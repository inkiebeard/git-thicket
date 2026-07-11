mod git;
mod watch;

use tauri_plugin_dialog::DialogExt;
use watch::WatchState;

#[tauri::command]
async fn open_repo_dialog(app: tauri::AppHandle) -> Option<String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_folder(move |folder| {
        let _ = tx.send(folder);
    });
    rx.recv().ok().flatten().map(|p| p.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(WatchState::new())
        .invoke_handler(tauri::generate_handler![
            open_repo_dialog,
            watch::watch_repo,
            watch::unwatch_repo,
            git::is_git_repo,
            git::list_commits,
            git::list_refs,
            git::list_worktrees,
            git::get_commit_files,
            git::get_file_diff,
            git::get_commit_detail,
            git::current_branch,
            git::ahead_behind,
            git::list_remotes,
            git::add_remote,
            git::fetch_all,
            git::pull,
            git::push,
            git::stash_list,
            git::stash_push,
            git::stash_pop,
            git::stash_drop,
            git::stash_show,
            git::checkout_ref,
            git::create_branch,
            git::delete_branch,
            git::rename_branch,
            git::move_branch,
            git::set_upstream,
            git::delete_remote_branch,
            git::run_git_args,
            git::create_tag,
            git::delete_tag,
            git::push_tag,
            git::delete_remote_tag,
            git::cherry_pick,
            git::revert_commit,
            git::reset_to_commit,
            git::fast_forward_branch,
            git::rebase_branch,
            git::git_status,
            git::stage_path,
            git::unstage_path,
            git::read_working_file,
            git::resolve_conflict,
            git::stage_paths,
            git::unstage_paths,
            git::stage_all,
            git::unstage_all,
            git::commit,
            git::get_working_file_diff,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
