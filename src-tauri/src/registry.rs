use crate::error::{AppError, AppResult};
use crate::folder::{build_tree, flatten_files, IndexedFile, TreeNode};
use crate::settings::{Folder, Settings};
use parking_lot::RwLock;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

/// In-memory registry: folder metadata + each folder's tree + the flat search index.
/// Persistence is delegated to `Settings`; the registry owns the live, hydrated state.
#[derive(Default)]
pub struct FolderRegistry {
    inner: RwLock<Inner>,
}

#[derive(Default)]
struct Inner {
    settings: Settings,
    trees: HashMap<String, TreeNode>,
    index: Vec<IndexedFile>,
}

impl FolderRegistry {
    pub fn from_settings(settings: Settings) -> Self {
        let mut inner = Inner {
            settings,
            ..Default::default()
        };
        inner.rebuild_all();
        Self {
            inner: RwLock::new(inner),
        }
    }

    pub fn settings(&self) -> Settings {
        self.inner.read().settings.clone()
    }

    pub fn folders(&self) -> Vec<Folder> {
        self.inner.read().settings.folders.clone()
    }

    pub fn tree(&self, folder_id: &str) -> Option<TreeNode> {
        self.inner.read().trees.get(folder_id).cloned()
    }

    pub fn index_snapshot(&self) -> Vec<IndexedFile> {
        self.inner.read().index.clone()
    }

    pub fn add_folder(&self, path: PathBuf) -> AppResult<Folder> {
        let abs = std::fs::canonicalize(&path)?;
        if !abs.is_dir() {
            return Err(AppError::Invalid("folder path is not a directory".into()));
        }
        let path_str = abs.to_str().ok_or(AppError::NonUtf8Path)?.to_string();
        let name = abs
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("folder")
            .to_string();

        let mut guard = self.inner.write();
        if let Some(existing) = guard.settings.folders.iter().find(|v| v.path == path_str) {
            return Ok(existing.clone());
        }

        let folder = Folder {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            path: path_str,
            added_at: chrono_now(),
        };
        guard.settings.add_folder(folder.clone());
        guard.rebuild_one(&folder);
        Ok(folder)
    }

    pub fn remove_folder(&self, id: &str) {
        let mut guard = self.inner.write();
        guard.settings.remove_folder(id);
        guard.trees.remove(id);
        guard.rebuild_index();
    }

    pub fn refresh_folder(&self, id: &str) {
        let mut guard = self.inner.write();
        let folder = match guard.settings.folders.iter().find(|v| v.id == id).cloned() {
            Some(v) => v,
            None => return,
        };
        guard.rebuild_one(&folder);
    }

    pub fn push_recent(&self, path: String) {
        self.inner.write().settings.push_recent(path);
    }

    pub fn save(&self, dir: &std::path::Path) -> AppResult<()> {
        self.inner.read().settings.save(dir)
    }

    pub fn save_with(
        &self,
        dir: &std::path::Path,
        mutate: impl FnOnce(&mut Settings),
    ) -> AppResult<()> {
        let mut guard = self.inner.write();
        mutate(&mut guard.settings);
        guard.settings.save(dir)
    }
}

impl Inner {
    fn rebuild_all(&mut self) {
        self.trees.clear();
        let folders = self.settings.folders.clone();
        for v in &folders {
            self.rebuild_one(v);
        }
    }

    fn rebuild_one(&mut self, folder: &Folder) {
        let root = PathBuf::from(&folder.path);
        match build_tree(&root) {
            Ok(tree) => {
                self.trees.insert(folder.id.clone(), tree);
            }
            Err(_) => {
                self.trees.remove(&folder.id);
            }
        }
        self.rebuild_index();
    }

    fn rebuild_index(&mut self) {
        self.index.clear();
        for v in &self.settings.folders {
            if let Some(tree) = self.trees.get(&v.id) {
                let root = PathBuf::from(&v.path);
                flatten_files(&v.id, &v.name, &root, tree, &mut self.index);
            }
        }
    }
}

pub type SharedRegistry = Arc<FolderRegistry>;

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn add_folder_indexes_files() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("a.md"), "x").unwrap();
        fs::create_dir_all(dir.path().join("sub")).unwrap();
        fs::write(dir.path().join("sub/b.md"), "y").unwrap();

        let reg = FolderRegistry::from_settings(Settings::default());
        let v = reg.add_folder(dir.path().to_path_buf()).unwrap();

        let idx = reg.index_snapshot();
        assert_eq!(idx.len(), 2);
        assert!(idx.iter().all(|f| f.folder_id == v.id));
    }

    #[test]
    fn remove_folder_drops_index_entries() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("a.md"), "x").unwrap();
        let reg = FolderRegistry::from_settings(Settings::default());
        let v = reg.add_folder(dir.path().to_path_buf()).unwrap();
        assert!(!reg.index_snapshot().is_empty());
        reg.remove_folder(&v.id);
        assert!(reg.index_snapshot().is_empty());
        assert!(reg.tree(&v.id).is_none());
    }

    #[test]
    fn add_same_folder_twice_dedups() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("a.md"), "x").unwrap();
        let reg = FolderRegistry::from_settings(Settings::default());
        let v1 = reg.add_folder(dir.path().to_path_buf()).unwrap();
        let v2 = reg.add_folder(dir.path().to_path_buf()).unwrap();
        assert_eq!(v1.id, v2.id);
        assert_eq!(reg.folders().len(), 1);
    }

    #[test]
    fn refresh_picks_up_new_files() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("a.md"), "x").unwrap();
        let reg = FolderRegistry::from_settings(Settings::default());
        let v = reg.add_folder(dir.path().to_path_buf()).unwrap();
        assert_eq!(reg.index_snapshot().len(), 1);
        fs::write(dir.path().join("new.md"), "z").unwrap();
        reg.refresh_folder(&v.id);
        assert_eq!(reg.index_snapshot().len(), 2);
    }
}
