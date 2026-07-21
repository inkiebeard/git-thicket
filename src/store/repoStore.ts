import { create } from "zustand";
import {
  getBackgroundFetchEnabled,
  getBackgroundFetchIntervalSec,
  setFileWatchEnabled as persistFileWatchEnabled,
} from "../lib/backgroundFetchSettings";
import {
  getShowRemoteBranches,
  setShowRemoteBranches as persistShowRemoteBranches,
} from "../lib/graphSettings";
import { isConflicted } from "../lib/conflicts";
import {
  type AheadBehind,
  type CommitDetail,
  type CommitInfo,
  type FileChange,
  type PushForceMode,
  type RefInfo,
  type RemoteInfo,
  type ResetMode,
  type StashEntry,
  type WorkingFileEntry,
  type WorktreeInfo,
  addRemote,
  aheadBehind as fetchAheadBehind,
  checkoutRef,
  cherryPick,
  commitChanges,
  createBranch,
  createPullRequest,
  createTag,
  currentBranch,
  deleteBranch,
  deleteRemoteBranch,
  deleteRemoteTag,
  deleteTag,
  fastForwardBranch,
  fetchAll,
  getCommitDetail,
  getCommitFiles,
  gitStatus,
  isGitRepo,
  listCommits,
  listRefs,
  listRemotes,
  listWorktrees,
  moveBranch,
  pull,
  push,
  pushTag,
  rebaseBranch,
  rebaseContinue,
  rebaseAbort,
  renameBranch,
  resetToCommit,
  resolveConflict,
  revertCommit,
  setUpstream,
  stageAll,
  stagePath,
  stagePaths,
  stashDrop,
  stashList,
  stashPop,
  stashPush,
  unstageAll,
  unstagePath,
  unstagePaths,
} from "../api/git";

export interface Toast {
  id: number;
  kind: "success" | "error";
  text: string;
  /** Human-readable label for what was being attempted, e.g. "Push". */
  action: string;
}

export interface RepoTab {
  repoPath: string;
  commits: CommitInfo[];
  refs: RefInfo[];
  branch: string | null;
  aheadBehind: AheadBehind | null;
  remotes: RemoteInfo[];
  worktrees: WorktreeInfo[];
  stashes: StashEntry[];
  loadingCommits: boolean;
  error: string | null;

  selectedSha: string | null;
  selectedShas: string[]; // Multiple selected commits for batch operations
  commitDetail: CommitDetail | null;
  loadingDetail: boolean;
  commitFiles: FileChange[];
  loadingFiles: boolean;

  selectedFilePath: string | null;

  workingStatus: WorkingFileEntry[];
  loadingStatus: boolean;
  viewingWorkingTree: boolean;
  selectedFileStaged: boolean;
  commitMessage: string;
  amend: boolean;

  /** Tracks any merge conflict in progress (stash pop, rebase, cherry-pick, etc.) */
  mergeConflictInProgress?: {
    operation: "stash-pop" | "rebase" | "cherry-pick" | "merge";
    operationLabel: string; // "stash pop", "rebase onto main", etc.
    stashIndex?: number; // For stash pop operations
  };

  busy: boolean;
  toast: Toast | null;
}

function makeTab(repoPath: string): RepoTab {
  return {
    repoPath,
    commits: [],
    refs: [],
    branch: null,
    aheadBehind: null,
    remotes: [],
    worktrees: [],
    stashes: [],
    loadingCommits: true,
    error: null,
    selectedSha: null,
    selectedShas: [],
    commitDetail: null,
    loadingDetail: false,
    commitFiles: [],
    loadingFiles: false,
    selectedFilePath: null,
    workingStatus: [],
    loadingStatus: false,
    viewingWorkingTree: false,
    selectedFileStaged: false,
    commitMessage: "",
    amend: false,
    busy: false,
    toast: null,
  };
}

interface RepoState {
  tabs: RepoTab[];
  activeRepoPath: string | null;
  showRemoteBranches: boolean;

  setShowRemoteBranches: (value: boolean) => void;
  setFileWatchEnabled: (value: boolean) => void;
  loadTabDataFor: (repoPath: string) => Promise<void>;
  loadWorkingStatusFor: (repoPath: string) => Promise<void>;
  restoreSession: () => Promise<void>;
  openRepo: (path: string) => Promise<void>;
  closeTab: (path: string) => void;
  setActiveTab: (path: string) => void;
  refreshRepo: () => Promise<void>;
  selectCommit: (sha: string) => Promise<void>;
  addCommitToSelection: (sha: string) => void;
  toggleCommitSelection: (sha: string) => void;
  clearCommitsSelection: () => void;
  selectFile: (path: string) => void;
  clearSelection: () => void;
  dismissToast: () => void;

