use crate::cli::InitialTarget;
use crate::error::{AppError, AppResult};
use crate::folder::TreeNode;
use crate::registry::SharedRegistry;
use crate::search::{search, SearchResult};
use crate::settings::{data_dir, Folder};
use crate::watcher::{watch_folder, SharedWatchers};
use parking_lot::Mutex;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

pub struct InitialTargetState(pub Mutex<InitialTarget>);

#[tauri::command]
pub fn get_initial_target(state: State<'_, InitialTargetState>) -> InitialTarget {
    state.0.lock().clone()
}

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
pub fn list_folders(registry: State<'_, SharedRegistry>) -> Vec<Folder> {
    registry.folders()
}

#[tauri::command]
pub fn add_folder(
    app: AppHandle,
    path: String,
    registry: State<'_, SharedRegistry>,
    watchers: State<'_, SharedWatchers>,
) -> AppResult<Folder> {
    let folder = registry.add_folder(PathBuf::from(&path))?;
    registry.save(&data_dir())?;
    if let Ok(handle) = watch_folder(
        app.clone(),
        Arc::clone(&registry),
        folder.id.clone(),
        PathBuf::from(&folder.path),
    ) {
        watchers.insert(folder.id.clone(), handle);
    }
    let _ = app.emit("folder://changed", &folder.id);
    Ok(folder)
}

#[tauri::command]
pub fn remove_folder(
    app: AppHandle,
    id: String,
    registry: State<'_, SharedRegistry>,
    watchers: State<'_, SharedWatchers>,
) -> AppResult<()> {
    registry.remove_folder(&id);
    watchers.remove(&id);
    registry.save(&data_dir())?;
    let _ = app.emit("folder://changed", &id);
    Ok(())
}

#[tauri::command]
pub fn read_folder_tree(id: String, registry: State<'_, SharedRegistry>) -> AppResult<TreeNode> {
    registry
        .tree(&id)
        .ok_or_else(|| AppError::NotFound(format!("folder {id}")))
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
pub fn search_files(
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
