# Marky — Implementation Plan

A fast, good-looking markdown viewer built in Tauri, launchable via `marky FILENAME`.

## Goals

- Open `.md` files with great rendering: GFM tables, task lists, syntax-highlighted code, mermaid diagrams, KaTeX math.
- CLI-first UX: `marky README.md` opens a window with that file. `marky ./docs/` opens a folder as a **vault**.
- **Vaults**: add folders as persistent workspaces (Obsidian-style). Vaults show in a sidebar and are always available on launch.
- **Cmd+K command palette** for fuzzy-finding any file across all open vaults.
- Feels native on macOS. Small binary. Fast startup.
- Live reload when the file changes on disk (useful when Claude is editing plans).

## Stack

| Layer | Choice | Why |
|---|---|---|
| Shell | **Tauri v2** | Small binaries, Rust backend, mature CLI plugin, native webview |
| Frontend build | **Vite + React + TypeScript** | Fast HMR, familiar |
| Markdown parser | **markdown-it** | Plugin ecosystem, CommonMark + GFM, battle-tested |
| Syntax highlighting | **Shiki** | TextMate grammars, VS Code themes, best-in-class output |
| Math | **markdown-it-katex** | Lightweight, renders server-side to HTML |
| Diagrams | **mermaid** | Render `lang=mermaid` fenced blocks |
| UI components | **shadcn/ui** (Radix + Tailwind) | Accessible primitives for dialogs, menus, tooltips, command palette |
| Styling | **Tailwind CSS** + custom markdown theme | Utility classes + a GitHub-like prose stylesheet |
| File watching | Rust `notify` crate | Cross-platform, efficient |
| Fuzzy search | **nucleo** (Rust) via Tauri command | Fast fuzzy matching over vault file lists; same algo as Helix |
| Command palette UI | **cmdk** (shadcn `<Command />`) | Accessible, styleable, composes with shadcn Dialog |

## Project Structure

```
marky/
├── src-tauri/                 # Rust backend
│   ├── src/
│   │   ├── main.rs            # entrypoint, window setup
│   │   ├── cli.rs             # argv parsing, file vs. folder resolution
│   │   ├── fs.rs              # read + watch markdown files
│   │   ├── vault.rs           # vault indexing, file tree walk, watcher per vault
│   │   ├── search.rs          # nucleo-based fuzzy matcher for Cmd+K
│   │   ├── settings.rs        # persisted settings (vaults list, theme, recents)
│   │   └── commands.rs        # #[tauri::command] handlers
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── icons/
├── src/                       # Frontend (React)
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── ui/                # shadcn-generated primitives (button, dialog, etc)
│   │   ├── Viewer.tsx         # renders parsed HTML
│   │   ├── Toolbar.tsx        # open file, theme toggle, TOC
│   │   ├── CodeBlock.tsx      # shiki + copy button
│   │   ├── Mermaid.tsx        # renders mermaid blocks
│   │   ├── CommandPalette.tsx # Cmd+K: fuzzy file search + actions
│   │   ├── VaultSidebar.tsx   # list of vaults + collapsible file tree
│   │   ├── FileTree.tsx       # recursive tree node component
│   │   └── TableOfContents.tsx
│   ├── lib/
│   │   ├── markdown.ts        # markdown-it configured instance
│   │   ├── highlight.ts       # shiki singleton
│   │   ├── tauri.ts           # typed wrappers over invoke()
│   │   ├── vault.ts           # vault state hooks, file tree helpers
│   │   └── theme.ts           # light/dark/system
│   └── styles/
│       ├── index.css          # tailwind + base
│       └── markdown.css       # prose styles (GitHub-ish)
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── CLAUDE.md
├── PLAN.md
└── README.md
```

## CLI Integration

The Tauri binary accepts a path as its first positional argument — file **or** directory.

**Rust side (`src-tauri/src/cli.rs`):**
- Read `std::env::args()` in `main.rs` before building the Tauri app.
- Resolve to an absolute path, `stat` it:
  - File → store as "initial file", open viewer on that file.
  - Directory → register it as a vault (if not already), open sidebar focused on it, show an empty viewer until the user picks a file.
  - No arg → open with the last session (vaults restored, last-viewed file selected).
- Expose `get_initial_target()` returning `{ kind: "file" | "vault" | "none", path }` for the frontend to branch on.

**Shell integration:**
- macOS: after `cargo tauri build`, symlink the inner binary to `~/.local/bin/marky` (or `/usr/local/bin/marky`).
- Provide an install script: `scripts/install-cli.sh` that creates the symlink.
- Later: Homebrew tap (`brew install marky`).

**Single-instance behavior:**
- Use `tauri-plugin-single-instance` so `marky other.md` in a second invocation focuses the existing window and loads the new file (or opens a new tab later).

## Vaults (Obsidian-style workspaces)

A **vault** is a persisted reference to a folder on disk. Vaults are listed in the left sidebar and always restored on launch.

**Data model (persisted in `settings.json`):**
```json
{
  "vaults": [
    { "id": "uuid", "name": "plans", "path": "/Users/me/plans", "addedAt": "..." }
  ],
  "lastOpenedFile": "/Users/me/plans/2026-04-release.md",
  "recentFiles": ["..."]
}
```

**Behavior:**
- Add vault: `Cmd+Shift+O` or sidebar "+" → native folder picker → append to settings.
- Remove vault: right-click → "Remove from Marky" (does NOT delete the folder).
- Each vault has its own `notify` watcher; add/remove/rename events update the in-memory tree.
- File tree shows `.md`, `.markdown`, `.mdx` by default. A per-vault filter can expand this. Hidden files (`.`-prefix), `node_modules`, `.git`, `target`, and `dist` are excluded by default via a small built-in ignore list.
- Vault file lists are indexed in memory for Cmd+K. Re-index on watcher events (debounced).
- Clicking a file in the tree opens it in the viewer. Folder expansion state is session-local (not persisted — keeps it simple).

