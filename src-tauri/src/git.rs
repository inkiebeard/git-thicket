use serde::Serialize;
use std::collections::HashMap;
use std::process::Command;

#[derive(Debug, Serialize)]
pub struct CommitInfo {
    pub hash: String,
    pub parents: Vec<String>,
    pub author: String,
    pub date: String,
    pub subject: String,
    pub insertions: u32,
    pub deletions: u32,
    pub co_authors: Vec<String>,
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
    pub insertions: u32,
    pub deletions: u32,
}

#[derive(Debug, Serialize)]
pub struct StashEntry {
    pub index: u32,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct RemoteInfo {
    pub name: String,
    pub url: String,
}

#[derive(Debug, Serialize)]
pub struct WorkingFileEntry {
    pub path: String,
    pub old_path: Option<String>,
    /// Status in the index (staged side), e.g. "modified", "added", "none".
    pub index_status: String,
    /// Status in the working tree (unstaged side), plus "untracked".
    pub worktree_status: String,
    pub index_insertions: u32,
    pub index_deletions: u32,
    pub worktree_insertions: u32,
    pub worktree_deletions: u32,
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

/// `git diff --no-index` follows classic `diff(1)` exit-code conventions
/// (0 = identical, 1 = differences found, 2+ = real error) instead of git's
/// usual "0 unless something broke" rule, so it needs its own success check.
fn run_git_diff_no_index(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(args)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;

    match output.status.code() {
        Some(0) | Some(1) => Ok(String::from_utf8_lossy(&output.stdout).to_string()),
        _ => Err(String::from_utf8_lossy(&output.stderr).to_string()),
    }
}

const RS: char = '\u{1f}'; // field separator
const RE: char = '\u{1e}'; // record separator

#[tauri::command]
pub fn is_git_repo(repo_path: String) -> bool {
    run_git(&repo_path, &["rev-parse", "--is-inside-work-tree"])
        .map(|s| s.trim() == "true")
        .unwrap_or(false)
}

/// Parses `git diff --numstat -z` output into a path -> (insertions,
/// deletions) map. `-z` matters for renames: with plain `--numstat`, a
/// rename's path renders as a `{old => new}` compact-common-prefix
/// notation that's painful to reconstruct reliably; with `-z`, a rename
/// record instead has an *empty* path field followed by two extra
/// NUL-terminated fields (old path, then new path). Binary files report
/// "-" for both counts, which parses to 0 here — there's no meaningful line
/// count to show for those anyway.
fn parse_numstat_z(output: &str) -> HashMap<String, (u32, u32)> {
    let mut stats = HashMap::new();
    let mut fields = output.split('\u{0}').filter(|s| !s.is_empty());
    while let Some(record) = fields.next() {
        let parts: Vec<&str> = record.splitn(3, '\t').collect();
        if parts.len() < 3 {
            continue;
        }
        let added = parts[0].parse::<u32>().unwrap_or(0);
        let removed = parts[1].parse::<u32>().unwrap_or(0);
        let path = if parts[2].is_empty() {
            // Rename: consume the old-path field, keep the new-path field.
            fields.next();
            fields.next().unwrap_or("").to_string()
        } else {
            parts[2].to_string()
        };
        if !path.is_empty() {
            stats.insert(path, (added, removed));
        }
    }
    stats
}

/// Parses a `git --shortstat` summary line, e.g.
/// " 3 files changed, 45 insertions(+), 2 deletions(-)". Either count may be
/// absent (a rename-only or pure-addition/deletion commit); missing means 0.
fn parse_shortstat(line: &str) -> (u32, u32) {
    let mut insertions = 0u32;
    let mut deletions = 0u32;
    for part in line.split(',') {
        let part = part.trim();
        if let Some(idx) = part.find("insertion") {
            insertions = part[..idx].trim().parse().unwrap_or(0);
        } else if let Some(idx) = part.find("deletion") {
            deletions = part[..idx].trim().parse().unwrap_or(0);
        }
    }
    (insertions, deletions)
}

/// A separate lightweight `--shortstat` pass, keyed by hash, merged into the
/// structured commit list afterward. Kept separate from the main `%H%P...`
/// format because `--shortstat` output isn't part of the `--format` string —
/// it's an extra freeform summary line git appends per commit — so mixing
/// them into one parse would be fragile.
fn get_commit_stats(repo_path: &str, limit: u32, skip: u32) -> Result<HashMap<String, (u32, u32)>, String> {
    let limit_arg = format!("-n{limit}");
    let skip_arg = format!("--skip={skip}");
    let output = run_git(
        &repo_path,
        &[
            "log",
            "--branches",
            "--tags",
            "HEAD",
            "--date-order",
            "--format=%H",
            "--shortstat",
            &limit_arg,
            &skip_arg,
        ],
    )?;

    let mut stats = HashMap::new();
    let mut current: Option<&str> = None;
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.len() == 40 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
            current = Some(trimmed);
        } else if let Some(hash) = current {
            stats.insert(hash.to_string(), parse_shortstat(trimmed));
        }
    }
    Ok(stats)
}

