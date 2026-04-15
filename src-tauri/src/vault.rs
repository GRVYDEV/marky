use crate::error::AppResult;
use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const DEFAULT_IGNORES: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".cache",
    ".venv",
    "__pycache__",
];

pub const MARKDOWN_EXTS: &[&str] = &["md", "markdown", "mdx"];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    #[serde(default)]
    pub children: Vec<TreeNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct IndexedFile {
    pub vault_id: String,
    pub vault_name: String,
    pub absolute_path: String,
    pub relative_path: String,
}

pub fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| MARKDOWN_EXTS.iter().any(|m| m.eq_ignore_ascii_case(e)))
        .unwrap_or(false)
}

fn is_ignored_dirname(name: &str) -> bool {
    name.starts_with('.') || DEFAULT_IGNORES.contains(&name)
}

/// Build the tree of markdown files for a vault root.
/// Empty directories (no markdown descendants) are pruned.
pub fn build_tree(root: &Path) -> AppResult<TreeNode> {
    let walker = WalkBuilder::new(root)
        .hidden(true)
        .git_ignore(true)
        .git_global(false)
        .filter_entry(|entry| {
            let name = entry.file_name().to_string_lossy();
            !(entry.depth() > 0 && is_ignored_dirname(&name))
        })
        .build();

    // Collect files first.
    let mut files: Vec<PathBuf> = Vec::new();
    for dent in walker.flatten() {
        let p = dent.path();
        if p.is_file() && is_markdown(p) {
            files.push(p.to_path_buf());
        }
    }
    files.sort();

    let root_name = root
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("vault")
        .to_string();

    let mut root_node = TreeNode {
        name: root_name,
        path: root.to_string_lossy().into_owned(),
        is_dir: true,
        children: Vec::new(),
    };

    for f in files {
        let rel = match f.strip_prefix(root) {
            Ok(r) => r,
            Err(_) => continue,
        };
        insert_path(&mut root_node, root, rel);
    }

    sort_tree(&mut root_node);
    Ok(root_node)
}

fn insert_path(node: &mut TreeNode, root: &Path, rel: &Path) {
    let components: Vec<_> = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect();
    if components.is_empty() {
        return;
    }
    insert_components(node, root, &components, 0);
}

fn insert_components(node: &mut TreeNode, root: &Path, parts: &[String], idx: usize) {
    if idx >= parts.len() {
        return;
    }
    let part = &parts[idx];
    let is_last = idx == parts.len() - 1;
    let abs: PathBuf = root.join(parts[..=idx].iter().collect::<PathBuf>());

    if let Some(existing) = node.children.iter_mut().find(|c| &c.name == part) {
        if !is_last {
            insert_components(existing, root, parts, idx + 1);
        }
        return;
    }

    let mut new_node = TreeNode {
        name: part.clone(),
        path: abs.to_string_lossy().into_owned(),
        is_dir: !is_last,
        children: Vec::new(),
    };

    if !is_last {
        insert_components(&mut new_node, root, parts, idx + 1);
    }
    node.children.push(new_node);
}

fn sort_tree(node: &mut TreeNode) {
    node.children.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    for c in &mut node.children {
        sort_tree(c);
    }
}

/// Flatten the tree into IndexedFile entries (markdown files only).
pub fn flatten_files(
    vault_id: &str,
    vault_name: &str,
    vault_root: &Path,
    node: &TreeNode,
    out: &mut Vec<IndexedFile>,
) {
    if node.is_dir {
        for c in &node.children {
            flatten_files(vault_id, vault_name, vault_root, c, out);
        }
    } else {
        let abs = PathBuf::from(&node.path);
        let rel = abs
            .strip_prefix(vault_root)
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|_| node.name.clone());
        out.push(IndexedFile {
            vault_id: vault_id.to_string(),
            vault_name: vault_name.to_string(),
            absolute_path: node.path.clone(),
            relative_path: rel,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn touch(p: &Path) {
        if let Some(parent) = p.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(p, "x").unwrap();
    }

    #[test]
    fn detects_markdown_extensions() {
        assert!(is_markdown(Path::new("a.md")));
        assert!(is_markdown(Path::new("a.MARKDOWN")));
        assert!(is_markdown(Path::new("a.mdx")));
        assert!(!is_markdown(Path::new("a.txt")));
        assert!(!is_markdown(Path::new("a")));
    }

    #[test]
    fn tree_includes_only_markdown() {
        let dir = tempdir().unwrap();
        touch(&dir.path().join("a.md"));
        touch(&dir.path().join("b.txt"));
        touch(&dir.path().join("sub/c.md"));
        let tree = build_tree(dir.path()).unwrap();
        let mut files = Vec::new();
        flatten_files("v", "vault", dir.path(), &tree, &mut files);
        let names: Vec<_> = files.iter().map(|f| f.relative_path.clone()).collect();
        assert!(names.iter().any(|n| n.ends_with("a.md")));
        assert!(names.iter().any(|n| n.ends_with("c.md")));
        assert!(!names.iter().any(|n| n.ends_with("b.txt")));
    }

    #[test]
    fn tree_skips_default_ignores_and_hidden() {
        let dir = tempdir().unwrap();
        touch(&dir.path().join("ok.md"));
        touch(&dir.path().join("node_modules/x.md"));
        touch(&dir.path().join(".git/y.md"));
        touch(&dir.path().join(".hidden/z.md"));
        let tree = build_tree(dir.path()).unwrap();
        let mut files = Vec::new();
        flatten_files("v", "vault", dir.path(), &tree, &mut files);
        let rels: Vec<_> = files.iter().map(|f| f.relative_path.clone()).collect();
        assert_eq!(rels, vec!["ok.md".to_string()]);
    }

    #[test]
    fn tree_directories_sorted_before_files() {
        let dir = tempdir().unwrap();
        touch(&dir.path().join("z_root.md"));
        touch(&dir.path().join("a_dir/inner.md"));
        let tree = build_tree(dir.path()).unwrap();
        assert_eq!(tree.children.len(), 2);
        assert!(tree.children[0].is_dir);
        assert_eq!(tree.children[0].name, "a_dir");
        assert_eq!(tree.children[1].name, "z_root.md");
    }

    #[test]
    fn tree_preserves_relative_path_in_indexed_files() {
        let dir = tempdir().unwrap();
        touch(&dir.path().join("docs/guide/intro.md"));
        let tree = build_tree(dir.path()).unwrap();
        let mut files = Vec::new();
        flatten_files("v1", "myvault", dir.path(), &tree, &mut files);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].vault_id, "v1");
        assert_eq!(files[0].vault_name, "myvault");
        assert_eq!(
            files[0].relative_path.replace('\\', "/"),
            "docs/guide/intro.md"
        );
    }
}
