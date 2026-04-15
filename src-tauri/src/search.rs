use crate::vault::IndexedFile;
use nucleo::pattern::{CaseMatching, Normalization, Pattern};
use nucleo::{Config, Matcher};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    #[serde(flatten)]
    pub file: IndexedFile,
    pub score: u32,
}

/// Fuzzy-match the query against `vault_name/relative_path` for every file.
/// Returns up to `limit` results sorted by descending score.
/// An empty query returns the first `limit` files in their original order with score 0.
pub fn search(files: &[IndexedFile], query: &str, limit: usize) -> Vec<SearchResult> {
    if query.is_empty() {
        return files
            .iter()
            .take(limit)
            .cloned()
            .map(|f| SearchResult { file: f, score: 0 })
            .collect();
    }

    let mut matcher = Matcher::new(Config::DEFAULT.match_paths());
    let pattern = Pattern::parse(query, CaseMatching::Smart, Normalization::Smart);

    let mut scored: Vec<SearchResult> = files
        .iter()
        .filter_map(|f| {
            let haystack = format!("{}/{}", f.vault_name, f.relative_path);
            let mut buf = Vec::new();
            let utf32 = nucleo::Utf32Str::new(&haystack, &mut buf);
            pattern.score(utf32, &mut matcher).map(|score| SearchResult {
                file: f.clone(),
                score,
            })
        })
        .collect();

    scored.sort_by(|a, b| b.score.cmp(&a.score));
    scored.truncate(limit);
    scored
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(vault: &str, rel: &str) -> IndexedFile {
        IndexedFile {
            vault_id: "v".into(),
            vault_name: vault.into(),
            absolute_path: format!("/root/{rel}"),
            relative_path: rel.into(),
        }
    }

    #[test]
    fn empty_query_returns_all_up_to_limit() {
        let files = vec![file("v", "a.md"), file("v", "b.md"), file("v", "c.md")];
        let r = search(&files, "", 2);
        assert_eq!(r.len(), 2);
    }

    #[test]
    fn matches_substring_in_path() {
        let files = vec![
            file("vault", "docs/intro.md"),
            file("vault", "notes/scratch.md"),
            file("vault", "docs/guide/setup.md"),
        ];
        let r = search(&files, "intro", 10);
        assert!(!r.is_empty());
        assert!(r[0].file.relative_path.contains("intro"));
    }

    #[test]
    fn ranks_better_matches_higher() {
        let files = vec![
            file("vault", "release-2026.md"),
            file("vault", "release-notes.md"),
            file("vault", "unrelated.md"),
        ];
        let r = search(&files, "rel", 10);
        assert!(r.len() >= 2);
        assert!(r.iter().all(|x| x.file.relative_path.contains("rel")));
    }

    #[test]
    fn no_matches_returns_empty() {
        let files = vec![file("v", "alpha.md")];
        let r = search(&files, "zzzzzz_no_match", 10);
        assert!(r.is_empty());
    }

    #[test]
    fn respects_limit() {
        let files: Vec<_> = (0..50).map(|i| file("v", &format!("file{i}.md"))).collect();
        let r = search(&files, "file", 10);
        assert!(r.len() <= 10);
    }
}
