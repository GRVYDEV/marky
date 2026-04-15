# CLAUDE.md — Marky

Instructions for future Claude sessions working on this repo. Read this first.

## What this is

`marky` is a Tauri-based desktop markdown viewer. Primary use case: viewing Claude-generated plans and other markdown docs with good rendering of tables, code blocks, task lists, math, and mermaid diagrams. Launched via `marky FILENAME` to open a file or `marky FOLDER` to open a folder as a **folder**. Folders persist across sessions (Obsidian-style), shown in a left sidebar. A **Cmd+K command palette** fuzzy-searches files across all folders.

See `PLAN.md` for the full roadmap and architectural decisions.

## Stack (authoritative — do not swap without asking)

- **Tauri v2** — desktop shell, Rust backend
- **Vite + React + TypeScript** — frontend
- **pnpm** — package manager (not npm, not yarn)
- **markdown-it** — parser (not remark, not marked)
- **Shiki** — syntax highlighting (not highlight.js, not Prism)
- **shadcn/ui** — UI component primitives (Radix-based, copied into `src/components/ui/`)
- **Tailwind CSS** — styling
- **KaTeX** for math, **mermaid** for diagrams
- **nucleo** (Rust) — fuzzy matcher for Cmd+K file search
- **cmdk** via shadcn `<Command />` — command palette UI
- **notify** (Rust) — file watching per folder
- **DOMPurify** — sanitize rendered HTML before injection

If a request would require swapping one of these, stop and confirm.

## Project layout

```
src-tauri/   Rust backend — CLI parsing, file I/O, file watching, Tauri commands
src/         React frontend — rendering pipeline, UI components
scripts/     Install / dev helper scripts
```

See `PLAN.md` → "Project Structure" for the full tree.

## Core conventions

### Rust (`src-tauri/`)
- Keep `main.rs` thin — delegate to `cli.rs`, `fs.rs`, `folder.rs`, `search.rs`, `settings.rs`, `commands.rs`.
- All frontend-callable functions live in `commands.rs` and are registered in `main.rs`'s `invoke_handler`.
- Follow the `golang-style` skill's spirit even for Rust: happy path unindented, errors wrapped with context (`anyhow::Context` or `thiserror`).
- File paths crossing the Rust↔JS boundary are always absolute strings.
- **Folder state** lives in a single `Arc<RwLock<FolderRegistry>>` in Tauri managed state. Don't scatter folder state across modules.
- **Fuzzy search index** is rebuilt from the registry on watcher events, debounced at 200ms. Keep it in-memory only.

### Frontend (`src/`)
- Markdown pipeline lives in `src/lib/markdown.ts` as a single configured `markdown-it` instance. Do not create ad-hoc instances elsewhere.
- Shiki highlighter is a lazy singleton in `src/lib/highlight.ts` — loading grammars is expensive, load once.
- All `invoke()` calls go through typed wrappers in `src/lib/tauri.ts`. Do not call `@tauri-apps/api` `invoke` directly from components.
- Components are function components with hooks. No class components.

### UI components
- Use **shadcn/ui** primitives from `src/components/ui/` for dialogs, buttons, dropdowns, tooltips, command palette, scroll areas, etc.
- Add new shadcn components via `pnpm dlx shadcn@latest add <component>` — do not hand-write primitives that shadcn already provides.
- Shadcn files in `src/components/ui/` are **owned by us** once added — edit them freely. Don't re-run `add` on an existing component without intent to overwrite.
- App-specific composite components (Viewer, Toolbar, etc.) live in `src/components/` and compose the primitives from `ui/`.

### Styling
- Tailwind for layout and component chrome.
- shadcn's CSS variables (`--background`, `--foreground`, `--muted`, etc.) drive theme colors. Prefer those tokens over raw Tailwind colors so light/dark stay consistent.
- `src/styles/markdown.css` owns prose styles (headings, paragraphs, tables, blockquotes). Keep markdown styling there, not inline on components. Reference shadcn CSS variables where it makes sense.
- Theme switching toggles the `dark` class on `<html>` (shadcn's default). System/light/dark via a small theme provider.

## Security

- **Always sanitize rendered HTML with DOMPurify** before setting `dangerouslySetInnerHTML`. Markdown files may contain raw HTML.
- External links (`target="_blank"`) must go through the Tauri shell plugin to open in the system browser, not the webview.
- Tauri `allowlist` / capabilities: grant only `fs:read` on user-selected paths, not blanket filesystem access.

## Running / building

```bash
pnpm install
pnpm tauri dev           # dev with HMR
pnpm tauri build         # production bundle (.app + .dmg on mac)
./scripts/install-cli.sh # symlink marky binary to ~/.local/bin
```

## Testing

- Rust: `cargo test` inside `src-tauri/`.
- Frontend: Vitest for `lib/` functions (markdown pipeline, path helpers). No need to test components heavily — this is a viewer, behavior is mostly visual.
- Before reporting a task done, run `pnpm tauri dev` and actually view a markdown file. Type checks don't catch rendering bugs.

## What not to do

- Don't add Electron fallbacks or wrappers.
- Don't add a markdown editor — this is read-only by design. No contenteditable, no textareas for editing.
- Don't persist user data outside `app_data_dir()`.
- Don't fetch remote resources at runtime (except images referenced in the markdown itself). No telemetry, no auto-update pings without explicit opt-in.
- Don't over-abstract. This is a single-purpose app — keep the component tree flat.

## When adding a new markdown feature

1. Is there a `markdown-it-*` plugin? Prefer that over a custom renderer rule.
2. Register it in `src/lib/markdown.ts`.
3. Add styling to `src/styles/markdown.css`.
4. Add a fixture to `src/lib/__fixtures__/` and a Vitest snapshot.

## Folder conventions

- A folder is a **pointer to a folder** — Marky never writes inside the folder. All folder state (name, id) lives in Marky's `app_data_dir/settings.json`.
- Default ignore list for folder trees: hidden dotfiles, `node_modules`, `.git`, `target`, `dist`, `build`. Centralize this in `folder.rs::DEFAULT_IGNORES`.
- Default file extensions shown: `.md`, `.markdown`, `.mdx`.
- Folder IDs are UUIDs generated on add. Paths alone aren't stable identifiers (folders can move).

## Cmd+K conventions

- One canonical palette component: `CommandPalette.tsx`. Do not build ad-hoc search dialogs elsewhere.
- Palette sources are **pluggable** — each source is `{ id, label, search(query) -> results }`. Adding a new source (e.g. headings in current file) means adding a source, not forking the palette.
- Fuzzy matching for files happens in Rust (`nucleo`), not in JS. Keep the frontend dumb: query in, ranked results out.

## Current status

Planning complete (this doc + `PLAN.md`). No code scaffolded yet. Next step: `pnpm create tauri-app` with the React + TS template, then wire up the Phase 1 checklist in `PLAN.md`.
