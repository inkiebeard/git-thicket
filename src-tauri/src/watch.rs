use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// Debounce window for coalescing a burst of filesystem events (a `git
/// commit` alone touches several files under `.git`) into a single
/// `repo-changed` event, rather than spamming the frontend with a refresh
/// per touched file.
const DEBOUNCE_MS: u64 = 400;

/// Holds at most one active watcher — the one for whichever repo tab is
/// currently active. Replacing the `Option` drops the previous `Debouncer`,
/// which stops its background thread and releases its OS watch handles.
pub struct WatchState(pub Mutex<Option<Debouncer<RecommendedWatcher>>>);

impl WatchState {
    pub fn new() -> Self {
        WatchState(Mutex::new(None))
    }
}

/// Starts watching `repo_path` for filesystem changes, replacing (and
/// thereby stopping) whatever repo was previously being watched. Emits a
/// `repo-changed` event to the frontend whenever files settle after a
/// change, so it can refresh that repo's tab without waiting for the next
/// poll tick. Best-effort: if the watcher fails to start (e.g. an OS watch
/// -handle limit), the app still works via the existing polling fallback.
#[tauri::command(async)]
pub fn watch_repo(app: AppHandle, repo_path: String) -> Result<(), String> {
    let state = app.state::<WatchState>();
    let mut guard = state.0.lock().map_err(|_| "watch state poisoned".to_string())?;

    let emit_path = repo_path.clone();
    let app_handle = app.clone();
    let mut debouncer = new_debouncer(Duration::from_millis(DEBOUNCE_MS), move |result: DebounceEventResult| {
        if result.is_ok() {
            let _ = app_handle.emit("repo-changed", emit_path.clone());
        }
    })
    .map_err(|e| format!("failed to start file watcher: {e}"))?;

    debouncer
        .watcher()
        .watch(Path::new(&repo_path), RecursiveMode::Recursive)
        .map_err(|e| format!("failed to watch {repo_path}: {e}"))?;

    // Assigning here drops (and thereby stops) whatever watcher was
    // previously held, if any.
    *guard = Some(debouncer);
    Ok(())
}

/// Stops watching, if anything is currently being watched — used when the
/// last tab closes and there's no active repo left to watch.
#[tauri::command(async)]
pub fn unwatch_repo(app: AppHandle) -> Result<(), String> {
    let state = app.state::<WatchState>();
    let mut guard = state.0.lock().map_err(|_| "watch state poisoned".to_string())?;
    *guard = None;
    Ok(())
}
