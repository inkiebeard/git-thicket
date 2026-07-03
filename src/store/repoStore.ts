import { create } from "zustand";
import {
  type CommitDetail,
  type CommitInfo,
  type FileChange,
  type PushForceMode,
  type RefInfo,
  currentBranch,
  fetchAll,
  getCommitDetail,
  getCommitFiles,
  isGitRepo,
  listCommits,
  listRefs,
  pull,
  push,
  stashPop,
  stashPush,
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
  loadingCommits: boolean;
  error: string | null;

  selectedSha: string | null;
  commitDetail: CommitDetail | null;
  loadingDetail: boolean;
  commitFiles: FileChange[];
  loadingFiles: boolean;

  selectedFilePath: string | null;

  busy: boolean;
  toast: Toast | null;
}

function makeTab(repoPath: string): RepoTab {
  return {
    repoPath,
    commits: [],
    refs: [],
    branch: null,
    loadingCommits: true,
    error: null,
    selectedSha: null,
    commitDetail: null,
    loadingDetail: false,
    commitFiles: [],
    loadingFiles: false,
    selectedFilePath: null,
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
  dismissToast: () => void;

  doFetch: () => Promise<void>;
  doPull: () => Promise<void>;
  doPush: (forceMode?: PushForceMode) => Promise<void>;
  doStashPush: (message?: string) => Promise<void>;
  doStashPop: (index?: number) => Promise<void>;
}

const OPEN_TABS_KEY = "gitux:openTabs";
const ACTIVE_TAB_KEY = "gitux:activeTab";

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

  async function loadTabData(repoPath: string) {
    updateTab(repoPath, { loadingCommits: true, error: null });
    try {
      const [commits, refs, branch] = await Promise.all([
        listCommits(repoPath),
        listRefs(repoPath),
        currentBranch(repoPath),
      ]);
      updateTab(repoPath, { commits, refs, branch, loadingCommits: false });
    } catch (e) {
      updateTab(repoPath, { error: String(e), loadingCommits: false });
    }
  }

  async function runAction(repoPath: string, action: () => Promise<string>) {
    updateTab(repoPath, { busy: true });
    try {
      const output = await action();
      updateTab(repoPath, {
        busy: false,
        toast: { id: toastId++, kind: "success", text: output.trim() || "Done" },
      });
      await loadTabData(repoPath);
    } catch (e) {
      updateTab(repoPath, {
        busy: false,
        toast: { id: toastId++, kind: "error", text: String(e) },
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

    dismissToast: () => {
      const { activeRepoPath } = get();
      if (!activeRepoPath) return;
      updateTab(activeRepoPath, { toast: null });
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
  };
});

export function useActiveTab(): RepoTab | null {
  return useRepoStore((s) => s.tabs.find((t) => t.repoPath === s.activeRepoPath) ?? null);
}
