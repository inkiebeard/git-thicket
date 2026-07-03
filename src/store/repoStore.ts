import { create } from "zustand";
import {
  type AheadBehind,
  type CommitDetail,
  type CommitInfo,
  type FileChange,
  type PushForceMode,
  type RefInfo,
  type ResetMode,
  type WorkingFileEntry,
  aheadBehind as fetchAheadBehind,
  checkoutRef,
  cherryPick,
  commitChanges,
  createBranch,
  createTag,
  currentBranch,
  deleteBranch,
  fetchAll,
  getCommitDetail,
  getCommitFiles,
  gitStatus,
  isGitRepo,
  listCommits,
  listRefs,
  pull,
  push,
  resetToCommit,
  revertCommit,
  stageAll,
  stagePath,
  stashPop,
  stashPush,
  unstageAll,
  unstagePath,
} from "../api/git";

export interface Toast {
  id: number;
  kind: "success" | "error";
  text: string;
}

export interface RepoTab {
  repoPath: string;
  commits: CommitInfo[];
  refs: RefInfo[];
  branch: string | null;
  aheadBehind: AheadBehind | null;
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
  stageFile: (path: string) => Promise<void>;
  unstageFile: (path: string) => Promise<void>;
  stageAllFiles: () => Promise<void>;
  unstageAllFiles: () => Promise<void>;
  commitStagedChanges: () => Promise<void>;

  doFetch: () => Promise<void>;
  doPull: () => Promise<void>;
  doPush: (forceMode?: PushForceMode) => Promise<void>;
  doStashPush: (message?: string) => Promise<void>;
  doStashPop: (index?: number) => Promise<void>;

  doCheckoutRef: (refName: string) => Promise<void>;
  doCreateBranch: (name: string, sha: string) => Promise<void>;
  doDeleteBranch: (name: string, force?: boolean) => Promise<void>;
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
        toast: { id: toastId++, kind: "error", text: String(e) },
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
      const [commits, refs, branch] = await Promise.all([
        listCommits(repoPath),
        listRefs(repoPath),
        currentBranch(repoPath),
      ]);
      updateTab(repoPath, { commits, refs, branch, loadingCommits: false });
      loadAheadBehind(repoPath);
    } catch (e) {
      updateTab(repoPath, { error: String(e), loadingCommits: false });
    }
    // Independent of the above: a broken working-tree status fetch shouldn't
    // blank out the commit graph that just loaded fine.
    loadWorkingStatus(repoPath);
  }

  async function runAction(repoPath: string, action: () => Promise<string>): Promise<boolean> {
    updateTab(repoPath, { busy: true });
    try {
      const output = await action();
      updateTab(repoPath, {
        busy: false,
        toast: { id: toastId++, kind: "success", text: output.trim() || "Done" },
      });
      await loadTabData(repoPath);
      return true;
    } catch (e) {
      updateTab(repoPath, {
        busy: false,
        toast: { id: toastId++, kind: "error", text: String(e) },
      });
      return false;
    }
  }

  // Stage/unstage toggles happen a lot and shouldn't spam a toast or block
  // the UI with `busy` — just re-fetch status, and only surface a toast on
  // failure.
  async function runQuiet(repoPath: string, action: () => Promise<string>) {
    try {
      await action();
      await loadWorkingStatus(repoPath);
    } catch (e) {
      updateTab(repoPath, { toast: { id: toastId++, kind: "error", text: String(e) } });
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

    stageFile: async (path: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runQuiet(activeRepoPath, () => stagePath(activeRepoPath, path));
    },

    unstageFile: async (path: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runQuiet(activeRepoPath, () => unstagePath(activeRepoPath, path));
    },

    stageAllFiles: async () => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runQuiet(activeRepoPath, () => stageAll(activeRepoPath));
    },

    unstageAllFiles: async () => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runQuiet(activeRepoPath, () => unstageAll(activeRepoPath));
    },

    commitStagedChanges: async () => {
      const { activeRepoPath, tabs } = get();
      if (!activeRepoPath) return;
      const message = tabs.find((t) => t.repoPath === activeRepoPath)?.commitMessage.trim();
      if (!message) return;
      const ok = await runAction(activeRepoPath, () => commitChanges(activeRepoPath, message));
      if (ok) updateTab(activeRepoPath, { commitMessage: "" });
    },

    doFetch: async () => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, () => fetchAll(activeRepoPath));
    },

    doPull: async () => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, () => pull(activeRepoPath));
    },

    doPush: async (forceMode: PushForceMode = null) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, () => push(activeRepoPath, forceMode));
    },

    doStashPush: async (message?: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, () => stashPush(activeRepoPath, message));
    },

    doStashPop: async (index?: number) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, () => stashPop(activeRepoPath, index));
    },

    doCheckoutRef: async (refName: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, () => checkoutRef(activeRepoPath, refName));
    },

    doCreateBranch: async (name: string, sha: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, () => createBranch(activeRepoPath, name, sha));
    },

    doDeleteBranch: async (name: string, force = false) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, () => deleteBranch(activeRepoPath, name, force));
    },

    doCreateTag: async (name: string, sha: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, () => createTag(activeRepoPath, name, sha));
    },

    doCherryPick: async (sha: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, () => cherryPick(activeRepoPath, sha));
    },

    doRevertCommit: async (sha: string) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, () => revertCommit(activeRepoPath, sha));
    },

    doResetToCommit: async (sha: string, mode: ResetMode) => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      await runAction(activeRepoPath, () => resetToCommit(activeRepoPath, sha, mode));
    },
  };
});

export function useActiveTab(): RepoTab | null {
  return useRepoStore((s) => s.tabs.find((t) => t.repoPath === s.activeRepoPath) ?? null);
}
