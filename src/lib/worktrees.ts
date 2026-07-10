import type { RefInfo, WorktreeInfo } from "../api/git";

/** Normalizes a filesystem path for comparison across worktree entries and
 * the currently-open repo path: git worktree paths and the repo path can
 * differ only in slash direction or (on Windows) drive-letter case. */
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** Maps branch name -> worktree path, for every worktree other than the one
 * at `repoPath` itself (that's just the current checkout, already shown as
 * "current branch" — not a separate worktree to flag). */
export function otherWorktreeBranches(
  worktrees: WorktreeInfo[],
  repoPath: string,
): Map<string, string> {
  const here = normalizePath(repoPath);
  const map = new Map<string, string>();
  for (const w of worktrees) {
    if (!w.branch || normalizePath(w.path) === here) continue;
    map.set(w.branch, w.path);
  }
  return map;
}

/** Last path segment, e.g. "C:/repos/thicket-hotfix" -> "thicket-hotfix" —
 * used as the display name for a detached worktree's synthetic ref, since
 * it has no branch name of its own. */
function worktreeLabel(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/**
 * A detached-HEAD worktree isn't on any branch, so its commits have no ref
 * pointing at them — normally that means they're both invisible in the
 * commit graph (nothing in `--branches --remotes --tags HEAD` reaches them)
 * and unlabeled even when they do show up. The backend now includes each
 * detached worktree's HEAD commit explicitly in `list_commits`/its ancestry
 * (see `detached_worktree_heads` in git.rs), so the commits themselves render
 * with their own lane; this builds the matching synthetic ref so that lane
 * gets a badge, styled distinctly (kind "worktree-head") so it doesn't read
 * as a real branch.
 */
export function worktreeHeadRefs(worktrees: WorktreeInfo[]): RefInfo[] {
  return worktrees
    .filter((w) => !w.branch)
    .map((w) => ({
      name: worktreeLabel(w.path),
      hash: w.head,
      kind: "worktree-head" as const,
      upstream: null,
    }));
}
