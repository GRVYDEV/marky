use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(default)]
    pub added_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Settings {
    /// Saved folder workspaces. `vaults` is accepted as a legacy alias so
    /// settings written by older builds still load.
    #[serde(default, alias = "vaults")]
    pub folders: Vec<Folder>,
    #[serde(default)]
    pub last_opened_file: Option<String>,
    #[serde(default)]
    pub recent_files: Vec<String>,
    #[serde(default)]
    pub theme: Option<String>,
    #[serde(default)]
    pub zoom: Option<f64>,
    #[serde(default)]
    pub sidebar_left_width: Option<u32>,
    #[serde(default)]
    pub sidebar_right_width: Option<u32>,
    #[serde(default)]
    pub copy_as_markdown: Option<bool>,
    #[serde(default)]
    pub sidebar_group_by_repo: Option<bool>,
}

const RECENT_LIMIT: usize = 20;
const FILE_NAME: &str = "settings.json";

impl Settings {
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

    pub fn push_recent(&mut self, path: String) {
        self.recent_files.retain(|p| p != &path);
        self.recent_files.insert(0, path.clone());
        self.recent_files.truncate(RECENT_LIMIT);
        self.last_opened_file = Some(path);
    }

    pub fn add_folder(&mut self, folder: Folder) {
        if self.folders.iter().any(|v| v.path == folder.path) {
            return;
        }
        self.folders.push(folder);
    }

    pub fn remove_folder(&mut self, id: &str) {
        self.folders.retain(|v| v.id != id);
    }
}

pub fn data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("marky")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn folder(id: &str, path: &str) -> Folder {
        Folder {
            id: id.into(),
            name: "x".into(),
            path: path.into(),
            added_at: "now".into(),
        }
    }

    #[test]
    fn round_trip_default() {
        let dir = tempdir().unwrap();
        let s = Settings::default();
        s.save(dir.path()).unwrap();
        let loaded = Settings::load(dir.path()).unwrap();
        assert!(loaded.folders.is_empty());
        assert!(loaded.recent_files.is_empty());
    }

    #[test]
    fn round_trip_with_data() {
        let dir = tempdir().unwrap();
        let mut s = Settings::default();
        s.add_folder(folder("f1", "/tmp/a"));
        s.push_recent("/tmp/a/file.md".into());
        s.save(dir.path()).unwrap();
        let loaded = Settings::load(dir.path()).unwrap();
        assert_eq!(loaded.folders.len(), 1);
        assert_eq!(loaded.recent_files, vec!["/tmp/a/file.md"]);
        assert_eq!(loaded.last_opened_file.as_deref(), Some("/tmp/a/file.md"));
    }

    #[test]
    fn add_folder_dedups_by_path() {
        let mut s = Settings::default();
        s.add_folder(folder("f1", "/tmp/a"));
        s.add_folder(folder("f2", "/tmp/a"));
        assert_eq!(s.folders.len(), 1);
        assert_eq!(s.folders[0].id, "f1");
    }

    #[test]
    fn remove_folder_works() {
        let mut s = Settings::default();
        s.add_folder(folder("f1", "/tmp/a"));
        s.add_folder(folder("f2", "/tmp/b"));
        s.remove_folder("f1");
        assert_eq!(s.folders.len(), 1);
        assert_eq!(s.folders[0].id, "f2");
    }

    #[test]
    fn push_recent_dedups_and_caps() {
        let mut s = Settings::default();
        for i in 0..30 {
            s.push_recent(format!("/p/{i}.md"));
        }
        assert_eq!(s.recent_files.len(), RECENT_LIMIT);
        assert_eq!(s.recent_files[0], "/p/29.md");

        s.push_recent("/p/5.md".into());
        assert_eq!(s.recent_files[0], "/p/5.md");
        let occurrences = s.recent_files.iter().filter(|p| *p == "/p/5.md").count();
        assert_eq!(occurrences, 1);
    }

    #[test]
    fn load_missing_file_is_default() {
        let dir = tempdir().unwrap();
        let s = Settings::load(dir.path()).unwrap();
        assert!(s.folders.is_empty());
    }

    #[test]
    fn load_corrupt_file_falls_back_to_default() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("settings.json"), "{not json").unwrap();
        let s = Settings::load(dir.path()).unwrap();
        assert!(s.folders.is_empty());
    }

    #[test]
    fn loads_legacy_vaults_alias() {
        let dir = tempdir().unwrap();
        let raw = r#"{"vaults":[{"id":"v1","name":"old","path":"/tmp/x","added_at":"0"}]}"#;
        std::fs::write(dir.path().join("settings.json"), raw).unwrap();
        let s = Settings::load(dir.path()).unwrap();
        assert_eq!(s.folders.len(), 1);
        assert_eq!(s.folders[0].id, "v1");
    }
}