  selectWorkingTree: () => void;
  selectWorkingFile: (path: string, staged: boolean) => void;
  setCommitMessage: (message: string) => void;
  setAmend: (amend: boolean) => void;
  stageFile: (path: string) => Promise<void>;
  unstageFile: (path: string) => Promise<void>;
  stageFiles: (paths: string[]) => Promise<void>;
  unstageFiles: (paths: string[]) => Promise<void>;
  stageAllFiles: () => Promise<void>;
  unstageAllFiles: () => Promise<void>;
  commitStagedChanges: () => Promise<void>;

  doFetch: () => Promise<void>;
  doPull: () => Promise<void>;
  doPush: (forceMode?: PushForceMode, noVerify?: boolean) => Promise<void>;
  doStashPush: (message?: string, paths?: string[]) => Promise<void>;
  doStashPop: (index?: number) => Promise<void>;
  doStashDrop: (index?: number) => Promise<void>;
  doAddRemote: (name: string, url: string) => Promise<void>;

  doCheckoutRef: (refName: string) => Promise<void>;
  doCheckoutRefWithStash: (refName: string) => Promise<void>;
  doPrepareCommit: () => Promise<void>;
  doCreateBranch: (name: string, sha: string) => Promise<void>;
  doDeleteBranch: (name: string, force?: boolean) => Promise<void>;
  doRenameBranch: (oldName: string, newName: string) => Promise<void>;
  doMoveBranch: (name: string, target: string) => Promise<void>;
  doSetUpstream: (name: string, upstream: string) => Promise<void>;
  doDeleteRemoteBranch: (remote: string, name: string) => Promise<void>;
  doCreateTag: (name: string, sha: string) => Promise<void>;
  doDeleteTag: (name: string) => Promise<void>;
  doPushTag: (remote: string, name: string) => Promise<void>;
  doDeleteRemoteTag: (remote: string, name: string) => Promise<void>;
  doCherryPick: (sha: string) => Promise<void>;
  doRevertCommit: (sha: string) => Promise<void>;
  doResetToCommit: (sha: string, mode: ResetMode) => Promise<void>;
  doFastForwardBranch: (targetRef: string) => Promise<void>;
  doRebaseBranch: (targetRef: string) => Promise<void>;
  doContinueRebase: () => Promise<void>;
  doAbortRebase: () => Promise<void>;
  doCompleteConflict: () => Promise<void>;
  doAbortConflict: () => Promise<void>;
  doCherryPickMultiple: (shas: string[]) => Promise<void>;
  doSquashCommits: (shas: string[]) => Promise<void>;
  doCreatePullRequest: (currentBranch: string, targetBranch: string, title: string, description: string, draft: boolean) => Promise<void>;
  doResolveConflict: (path: string, content: string) => Promise<void>;
}

const OPEN_TABS_KEY = "thicket:openTabs";
const ACTIVE_TAB_KEY = "thicket:activeTab";

function saveSession(tabs: RepoTab[], activeRepoPath: string | null) {
  localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(tabs.map((t) => t.repoPath)));
  if (activeRepoPath) localStorage.setItem(ACTIVE_TAB_KEY, activeRepoPath);
  else localStorage.removeItem(ACTIVE_TAB_KEY);
}