**Rust commands (`commands.rs`):**
- `list_vaults() -> Vec<Vault>`
- `add_vault(path: String) -> Vault`
- `remove_vault(id: String)`
- `read_vault_tree(id: String) -> TreeNode` (lazy: children only on demand for deep trees, OR eager walk if fast enough — start eager, optimize if needed)
- `subscribe_vault_events(id: String)` → emits events on the `vault://{id}/changed` channel

## Command Palette (Cmd+K)

Opens a shadcn `<CommandDialog />` anchored center-top.

**Sources (in priority order):**
1. **Actions** — "Open File…", "Add Vault…", "Toggle Theme", "Toggle Sidebar", "Copy Path", etc.
2. **Files** — every `.md` file across all vaults, fuzzy-matched by relative path.
3. **Headings** — (Phase 3) headings inside the currently open file, for jumping.

**Search implementation:**
- Rust command `search_vault_files(query: String, limit: u32) -> Vec<Match>`
- Backed by `nucleo` (same matcher as Helix); matches on `vault_name/relative/path.md`.
- Index is rebuilt on vault watcher events; kept in memory as `Vec<(vault_id, relative_path)>`.
- For N < ~50k files this is effectively instant; re-invoke on every keystroke from the frontend.

**UI:**
- `Cmd+K` toggles. `Esc` closes. `↑/↓` navigates. `Enter` opens.
- Result rows show: file name (bold), relative path (muted), vault name (badge on the right).
- First render shows Actions + most recent files when query is empty.

## Feature Phases

### Phase 1 — MVP (the must-haves)
- [ ] Tauri v2 scaffold + Vite + React + TS
- [ ] Install & init shadcn/ui (new-york style, slate base, CSS variables for theming)
- [ ] CLI argv → initial file path
- [ ] Read file contents in Rust, pass to frontend
- [ ] markdown-it render with GFM (tables, task lists, strikethrough, autolink)
- [ ] Shiki syntax highlighting with light/dark themes
- [ ] Base prose stylesheet (readable typography, good spacing)
- [ ] Light / dark / system theme toggle
- [ ] File watcher → auto-refresh on disk change
- [ ] Drag-and-drop a file onto the window to open it
- [ ] `Cmd+O` open file dialog
- [ ] Install script to put `marky` on PATH

### Phase 1.5 — Vaults & Cmd+K (high priority, right after MVP)
- [ ] Settings persistence (`settings.rs` + `app_data_dir/settings.json`)
- [ ] `add_vault` / `list_vaults` / `remove_vault` commands
- [ ] Eager vault tree walk with ignore list
- [ ] `VaultSidebar` + `FileTree` components (shadcn ScrollArea + Collapsible)
- [ ] Per-vault `notify` watcher → emit events → frontend updates tree
- [ ] CLI: `marky ./docs/` registers/opens the folder as a vault
- [ ] Restore vaults + last-opened file on launch
- [ ] `search_vault_files` command backed by `nucleo`
- [ ] `CommandPalette` component (shadcn `<CommandDialog />`) with Actions + Files sources
- [ ] Global `Cmd+K` hotkey

### Phase 2 — Polish
- [ ] Mermaid diagrams
- [ ] KaTeX math (`$...$` and `$$...$$`)
- [ ] Table of contents sidebar (auto-generated from headings, collapsible)
- [ ] In-page search (`Cmd+F`)
- [ ] Copy-code button on code blocks
- [ ] Remember scroll position per file (keyed by absolute path)
- [ ] Recent files in Cmd+K when query is empty
- [ ] External links open in system browser, not webview

### Phase 3 — Nice-to-haves
- [ ] Export to PDF / print stylesheet
- [ ] Multi-tab / multi-window
- [ ] Image zoom on click
- [ ] Diagram export (svg download)
- [ ] Frontmatter rendering (YAML metadata banner)
- [ ] Footnotes + definition lists plugin
- [ ] Mac menu bar polish (native menus)
- [ ] Cmd+K: jump to heading within current file
- [ ] Cmd+K: full-text content search across vaults (ripgrep-style, via `grep` crate or shelling to `rg`)
- [ ] Wikilinks (`[[Other Note]]`) resolved against the current vault

## Build & Install Flow

```bash
# dev
pnpm install
pnpm tauri dev

# production build (creates .app + .dmg on mac)
pnpm tauri build

# install CLI
./scripts/install-cli.sh   # symlinks marky -> ~/.local/bin/marky
```

## Open Questions

- **Tabs vs. new window per file?** Start with new-window-per-file (simpler). Revisit after using it.
- **Watch granularity?** Debounce file-change events at ~100ms so editor save storms don't flicker.
- **Should the rendered HTML be sanitized?** Yes — use DOMPurify on the markdown-it output before injecting. Claude plans can contain arbitrary HTML.
- **Where to store settings (theme, recent files)?** Tauri's `app_data_dir()` + a small `settings.json`.
- **Vault tree: eager vs. lazy walk?** Start eager (simple, fast enough for <10k files). Switch to lazy per-folder reads if large vaults lag.
- **Should vaults store any files themselves (like Obsidian's `.obsidian/`)?** No — keep vaults as pure pointers. All state lives in the app's own settings dir. Folders can be opened by multiple tools without contamination.

## Success Criteria

- `marky some-plan.md` opens a window in under 500ms on a warm start.
- Tables, task lists, and code blocks all render with proper styling.
- Editing the file externally updates the view within ~200ms.
- Built `.dmg` is under 15 MB.
