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
  addFolder: (path: string) => invoke<Folder>("add_folder", { path }),
  removeFolder: (id: string) => invoke<void>("remove_folder", { id }),
  readFolderTree: (id: string) => invoke<TreeNode>("read_folder_tree", { id }),
  searchFiles: (query: string, limit = 50) =>
    invoke<SearchResult[]>("search_files", { args: { query, limit } }),
  getRecentFiles: () => invoke<string[]>("get_recent_files"),
  saveTheme: (theme: string) => invoke<void>("save_theme", { theme }),
};

export function onFolderChanged(cb: (folderId: string) => void): Promise<UnlistenFn> {
  return listen<string>("folder://changed", (e) => cb(e.payload));
}

export function onCliTarget(cb: (t: InitialTarget) => void): Promise<UnlistenFn> {
  return listen<InitialTarget>("cli://target", (e) => cb(e.payload));
}
