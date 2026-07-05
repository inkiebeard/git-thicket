import { invoke } from "@tauri-apps/api/core";

export interface CommitInfo {
  hash: string;
  parents: string[];
  author: string;
  date: string;
  subject: string;
  insertions: number;
  deletions: number;
  /** Raw "Name <email>" strings from Co-authored-by trailers. */
  coAuthors: string[];
}

interface RawCommitInfo {
  hash: string;
  parents: string[];
  author: string;
  date: string;
  subject: string;
  insertions: number;
  deletions: number;
  co_authors: string[];
}

export type RefKind = "branch" | "remote-branch" | "tag" | "head" | "other";

export interface RefInfo {
  name: string;
  hash: string;
  kind: RefKind;
  /** e.g. "origin/main"; only set for local branches with a tracked remote. */
  upstream: string | null;
}

export type FileStatus =
  | "added"
  | "deleted"
  | "modified"
  | "renamed"
  | "copied"
  | "type-changed";

export interface FileChange {
  path: string;
  oldPath: string | null;
  status: FileStatus;
  insertions: number;
  deletions: number;
}

interface RawFileChange {
  path: string;
  old_path: string | null;
  status: FileStatus;
  insertions: number;
  deletions: number;
}

export async function openRepoDialog(): Promise<string | null> {
  return invoke<string | null>("open_repo_dialog");
}

export async function isGitRepo(repoPath: string): Promise<boolean> {
  return invoke<boolean>("is_git_repo", { repoPath });
}

export async function listCommits(
  repoPath: string,
  limit = 500,
  skip = 0,
): Promise<CommitInfo[]> {
  const raw = await invoke<RawCommitInfo[]>("list_commits", { repoPath, limit, skip });
  return raw.map((c) => ({
    hash: c.hash,
    parents: c.parents,
    author: c.author,
    date: c.date,
    subject: c.subject,
    insertions: c.insertions,
    deletions: c.deletions,
    coAuthors: c.co_authors,
  }));
}

export async function listRefs(repoPath: string): Promise<RefInfo[]> {
  return invoke<RefInfo[]>("list_refs", { repoPath });
}

export async function getCommitFiles(
  repoPath: string,
  sha: string,
): Promise<FileChange[]> {
  const raw = await invoke<RawFileChange[]>("get_commit_files", {
    repoPath,
    sha,
  });
  return raw.map((f) => ({
    path: f.path,
    oldPath: f.old_path,
    status: f.status,
    insertions: f.insertions,
    deletions: f.deletions,
  }));
}

export async function getFileDiff(
  repoPath: string,
  sha: string,
  filePath: string,
): Promise<string> {
  return invoke<string>("get_file_diff", { repoPath, sha, filePath });
}

export interface CommitDetail {
  hash: string;
  authorName: string;
  authorEmail: string;
  authorDate: string;
  committerName: string;
  committerEmail: string;
  committerDate: string;
  subject: string;
  body: string;
}

interface RawCommitDetail {
  hash: string;
  author_name: string;
  author_email: string;
  author_date: string;
  committer_name: string;
  committer_email: string;
  committer_date: string;
  subject: string;
  body: string;
}

export async function getCommitDetail(
  repoPath: string,
  sha: string,
): Promise<CommitDetail> {
  const raw = await invoke<RawCommitDetail>("get_commit_detail", { repoPath, sha });
  return {
    hash: raw.hash,
    authorName: raw.author_name,
    authorEmail: raw.author_email,
    authorDate: raw.author_date,
    committerName: raw.committer_name,
    committerEmail: raw.committer_email,
    committerDate: raw.committer_date,
    subject: raw.subject,
    body: raw.body,
  };
}

export type PushForceMode = "force" | "force-with-lease" | null;

export interface StashEntry {
  index: number;
  message: string;
}

export async function currentBranch(repoPath: string): Promise<string> {
  return invoke<string>("current_branch", { repoPath });
}

export interface RemoteInfo {
  name: string;
  url: string;
}

export async function listRemotes(repoPath: string): Promise<RemoteInfo[]> {
  return invoke<RemoteInfo[]>("list_remotes", { repoPath });
}

export async function addRemote(
  repoPath: string,
  name: string,
  url: string,
): Promise<string> {
  return invoke<string>("add_remote", { repoPath, name, url });
}

export interface AheadBehind {
  ahead: number;
  behind: number;
}

export async function aheadBehind(
  repoPath: string,
  branch: string,
  upstream: string,
): Promise<AheadBehind> {
  return invoke<AheadBehind>("ahead_behind", { repoPath, branch, upstream });
}

export async function fetchAll(repoPath: string): Promise<string> {
  return invoke<string>("fetch_all", { repoPath });
}

export async function pull(repoPath: string): Promise<string> {
  return invoke<string>("pull", { repoPath });
}

export async function push(
  repoPath: string,
  forceMode: PushForceMode = null,
): Promise<string> {
  return invoke<string>("push", { repoPath, forceMode });
}

export async function stashList(repoPath: string): Promise<StashEntry[]> {
  return invoke<StashEntry[]>("stash_list", { repoPath });
}

