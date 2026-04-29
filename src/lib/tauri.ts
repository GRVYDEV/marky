import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type InitialTarget =
  | { kind: "file"; path: string }
  | { kind: "folder"; path: string }
  | { kind: "none" };

export interface Folder {
  id: string;
  name: string;
  path: string;
  added_at: string;
}

export interface AnnotatedFolder extends Folder {
  repo_root: string | null;
  repo_name: string | null;
}

export interface TreeNode {
  name: string;
  path: string;
  is_dir: boolean;
  children: TreeNode[];
}

export interface IndexedFile {
  folder_id: string;
  folder_name: string;
  absolute_path: string;
  relative_path: string;
}

export interface SearchResult extends IndexedFile {
  score: number;
}

export const tauri = {
  getInitialTarget: () => invoke<InitialTarget>("get_initial_target"),
  setInitialTarget: (target: InitialTarget) => invoke<void>("set_initial_target", { target }),
  readFile: (path: string) => invoke<string>("read_file", { path }),
  listFolders: () => invoke<Folder[]>("list_folders"),
  listFoldersGrouped: () => invoke<AnnotatedFolder[]>("list_folders_grouped"),
  addFolder: (path: string) => invoke<Folder>("add_folder", { path }),
  removeFolder: (id: string) => invoke<void>("remove_folder", { id }),
  readFolderTree: (id: string) => invoke<TreeNode>("read_folder_tree", { id }),
  searchFiles: (query: string, limit = 50) =>
    invoke<SearchResult[]>("search_files", { args: { query, limit } }),
  getRecentFiles: () => invoke<string[]>("get_recent_files"),
  saveTheme: (theme: string) => invoke<void>("save_theme", { theme }),
  savePreferences: (prefs: PreferencesPayload) =>
    invoke<void>("save_preferences", { prefs }),
  loadPreferences: () => invoke<PreferencesPayload>("load_preferences"),
  loadHighlights: () => invoke<HighlightsFilePayload>("load_highlights"),
  saveHighlightsForFile: (filePath: string, highlights: HighlightPayload[]) =>
    invoke<void>("save_highlights_for_file", { filePath, highlights }),
};

export interface PreferencesPayload {
  zoom: number | null;
  sidebar_left_width: number | null;
  sidebar_right_width: number | null;
  copy_as_markdown: boolean | null;
  sidebar_group_by_repo: boolean | null;
}

export interface HighlightPayload {
  id: string;
  filePath: string;
  colour: string;
  sourceStartLine: number;
  sourceEndLine: number;
  passage: string;
  occurrence: number;
  section: string;
  createdAt: string;
}

export interface HighlightsFilePayload {
  version: number;
  files: Record<string, HighlightPayload[]>;
}

export function onFolderChanged(cb: (folderId: string) => void): Promise<UnlistenFn> {
  return listen<string>("folder://changed", (e) => cb(e.payload));
}

export function onFileChanged(cb: (paths: string[]) => void): Promise<UnlistenFn> {
  return listen<string[]>("file://changed", (e) => cb(e.payload));
}

export function onCliTarget(cb: (t: InitialTarget) => void): Promise<UnlistenFn> {
  return listen<InitialTarget>("cli://target", (e) => cb(e.payload));
}