function loadSavedTabPaths(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(OPEN_TABS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let toastId = 0;

export const useRepoStore = create<RepoState>((set, get) => {
  function updateTab(repoPath: string, patch: Partial<RepoTab>) {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.repoPath === repoPath ? { ...t, ...patch } : t)),
    }));
  }

  // Cheap structural equality for the poll path: the API returns fresh
  // arrays every call, so identity alone would say "changed" on every tick
  // and re-render (and re-layout) the graph even when nothing moved.
  function sameData(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  // `quiet` is the background-poll variant: no loadingStatus flip (which
  // would flicker spinners every tick), no error toast (a failed unattended
  // poll shouldn't nag), and no state write when nothing changed.
  async function loadWorkingStatus(repoPath: string, quiet = false) {
    if (!quiet) updateTab(repoPath, { loadingStatus: true });
    try {
      const workingStatus = await gitStatus(repoPath);
      const tab = get().tabs.find((t) => t.repoPath === repoPath);
      if (!tab) return;
      if (quiet && sameData(workingStatus, tab.workingStatus)) return;
      updateTab(repoPath, { workingStatus, loadingStatus: false });
    } catch (e) {
      if (quiet) return;
      updateTab(repoPath, {
        loadingStatus: false,
        toast: { id: toastId++, kind: "error", text: String(e), action: "Load status" },
      });
    }
  }

  // Independent of loadTabData's own success/failure: how far the current
  // branch has diverged from its upstream, if it has one.
  async function loadAheadBehind(repoPath: string) {
    const tab = get().tabs.find((t) => t.repoPath === repoPath);
    const upstream = tab?.refs.find((r) => r.kind === "head")?.upstream ?? null;
    if (!tab?.branch || !upstream) {
      if (tab?.aheadBehind !== null) updateTab(repoPath, { aheadBehind: null });
      return;
    }
    try {
      const result = await fetchAheadBehind(repoPath, tab.branch, upstream);
      const current = get().tabs.find((t) => t.repoPath === repoPath)?.aheadBehind;
      if (sameData(result, current)) return;
      updateTab(repoPath, { aheadBehind: result });
    } catch {
      updateTab(repoPath, { aheadBehind: null });
    }
  }

  async function loadTabData(repoPath: string) {
    updateTab(repoPath, { loadingCommits: true, error: null });
    try {
      const [commits, refs, branch, remotes, worktrees, stashes] = await Promise.all([
        listCommits(repoPath, get().showRemoteBranches),
        listRefs(repoPath),
        currentBranch(repoPath),
        listRemotes(repoPath).catch(() => []),
        listWorktrees(repoPath).catch(() => []),
        stashList(repoPath).catch(() => []),
      ]);
      updateTab(repoPath, { commits, refs, branch, remotes, worktrees, stashes, loadingCommits: false });
      loadAheadBehind(repoPath);
    } catch (e) {
      updateTab(repoPath, { error: String(e), loadingCommits: false });
    }
    // Independent of the above: a broken working-tree status fetch shouldn't
    // blank out the commit graph that just loaded fine.
    loadWorkingStatus(repoPath);
  }

  // Same data as loadTabData, but never flips loadingCommits — used for the
  // background refresh so an unattended tab doesn't flash "Loading commits…"
  // and blank its graph every 30s. Silently gives up on failure (e.g. no
  // network) rather than surfacing an error for a poll nobody asked to see.
  // Only writes the fields that actually changed, so a no-news poll (the
  // common case) causes zero re-renders.
  async function loadTabDataQuiet(repoPath: string) {
    try {
      const [commits, refs, branch, remotes, worktrees, stashes] = await Promise.all([
        listCommits(repoPath, get().showRemoteBranches),
        listRefs(repoPath),
        currentBranch(repoPath),
        listRemotes(repoPath).catch(() => []),
        listWorktrees(repoPath).catch(() => []),
        stashList(repoPath).catch(() => []),
      ]);
      const tab = get().tabs.find((t) => t.repoPath === repoPath);
      if (!tab) return;
      const patch: Partial<RepoTab> = {};
      if (!sameData(commits, tab.commits)) patch.commits = commits;
      if (!sameData(refs, tab.refs)) patch.refs = refs;
      if (branch !== tab.branch) patch.branch = branch;
      if (!sameData(remotes, tab.remotes)) patch.remotes = remotes;
      if (!sameData(worktrees, tab.worktrees)) patch.worktrees = worktrees;
      if (!sameData(stashes, tab.stashes)) patch.stashes = stashes;
      if (Object.keys(patch).length > 0) updateTab(repoPath, patch);
      loadAheadBehind(repoPath);
    } catch {
      return;
    }
    loadWorkingStatus(repoPath, true);
  }

  // Polls only the *active* tab so its commit graph, refs, and working-tree
  // status stay current without the user having to click Fetch — covers
  // commits/edits made outside the app (another terminal, an editor, a
  // second git-thicket window). Background tabs are left alone: they get a
  // full resync the moment the user switches to them (see activateRepo)
  // instead of being kept warm the whole time they're not visible, same
  // scope as the filesystem watcher above, which also only ever covers the
  // active repo. Keeping every open tab polling in the background used to
  // multiply how many concurrent `git` subprocesses spawn per tick by the
  // tab count for essentially no benefit, since nothing was showing that
  // data anyway. The "background fetch" setting only gates the network
  // part (`git fetch` against a remote); the local-only refresh below runs
  // unconditionally, since a repo with no remote configured (or the
  // setting turned off) still needs to notice its own local changes.
  // Skipped if the tab is mid-action (busy) or its previous poll is still
  // running — a fetch that outlasts the interval (slow network, short
  // interval) must not stack a second one on top of itself.
  const backgroundFetchInFlight = new Set<string>();
  async function backgroundRefresh(repoPath: string) {
    const tab = get().tabs.find((t) => t.repoPath === repoPath);
    if (!tab || tab.busy) return;
    if (backgroundFetchInFlight.has(repoPath)) return;
    backgroundFetchInFlight.add(repoPath);
    try {
      if (getBackgroundFetchEnabled() && tab.remotes.length > 0) {
        await fetchAll(repoPath);
      }
      await loadTabDataQuiet(repoPath);
    } catch {
      // Unattended poll — nothing to surface.
    } finally {
      backgroundFetchInFlight.delete(repoPath);
    }
  }

  // Self-rescheduling rather than setInterval so a change to the configured
  // interval in Settings is picked up on the next tick instead of requiring
  // an app restart.
  function scheduleBackgroundFetch() {
    setTimeout(() => {
      const { activeRepoPath } = get();
      if (activeRepoPath) backgroundRefresh(activeRepoPath);
      scheduleBackgroundFetch();
    }, getBackgroundFetchIntervalSec() * 1000);
  }
  scheduleBackgroundFetch();

  // Only the active tab gets a filesystem watcher — the backend keeps at
  // most one alive, so pointing it at a new repo implicitly stops the old one.
  async function runAction(
    repoPath: string,
    label: string,
    action: () => Promise<string>,
  ): Promise<boolean> {
    updateTab(repoPath, { busy: true });
    try {
      const output = await action();
      updateTab(repoPath, {
        busy: false,
        toast: { id: toastId++, kind: "success", text: output.trim() || "Done", action: label },
      });
      await loadTabData(repoPath);
      return true;
    } catch (e) {
      updateTab(repoPath, {
        busy: false,
        toast: { id: toastId++, kind: "error", text: String(e), action: label },
      });
      return false;
    }
  }

  // Stage/unstage toggles happen a lot and shouldn't spam a toast or block
  // the UI with `busy` — just re-fetch status, and only surface a toast on
  // failure.
  async function runQuiet(repoPath: string, label: string, action: () => Promise<string>) {
    try {
      await action();
      await loadWorkingStatus(repoPath);
    } catch (e) {
      updateTab(repoPath, {
        toast: { id: toastId++, kind: "error", text: String(e), action: label },
      });
    }
  }

  return {
    tabs: [],
    activeRepoPath: null,
    showRemoteBranches: getShowRemoteBranches(),

    // Global (not per-tab): reloads every open tab quietly, so the graphs
    // swap to the new ref set in place instead of blanking behind a
    // "Loading commits…" state.
    setShowRemoteBranches: (value: boolean) => {
      persistShowRemoteBranches(value);
      set({ showRemoteBranches: value });
    },

    // Applies immediately to whatever's active, rather than waiting for the
    // next tab switch — flipping this off should visibly stop watching
    // right away (useful for isolating whether the watcher itself is
    // responsible for some platform quirk), and flipping it on should pick
    // up the active repo without needing to switch away and back.
    setFileWatchEnabled: (value: boolean) => {
      persistFileWatchEnabled(value);
    },

    // Exposed for useTabLifecycle hook to call when tab becomes active.
    // If tab already has data (from a previous view), quietly refresh it
    // in the background. Otherwise, do a full load with loading indicator.
    loadTabDataFor: async (repoPath: string) => {
      const tab = get().tabs.find((t) => t.repoPath === repoPath);
      // If tab has no commits yet, do a full load with indicator
      if (!tab || tab.commits.length === 0) {
        await loadTabData(repoPath);
      } else {
        // Tab has data from previous view: quietly update in background
        await loadTabDataQuiet(repoPath);
      }
    },

    // Exposed for useTabLifecycle hook: refresh only working status
    loadWorkingStatusFor: async (repoPath: string) => {
      await loadWorkingStatus(repoPath);
    },

    // Only the tab that ends up active gets its data loaded eagerly here —
    // the rest just get a placeholder tab and lazily load the first time
    // the user actually switches to them (via activateRepo, same as any
    // other tab switch). Restoring N tabs used to fire a full loadTabData
    // (a good half-dozen concurrent `git` subprocess spawns each) for every
    // one of them at once; for someone with many saved tabs that's a burst
    // of dozens of processes touching the repo folder in the first second
    // of startup, which is squarely what large multi-tab sessions don't
    // need before the user has even looked at most of those tabs.
    restoreSession: async () => {
      const paths = loadSavedTabPaths();
      const savedActive = localStorage.getItem(ACTIVE_TAB_KEY);
      const validPaths = [];
      for (const path of paths) {
        const valid = await isGitRepo(path).catch(() => false);
        if (valid) validPaths.push(path);
      }
      const tabs = validPaths.map(makeTab);
      const active =
        (savedActive && validPaths.includes(savedActive) && savedActive) || tabs[0]?.repoPath || null;
      set({ tabs, activeRepoPath: active });
    },

    openRepo: async (path: string) => {
      const existing = get().tabs.find((t) => t.repoPath === path);
      if (existing) {
        set({ activeRepoPath: path });
        saveSession(get().tabs, path);
        return;
      }
      const tab = makeTab(path);
      set((state) => {
        const tabs = [...state.tabs, tab];
        saveSession(tabs, path);
        return { tabs, activeRepoPath: path };
      });
    },

    closeTab: (path: string) => {
      set((state) => {
        const tabs = state.tabs.filter((t) => t.repoPath !== path);
        let activeRepoPath = state.activeRepoPath;
        if (activeRepoPath === path) {
          activeRepoPath = tabs[tabs.length - 1]?.repoPath ?? null;
        }
        saveSession(tabs, activeRepoPath);
        return { tabs, activeRepoPath };
      });
    },

    setActiveTab: (path: string) => {
      set({ activeRepoPath: path });
      saveSession(get().tabs, path);
    },

    refreshRepo: async () => {
      // Refresh handled by useTabLifecycle hook on active tab
    },

    selectCommit: async (sha: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      updateTab(activeRepoPath, {
        selectedSha: sha,
        viewingWorkingTree: false,
        loadingFiles: true,
        commitFiles: [],
        selectedFilePath: null,
        loadingDetail: true,
        commitDetail: null,
      });
      try {
        const [files, detail] = await Promise.all([
          getCommitFiles(activeRepoPath, sha),
          getCommitDetail(activeRepoPath, sha),
        ]);
        updateTab(activeRepoPath, {
          commitFiles: files,
          loadingFiles: false,
          commitDetail: detail,
          loadingDetail: false,
        });
      } catch (e) {
        updateTab(activeRepoPath, {
          error: String(e),
          loadingFiles: false,
          loadingDetail: false,
        });
      }
    },

    addCommitToSelection: (sha: string) => {
      const { activeRepoPath, tabs } = get();
      if (!activeRepoPath) return;
      const tab = tabs.find((t) => t.repoPath === activeRepoPath);
      if (!tab) return;
      
      const current = tab.selectedShas;
      if (!current.includes(sha)) {
        updateTab(activeRepoPath, { selectedShas: [...current, sha] });
      }
    },

    toggleCommitSelection: (sha: string) => {
      const { activeRepoPath, tabs } = get();
      if (!activeRepoPath) return;
      const tab = tabs.find((t) => t.repoPath === activeRepoPath);
      if (!tab) return;
      
      const current = tab.selectedShas;
      if (current.includes(sha)) {
        updateTab(activeRepoPath, { selectedShas: current.filter((s) => s !== sha) });
      } else {
        updateTab(activeRepoPath, { selectedShas: [...current, sha] });
      }
    },

    clearCommitsSelection: () => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      updateTab(activeRepoPath, { selectedShas: [] });
    },

    selectFile: (path: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      updateTab(activeRepoPath, { selectedFilePath: path });
    },

    clearSelection: () => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      updateTab(activeRepoPath, {
        selectedSha: null,
        viewingWorkingTree: false,
        commitDetail: null,
        loadingDetail: false,
        commitFiles: [],
        loadingFiles: false,
        selectedFilePath: null,
        selectedFileStaged: false,
      });
    },

    dismissToast: () => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      updateTab(activeRepoPath, { toast: null });
    },

    selectWorkingTree: () => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      updateTab(activeRepoPath, {
        viewingWorkingTree: true,
        selectedSha: null,
        commitDetail: null,
        commitFiles: [],
        selectedFilePath: null,
        selectedFileStaged: false,
      });
    },

    selectWorkingFile: (path: string, staged: boolean) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      updateTab(activeRepoPath, { selectedFilePath: path, selectedFileStaged: staged });
    },

    setCommitMessage: (message: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      updateTab(activeRepoPath, { commitMessage: message });
    },

    setAmend: (amend: boolean) => {
      const { activeRepoPath, tabs } = get();
      if (!activeRepoPath) return;
      updateTab(activeRepoPath, { amend });
      if (!amend) return;
      // Pre-fill with the previous commit's message, like `git commit
      // --amend` does — but don't clobber anything the user already typed.
      const tab = tabs.find((t) => t.repoPath === activeRepoPath);
      if (tab?.commitMessage.trim()) return;
      getCommitDetail(activeRepoPath, "HEAD")
        .then((detail) => {
          const message = detail.body ? `${detail.subject}\n\n${detail.body}` : detail.subject;
          updateTab(activeRepoPath, { commitMessage: message });
        })
        .catch(() => {
          // No previous commit to amend, or the fetch failed — leave the
          // message blank; the commit itself will surface a clear error.
        });
    },

    stageFile: async (path: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runQuiet(activeRepoPath, "Stage", () => stagePath(activeRepoPath, path));
    },

    unstageFile: async (path: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runQuiet(activeRepoPath, "Unstage", () => unstagePath(activeRepoPath, path));
    },

    stageFiles: async (paths: string[]) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath || paths.length === 0) return;
      await runQuiet(activeRepoPath, "Stage selected", () => stagePaths(activeRepoPath, paths));
    },

    unstageFiles: async (paths: string[]) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath || paths.length === 0) return;
      await runQuiet(activeRepoPath, "Unstage selected", () => unstagePaths(activeRepoPath, paths));
    },

    stageAllFiles: async () => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runQuiet(activeRepoPath, "Stage all", () => stageAll(activeRepoPath));
    },

    unstageAllFiles: async () => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runQuiet(activeRepoPath, "Unstage all", () => unstageAll(activeRepoPath));
    },

    commitStagedChanges: async () => {
      const { activeRepoPath, tabs } = get();
      if (!activeRepoPath) return;
      const tab = tabs.find((t) => t.repoPath === activeRepoPath);
      const message = tab?.commitMessage.trim();
      if (!message) return;
      const amend = tab?.amend ?? false;
      const ok = await runAction(activeRepoPath, amend ? "Amend commit" : "Commit", () =>
        commitChanges(activeRepoPath, message, amend),
      );
      if (ok) updateTab(activeRepoPath, { commitMessage: "", amend: false });
    },

    doFetch: async () => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Fetch", () => fetchAll(activeRepoPath));
    },

    doPull: async () => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Pull", () => pull(activeRepoPath));
    },

    doPush: async (forceMode: PushForceMode = null, noVerify = false) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Push", () => push(activeRepoPath, forceMode, noVerify));
    },

    doStashPush: async (message?: string, paths?: string[]) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Stash", () => stashPush(activeRepoPath, message, paths));
    },

    doStashPop: async (index?: number) => {
      const { activeRepoPath, tabs } = get();
      if (!activeRepoPath) return;

      const activeTab = tabs.find((t) => t.repoPath === activeRepoPath);
      if (!activeTab) return;

      const success = await runAction(activeRepoPath, "Stash pop", async () => {
        // Check if there are uncommitted changes that would conflict with the stash
        const hasUncommittedChanges = activeTab.workingStatus.some(
          (f) => f.indexStatus !== "none" || f.worktreeStatus !== "none",
        );

        let stashed = false;

        try {
          // Stash changes if they exist to avoid conflicts during pop
          if (hasUncommittedChanges) {
            await stashPush(activeRepoPath, "thicket-stashpop-auto");
            stashed = true;
          }

          // Pop the requested stash
          const popResult = await stashPop(activeRepoPath, index);

          // Try to unstash the changes we saved
          if (stashed) {
            try {
              await stashPop(activeRepoPath, 0);
              return `${popResult}\nAuto-unstashed your changes.`;
            } catch (unstashError) {
              // If unstashing fails, the stash is still available
              return `${popResult}\nWarning: Could not auto-unstash changes. Stash available at stash@{0}.`;
            }
          }

          return popResult;
        } catch (popError) {
          // If pop fails, try to unstash so the working tree isn't left empty
          if (stashed) {
            try {
              await stashPop(activeRepoPath, 0);
            } catch {
              // Ignore unstash errors during error recovery
            }
          }
          throw popError;
        }
      });

      if (success) {
        // Check if there are conflicts after pop
        const updatedTab = tabs.find((t) => t.repoPath === activeRepoPath);
        const conflicts = updatedTab?.workingStatus.filter((f) => isConflicted(f)) ?? [];

        if (conflicts.length > 0) {
          // Find the stash that was popped to get its message for display
          const stashIndex = index ?? 0;
          const stashEntry = updatedTab?.stashes.find((s) => s.index === stashIndex);
          const stashMessage = stashEntry?.message ?? `stash@{${stashIndex}}`;

          // Set merge conflict in progress so the UI can show conflict dialog
          updateTab(activeRepoPath, {
            mergeConflictInProgress: {
              operation: "stash-pop",
              operationLabel: `stash pop: ${stashMessage}`,
              stashIndex,
            },
          });
        }
      }
    },

    doStashDrop: async (index?: number) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Stash drop", () => stashDrop(activeRepoPath, index));
    },

    doAddRemote: async (name: string, url: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Add remote", () => addRemote(activeRepoPath, name, url));
    },

    doCheckoutRef: async (refName: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Checkout", () => checkoutRef(activeRepoPath, refName));
    },

    doCheckoutRefWithStash: async (refName: string) => {
      const { activeRepoPath, tabs } = get();
      if (!activeRepoPath) return;
      const activeTab = tabs.find((t) => t.repoPath === activeRepoPath);
      if (!activeTab) return;

      await runAction(activeRepoPath, "Checkout", async () => {
        // Check if there are uncommitted changes
        const hasUncommittedChanges = activeTab.workingStatus.some(
          (f) => f.indexStatus !== "none" || f.worktreeStatus !== "none",
        );

        let stashed = false;

        try {
          // Stash changes if they exist
          if (hasUncommittedChanges) {
            await stashPush(activeRepoPath, "thicket-checkout-auto");
            stashed = true;
          }

          // Perform the checkout
          const checkoutResult = await checkoutRef(activeRepoPath, refName);

          // Unstash changes if we stashed them
          if (stashed) {
            try {
              await stashPop(activeRepoPath, 0);
              return `${checkoutResult}\nUnstashed changes (auto-stashed before checkout).`;
            } catch (unstashError) {
              // If unstashing fails, the stash is still available, just show the checkout result
              return `${checkoutResult}\nWarning: Could not auto-unstash changes. Stash available at stash@{0}.`;
            }
          }

          return checkoutResult;
        } catch (checkoutError) {
          // If checkout fails, try to unstash so the working tree isn't left empty
          if (stashed) {
            try {
              await stashPop(activeRepoPath, 0);
            } catch {
              // Ignore unstash errors during error recovery
            }
          }
          throw checkoutError;
        }
      });
    },

    doPrepareCommit: async () => {
      const { activeRepoPath, tabs } = get();
      if (!activeRepoPath) return;
      const activeTab = tabs.find((t) => t.repoPath === activeRepoPath);
      if (!activeTab) return;

      // Stage all changes
      const allPaths = activeTab.workingStatus
        .filter((f) => f.indexStatus !== "none" || f.worktreeStatus !== "none")
        .map((f) => f.path);

      if (allPaths.length > 0) {
        await runQuiet(activeRepoPath, "Stage all", () => stagePaths(activeRepoPath, allPaths));
      }

      // Switch to working tree view
      updateTab(activeRepoPath, { viewingWorkingTree: true });
      await loadWorkingStatus(activeRepoPath);
    },

    doCreateBranch: async (name: string, sha: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Create branch", () => createBranch(activeRepoPath, name, sha));
    },

    doDeleteBranch: async (name: string, force = false) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Delete branch", () => deleteBranch(activeRepoPath, name, force));
    },

    doRenameBranch: async (oldName: string, newName: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Rename branch", () =>
        renameBranch(activeRepoPath, oldName, newName),
      );
    },

    doMoveBranch: async (name: string, target: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Repoint branch", () =>
        moveBranch(activeRepoPath, name, target),
      );
    },

    doSetUpstream: async (name: string, upstream: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Set upstream", () =>
        setUpstream(activeRepoPath, name, upstream),
      );
    },

    doDeleteRemoteBranch: async (remote: string, name: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Delete remote branch", () =>
        deleteRemoteBranch(activeRepoPath, remote, name),
      );
    },

    doCreateTag: async (name: string, sha: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Create tag", () => createTag(activeRepoPath, name, sha));
    },

    doDeleteTag: async (name: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Delete tag", () => deleteTag(activeRepoPath, name));
    },

    doPushTag: async (remote: string, name: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Push tag", () => pushTag(activeRepoPath, remote, name));
    },

    doDeleteRemoteTag: async (remote: string, name: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Delete remote tag", () =>
        deleteRemoteTag(activeRepoPath, remote, name),
      );
    },

    doCherryPick: async (sha: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Cherry-pick", () => cherryPick(activeRepoPath, sha));
    },

    doRevertCommit: async (sha: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Revert commit", () => revertCommit(activeRepoPath, sha));
    },

    doResetToCommit: async (sha: string, mode: ResetMode) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Reset", () => resetToCommit(activeRepoPath, sha, mode));
    },

    doFastForwardBranch: async (targetRef: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Fast-forward", () =>
        fastForwardBranch(activeRepoPath, targetRef),
      );
    },

    doRebaseBranch: async (targetRef: string) => {
      const { activeRepoPath, tabs } = get();
      if (!activeRepoPath) return;
      const activeTab = tabs.find((t) => t.repoPath === activeRepoPath);
      if (!activeTab) return;

      const success = await runAction(activeRepoPath, "Rebase", async () => {
        // Check if there are uncommitted changes
        const hasUncommittedChanges = activeTab.workingStatus.some(
          (f) => f.indexStatus !== "none" || f.worktreeStatus !== "none",
        );

        let stashed = false;

        try {
          // Stash changes if they exist
          if (hasUncommittedChanges) {
            await stashPush(activeRepoPath, "thicket-rebase-auto");
            stashed = true;
          }

          // Perform the rebase
          const rebaseResult = await rebaseBranch(activeRepoPath, targetRef);

          // Unstash changes if we stashed them
          if (stashed) {
            try {
              await stashPop(activeRepoPath, 0);
              return `${rebaseResult}\nUnstashed changes (auto-stashed before rebase).`;
            } catch (unstashError) {
              // If unstashing fails, the stash is still available, just show the rebase result
              return `${rebaseResult}\nWarning: Could not auto-unstash changes. Stash available at stash@{0}.`;
            }
          }

          return rebaseResult;
        } catch (rebaseError) {
          // If rebase fails, try to unstash so the working tree isn't left empty
          if (stashed) {
            try {
              await stashPop(activeRepoPath, 0);
            } catch {
              // Ignore unstash errors during error recovery
            }
          }
          throw rebaseError;
        }
      });

      if (success) {
        // Check if there are conflicts after rebase
        const tab = tabs.find((t) => t.repoPath === activeRepoPath);
        const conflicts = tab?.workingStatus.filter((f) => isConflicted(f)) ?? [];

        if (conflicts.length > 0) {
          // Set merge conflict in progress so the UI can show conflict dialog
          updateTab(activeRepoPath, {
            mergeConflictInProgress: {
              operation: "rebase",
              operationLabel: `rebase onto ${targetRef}`,
            },
          });
        }
      }
    },

    doContinueRebase: async () => {
      const { activeRepoPath, tabs } = get();
      if (!activeRepoPath) return;

      const tab = tabs.find((t) => t.repoPath === activeRepoPath);
      if (!tab?.mergeConflictInProgress || tab.mergeConflictInProgress.operation !== "rebase")
        return;

      // Continue the rebase
      const success = await runAction(activeRepoPath, "Continue rebase", () =>
        rebaseContinue(activeRepoPath),
      );

      if (success) {
        // Check if there are more conflicts
        const updatedTab = tabs.find((t) => t.repoPath === activeRepoPath);
        const conflicts = updatedTab?.workingStatus.filter((f) => isConflicted(f)) ?? [];

        if (conflicts.length === 0) {
          // No more conflicts, clear the state
          updateTab(activeRepoPath, { mergeConflictInProgress: undefined });
        }
        // Otherwise, keep the dialog open for next set of conflicts
      }
    },

    doAbortRebase: async () => {
      const { activeRepoPath, tabs } = get();
      if (!activeRepoPath) return;

      const tab = tabs.find((t) => t.repoPath === activeRepoPath);
      if (!tab?.mergeConflictInProgress || tab.mergeConflictInProgress.operation !== "rebase")
        return;

      // Abort the rebase
      const success = await runAction(activeRepoPath, "Abort rebase", () =>
        rebaseAbort(activeRepoPath),
      );

      if (success) {
        // Clear the conflict state
        updateTab(activeRepoPath, { mergeConflictInProgress: undefined });
      }
    },

    doCompleteConflict: async () => {
      const { activeRepoPath, tabs } = get();
      if (!activeRepoPath) return;

      const tab = tabs.find((t) => t.repoPath === activeRepoPath);
      const conflict = tab?.mergeConflictInProgress;
      if (!conflict) return;

      if (conflict.operation === "stash-pop") {
        // Drop the stash to complete the pop
        const success = await runAction(activeRepoPath, "Complete stash pop", () =>
          stashDrop(activeRepoPath, conflict.stashIndex ?? 0),
        );

        if (success) {
          updateTab(activeRepoPath, { mergeConflictInProgress: undefined });
        }
      } else if (conflict.operation === "rebase") {
        // Continue the rebase
        await get().doContinueRebase();
      }
    },

    doAbortConflict: async () => {
      const { activeRepoPath, tabs } = get();
      if (!activeRepoPath) return;

      const tab = tabs.find((t) => t.repoPath === activeRepoPath);
      const conflict = tab?.mergeConflictInProgress;
      if (!conflict) return;

      if (conflict.operation === "stash-pop") {
        // Reset to HEAD to discard the conflicted merge state
        const success = await runAction(activeRepoPath, "Abort stash pop", () =>
          resetToCommit(activeRepoPath, "HEAD", "hard"),
        );

        if (success) {
          updateTab(activeRepoPath, { mergeConflictInProgress: undefined });
        }
      } else if (conflict.operation === "rebase") {
        // Abort the rebase
        await get().doAbortRebase();
      }
    },

    doResolveConflict: async (path: string, content: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Resolve conflict", () =>
        resolveConflict(activeRepoPath, path, content),
      );
    },

    doCherryPickMultiple: async (shas: string[]) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath || shas.length === 0) return;

      // Cherry-pick each commit in order, stopping on first conflict
      for (const sha of shas) {
        const success = await runAction(activeRepoPath, `Cherry-pick ${sha.slice(0, 7)}`, () =>
          cherryPick(activeRepoPath, sha),
        );
        if (!success) {
          // Cherry-pick stopped, keep selection to show which commits were intended
          return;
        }
      }

      // Clear selection after successful operation
      get().clearCommitsSelection();
    },

    doSquashCommits: async (shas: string[]) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath || shas.length < 2) return;

      // For squashing: need to do interactive rebase
      // shas are in commit graph order (newest first usually)
      // We rebase onto the parent of the oldest commit
      const oldestSha = shas[shas.length - 1];

      // Get the parent of the oldest commit
      const parentRef = `${oldestSha}^`;

      // Interactive rebase with squash script
      // For now, we'll use a simple approach: rebase and let the user know to use rebase --interactive
      // This is complex and might need a separate interactive rebase UI

      const success = await runAction(activeRepoPath, "Rebase", () =>
        rebaseBranch(activeRepoPath, parentRef),
      );

      if (success) {
        const tab = get().tabs.find((t) => t.repoPath === activeRepoPath);
        const conflicts = tab?.workingStatus.filter((f) => isConflicted(f)) ?? [];

        if (conflicts.length > 0) {
          updateTab(activeRepoPath, {
            mergeConflictInProgress: {
              operation: "rebase",
              operationLabel: `rebase for squash`,
            },
          });
        }
      }

      // Clear selection
      get().clearCommitsSelection();
    },

    doCreatePullRequest: async (currentBranch: string, targetBranch: string, title: string, description: string, draft: boolean) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Create pull request", () =>
        createPullRequest(activeRepoPath, currentBranch, targetBranch, title, description, draft),
      );
    },
  };
});

export function useActiveTab(): RepoTab | null {
  return useRepoStore((s) => s.tabs.find((t) => t.repoPath === s.activeRepoPath) ?? null);
}
