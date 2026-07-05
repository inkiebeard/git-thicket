import { create } from "zustand";
import {
  type AheadBehind,
  type CommitDetail,
  type CommitInfo,
  type FileChange,
  type PushForceMode,
  type RefInfo,
  type RemoteInfo,
  type ResetMode,
  type WorkingFileEntry,
  addRemote,
  aheadBehind as fetchAheadBehind,
  checkoutRef,
  cherryPick,
  commitChanges,
  createBranch,
  createTag,
  currentBranch,
  deleteBranch,
  deleteRemoteBranch,
  fetchAll,
  getCommitDetail,
  getCommitFiles,
  gitStatus,
  isGitRepo,
  listCommits,
  listRefs,
  listRemotes,
  moveBranch,
  pull,
  push,
  renameBranch,
  resetToCommit,
  revertCommit,
  setUpstream,
  stageAll,
  stagePath,
  stagePaths,
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
  loadingCommits: boolean;
  error: string | null;

  selectedSha: string | null;
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
    loadingCommits: true,
    error: null,
    selectedSha: null,
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

  restoreSession: () => Promise<void>;
  openRepo: (path: string) => Promise<void>;
  closeTab: (path: string) => void;
  setActiveTab: (path: string) => void;
  refreshRepo: () => Promise<void>;
  selectCommit: (sha: string) => Promise<void>;
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
  doPush: (forceMode?: PushForceMode) => Promise<void>;
  doStashPush: (message?: string) => Promise<void>;
  doStashPop: (index?: number) => Promise<void>;
  doAddRemote: (name: string, url: string) => Promise<void>;

  doCheckoutRef: (refName: string) => Promise<void>;
  doCreateBranch: (name: string, sha: string) => Promise<void>;
  doDeleteBranch: (name: string, force?: boolean) => Promise<void>;
  doRenameBranch: (oldName: string, newName: string) => Promise<void>;
  doMoveBranch: (name: string, target: string) => Promise<void>;
  doSetUpstream: (name: string, upstream: string) => Promise<void>;
  doDeleteRemoteBranch: (remote: string, name: string) => Promise<void>;
  doCreateTag: (name: string, sha: string) => Promise<void>;
  doCherryPick: (sha: string) => Promise<void>;
  doRevertCommit: (sha: string) => Promise<void>;
  doResetToCommit: (sha: string, mode: ResetMode) => Promise<void>;
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

  async function loadWorkingStatus(repoPath: string) {
    updateTab(repoPath, { loadingStatus: true });
    try {
      const workingStatus = await gitStatus(repoPath);
      updateTab(repoPath, { workingStatus, loadingStatus: false });
    } catch (e) {
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
      updateTab(repoPath, { aheadBehind: null });
      return;
    }
    try {
      const result = await fetchAheadBehind(repoPath, tab.branch, upstream);
      updateTab(repoPath, { aheadBehind: result });
    } catch {
      updateTab(repoPath, { aheadBehind: null });
    }
  }

  async function loadTabData(repoPath: string) {
    updateTab(repoPath, { loadingCommits: true, error: null });
    try {
      const [commits, refs, branch, remotes] = await Promise.all([
        listCommits(repoPath),
        listRefs(repoPath),
        currentBranch(repoPath),
        listRemotes(repoPath).catch(() => []),
      ]);
      updateTab(repoPath, { commits, refs, branch, remotes, loadingCommits: false });
      loadAheadBehind(repoPath);
    } catch (e) {
      updateTab(repoPath, { error: String(e), loadingCommits: false });
    }
    // Independent of the above: a broken working-tree status fetch shouldn't
    // blank out the commit graph that just loaded fine.
    loadWorkingStatus(repoPath);
  }

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

    restoreSession: async () => {
      const paths = loadSavedTabPaths();
      const savedActive = localStorage.getItem(ACTIVE_TAB_KEY);
      for (const path of paths) {
        const valid = await isGitRepo(path).catch(() => false);
        if (!valid) continue;
        set((state) =>
          state.tabs.some((t) => t.repoPath === path)
            ? state
            : { tabs: [...state.tabs, makeTab(path)] },
        );
        loadTabData(path);
      }
      const { tabs } = get();
      const active =
        (savedActive && tabs.some((t) => t.repoPath === savedActive) && savedActive) ||
        tabs[0]?.repoPath ||
        null;
      set({ activeRepoPath: active });
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
      await loadTabData(path);
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
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await loadTabData(activeRepoPath);
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

    doPush: async (forceMode: PushForceMode = null) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Push", () => push(activeRepoPath, forceMode));
    },

    doStashPush: async (message?: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Stash", () => stashPush(activeRepoPath, message));
    },

    doStashPop: async (index?: number) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, "Stash pop", () => stashPop(activeRepoPath, index));
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
  };
});

export function useActiveTab(): RepoTab | null {
  return useRepoStore((s) => s.tabs.find((t) => t.repoPath === s.activeRepoPath) ?? null);
}
