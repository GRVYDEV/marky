import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type InitialTarget =
  | { kind: "file"; path: string }
  | { kind: "vault"; path: string }
  | { kind: "none" };

export interface Vault {
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
  vault_id: string;
  vault_name: string;
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
  listVaults: () => invoke<Vault[]>("list_vaults"),
  addVault: (path: string) => invoke<Vault>("add_vault", { path }),
  removeVault: (id: string) => invoke<void>("remove_vault", { id }),
  readVaultTree: (id: string) => invoke<TreeNode>("read_vault_tree", { id }),
  searchVaultFiles: (query: string, limit = 50) =>
    invoke<SearchResult[]>("search_vault_files", { args: { query, limit } }),
  getRecentFiles: () => invoke<string[]>("get_recent_files"),
  saveTheme: (theme: string) => invoke<void>("save_theme", { theme }),
};

export function onVaultChanged(cb: (vaultId: string) => void): Promise<UnlistenFn> {
  return listen<string>("vault://changed", (e) => cb(e.payload));
}

export function onCliTarget(cb: (t: InitialTarget) => void): Promise<UnlistenFn> {
  return listen<InitialTarget>("cli://target", (e) => cb(e.payload));
}
