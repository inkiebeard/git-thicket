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
///
/// Runs on `spawn_blocking` rather than directly in this command body:
/// `watcher().watch(..., RecursiveMode::Recursive)` walks the entire repo
/// tree to register it (on Windows, a recursive `ReadDirectoryChangesW`
/// setup) — for a large working tree that's real, blocking work, and this
/// gets called *first* in `activateRepo` on the frontend, ahead of every
/// git-data command for the tab being switched to. A `#[tauri::command
/// (async)]` on a plain (non-`async`) fn still runs synchronously on the
/// webview's IPC dispatch thread, so left as-is this would stall every one
/// of those git calls behind however long the watch setup takes, on top of
/// the same class of bug already fixed for the git commands themselves.
#[tauri::command(async)]
pub async fn watch_repo(app: AppHandle, repo_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<WatchState>();
        let mut guard = state.0.lock().map_err(|_| "watch state poisoned".to_string())?;

        let emit_path = repo_path.clone();
        let app_handle = app.clone();
        // `.git` is excluded from what's watched (see below) — every quiet
        // refresh runs `git status`, and `git status` rewrites `.git/index`'s
        // stat-cache as a read-path side effect whenever a tracked file's mtime
        // needs re-checking. Left unfiltered, that write retriggers this
        // watcher, which fires a `repo-changed` refresh, which runs `git status`
        // again, which rewrites the index again — a self-sustaining loop with no
        // user action or network involved (this is why other git GUIs generally
        // don't watch `.git` either). Commits/checkouts/merges made from outside
        // the app are still caught: the unconditional background poll in
        // repoStore.ts refreshes the active tab regardless of watcher state, the
        // watcher is only a responsiveness bonus on top of it, and any real edit
        // to a tracked file still shows up as a working-tree change here.
        let git_dir = Path::new(&repo_path).join(".git");
        let mut debouncer = new_debouncer(Duration::from_millis(DEBOUNCE_MS), move |result: DebounceEventResult| {
            if let Ok(events) = result {
                let relevant = events.iter().any(|e| !e.path.starts_with(&git_dir));
                if relevant {
                    let _ = app_handle.emit("repo-changed", emit_path.clone());
                }
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
    })
    .await
    .map_err(|e| format!("task failed: {e}"))?
}

/// Stops watching, if anything is currently being watched — used when the
/// last tab closes and there's no active repo left to watch.
#[tauri::command(async)]
pub async fn unwatch_repo(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<WatchState>();
        let mut guard = state.0.lock().map_err(|_| "watch state poisoned".to_string())?;
        *guard = None;
        Ok(())
    })
    .await
    .map_err(|e| format!("task failed: {e}"))?
}
