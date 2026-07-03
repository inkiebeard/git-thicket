use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize)]
pub struct CommitInfo {
    pub hash: String,
    pub parents: Vec<String>,
    pub author: String,
    pub date: String,
    pub subject: String,
}

#[derive(Debug, Serialize)]
pub struct RefInfo {
    pub name: String,
    pub hash: String,
    pub kind: String, // "branch", "remote-branch", "tag", "head"
    pub upstream: Option<String>, // e.g. "origin/main"; only set for local branches with a tracked remote
}

#[derive(Debug, Serialize)]
pub struct CommitDetail {
    pub hash: String,
    pub author_name: String,
    pub author_email: String,
    pub author_date: String,
    pub committer_name: String,
    pub committer_email: String,
    pub committer_date: String,
    pub subject: String,
    pub body: String,
}

#[derive(Debug, Serialize)]
pub struct FileChange {
    pub path: String,
    pub old_path: Option<String>,
    pub status: String, // "added", "modified", "deleted", "renamed", "copied"
}

#[derive(Debug, Serialize)]
pub struct StashEntry {
    pub index: u32,
    pub message: String,
}

fn run_git(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(args)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

const RS: char = '\u{1f}'; // field separator
const RE: char = '\u{1e}'; // record separator

#[tauri::command]
pub fn is_git_repo(repo_path: String) -> bool {
    run_git(&repo_path, &["rev-parse", "--is-inside-work-tree"])
        .map(|s| s.trim() == "true")
        .unwrap_or(false)
}

#[tauri::command]
pub fn list_commits(repo_path: String, limit: u32, skip: u32) -> Result<Vec<CommitInfo>, String> {
    let format = format!("%H{RS}%P{RS}%an{RS}%ad{RS}%s{RE}");
    let limit_arg = format!("-n{limit}");
    let skip_arg = format!("--skip={skip}");
    let output = run_git(
        &repo_path,
        &[
            "log",
            "--all",
            "--date-order",
            &format!("--format={format}"),
            "--date=iso-strict",
            &limit_arg,
            &skip_arg,
        ],
    )?;

    let commits = output
        .split(RE)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .filter_map(|record| {
            let fields: Vec<&str> = record.split(RS).collect();
            if fields.len() < 5 {
                return None;
            }
            Some(CommitInfo {
                hash: fields[0].to_string(),
                parents: fields[1]
                    .split_whitespace()
                    .map(str::to_string)
                    .collect(),
                author: fields[2].to_string(),
                date: fields[3].to_string(),
                subject: fields[4].to_string(),
            })
        })
        .collect();

    Ok(commits)
}

#[tauri::command]
pub fn list_refs(repo_path: String) -> Result<Vec<RefInfo>, String> {
    let output = run_git(
        &repo_path,
        &[
            "for-each-ref",
            &format!("--format=%(refname){RS}%(objectname){RS}%(HEAD){RS}%(upstream:short)"),
            "refs/heads",
            "refs/remotes",
            "refs/tags",
        ],
    )?;

    let refs = output
        .lines()
        .filter_map(|line| {
            let fields: Vec<&str> = line.split(RS).collect();
            if fields.len() < 4 {
                return None;
            }
            let refname = fields[0];
            let hash = fields[1].to_string();
            let is_head = fields[2] == "*";
            let upstream = if fields[3].is_empty() {
                None
            } else {
                Some(fields[3].to_string())
            };

            let (name, kind) = if let Some(n) = refname.strip_prefix("refs/heads/") {
                (n.to_string(), "branch")
            } else if let Some(n) = refname.strip_prefix("refs/remotes/") {
                (n.to_string(), "remote-branch")
            } else if let Some(n) = refname.strip_prefix("refs/tags/") {
                (n.to_string(), "tag")
            } else {
                (refname.to_string(), "other")
            };

            Some(RefInfo {
                name,
                hash,
                kind: if is_head { "head".to_string() } else { kind.to_string() },
                upstream,
            })
        })
        .collect();

    Ok(refs)
}

fn status_code_to_name(code: &str) -> &'static str {
    match code.chars().next().unwrap_or(' ') {
        'A' => "added",
        'D' => "deleted",
        'M' => "modified",
        'R' => "renamed",
        'C' => "copied",
        'T' => "type-changed",
        _ => "modified",
    }
}

