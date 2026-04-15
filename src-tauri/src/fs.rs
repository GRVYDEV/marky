use crate::error::{AppError, AppResult};
use std::path::Path;

const MAX_FILE_BYTES: u64 = 25 * 1024 * 1024; // 25 MB

pub fn read_text<P: AsRef<Path>>(path: P) -> AppResult<String> {
    let path = path.as_ref();
    let meta = std::fs::metadata(path)?;
    if meta.len() > MAX_FILE_BYTES {
        return Err(AppError::Invalid(format!(
            "file too large: {} bytes (max {})",
            meta.len(),
            MAX_FILE_BYTES
        )));
    }
    let bytes = std::fs::read(path)?;
    String::from_utf8(bytes).map_err(|_| AppError::Invalid("file is not valid UTF-8".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn reads_text_file() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("a.md");
        fs::write(&p, "hello\n").unwrap();
        assert_eq!(read_text(&p).unwrap(), "hello\n");
    }

    #[test]
    fn rejects_non_utf8() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("bad.md");
        fs::write(&p, [0xff, 0xfe, 0xfd]).unwrap();
        assert!(matches!(read_text(&p), Err(AppError::Invalid(_))));
    }

    #[test]
    fn missing_file_returns_io_err() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("missing.md");
        assert!(matches!(read_text(&p), Err(AppError::Io(_))));
    }
}
