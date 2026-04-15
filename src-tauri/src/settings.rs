use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Vault {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(default)]
    pub added_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default)]
    pub vaults: Vec<Vault>,
    #[serde(default)]
    pub last_opened_file: Option<String>,
    #[serde(default)]
    pub recent_files: Vec<String>,
    #[serde(default)]
    pub theme: Option<String>,
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

    pub fn add_vault(&mut self, vault: Vault) {
        if self.vaults.iter().any(|v| v.path == vault.path) {
            return;
        }
        self.vaults.push(vault);
    }

    pub fn remove_vault(&mut self, id: &str) {
        self.vaults.retain(|v| v.id != id);
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

    fn vault(id: &str, path: &str) -> Vault {
        Vault {
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
        assert!(loaded.vaults.is_empty());
        assert!(loaded.recent_files.is_empty());
    }

    #[test]
    fn round_trip_with_data() {
        let dir = tempdir().unwrap();
        let mut s = Settings::default();
        s.add_vault(vault("v1", "/tmp/a"));
        s.push_recent("/tmp/a/file.md".into());
        s.save(dir.path()).unwrap();
        let loaded = Settings::load(dir.path()).unwrap();
        assert_eq!(loaded.vaults.len(), 1);
        assert_eq!(loaded.recent_files, vec!["/tmp/a/file.md"]);
        assert_eq!(loaded.last_opened_file.as_deref(), Some("/tmp/a/file.md"));
    }

    #[test]
    fn add_vault_dedups_by_path() {
        let mut s = Settings::default();
        s.add_vault(vault("v1", "/tmp/a"));
        s.add_vault(vault("v2", "/tmp/a"));
        assert_eq!(s.vaults.len(), 1);
        assert_eq!(s.vaults[0].id, "v1");
    }

    #[test]
    fn remove_vault_works() {
        let mut s = Settings::default();
        s.add_vault(vault("v1", "/tmp/a"));
        s.add_vault(vault("v2", "/tmp/b"));
        s.remove_vault("v1");
        assert_eq!(s.vaults.len(), 1);
        assert_eq!(s.vaults[0].id, "v2");
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
        assert!(s.vaults.is_empty());
    }

    #[test]
    fn load_corrupt_file_falls_back_to_default() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("settings.json"), "{not json").unwrap();
        let s = Settings::load(dir.path()).unwrap();
        assert!(s.vaults.is_empty());
    }
}
