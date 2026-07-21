use serde::Serialize;
use std::collections::HashMap;
use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use tauri::Emitter;

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
pub struct WorktreeInfo {
    pub path: String,
    /// Branch checked out in this worktree, e.g. "main"; `None` for a
    /// detached-HEAD worktree.
    pub branch: Option<String>,
    pub head: String,
    pub locked: bool,
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
    /// The commit HEAD was on when this stash was created — `stash@{n}` is
    /// itself a commit whose first parent is that base (`^2` holds the
    /// staged changes, `^3` untracked files if `-u`/`-a` was used).
    pub base_hash: String,
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

#[derive(Debug, Serialize, Clone)]
pub struct DiffChunk {
    pub chunk: String,
    pub sequence: u32,
    pub is_final: bool,
}

// Every command in this module is `#[tauri::command(async)]`: without the
// `async` attribute Tauri runs sync commands on the main thread, so anything
// slow — `git fetch` over the network, `git log` on a big repo — freezes the
// whole window for its duration. The attribute moves execution to a worker
// thread while the bodies stay plain blocking code.

// Commands that touch the network (fetch/pull/push/ls-remote) get a longer
// budget than local-only ones (log/status/etc), since a slow-but-alive
// connection shouldn't be killed as aggressively as a truly hung process.
const LOCAL_TIMEOUT: Duration = Duration::from_secs(30);
const NETWORK_TIMEOUT: Duration = Duration::from_secs(60);

fn git_command(repo_path: &str, args: &[&str]) -> Command {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(repo_path).args(args);
    // Without this, a git prompting for a username/password/passphrase over
    // an interactive terminal blocks forever instead of erroring — and since
    // a windows-subsystem app has no console for it to prompt on, there is no
    // way for the user to ever answer it. Force a fast failure instead: any
    // credential helper still runs, only the "ask the user directly" fallback
    // is disabled.
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    // GIT_TERMINAL_PROMPT only covers git's own terminal-based prompt — Git
    // for Windows' default credential helper, Git Credential Manager, has a
    // *separate* GUI prompt (a native dialog, not tied to a console) that
    // isn't gated by it at all. Spawned here with no owning window
    // (CREATE_NO_WINDOW below), that dialog can end up invisible/unfocusable,
    // so the subprocess just hangs waiting for a response nobody can give —
    // silently, since there's no error to catch, just a call that never
    // returns. This is GCM's own documented escape hatch: force it to fail
    // fast instead of ever prompting. No effect on macOS/Linux, where the
    // default helpers (osxkeychain, libsecret) aren't GCM and don't read it.
    cmd.env("GCM_INTERACTIVE", "Never");
    cmd.stdin(Stdio::null());
    // A windows-subsystem app has no console, so each spawned console child
    // would otherwise open its own visible window — with the background fetch
    // that's a console flash every poll tick in release builds.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

// Network operations (fetch/pull/push/ls-remote) can still hang past
// GIT_TERMINAL_PROMPT=0 — a stalled TCP connection or unresponsive SSH server
// never prompts for anything, it just never returns. This is the backstop:
// spawn instead of the blocking `output()`, then poll `try_wait` against a
// deadline and kill the child if it's exceeded. Without it, a single wedged
// `git fetch` freezes that repo's tab forever (nothing else re-triggers a
// load once `loadingCommits` is stuck true — see activateRepo in the
// frontend), and the poll loop backing every open tab piles up one hung
// subprocess per tick on top.
fn run_git_with_timeout(repo_path: &str, args: &[&str], timeout: Duration) -> Result<String, String> {
    let mut child = git_command(repo_path, args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to run git: {e}"))?;

    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(_status)) => break,
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!(
                        "git {} timed out after {}s",
                        args.join(" "),
                        timeout.as_secs()
                    ));
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(e) => return Err(format!("failed to wait for git: {e}")),
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("failed to collect git output: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn run_git(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let timeout = match args.first() {
        Some(&"fetch") | Some(&"pull") | Some(&"push") | Some(&"ls-remote") => NETWORK_TIMEOUT,
        _ => LOCAL_TIMEOUT,
    };
    run_git_with_timeout(repo_path, args, timeout)
}

// Every command below hands its actual work to this, via
// `tauri::async_runtime::spawn_blocking`, rather than running it directly in
// the `#[tauri::command(async)]` function body. A command fn that isn't
// itself an `async fn` (all of these are plain, since the git-shelling logic
// is synchronous) gets invoked by Tauri *inline on the webview's IPC
// message-handling thread* — the same thread that dispatches every other
// pending invoke. A blocking git subprocess call there doesn't just block
// that one request; it blocks Tauri from even starting the *next* request
// until it returns, so switching tabs (which fires a burst of these) stalls
// them all behind whichever one happens to be running. Moving the blocking
// work onto the dedicated blocking-thread pool via `spawn_blocking` frees the
// IPC thread to keep dispatching other invokes concurrently.
async fn run_blocking<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("task failed: {e}"))?
}

