mod git;

use tauri_plugin_dialog::DialogExt;

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
        .invoke_handler(tauri::generate_handler![
            open_repo_dialog,
            git::is_git_repo,
            git::list_commits,
            git::list_refs,
            git::get_commit_files,
            git::get_file_diff,
            git::get_commit_detail,
            git::current_branch,
            git::fetch_all,
            git::pull,
            git::push,
            git::stash_list,
            git::stash_push,
            git::stash_pop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
