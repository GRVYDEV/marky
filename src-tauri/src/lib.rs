mod cli;
mod commands;
mod error;
mod folder;
mod fs;
mod registry;
mod search;
mod settings;
mod watcher;

use commands::InitialTargetState;
use parking_lot::Mutex;
use registry::{FolderRegistry, SharedRegistry};
use settings::{data_dir, Settings};
use std::path::PathBuf;
use std::sync::Arc;
use watcher::{watch_folder, SharedWatchers, Watchers};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let initial = cli::resolve(&args);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            use tauri::Manager;
            let new_target = cli::resolve(&argv);

            // For folder targets, register/index the folder before notifying the
            // frontend so the sidebar update + auto-switch happen atomically.
            let resolved = match &new_target {
                cli::InitialTarget::Folder { path } => {
                    if let (Some(reg), Some(watchers)) = (
                        app.try_state::<SharedRegistry>(),
                        app.try_state::<SharedWatchers>(),
                    ) {
                        if let Ok(folder) = reg.add_folder(PathBuf::from(path)) {
                            let _ = reg.save(&data_dir());
                            if let Ok(w) = watch_folder(
                                app.clone(),
                                Arc::clone(&*reg),
                                folder.id.clone(),
                                PathBuf::from(&folder.path),
                            ) {
                                watchers.insert(folder.id.clone(), w);
                            }
                            cli::InitialTarget::Folder { path: folder.path }
                        } else {
                            new_target.clone()
                        }
                    } else {
                        new_target.clone()
                    }
                }
                other => other.clone(),
            };

            if let Some(state) = app.try_state::<InitialTargetState>() {
                *state.0.lock() = resolved.clone();
            }
            let _ = tauri::Emitter::emit(app, "cli://target", &resolved);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .setup(move |app| {
            use tauri::Manager;

            let dir = data_dir();
            let settings = Settings::load(&dir).unwrap_or_default();
            let registry: SharedRegistry = Arc::new(FolderRegistry::from_settings(settings));
            let watchers: SharedWatchers = Arc::new(Watchers::default());

            let handle = app.handle().clone();
            for folder in registry.folders() {
                if let Ok(w) = watch_folder(
                    handle.clone(),
                    Arc::clone(&registry),
                    folder.id.clone(),
                    PathBuf::from(&folder.path),
                ) {
                    watchers.insert(folder.id.clone(), w);
                }
            }

            let initial_resolved = match &initial {
                cli::InitialTarget::Folder { path } => {
                    match registry.add_folder(PathBuf::from(path)) {
                        Ok(v) => {
                            let _ = registry.save(&dir);
                            if let Ok(w) = watch_folder(
                                handle.clone(),
                                Arc::clone(&registry),
                                v.id.clone(),
                                PathBuf::from(&v.path),
                            ) {
                                watchers.insert(v.id.clone(), w);
                            }
                            cli::InitialTarget::Folder { path: v.path }
                        }
                        Err(_) => cli::InitialTarget::None,
                    }
                }
                other => other.clone(),
            };

            app.manage(InitialTargetState(Mutex::new(initial_resolved)));
            app.manage(registry);
            app.manage(watchers);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_initial_target,
            commands::set_initial_target,
            commands::read_file,
            commands::list_folders,
            commands::add_folder,
            commands::remove_folder,
            commands::read_folder_tree,
            commands::search_files,
            commands::get_recent_files,
            commands::save_theme,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