#[tauri::command]
pub fn get_commit_files(repo_path: String, sha: String) -> Result<Vec<FileChange>, String> {
    // Root commits have no parent; diff against the empty tree instead.
    let has_parent = run_git(&repo_path, &["rev-parse", &format!("{sha}^")]).is_ok();

    let output = if has_parent {
        // Plain `git diff` (rather than `diff-tree`) so merge commits still show
        // their first-parent diff instead of being silently suppressed.
        run_git(
            &repo_path,
            &["diff", "--name-status", "-M", "-r", &format!("{sha}^"), &sha],
        )?
    } else {
        // 4b825dc642cb6eb9a060e54bf8d69288fbee4904 is git's canonical empty tree hash.
        run_git(
            &repo_path,
            &[
                "diff",
                "--no-commit-id",
                "--name-status",
                "-M",
                "-r",
                "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
                &sha,
            ],
        )?
    };

    let files = output
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() < 2 {
                return None;
            }
            let status = status_code_to_name(parts[0]);
            if status == "renamed" && parts.len() >= 3 {
                Some(FileChange {
                    old_path: Some(parts[1].to_string()),
                    path: parts[2].to_string(),
                    status: status.to_string(),
                })
            } else {
                Some(FileChange {
                    old_path: None,
                    path: parts[1].to_string(),
                    status: status.to_string(),
                })
            }
        })
        .collect();

    Ok(files)
}

#[tauri::command]
pub fn get_commit_detail(repo_path: String, sha: String) -> Result<CommitDetail, String> {
    let format = format!("%H{RS}%an{RS}%ae{RS}%ad{RS}%cn{RS}%ce{RS}%cd{RS}%s{RS}%b");
    let output = run_git(
        &repo_path,
        &[
            "show",
            "-s",
            &format!("--format={format}"),
            "--date=iso-strict",
            &sha,
        ],
    )?;

    let fields: Vec<&str> = output.splitn(9, RS).collect();
    if fields.len() < 9 {
        return Err("failed to parse commit detail".to_string());
    }

    Ok(CommitDetail {
        hash: fields[0].to_string(),
        author_name: fields[1].to_string(),
        author_email: fields[2].to_string(),
        author_date: fields[3].to_string(),
        committer_name: fields[4].to_string(),
        committer_email: fields[5].to_string(),
        committer_date: fields[6].to_string(),
        subject: fields[7].to_string(),
        body: fields[8].trim_end().to_string(),
    })
}

#[tauri::command]
pub fn current_branch(repo_path: String) -> Result<String, String> {
    run_git(&repo_path, &["rev-parse", "--abbrev-ref", "HEAD"]).map(|s| s.trim().to_string())
}

#[tauri::command]
pub fn fetch_all(repo_path: String) -> Result<String, String> {
    run_git(&repo_path, &["fetch", "--all", "--prune"])
}

#[tauri::command]
pub fn pull(repo_path: String) -> Result<String, String> {
    run_git(&repo_path, &["pull"])
}

/// `force_mode`: None for a plain push, `Some("force")` or `Some("force-with-lease")`
/// for the corresponding destructive push variant.
#[tauri::command]
pub fn push(repo_path: String, force_mode: Option<String>) -> Result<String, String> {
    let mut args = vec!["push"];
    match force_mode.as_deref() {
        Some("force") => args.push("--force"),
        Some("force-with-lease") => args.push("--force-with-lease"),
        _ => {}
    }
    run_git(&repo_path, &args)
}

#[tauri::command]
pub fn stash_list(repo_path: String) -> Result<Vec<StashEntry>, String> {
    let output = run_git(&repo_path, &["stash", "list"])?;

    let entries = output
        .lines()
        .filter_map(|line| {
            // format: "stash@{0}: WIP on main: abc123 message"
            let open = line.find('{')?;
            let close = line.find('}')?;
            let index: u32 = line[open + 1..close].parse().ok()?;
            let message = line.splitn(2, ": ").nth(1).unwrap_or("").to_string();
            Some(StashEntry { index, message })
        })
        .collect();

    Ok(entries)
}

#[tauri::command]
pub fn stash_push(repo_path: String, message: Option<String>) -> Result<String, String> {
    match &message {
        Some(m) => run_git(&repo_path, &["stash", "push", "-m", m]),
        None => run_git(&repo_path, &["stash", "push"]),
    }
}

#[tauri::command]
pub fn stash_pop(repo_path: String, index: Option<u32>) -> Result<String, String> {
    match index {
        Some(i) => {
            let stash_ref = format!("stash@{{{i}}}");
            run_git(&repo_path, &["stash", "pop", &stash_ref])
        }
        None => run_git(&repo_path, &["stash", "pop"]),
    }
}

#[tauri::command]
pub fn get_file_diff(repo_path: String, sha: String, file_path: String) -> Result<String, String> {
    let has_parent = run_git(&repo_path, &["rev-parse", &format!("{sha}^")]).is_ok();

    if has_parent {
        run_git(
            &repo_path,
            &[
                "diff",
                &format!("{sha}^"),
                &sha,
                "--",
                &file_path,
            ],
        )
    } else {
        run_git(
            &repo_path,
            &[
                "diff",
                "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
                &sha,
                "--",
                &file_path,
            ],
        )
    }
}
