use crate::registry::SharedRegistry;
use notify_debouncer_full::{
    new_debouncer, notify::RecursiveMode, DebounceEventResult, Debouncer, RecommendedCache,
};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub struct WatcherHandle {
    _debouncer: Debouncer<notify::RecommendedWatcher, RecommendedCache>,
}

/// Spin up a debounced watcher per folder. On any change, re-index the folder
/// and emit `folder://changed` with the folder id so the frontend can refresh.
pub fn watch_folder(
    app: AppHandle,
    registry: SharedRegistry,
    folder_id: String,
    root: PathBuf,
) -> anyhow::Result<WatcherHandle> {
    let app_for_cb = app.clone();
    let reg_for_cb = registry.clone();
    let id_for_cb = folder_id.clone();

    let mut debouncer = new_debouncer(
        Duration::from_millis(200),
        None,
        move |res: DebounceEventResult| {
            if res.is_err() {
                return;
            }
            reg_for_cb.refresh_folder(&id_for_cb);
            let _ = app_for_cb.emit("folder://changed", &id_for_cb);
        },
    )?;

    debouncer.watch(&root, RecursiveMode::Recursive)?;
    Ok(WatcherHandle {
        _debouncer: debouncer,
    })
}

/// Lifetime holder for active watchers, keyed by folder id.
#[derive(Default)]
pub struct Watchers {
    inner: parking_lot::Mutex<std::collections::HashMap<String, WatcherHandle>>,
}

impl Watchers {
    pub fn insert(&self, id: String, handle: WatcherHandle) {
        self.inner.lock().insert(id, handle);
    }

    pub fn remove(&self, id: &str) {
        self.inner.lock().remove(id);
    }
}

pub type SharedWatchers = Arc<Watchers>;
