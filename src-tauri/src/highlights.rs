//! Highlights persistence.
//!
//! Highlights are keyed by the absolute file path of the markdown document
//! they belong to. We store all highlights in a single JSON file at
//! `app_data_dir/highlights.json` so they survive across sessions without
//! requiring any filesystem permissions outside Marky's own data directory.

use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

const FILE_NAME: &str = "highlights.json";
const CURRENT_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Highlight {
    pub id: String,
    #[serde(rename = "filePath")]
    pub file_path: String,
    pub colour: String,
    #[serde(rename = "sourceStartLine")]
    pub source_start_line: u32,
    #[serde(rename = "sourceEndLine")]
    pub source_end_line: u32,
    pub passage: String,
    pub occurrence: u32,
    pub section: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    /// Optional per-item annotation. Older `highlights.json` files written
    /// before annotations existed deserialize cleanly via `default`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HighlightsFile {
    pub version: u32,
    pub files: HashMap<String, Vec<Highlight>>,
}

impl Default for HighlightsFile {
    fn default() -> Self {
        Self {
            version: CURRENT_VERSION,
            files: HashMap::new(),
        }
    }
}

impl HighlightsFile {
    pub fn load(dir: &Path) -> AppResult<Self> {
        let p = dir.join(FILE_NAME);
        if !p.exists() {
            return Ok(Self::default());
        }
        let raw = std::fs::read_to_string(&p)?;
        Ok(serde_json::from_str(&raw).unwrap_or_default())
    }

    pub fn save(&self, dir: &Path) -> AppResult<()> {
        std::fs::create_dir_all(dir)?;
        let p = dir.join(FILE_NAME);
        let tmp = dir.join(format!("{FILE_NAME}.tmp"));
        let raw = serde_json::to_string_pretty(self)?;
        std::fs::write(&tmp, raw)?;
        std::fs::rename(&tmp, &p)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn h(id: &str, path: &str, colour: &str) -> Highlight {
        Highlight {
            id: id.into(),
            file_path: path.into(),
            colour: colour.into(),
            source_start_line: 0,
            source_end_line: 1,
            passage: "p".into(),
            occurrence: 0,
            section: "".into(),
            created_at: "2026-04-29T00:00:00.000Z".into(),
            note: None,
        }
    }

    #[test]
    fn round_trip_default() {
        let dir = tempdir().unwrap();
        let f = HighlightsFile::default();
        f.save(dir.path()).unwrap();
        let loaded = HighlightsFile::load(dir.path()).unwrap();
        assert_eq!(loaded.version, CURRENT_VERSION);
        assert!(loaded.files.is_empty());
    }

    #[test]
    fn round_trip_with_data() {
        let dir = tempdir().unwrap();
        let mut f = HighlightsFile::default();
        f.files
            .insert("/a.md".into(), vec![h("1", "/a.md", "yellow")]);
        f.save(dir.path()).unwrap();

        let loaded = HighlightsFile::load(dir.path()).unwrap();
        assert_eq!(loaded.files.len(), 1);
        let items = loaded.files.get("/a.md").unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "1");
        assert_eq!(items[0].colour, "yellow");
    }

    #[test]
    fn load_missing_file_is_default() {
        let dir = tempdir().unwrap();
        let loaded = HighlightsFile::load(dir.path()).unwrap();
        assert!(loaded.files.is_empty());
    }

    #[test]
    fn load_corrupt_file_falls_back_to_default() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join(FILE_NAME), "{not json").unwrap();
        let loaded = HighlightsFile::load(dir.path()).unwrap();
        assert!(loaded.files.is_empty());
    }

    #[test]
    fn camelcase_field_names_in_json() {
        let dir = tempdir().unwrap();
        let mut f = HighlightsFile::default();
        f.files
            .insert("/a.md".into(), vec![h("1", "/a.md", "yellow")]);
        f.save(dir.path()).unwrap();
        let raw = std::fs::read_to_string(dir.path().join(FILE_NAME)).unwrap();
        // Frontend expects camelCase keys.
        assert!(raw.contains("\"filePath\""));
        assert!(raw.contains("\"sourceStartLine\""));
        assert!(raw.contains("\"sourceEndLine\""));
        assert!(raw.contains("\"createdAt\""));
    }

    #[test]
    fn loads_legacy_file_without_note_field() {
        // A highlights.json written before `note` existed must still load.
        let dir = tempdir().unwrap();
        let raw = r#"{"version":1,"files":{"/a.md":[{"id":"1","filePath":"/a.md","colour":"yellow","sourceStartLine":0,"sourceEndLine":1,"passage":"p","occurrence":0,"section":"","createdAt":"2026-04-29T00:00:00.000Z"}]}}"#;
        std::fs::write(dir.path().join(FILE_NAME), raw).unwrap();
        let loaded = HighlightsFile::load(dir.path()).unwrap();
        let items = loaded.files.get("/a.md").unwrap();
        assert_eq!(items.len(), 1);
        assert!(items[0].note.is_none());
    }

    #[test]
    fn omits_note_field_in_json_when_absent() {
        let dir = tempdir().unwrap();
        let mut f = HighlightsFile::default();
        f.files
            .insert("/a.md".into(), vec![h("1", "/a.md", "yellow")]);
        f.save(dir.path()).unwrap();
        let raw = std::fs::read_to_string(dir.path().join(FILE_NAME)).unwrap();
        // skip_serializing_if keeps the JSON small for un-annotated highlights.
        assert!(!raw.contains("\"note\""));
    }
}
