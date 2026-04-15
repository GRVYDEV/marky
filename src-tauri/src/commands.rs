use crate::cli::InitialTarget;
use crate::error::{AppError, AppResult};
use crate::registry::SharedRegistry;
use crate::search::{search, SearchResult};
use crate::settings::{data_dir, Vault};
use crate::vault::TreeNode;
use crate::watcher::{watch_vault, SharedWatchers};
use parking_lot::Mutex;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, State};

pub struct InitialTargetState(pub Mutex<InitialTarget>);

#[tauri::command]
pub fn get_initial_target(state: State<'_, InitialTargetState>) -> InitialTarget {
    state.0.lock().clone()
}

/// Replace the current initial target — used when single-instance fires for a new file.
#[tauri::command]
pub fn set_initial_target(target: InitialTarget, state: State<'_, InitialTargetState>) {
    *state.0.lock() = target;
}

#[tauri::command]
pub fn read_file(path: String, registry: State<'_, SharedRegistry>) -> AppResult<String> {
    let contents = crate::fs::read_text(&path)?;
    registry.push_recent(path);
    let _ = registry.save(&data_dir());
    Ok(contents)
}

#[tauri::command]
pub fn list_vaults(registry: State<'_, SharedRegistry>) -> Vec<Vault> {
    registry.vaults()
}

#[tauri::command]
pub fn add_vault(
    app: AppHandle,
    path: String,
    registry: State<'_, SharedRegistry>,
    watchers: State<'_, SharedWatchers>,
) -> AppResult<Vault> {
    let vault = registry.add_vault(PathBuf::from(&path))?;
    registry.save(&data_dir())?;
    if let Ok(handle) = watch_vault(
        app.clone(),
        Arc::clone(&registry),
        vault.id.clone(),
        PathBuf::from(&vault.path),
    ) {
        watchers.insert(vault.id.clone(), handle);
    }
    Ok(vault)
}

#[tauri::command]
pub fn remove_vault(
    id: String,
    registry: State<'_, SharedRegistry>,
    watchers: State<'_, SharedWatchers>,
) -> AppResult<()> {
    registry.remove_vault(&id);
    watchers.remove(&id);
    registry.save(&data_dir())?;
    Ok(())
}

#[tauri::command]
pub fn read_vault_tree(
    id: String,
    registry: State<'_, SharedRegistry>,
) -> AppResult<TreeNode> {
    registry
        .tree(&id)
        .ok_or_else(|| AppError::NotFound(format!("vault {id}")))
}

#[derive(serde::Deserialize)]
pub struct SearchArgs {
    pub query: String,
    #[serde(default = "default_limit")]
    pub limit: usize,
}

fn default_limit() -> usize {
    50
}

#[tauri::command]
pub fn search_vault_files(
    args: SearchArgs,
    registry: State<'_, SharedRegistry>,
) -> Vec<SearchResult> {
    let snapshot = registry.index_snapshot();
    search(&snapshot, &args.query, args.limit)
}

#[tauri::command]
pub fn get_recent_files(registry: State<'_, SharedRegistry>) -> Vec<String> {
    registry.settings().recent_files
}

#[tauri::command]
pub fn save_theme(theme: String, registry: State<'_, SharedRegistry>) -> AppResult<()> {
    registry.save_with(&data_dir(), |s| s.theme = Some(theme))
}
