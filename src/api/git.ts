import { invoke } from "@tauri-apps/api/core";

export interface CommitInfo {
  hash: string;
  parents: string[];
  author: string;
  date: string;
  subject: string;
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
}

interface RawFileChange {
  path: string;
  old_path: string | null;
  status: FileStatus;
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
  return invoke<CommitInfo[]>("list_commits", { repoPath, limit, skip });
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
