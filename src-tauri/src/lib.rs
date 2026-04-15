mod cli;
mod commands;
mod error;
mod fs;
mod registry;
mod search;
mod settings;
mod vault;
mod watcher;

use commands::InitialTargetState;
use parking_lot::Mutex;
use registry::{SharedRegistry, VaultRegistry};
use settings::{data_dir, Settings};
use std::path::PathBuf;
use std::sync::Arc;
use watcher::{watch_vault, SharedWatchers, Watchers};

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
            if let Some(state) = app.try_state::<InitialTargetState>() {
                *state.0.lock() = new_target.clone();
            }
            let _ = tauri::Emitter::emit(app, "cli://target", &new_target);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .setup(move |app| {
            use tauri::Manager;

            let dir = data_dir();
            let settings = Settings::load(&dir).unwrap_or_default();
            let registry: SharedRegistry = Arc::new(VaultRegistry::from_settings(settings));
            let watchers: SharedWatchers = Arc::new(Watchers::default());

            let handle = app.handle().clone();
            for vault in registry.vaults() {
                if let Ok(w) = watch_vault(
                    handle.clone(),
                    Arc::clone(&registry),
                    vault.id.clone(),
                    PathBuf::from(&vault.path),
                ) {
                    watchers.insert(vault.id.clone(), w);
                }
            }

            let initial_resolved = match &initial {
                cli::InitialTarget::Vault { path } => {
                    match registry.add_vault(PathBuf::from(path)) {
                        Ok(v) => {
                            let _ = registry.save(&dir);
                            if let Ok(w) = watch_vault(
                                handle.clone(),
                                Arc::clone(&registry),
                                v.id.clone(),
                                PathBuf::from(&v.path),
                            ) {
                                watchers.insert(v.id.clone(), w);
                            }
                            cli::InitialTarget::Vault { path: v.path }
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
            commands::list_vaults,
            commands::add_vault,
            commands::remove_vault,
            commands::read_vault_tree,
            commands::search_vault_files,
            commands::get_recent_files,
            commands::save_theme,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