export async function stashPush(
  repoPath: string,
  message?: string,
): Promise<string> {
  return invoke<string>("stash_push", { repoPath, message: message ?? null });
}

export async function stashPop(
  repoPath: string,
  index?: number,
): Promise<string> {
  return invoke<string>("stash_pop", { repoPath, index: index ?? null });
}

export async function checkoutRef(
  repoPath: string,
  refName: string,
): Promise<string> {
  return invoke<string>("checkout_ref", { repoPath, refName });
}

export async function createBranch(
  repoPath: string,
  name: string,
  sha: string,
): Promise<string> {
  return invoke<string>("create_branch", { repoPath, name, sha });
}

export async function deleteBranch(
  repoPath: string,
  name: string,
  force = false,
): Promise<string> {
  return invoke<string>("delete_branch", { repoPath, name, force });
}

export async function renameBranch(
  repoPath: string,
  oldName: string,
  newName: string,
): Promise<string> {
  return invoke<string>("rename_branch", { repoPath, oldName, newName });
}

export async function moveBranch(
  repoPath: string,
  name: string,
  target: string,
): Promise<string> {
  return invoke<string>("move_branch", { repoPath, name, target });
}

export async function setUpstream(
  repoPath: string,
  name: string,
  upstream: string,
): Promise<string> {
  return invoke<string>("set_upstream", { repoPath, name, upstream });
}

export async function deleteRemoteBranch(
  repoPath: string,
  remote: string,
  name: string,
): Promise<string> {
  return invoke<string>("delete_remote_branch", { repoPath, remote, name });
}

export async function runGitArgs(repoPath: string, args: string[]): Promise<string> {
  return invoke<string>("run_git_args", { repoPath, args });
}

export async function createTag(
  repoPath: string,
  name: string,
  sha: string,
): Promise<string> {
  return invoke<string>("create_tag", { repoPath, name, sha });
}

export async function cherryPick(repoPath: string, sha: string): Promise<string> {
  return invoke<string>("cherry_pick", { repoPath, sha });
}

export async function revertCommit(repoPath: string, sha: string): Promise<string> {
  return invoke<string>("revert_commit", { repoPath, sha });
}

export type ResetMode = "soft" | "mixed" | "hard";

export async function resetToCommit(
  repoPath: string,
  sha: string,
  mode: ResetMode,
): Promise<string> {
  return invoke<string>("reset_to_commit", { repoPath, sha, mode });
}

export interface WorkingFileEntry {
  path: string;
  oldPath: string | null;
  /** Status in the index (staged side): "modified" | "added" | "deleted" | "renamed" | "copied" | "unmerged" | "type-changed" | "none". */
  indexStatus: FileStatus | "unmerged" | "none";
  /** Status in the working tree (unstaged side); same set plus "untracked". */
  worktreeStatus: FileStatus | "unmerged" | "untracked" | "none";
  indexInsertions: number;
  indexDeletions: number;
  worktreeInsertions: number;
  worktreeDeletions: number;
}

interface RawWorkingFileEntry {
  path: string;
  old_path: string | null;
  index_status: string;
  worktree_status: string;
  index_insertions: number;
  index_deletions: number;
  worktree_insertions: number;
  worktree_deletions: number;
}

export async function gitStatus(repoPath: string): Promise<WorkingFileEntry[]> {
  const raw = await invoke<RawWorkingFileEntry[]>("git_status", { repoPath });
  return raw.map((f) => ({
    path: f.path,
    oldPath: f.old_path,
    indexStatus: f.index_status as WorkingFileEntry["indexStatus"],
    worktreeStatus: f.worktree_status as WorkingFileEntry["worktreeStatus"],
    indexInsertions: f.index_insertions,
    indexDeletions: f.index_deletions,
    worktreeInsertions: f.worktree_insertions,
    worktreeDeletions: f.worktree_deletions,
  }));
}

export async function stagePath(repoPath: string, path: string): Promise<string> {
  return invoke<string>("stage_path", { repoPath, path });
}

export async function unstagePath(repoPath: string, path: string): Promise<string> {
  return invoke<string>("unstage_path", { repoPath, path });
}

export async function stagePaths(repoPath: string, paths: string[]): Promise<string> {
  return invoke<string>("stage_paths", { repoPath, paths });
}

export async function unstagePaths(repoPath: string, paths: string[]): Promise<string> {
  return invoke<string>("unstage_paths", { repoPath, paths });
}

export async function stageAll(repoPath: string): Promise<string> {
  return invoke<string>("stage_all", { repoPath });
}

export async function unstageAll(repoPath: string): Promise<string> {
  return invoke<string>("unstage_all", { repoPath });
}

export async function commitChanges(
  repoPath: string,
  message: string,
  amend = false,
): Promise<string> {
  return invoke<string>("commit", { repoPath, message, amend });
}

export async function getWorkingFileDiff(
  repoPath: string,
  path: string,
  staged: boolean,
  untracked: boolean,
): Promise<string> {
  return invoke<string>("get_working_file_diff", { repoPath, path, staged, untracked });
}