/// `git diff --no-index` follows classic `diff(1)` exit-code conventions
/// (0 = identical, 1 = differences found, 2+ = real error) instead of git's
/// usual "0 unless something broke" rule, so it needs its own success check.
fn run_git_diff_no_index(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let output = git_command(repo_path, args)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;

    match output.status.code() {
        Some(0) | Some(1) => Ok(String::from_utf8_lossy(&output.stdout).to_string()),
        _ => Err(String::from_utf8_lossy(&output.stderr).to_string()),
    }
}

const RS: char = '\u{1f}'; // field separator
const RE: char = '\u{1e}'; // record separator

#[tauri::command(async)]
pub async fn is_git_repo(repo_path: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || {
        run_git(&repo_path, &["rev-parse", "--is-inside-work-tree"])
            .map(|s| s.trim() == "true")
            .unwrap_or(false)
    })
    .await
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
fn get_commit_stats(
    repo_path: &str,
    include_remotes: bool,
    limit: u32,
    skip: u32,
) -> Result<HashMap<String, (u32, u32)>, String> {
    let limit_arg = format!("-n{limit}");
    let skip_arg = format!("--skip={skip}");
    let detached_heads = detached_worktree_heads(repo_path);
    let mut args = vec!["log", "--branches"];
    if include_remotes {
        args.push("--remotes");
    }
    args.push("--tags");
    args.push("HEAD");
    for h in &detached_heads {
        args.push(h.as_str());
    }
    args.extend([
        "--date-order",
        "--format=%H",
        "--shortstat",
        &limit_arg,
        &skip_arg,
    ]);
    let output = run_git(&repo_path, &args)?;

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

/// Explicit `--branches --remotes --tags HEAD` rather than `--all`: `--all`
/// also walks refs outside those namespaces (e.g. `refs/stash`), which would
/// open lanes nothing in the UI can badge. `--remotes` is on by default so
/// teammates' branches with no local counterpart still appear — every
/// remote-tracking ref gets an `origin/...` badge in the graph, including
/// stale ones from unpruned fetches, so their lanes are labeled.
/// `include_remotes: false` is the user-facing "hide remote-only lanes"
/// toggle for when that's still too noisy.
#[tauri::command(async)]
pub async fn list_commits(
    repo_path: String,
    include_remotes: bool,
    limit: u32,
    skip: u32,
) -> Result<Vec<CommitInfo>, String> {
    run_blocking(move || {
        // Co-authors come from the `Co-authored-by` trailer via git's own
        // %(trailers:...) placeholder, not a full body fetch — cheap to include
        // per-commit since it's usually empty, unlike pulling %b for everyone.
        let format = format!(
            "%H{RS}%P{RS}%an{RS}%ad{RS}%s{RS}%(trailers:key=Co-authored-by,valueonly,separator=%x1d){RE}"
        );
        let limit_arg = format!("-n{limit}");
        let skip_arg = format!("--skip={skip}");
        let format_arg = format!("--format={format}");
        let detached_heads = detached_worktree_heads(&repo_path);
        let mut args = vec!["log", "--branches"];
        if include_remotes {
            args.push("--remotes");
        }
        args.push("--tags");
        args.push("HEAD");
        for h in &detached_heads {
            args.push(h.as_str());
        }
        args.extend([
            "--date-order",
            format_arg.as_str(),
            "--date=iso-strict",
            &limit_arg,
            &skip_arg,
        ]);
        let output = run_git(&repo_path, &args)?;

        let stats = get_commit_stats(&repo_path, include_remotes, limit, skip)
            .unwrap_or_else(|err| {
                eprintln!("[list_commits] stats failed: {}", err);
                Default::default()
            });

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
    })
    .await
}

#[tauri::command(async)]
pub async fn list_refs(repo_path: String) -> Result<Vec<RefInfo>, String> {
    run_blocking(move || {
        let output = run_git(
            &repo_path,
            &[
                "for-each-ref",
                &format!(
                    "--format=%(refname){RS}%(objectname){RS}%(HEAD){RS}%(upstream:short){RS}%(*objectname)"
                ),
                "refs/heads",
                "refs/remotes",
                "refs/tags",
            ],
        )?;

        let mut refs: Vec<RefInfo> = output
            .lines()
            .filter_map(|line| {
                let fields: Vec<&str> = line.split(RS).collect();
                if fields.len() < 4 {
                    return None;
                }
                let refname = fields[0];
                // An annotated tag's `%(objectname)` is the tag *object's* own
                // hash, not the commit it points to — `%(*objectname)` is the
                // dereferenced target, populated only for annotated tags, so
                // prefer it when present. Lightweight tags/branches have no
                // dereferenced value and just use `%(objectname)` directly.
                let deref = fields.get(4).copied().unwrap_or("");
                let hash = if deref.is_empty() { fields[1].to_string() } else { deref.to_string() };
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

                // `refs/remotes/<remote>/HEAD` is a symbolic alias for the
                // remote's default branch, not a real remote-tracking branch —
                // checking it out by that literal name always detaches HEAD
                // instead of landing on a tracked branch, and it's redundant
                // with whatever badge already represents the actual branch it
                // points to.
                if kind == "remote-branch" && name.rsplit('/').next() == Some("HEAD") {
                    return None;
                }

                Some(RefInfo {
                    name,
                    hash,
                    kind: if is_head { "head".to_string() } else { kind.to_string() },
                    upstream,
                })
            })
            .collect();

        // In detached HEAD, HEAD isn't the symbolic target of any ref under
        // refs/heads — so `%(HEAD)` above never marks anything `*`, even if a
        // branch happens to point at the same commit. Without a synthetic
        // "head" entry here, every HEAD-position feature (the uncommitted-
        // changes ghost row, the current-position badge, etc.) silently has
        // nothing to find.
        if !refs.iter().any(|r| r.kind == "head") {
            match run_git(&repo_path, &["rev-parse", "HEAD"]) {
                Ok(sha) => {
                    refs.push(RefInfo {
                        name: "HEAD".to_string(),
                        hash: sha.trim().to_string(),
                        kind: "head".to_string(),
                        upstream: None,
                    });
                }
                Err(err) => eprintln!("[list_refs] failed to get HEAD: {}", err),
            }
        }

        Ok(refs)
    })
    .await
}

/// Parses `git worktree list --porcelain` output: blank-line-separated
/// records of `key[ value]` lines — `worktree <path>` starts each record,
/// `branch refs/heads/<name>` is absent for a detached HEAD, and
/// `locked[ <reason>]` only appears when locked.
fn parse_worktrees(output: &str) -> Vec<WorktreeInfo> {
    fn flush(
        worktrees: &mut Vec<WorktreeInfo>,
        path: &mut Option<String>,
        head: &mut String,
        branch: &mut Option<String>,
        locked: &mut bool,
    ) {
        if let Some(p) = path.take() {
            worktrees.push(WorktreeInfo {
                path: p,
                branch: branch.take(),
                head: std::mem::take(head),
                locked: std::mem::replace(locked, false),
            });
        }
    }

    let mut worktrees = Vec::new();
    let mut path: Option<String> = None;
    let mut head = String::new();
    let mut branch: Option<String> = None;
    let mut locked = false;

    for line in output.lines() {
        if line.is_empty() {
            flush(&mut worktrees, &mut path, &mut head, &mut branch, &mut locked);
            continue;
        }
        if let Some(v) = line.strip_prefix("worktree ") {
            path = Some(v.to_string());
        } else if let Some(v) = line.strip_prefix("HEAD ") {
            head = v.to_string();
        } else if let Some(v) = line.strip_prefix("branch ") {
            branch = Some(v.strip_prefix("refs/heads/").unwrap_or(v).to_string());
        } else if line == "locked" || line.starts_with("locked ") {
            locked = true;
        }
    }
    flush(&mut worktrees, &mut path, &mut head, &mut branch, &mut locked);

    worktrees
}

#[tauri::command(async)]
pub async fn list_worktrees(repo_path: String) -> Result<Vec<WorktreeInfo>, String> {
    run_blocking(move || {
        let output = run_git(&repo_path, &["worktree", "list", "--porcelain"])?;
        Ok(parse_worktrees(&output))
    })
    .await
}

/// HEAD commit hashes of every worktree that's in detached-HEAD state (no
/// branch checked out). Their commits aren't reachable from `--branches`,
/// `--remotes`, or the *main* worktree's `HEAD` the way a normal branch's
/// commits are, so callers building a `git log` revision list need these
/// added explicitly or that worktree's history is invisible in the graph.
/// Best-effort: a failure here (e.g. git too old for `worktree list`) just
/// means no detached worktrees are surfaced, not that the whole call fails.
fn detached_worktree_heads(repo_path: &str) -> Vec<String> {
    run_git(repo_path, &["worktree", "list", "--porcelain"])
        .map(|output| {
            parse_worktrees(&output)
                .into_iter()
                .filter(|w| w.branch.is_none())
                .map(|w| w.head)
                .collect()
        })
        .unwrap_or_else(|err| {
            eprintln!("[detached_worktree_heads] failed: {}", err);
            Vec::new()
        })
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

#[tauri::command(async)]
pub async fn get_commit_files(repo_path: String, sha: String) -> Result<Vec<FileChange>, String> {
    run_blocking(move || {
        // Root commits have no parent; diff against the empty tree instead.
        let has_parent = match run_git(&repo_path, &["rev-parse", &format!("{sha}^")]) {
            Ok(_) => true,
            Err(err) => {
                eprintln!("[get_commit_files] parent check failed for {}: {}", sha, err);
                false
            }
        };
        let base = if has_parent {
            format!("{sha}^")
        } else {
            // 4b825dc642cb6eb9a060e54bf8d69288fbee4904 is git's canonical empty tree hash.
            "4b825dc642cb6eb9a060e54bf8d69288fbee4904".to_string()
        };

        // Plain `git diff` (rather than `diff-tree`) so merge commits still show
        // their first-parent diff instead of being silently suppressed.
        let output = match run_git(&repo_path, &["diff", "--name-status", "-M", "-r", &base, &sha]) {
            Ok(s) => s,
            Err(err) => {
                eprintln!("[get_commit_files] diff failed for {}: {}", sha, err);
                return Err(err);
            }
        };
        let numstat_output = run_git(&repo_path, &["diff", "--numstat", "-z", "-M", "-r", &base, &sha])
            .unwrap_or_else(|err| {
                eprintln!("[get_commit_files] numstat failed for {}: {}", sha, err);
                String::new()
            });
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
    })
    .await
}

#[tauri::command(async)]
pub async fn get_commit_detail(repo_path: String, sha: String) -> Result<CommitDetail, String> {
    run_blocking(move || {
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
    })
    .await
}

#[tauri::command(async)]
pub async fn current_branch(repo_path: String) -> Result<String, String> {
    run_blocking(move || {
        run_git(&repo_path, &["rev-parse", "--abbrev-ref", "HEAD"]).map(|s| s.trim().to_string())
    })
    .await
}

#[tauri::command(async)]
pub async fn list_remotes(repo_path: String) -> Result<Vec<RemoteInfo>, String> {
    run_blocking(move || {
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
    })
    .await
}

#[tauri::command(async)]
pub async fn add_remote(repo_path: String, name: String, url: String) -> Result<String, String> {
    run_blocking(move || run_git(&repo_path, &["remote", "add", &name, &url])).await
}

#[derive(Debug, Serialize)]
pub struct AheadBehind {
    pub ahead: u32,
    pub behind: u32,
}

/// How far `branch` and `upstream` (e.g. "main" and "origin/main") have
/// diverged: `ahead` = commits on `branch` not on `upstream`, `behind` =
/// commits on `upstream` not on `branch`.
#[tauri::command(async)]
pub async fn ahead_behind(repo_path: String, branch: String, upstream: String) -> Result<AheadBehind, String> {
    run_blocking(move || {
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
    })
    .await
}

#[tauri::command(async)]
pub async fn fetch_all(repo_path: String) -> Result<String, String> {
    run_blocking(move || run_git(&repo_path, &["fetch", "--all", "--prune"])).await
}

#[tauri::command(async)]
pub async fn pull(repo_path: String) -> Result<String, String> {
    run_blocking(move || run_git(&repo_path, &["pull"])).await
}

/// `force_mode`: None for a plain push, `Some("force")` or `Some("force-with-lease")`
/// for the corresponding destructive push variant. `no_verify` skips local
/// pre-push hooks, independent of `force_mode`.
#[tauri::command(async)]
pub async fn push(
    repo_path: String,
    force_mode: Option<String>,
    no_verify: Option<bool>,
) -> Result<String, String> {
    run_blocking(move || {
        let mut args = vec!["push".to_string()];
        match force_mode.as_deref() {
            Some("force") => args.push("--force".to_string()),
            Some("force-with-lease") => args.push("--force-with-lease".to_string()),
            _ => {}
        }
        if no_verify.unwrap_or(false) {
            args.push("--no-verify".to_string());
        }

        // A branch that's never been pushed (or a remote that was just added)
        // has no upstream configured yet, so a plain `git push` fails with
        // "no upstream branch" — set one up automatically instead of erroring.
        // Also handle stale/mismatched upstream tracking (e.g., after rebase).
        let current_branch = run_git(&repo_path, &["rev-parse", "--abbrev-ref", "HEAD"])?
            .trim()
            .to_string();

        let upstream_check = run_git(
            &repo_path,
            &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
        );

        let needs_upstream = match upstream_check {
            Ok(upstream) => {
                // Check if upstream matches current branch (e.g., "refs/remotes/origin/luxinabox")
                !upstream.contains(&format!("origin/{}", current_branch))
            },
            Err(err) => {
                eprintln!("[push] upstream check failed: {}", err);
                true  // No upstream at all
            }
        };

        if needs_upstream {
            let remotes_result = run_git(&repo_path, &["remote"]);
            let remote_name = match remotes_result {
                Ok(output) => output
                    .lines()
                    .next()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .ok_or_else(|| "No remote configured".to_string())?
                    .to_string(),
                Err(err) => {
                    eprintln!("[push] failed to list remotes: {}", err);
                    return Err("Failed to list remotes".to_string());
                }
            };
            args.push("--set-upstream".to_string());
            args.push(remote_name);
            args.push(current_branch);
        }

        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        run_git(&repo_path, &arg_refs)
    })
    .await
}

#[tauri::command(async)]
pub async fn stash_list(repo_path: String) -> Result<Vec<StashEntry>, String> {
    run_blocking(move || {
        let output = run_git(&repo_path, &["stash", "list"])?;

        let mut entries = Vec::new();
        for line in output.lines() {
            // format: "stash@{0}: WIP on main: abc123 message"
            let Some(open) = line.find('{') else { continue };
            let Some(close) = line.find('}') else { continue };
            let Ok(index) = line[open + 1..close].parse::<u32>() else { continue };
            let message = line.splitn(2, ": ").nth(1).unwrap_or("").to_string();
            let base_hash = match run_git(&repo_path, &["rev-parse", &format!("stash@{{{index}}}^1")]) {
                Ok(s) => s.trim().to_string(),
                Err(err) => {
                    eprintln!("[stash_list] failed to get base hash for stash@{{{index}}}: {}", err);
                    String::new()
                }
            };
            entries.push(StashEntry { index, message, base_hash });
        }

        Ok(entries)
    })
    .await
}

#[tauri::command(async)]
pub async fn stash_push(
    repo_path: String,
    message: Option<String>,
    paths: Option<Vec<String>>,
) -> Result<String, String> {
    run_blocking(move || {
        let mut args = vec!["stash", "push"];
        if let Some(m) = &message {
            args.push("-m");
            args.push(m);
        }
        if let Some(p) = &paths {
            if !p.is_empty() {
                args.push("--");
                for path in p {
                    args.push(path);
                }
            }
        }
        run_git(&repo_path, &args)
    })
    .await
}

#[tauri::command(async)]
pub async fn stash_pop(repo_path: String, index: Option<u32>) -> Result<String, String> {
    run_blocking(move || match index {
        Some(i) => {
            let stash_ref = format!("stash@{{{i}}}");
            run_git(&repo_path, &["stash", "pop", &stash_ref])
        }
        None => run_git(&repo_path, &["stash", "pop"]),
    })
    .await
}

#[tauri::command(async)]
pub async fn stash_drop(repo_path: String, index: Option<u32>) -> Result<String, String> {
    run_blocking(move || match index {
        Some(i) => {
            let stash_ref = format!("stash@{{{i}}}");
            run_git(&repo_path, &["stash", "drop", &stash_ref])
        }
        None => run_git(&repo_path, &["stash", "drop"]),
    })
    .await
}

#[tauri::command(async)]
pub async fn stash_show(repo_path: String, index: u32) -> Result<String, String> {
    run_blocking(move || {
        let stash_ref = format!("stash@{{{index}}}");
        run_git(&repo_path, &["stash", "show", "-p", "--no-color", &stash_ref])
    })
    .await
}

/// Checks out a commit SHA or branch/tag name. For a bare SHA this leaves the
/// repo in detached HEAD state, same as running `git checkout <sha>` by hand.
#[tauri::command(async)]
pub async fn checkout_ref(repo_path: String, ref_name: String) -> Result<String, String> {
    run_blocking(move || run_git(&repo_path, &["checkout", &ref_name])).await
}

#[tauri::command(async)]
pub async fn create_branch(repo_path: String, name: String, sha: String) -> Result<String, String> {
    run_blocking(move || run_git(&repo_path, &["branch", &name, &sha])).await
}

#[tauri::command(async)]
pub async fn delete_branch(repo_path: String, name: String, force: bool) -> Result<String, String> {
    run_blocking(move || {
        let flag = if force { "-D" } else { "-d" };
        run_git(&repo_path, &["branch", flag, &name])
    })
    .await
}

/// `git branch -m` preserves whatever upstream the branch was already
/// tracking (it renames the config section along with the branch) — it
/// does not retarget tracking to a same-named remote branch. If that's
/// needed (e.g. renaming to match a differently-named remote default), the
/// user still pushes with `-u` afterward to point it there explicitly.
#[tauri::command(async)]
pub async fn rename_branch(repo_path: String, old_name: String, new_name: String) -> Result<String, String> {
    run_blocking(move || run_git(&repo_path, &["branch", "-m", &old_name, &new_name])).await
}

/// `git branch -f` refuses to move the currently checked-out branch ("error:
/// Cannot force update the current branch"); repointing HEAD's own branch
/// should go through `reset_to_commit` instead, which the UI already offers
/// from the commit context menu.
#[tauri::command(async)]
pub async fn move_branch(repo_path: String, name: String, target: String) -> Result<String, String> {
    run_blocking(move || run_git(&repo_path, &["branch", "-f", &name, &target])).await
}

#[tauri::command(async)]
pub async fn set_upstream(repo_path: String, name: String, upstream: String) -> Result<String, String> {
    run_blocking(move || run_git(&repo_path, &["branch", "--set-upstream-to", &upstream, &name])).await
}

#[tauri::command(async)]
pub async fn delete_remote_branch(repo_path: String, remote: String, name: String) -> Result<String, String> {
    run_blocking(move || run_git(&repo_path, &["push", &remote, "--delete", &name])).await
}

/// Runs an arbitrary git subcommand built from discrete argv entries — the
/// backend for the "terminal" command composer. Safe from shell injection
/// the same way every other command here is: args go straight to
/// `Command::new("git").args(..)`, never through a shell, so there's no
/// metacharacter/quoting concern. It's still a broad hatch (any git
/// subcommand), so the frontend is expected to only ever construct `args`
/// from its own validated block selections, not free-text input.
#[tauri::command(async)]
pub async fn run_git_args(repo_path: String, args: Vec<String>) -> Result<String, String> {
    run_blocking(move || {
        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        run_git(&repo_path, &arg_refs)
    })
    .await
}

#[tauri::command(async)]
pub async fn create_tag(repo_path: String, name: String, sha: String) -> Result<String, String> {
    run_blocking(move || run_git(&repo_path, &["tag", &name, &sha])).await
}

#[tauri::command(async)]
pub async fn delete_tag(repo_path: String, name: String) -> Result<String, String> {
    run_blocking(move || run_git(&repo_path, &["tag", "-d", &name])).await
}

/// A plain `git push <remote> <tag>` only pushes the tag ref itself, unlike
/// `--tags` which pushes every tag in the repo — scoped to just the one the
/// user asked for.
#[tauri::command(async)]
pub async fn push_tag(repo_path: String, remote: String, name: String) -> Result<String, String> {
    run_blocking(move || run_git(&repo_path, &["push", &remote, &name])).await
}

#[tauri::command(async)]
pub async fn delete_remote_tag(repo_path: String, remote: String, name: String) -> Result<String, String> {
    run_blocking(move || run_git(&repo_path, &["push", &remote, "--delete", &name])).await
}

#[tauri::command(async)]
pub async fn cherry_pick(repo_path: String, sha: String) -> Result<String, String> {
    run_blocking(move || run_git(&repo_path, &["cherry-pick", &sha])).await
}

#[tauri::command(async)]
pub async fn revert_commit(repo_path: String, sha: String) -> Result<String, String> {
    run_blocking(move || run_git(&repo_path, &["revert", "--no-edit", &sha])).await
}

/// Fast-forwards the currently checked-out branch to `target_ref`. Fails
/// (rather than falling back to a merge commit) if the current branch has
/// diverged, since the whole point of offering this as a distinct choice
/// from "Rebase" is that it only ever moves the branch pointer.
#[tauri::command(async)]
pub async fn fast_forward_branch(repo_path: String, target_ref: String) -> Result<String, String> {
    run_blocking(move || run_git(&repo_path, &["merge", "--ff-only", &target_ref])).await
}

/// Rebases the currently checked-out branch onto `target_ref`.
#[tauri::command(async)]
pub async fn rebase_branch(repo_path: String, target_ref: String) -> Result<String, String> {
    run_blocking(move || run_git(&repo_path, &["rebase", &target_ref])).await
}

/// Continues a rebase in progress after conflicts have been resolved.
#[tauri::command(async)]
pub async fn rebase_continue(repo_path: String) -> Result<String, String> {
    run_blocking(move || run_git(&repo_path, &["rebase", "--continue"])).await
}

/// Aborts an in-progress rebase, returning to the original branch state.
#[tauri::command(async)]
pub async fn rebase_abort(repo_path: String) -> Result<String, String> {
    run_blocking(move || run_git(&repo_path, &["rebase", "--abort"])).await
}

/// `mode`: "soft", "mixed", or "hard" — matches the `git reset --<mode>` flag.
#[tauri::command(async)]
pub async fn reset_to_commit(repo_path: String, sha: String, mode: String) -> Result<String, String> {
    run_blocking(move || {
        let flag = match mode.as_str() {
            "soft" => "--soft",
            "hard" => "--hard",
            _ => "--mixed",
        };
        run_git(&repo_path, &["reset", flag, &sha])
    })
    .await
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

/// Untracked files have no index/tree entry to diff against, so `git diff`
/// can't report a line count for them; read the file directly instead
/// (insertions = line count, deletions = 0). Best-effort: unreadable or
/// binary-looking content just falls back to 0.
fn count_file_lines(repo_path: &str, path: &str) -> u32 {
    let full_path = std::path::Path::new(repo_path).join(path);
    let Ok(bytes) = std::fs::read(&full_path) else {
        eprintln!("[count_file_lines] failed to read {path}");
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

#[tauri::command(async)]
pub async fn git_status(repo_path: String) -> Result<Vec<WorkingFileEntry>, String> {
    run_blocking(move || {
        let output = run_git(
            &repo_path,
            &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
        )?;

        // Best-effort: a failure here shouldn't block the status list itself,
        // just leave counts at 0.
        let staged_stats = run_git(&repo_path, &["diff", "--cached", "--numstat", "-z", "-M"])
            .map(|s| parse_numstat_z(&s))
            .unwrap_or_else(|err| {
                eprintln!("[git_status] staged stats failed: {}", err);
                Default::default()
            });
        let unstaged_stats = run_git(&repo_path, &["diff", "--numstat", "-z", "-M"])
            .map(|s| parse_numstat_z(&s))
            .unwrap_or_else(|err| {
                eprintln!("[git_status] unstaged stats failed: {}", err);
                Default::default()
            });

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
    })
    .await
}

/// Reads a working-tree file's raw text content, for the conflict-resolution
/// editor — which needs the file's own `<<<<<<<`/`=======`/`>>>>>>>` markers
/// as git left them, not a diff against either side.
#[tauri::command(async)]
pub async fn read_working_file(repo_path: String, path: String) -> Result<String, String> {
    run_blocking(move || {
        let full_path = std::path::Path::new(&repo_path).join(&path);
        let bytes = std::fs::read(&full_path).map_err(|e| format!("failed to read {path}: {e}"))?;
        String::from_utf8(bytes).map_err(|_| format!("{path} is not valid UTF-8 text"))
    })
    .await
}

/// Writes the resolved content back to the working-tree file and stages it —
/// `git add` on a path that was in a conflicted (unmerged) state clears its
/// conflict stages the same way it would for any other edit.
#[tauri::command(async)]
pub async fn resolve_conflict(repo_path: String, path: String, content: String) -> Result<String, String> {
    run_blocking(move || {
        let full_path = std::path::Path::new(&repo_path).join(&path);
        std::fs::write(&full_path, content).map_err(|e| format!("failed to write {path}: {e}"))?;
        run_git(&repo_path, &["add", "--", &path])
    })
    .await
}

#[tauri::command(async)]
pub async fn stage_path(repo_path: String, path: String) -> Result<String, String> {
    run_blocking(move || run_git(&repo_path, &["add", "--", &path])).await
}

#[tauri::command(async)]
pub async fn unstage_path(repo_path: String, path: String) -> Result<String, String> {
    run_blocking(move || run_git(&repo_path, &["restore", "--staged", "--", &path])).await
}

#[tauri::command(async)]
pub async fn stage_paths(repo_path: String, paths: Vec<String>) -> Result<String, String> {
    run_blocking(move || {
        if paths.is_empty() {
            return Ok(String::new());
        }
        let mut args: Vec<&str> = vec!["add", "--"];
        args.extend(paths.iter().map(String::as_str));
        run_git(&repo_path, &args)
    })
    .await
}

#[tauri::command(async)]
pub async fn unstage_paths(repo_path: String, paths: Vec<String>) -> Result<String, String> {
    run_blocking(move || {
        if paths.is_empty() {
            return Ok(String::new());
        }
        let mut args: Vec<&str> = vec!["restore", "--staged", "--"];
        args.extend(paths.iter().map(String::as_str));
        run_git(&repo_path, &args)
    })
    .await
}

#[tauri::command(async)]
pub async fn stage_all(repo_path: String) -> Result<String, String> {
    run_blocking(move || run_git(&repo_path, &["add", "-A"])).await
}

#[tauri::command(async)]
pub async fn unstage_all(repo_path: String) -> Result<String, String> {
    run_blocking(move || run_git(&repo_path, &["restore", "--staged", "."])).await
}

#[tauri::command(async)]
pub async fn commit(repo_path: String, message: String, amend: bool) -> Result<String, String> {
    run_blocking(move || {
        if amend {
            run_git(&repo_path, &["commit", "--amend", "-m", &message])
        } else {
            run_git(&repo_path, &["commit", "-m", &message])
        }
    })
    .await
}

/// `staged` selects `diff --cached`; for unstaged changes, `untracked` picks
/// between a plain working-tree diff (tracked file) and a `--no-index` diff
/// against `/dev/null` (new file git has no record of yet).
#[tauri::command(async)]
pub async fn get_working_file_diff(
    repo_path: String,
    path: String,
    staged: bool,
    untracked: bool,
) -> Result<String, String> {
    run_blocking(move || {
        if staged {
            run_git(&repo_path, &["diff", "--cached", "--", &path])
        } else if untracked {
            run_git_diff_no_index(&repo_path, &["diff", "--no-index", "--", "/dev/null", &path])
        } else {
            run_git(&repo_path, &["diff", "--", &path])
        }
    })
    .await
}

/// Streams diff output in chunks via Tauri events. Each chunk is emitted as
/// `event_name` with a DiffChunk payload containing the data chunk, sequence
/// number, and final flag. Use this for large diffs to avoid buffering the
/// entire output in memory. The frontend accumulates chunks until `is_final`
/// is true.
#[tauri::command(async)]
pub async fn stream_working_file_diff(
    app: tauri::AppHandle,
    repo_path: String,
    path: String,
    staged: bool,
    untracked: bool,
    event_name: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = if staged {
            git_command(&repo_path, &["diff", "--cached", "--", &path])
        } else if untracked {
            git_command(&repo_path, &["diff", "--no-index", "--", "/dev/null", &path])
        } else {
            git_command(&repo_path, &["diff", "--", &path])
        };

        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
        let mut child = cmd.spawn().map_err(|e| format!("failed to spawn git: {e}"))?;
        let mut stdout = child.stdout.take().ok_or("failed to open stdout")?;

        let deadline = Instant::now() + LOCAL_TIMEOUT;
        let mut buf = [0u8; 65536]; // 64KB chunks
        let mut sequence = 0u32;

        loop {
            // Check timeout
            if Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("git diff timed out after {}s", LOCAL_TIMEOUT.as_secs()));
            }

            match stdout.read(&mut buf) {
                Ok(0) => {
                    // EOF: emit final empty chunk with is_final flag
                    let chunk = DiffChunk {
                        chunk: String::new(),
                        sequence,
                        is_final: true,
                    };
                    let _ = app.emit(&event_name, chunk);
                    break;
                }
                Ok(n) => {
                    // Emit this chunk
                    let chunk_str = String::from_utf8_lossy(&buf[..n]).to_string();
                    let chunk = DiffChunk {
                        chunk: chunk_str,
                        sequence,
                        is_final: false,
                    };
                    if let Err(e) = app.emit(&event_name, chunk) {
                        eprintln!("[stream_working_file_diff] failed to emit chunk {}: {}", sequence, e);
                    }
                    sequence += 1;
                }
                Err(e) => {
                    eprintln!("[stream_working_file_diff] read error: {}", e);
                    let chunk = DiffChunk {
                        chunk: String::new(),
                        sequence,
                        is_final: true,
                    };
                    let _ = app.emit(&event_name, chunk);
                    return Err(format!("failed to read git output: {e}"));
                }
            }
        }

        let status = child
            .wait()
            .map_err(|e| format!("failed to wait for git: {e}"))?;

        if !status.success() {
            return Err(format!("git diff exited with code {}", status.code().unwrap_or(-1)));
        }

        Ok(())
    })
    .await
    .map_err(|e| format!("task failed: {e}"))?
}

#[tauri::command(async)]
pub async fn get_file_diff(repo_path: String, sha: String, file_path: String) -> Result<String, String> {
    run_blocking(move || {
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
    })
    .await
}

/// Creates a pull request for the given branch using GitHub CLI (gh).
/// Automatically pushes the branch if it hasn't been pushed yet.
#[tauri::command(async)]
pub async fn create_pull_request(
    repo_path: String,
    current_branch: String,
    target_branch: String,
    title: String,
    description: String,
    draft: bool,
) -> Result<String, String> {
    run_blocking(move || {
        // Check if the branch exists on the remote by trying to resolve origin/<branch>
        let remote_branch_check = run_git(&repo_path, &["rev-parse", &format!("origin/{}", current_branch)]);

        let needs_push = remote_branch_check.is_err();

        // Push the branch if it doesn't exist on remote yet
        if needs_push {
            run_git(&repo_path, &["push", "origin", &current_branch])?;
        }

        // Create the PR using GitHub CLI
        let mut args: Vec<&str> = vec!["pr", "create", "--head", &current_branch, "--base", &target_branch, "--title", &title];

        if !description.is_empty() {
            args.push("--body");
            args.push(&description);
        }

        if draft {
            args.push("--draft");
        }

        // Use 'gh' command instead of git
        let output = Command::new("gh")
            .current_dir(&repo_path)
            .args(&args)
            .output()
            .map_err(|e| format!("GitHub CLI not found or error: {}", e))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    })
    .await
}
