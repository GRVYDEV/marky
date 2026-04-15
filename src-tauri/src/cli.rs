use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum InitialTarget {
    File { path: String },
    Vault { path: String },
    None,
}

/// Resolve a CLI argv into an InitialTarget.
///
/// - `marky FILE.md` → File
/// - `marky DIR/`     → Vault
/// - `marky` (none)   → None
/// - missing path     → None (we don't error; user gets empty state)
pub fn resolve(args: &[String]) -> InitialTarget {
    let raw = match args.iter().skip(1).find(|a| !a.starts_with("--")) {
        Some(a) => a,
        None => return InitialTarget::None,
    };

    let path = PathBuf::from(raw);
    let abs = match std::fs::canonicalize(&path) {
        Ok(p) => p,
        Err(_) => return InitialTarget::None,
    };

    classify(&abs)
}

fn classify(path: &Path) -> InitialTarget {
    let s = match path.to_str() {
        Some(s) => s.to_string(),
        None => return InitialTarget::None,
    };
    if path.is_dir() {
        InitialTarget::Vault { path: s }
    } else if path.is_file() {
        InitialTarget::File { path: s }
    } else {
        InitialTarget::None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn resolves_no_args_to_none() {
        let args = vec!["marky".to_string()];
        assert_eq!(resolve(&args), InitialTarget::None);
    }

    #[test]
    fn resolves_missing_path_to_none() {
        let args = vec!["marky".into(), "/nonexistent/path/xyz123".into()];
        assert_eq!(resolve(&args), InitialTarget::None);
    }

    #[test]
    fn resolves_file_to_file() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("a.md");
        fs::write(&p, "# hi").unwrap();
        let args = vec!["marky".into(), p.to_string_lossy().into_owned()];
        match resolve(&args) {
            InitialTarget::File { path } => assert!(path.ends_with("a.md")),
            other => panic!("expected file, got {:?}", other),
        }
    }

    #[test]
    fn resolves_dir_to_vault() {
        let dir = tempdir().unwrap();
        let args = vec!["marky".into(), dir.path().to_string_lossy().into_owned()];
        matches!(resolve(&args), InitialTarget::Vault { .. });
    }

    #[test]
    fn skips_flag_args() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("b.md");
        fs::write(&p, "x").unwrap();
        let args = vec![
            "marky".into(),
            "--debug".into(),
            p.to_string_lossy().into_owned(),
        ];
        matches!(resolve(&args), InitialTarget::File { .. });
    }
}