/// Deliberately `--branches --tags HEAD`, not `--all`: `--all` also walks
/// `refs/remotes/*`, and stale remote-tracking refs for PR branches whose
/// upstream was already deleted (common when the user hasn't run
/// `git fetch --prune`) have no local branch to badge them, so they show up
/// in the graph as unexplained parallel lanes that never visibly connect
/// back to anything. Local branches + tags + HEAD is what actually has a
/// badge in the UI, so it's what should open a lane.
#[tauri::command]
pub fn list_commits(repo_path: String, limit: u32, skip: u32) -> Result<Vec<CommitInfo>, String> {
    // Co-authors come from the `Co-authored-by` trailer via git's own
    // %(trailers:...) placeholder, not a full body fetch — cheap to include
    // per-commit since it's usually empty, unlike pulling %b for everyone.
    let format = format!(
        "%H{RS}%P{RS}%an{RS}%ad{RS}%s{RS}%(trailers:key=Co-authored-by,valueonly,separator=%x1d){RE}"
    );
    let limit_arg = format!("-n{limit}");
    let skip_arg = format!("--skip={skip}");
    let output = run_git(
        &repo_path,
        &[
            "log",
            "--branches",
            "--tags",
            "HEAD",
            "--date-order",
            &format!("--format={format}"),
            "--date=iso-strict",
            &limit_arg,
            &skip_arg,
        ],
    )?;

    let stats = get_commit_stats(&repo_path, limit, skip).unwrap_or_default();

    let commits = output
        .split(RE)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .filter_map(|record| {
            let fields: Vec<&str> = record.split(RS).collect();
            if fields.len() < 6 {
                return None;
            }
            let hash = fields[0].to_string();
            let (insertions, deletions) = stats.get(&hash).copied().unwrap_or((0, 0));
            let co_authors = fields[5]
                .split('\u{1d}')
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .collect();
            Some(CommitInfo {
                hash,
                parents: fields[1]
                    .split_whitespace()
                    .map(str::to_string)
                    .collect(),
                author: fields[2].to_string(),
                date: fields[3].to_string(),
                subject: fields[4].to_string(),
                insertions,
                deletions,
                co_authors,
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
    let base = if has_parent {
        format!("{sha}^")
    } else {
        // 4b825dc642cb6eb9a060e54bf8d69288fbee4904 is git's canonical empty tree hash.
        "4b825dc642cb6eb9a060e54bf8d69288fbee4904".to_string()
    };

    // Plain `git diff` (rather than `diff-tree`) so merge commits still show
    // their first-parent diff instead of being silently suppressed.
    let output = run_git(&repo_path, &["diff", "--name-status", "-M", "-r", &base, &sha])?;
    let numstat_output = run_git(&repo_path, &["diff", "--numstat", "-z", "-M", "-r", &base, &sha])?;
    let stats = parse_numstat_z(&numstat_output);

    let files = output
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() < 2 {
                return None;
            }
            let status = status_code_to_name(parts[0]);
            let (old_path, path) = if status == "renamed" && parts.len() >= 3 {
                (Some(parts[1].to_string()), parts[2].to_string())
            } else {
                (None, parts[1].to_string())
            };
            let (insertions, deletions) = stats.get(&path).copied().unwrap_or((0, 0));
            Some(FileChange {
                old_path,
                path,
                status: status.to_string(),
                insertions,
                deletions,
            })
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
pub fn list_remotes(repo_path: String) -> Result<Vec<RemoteInfo>, String> {
    let output = run_git(&repo_path, &["remote", "-v"])?;
    let mut seen = std::collections::HashSet::new();
    let mut remotes = Vec::new();
    for line in output.lines() {
        let mut parts = line.splitn(2, '\t');
        let name = match parts.next() {
            Some(n) if !n.is_empty() => n,
            _ => continue,
        };
        let rest = match parts.next() {
            Some(r) => r,
            None => continue,
        };
        let url = rest.trim_end_matches(" (fetch)").trim_end_matches(" (push)");
        if !url.is_empty() && seen.insert(name.to_string()) {
            remotes.push(RemoteInfo {
                name: name.to_string(),
                url: url.to_string(),
            });
        }
    }
    Ok(remotes)
}

#[tauri::command]
pub fn add_remote(repo_path: String, name: String, url: String) -> Result<String, String> {
    run_git(&repo_path, &["remote", "add", &name, &url])
}

#[derive(Debug, Serialize)]
pub struct AheadBehind {
    pub ahead: u32,
    pub behind: u32,
}

/// How far `branch` and `upstream` (e.g. "main" and "origin/main") have
/// diverged: `ahead` = commits on `branch` not on `upstream`, `behind` =
/// commits on `upstream` not on `branch`.
#[tauri::command]
pub fn ahead_behind(repo_path: String, branch: String, upstream: String) -> Result<AheadBehind, String> {
    let range = format!("{branch}...{upstream}");
    let output = run_git(&repo_path, &["rev-list", "--left-right", "--count", &range])?;
    let parts: Vec<&str> = output.split_whitespace().collect();
    if parts.len() < 2 {
        return Err("failed to parse ahead/behind counts".to_string());
    }
    Ok(AheadBehind {
        ahead: parts[0].parse().unwrap_or(0),
        behind: parts[1].parse().unwrap_or(0),
    })
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

    // A branch that's never been pushed (or a remote that was just added)
    // has no upstream configured yet, so a plain `git push` fails with
    // "no upstream branch" — set one up automatically instead of erroring.
    let has_upstream = run_git(
        &repo_path,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    )
    .is_ok();

    let remote;
    let branch;
    if !has_upstream {
        let remotes_output = run_git(&repo_path, &["remote"])?;
        remote = remotes_output
            .lines()
            .next()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| "No remote configured".to_string())?
            .to_string();
        branch = run_git(&repo_path, &["rev-parse", "--abbrev-ref", "HEAD"])?
            .trim()
            .to_string();
        args.push("--set-upstream");
        args.push(&remote);
        args.push(&branch);
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

/// Checks out a commit SHA or branch/tag name. For a bare SHA this leaves the
/// repo in detached HEAD state, same as running `git checkout <sha>` by hand.
#[tauri::command]
pub fn checkout_ref(repo_path: String, ref_name: String) -> Result<String, String> {
    run_git(&repo_path, &["checkout", &ref_name])
}

#[tauri::command]
pub fn create_branch(repo_path: String, name: String, sha: String) -> Result<String, String> {
    run_git(&repo_path, &["branch", &name, &sha])
}

#[tauri::command]
pub fn delete_branch(repo_path: String, name: String, force: bool) -> Result<String, String> {
    let flag = if force { "-D" } else { "-d" };
    run_git(&repo_path, &["branch", flag, &name])
}

/// `git branch -m` preserves whatever upstream the branch was already
/// tracking (it renames the config section along with the branch) — it
/// does not retarget tracking to a same-named remote branch. If that's
/// needed (e.g. renaming to match a differently-named remote default), the
/// user still pushes with `-u` afterward to point it there explicitly.
#[tauri::command]
pub fn rename_branch(repo_path: String, old_name: String, new_name: String) -> Result<String, String> {
    run_git(&repo_path, &["branch", "-m", &old_name, &new_name])
}

/// `git branch -f` refuses to move the currently checked-out branch ("error:
/// Cannot force update the current branch"); repointing HEAD's own branch
/// should go through `reset_to_commit` instead, which the UI already offers
/// from the commit context menu.
#[tauri::command]
pub fn move_branch(repo_path: String, name: String, target: String) -> Result<String, String> {
    run_git(&repo_path, &["branch", "-f", &name, &target])
}

#[tauri::command]
pub fn set_upstream(repo_path: String, name: String, upstream: String) -> Result<String, String> {
    run_git(&repo_path, &["branch", "--set-upstream-to", &upstream, &name])
}

#[tauri::command]
pub fn delete_remote_branch(repo_path: String, remote: String, name: String) -> Result<String, String> {
    run_git(&repo_path, &["push", &remote, "--delete", &name])
}

/// Runs an arbitrary git subcommand built from discrete argv entries — the
/// backend for the "terminal" command composer. Safe from shell injection
/// the same way every other command here is: args go straight to
/// `Command::new("git").args(..)`, never through a shell, so there's no
/// metacharacter/quoting concern. It's still a broad hatch (any git
/// subcommand), so the frontend is expected to only ever construct `args`
/// from its own validated block selections, not free-text input.
#[tauri::command]
pub fn run_git_args(repo_path: String, args: Vec<String>) -> Result<String, String> {
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    run_git(&repo_path, &arg_refs)
}

#[tauri::command]
pub fn create_tag(repo_path: String, name: String, sha: String) -> Result<String, String> {
    run_git(&repo_path, &["tag", &name, &sha])
}

#[tauri::command]
pub fn delete_tag(repo_path: String, name: String) -> Result<String, String> {
    run_git(&repo_path, &["tag", "-d", &name])
}

/// A plain `git push <remote> <tag>` only pushes the tag ref itself, unlike
/// `--tags` which pushes every tag in the repo — scoped to just the one the
/// user asked for.
#[tauri::command]
pub fn push_tag(repo_path: String, remote: String, name: String) -> Result<String, String> {
    run_git(&repo_path, &["push", &remote, &name])
}

#[tauri::command]
pub fn delete_remote_tag(repo_path: String, remote: String, name: String) -> Result<String, String> {
    run_git(&repo_path, &["push", &remote, "--delete", &name])
}

#[tauri::command]
pub fn cherry_pick(repo_path: String, sha: String) -> Result<String, String> {
    run_git(&repo_path, &["cherry-pick", &sha])
}

#[tauri::command]
pub fn revert_commit(repo_path: String, sha: String) -> Result<String, String> {
    run_git(&repo_path, &["revert", "--no-edit", &sha])
}

/// `mode`: "soft", "mixed", or "hard" — matches the `git reset --<mode>` flag.
#[tauri::command]
pub fn reset_to_commit(repo_path: String, sha: String, mode: String) -> Result<String, String> {
    let flag = match mode.as_str() {
        "soft" => "--soft",
        "hard" => "--hard",
        _ => "--mixed",
    };
    run_git(&repo_path, &["reset", flag, &sha])
}

fn status_char_to_name(c: char) -> &'static str {
    match c {
        ' ' => "none",
        'M' => "modified",
        'A' => "added",
        'D' => "deleted",
        'R' => "renamed",
        'C' => "copied",
        'U' => "unmerged",
        'T' => "type-changed",
        '?' => "untracked",
        '!' => "ignored",
        _ => "modified",
    }
}

#[tauri::command]
/// Untracked files have no index/tree entry to diff against, so `git diff`
/// can't report a line count for them; read the file directly instead
/// (insertions = line count, deletions = 0). Best-effort: unreadable or
/// binary-looking content just falls back to 0.
fn count_file_lines(repo_path: &str, path: &str) -> u32 {
    let full_path = std::path::Path::new(repo_path).join(path);
    let Ok(bytes) = std::fs::read(&full_path) else {
        return 0;
    };
    if bytes.iter().take(8000).any(|&b| b == 0) {
        return 0; // looks binary
    }
    match String::from_utf8(bytes) {
        Ok(text) if !text.is_empty() => text.lines().count() as u32,
        _ => 0,
    }
}

#[tauri::command]
pub fn git_status(repo_path: String) -> Result<Vec<WorkingFileEntry>, String> {
    let output = run_git(
        &repo_path,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    )?;

    // Best-effort: a failure here shouldn't block the status list itself,
    // just leave counts at 0.
    let staged_stats = run_git(&repo_path, &["diff", "--cached", "--numstat", "-z", "-M"])
        .map(|s| parse_numstat_z(&s))
        .unwrap_or_default();
    let unstaged_stats = run_git(&repo_path, &["diff", "--numstat", "-z", "-M"])
        .map(|s| parse_numstat_z(&s))
        .unwrap_or_default();

    let mut entries = Vec::new();
    let mut fields = output.split('\u{0}').filter(|s| !s.is_empty());

    while let Some(record) = fields.next() {
        let mut chars = record.chars();
        let index_char = match chars.next() {
            Some(c) => c,
            None => continue,
        };
        let worktree_char = match chars.next() {
            Some(c) => c,
            None => continue,
        };
        // record[3..] skips the two status chars and the separating space.
        let path = record.get(3..).unwrap_or("").to_string();
        // Git reports untracked files as "??" — both chars map to
        // "untracked" individually, but that's one combined marker, not two
        // independent per-side statuses. An untracked file has nothing in
        // the index at all, so index_status must read "none" or it
        // misclassifies as staged (and "unstage" on it is a no-op, since
        // there's nothing staged to restore away).
        let (index_status, worktree_status) = if index_char == '?' && worktree_char == '?' {
            ("none", "untracked")
        } else {
            (status_char_to_name(index_char), status_char_to_name(worktree_char))
        };

        let is_rename_or_copy = matches!(index_status, "renamed" | "copied")
            || matches!(worktree_status, "renamed" | "copied");
        let old_path = if is_rename_or_copy {
            fields.next().map(str::to_string)
        } else {
            None
        };

        let (index_insertions, index_deletions) = staged_stats.get(&path).copied().unwrap_or((0, 0));
        let (worktree_insertions, worktree_deletions) = if worktree_status == "untracked" {
            (count_file_lines(&repo_path, &path), 0)
        } else {
            unstaged_stats.get(&path).copied().unwrap_or((0, 0))
        };

        entries.push(WorkingFileEntry {
            path,
            old_path,
            index_status: index_status.to_string(),
            worktree_status: worktree_status.to_string(),
            index_insertions,
            index_deletions,
            worktree_insertions,
            worktree_deletions,
        });
    }

    Ok(entries)
}

#[tauri::command]
pub fn stage_path(repo_path: String, path: String) -> Result<String, String> {
    run_git(&repo_path, &["add", "--", &path])
}

#[tauri::command]
pub fn unstage_path(repo_path: String, path: String) -> Result<String, String> {
    run_git(&repo_path, &["restore", "--staged", "--", &path])
}

#[tauri::command]
pub fn stage_paths(repo_path: String, paths: Vec<String>) -> Result<String, String> {
    if paths.is_empty() {
        return Ok(String::new());
    }
    let mut args: Vec<&str> = vec!["add", "--"];
    args.extend(paths.iter().map(String::as_str));
    run_git(&repo_path, &args)
}

#[tauri::command]
pub fn unstage_paths(repo_path: String, paths: Vec<String>) -> Result<String, String> {
    if paths.is_empty() {
        return Ok(String::new());
    }
    let mut args: Vec<&str> = vec!["restore", "--staged", "--"];
    args.extend(paths.iter().map(String::as_str));
    run_git(&repo_path, &args)
}

#[tauri::command]
pub fn stage_all(repo_path: String) -> Result<String, String> {
    run_git(&repo_path, &["add", "-A"])
}

#[tauri::command]
pub fn unstage_all(repo_path: String) -> Result<String, String> {
    run_git(&repo_path, &["restore", "--staged", "."])
}

#[tauri::command]
pub fn commit(repo_path: String, message: String, amend: bool) -> Result<String, String> {
    if amend {
        run_git(&repo_path, &["commit", "--amend", "-m", &message])
    } else {
        run_git(&repo_path, &["commit", "-m", &message])
    }
}

/// `staged` selects `diff --cached`; for unstaged changes, `untracked` picks
/// between a plain working-tree diff (tracked file) and a `--no-index` diff
/// against `/dev/null` (new file git has no record of yet).
#[tauri::command]
pub fn get_working_file_diff(
    repo_path: String,
    path: String,
    staged: bool,
    untracked: bool,
) -> Result<String, String> {
    if staged {
        run_git(&repo_path, &["diff", "--cached", "--", &path])
    } else if untracked {
        run_git_diff_no_index(&repo_path, &["diff", "--no-index", "--", "/dev/null", &path])
    } else {
        run_git(&repo_path, &["diff", "--", &path])
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
