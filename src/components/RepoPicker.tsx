import { useState } from "react";
import { isGitRepo, openRepoDialog } from "../api/git";
import { useClickOutside } from "../lib/useClickOutside";
import { useActiveTab, useRepoStore } from "../store/repoStore";

const RECENT_KEY = "thicket:recentRepos";

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveRecent(path: string) {
  const existing = loadRecent().filter((p) => p !== path);
  const updated = [path, ...existing].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  return updated;
}

export function RepoPicker() {
  const openRepo = useRepoStore((s) => s.openRepo);
  const activeTab = useActiveTab();
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [pickError, setPickError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  async function handleOpen(path: string) {
    setPickError(null);
    const valid = await isGitRepo(path);
    if (!valid) {
      setPickError(`Not a git repository: ${path}`);
      return;
    }
    setRecent(saveRecent(path));
    await openRepo(path);
  }

  async function handleBrowse() {
    const path = await openRepoDialog();
    if (path) await handleOpen(path);
  }

  return (
    <div className="repo-picker" ref={ref}>
      <div className="split-button">
        <button className="btn-primary" onClick={handleBrowse}>
          Open Repository…
        </button>
        <button
          className="btn-primary btn-caret"
          disabled={recent.length === 0}
          onClick={() => setOpen((o) => !o)}
          aria-label="Recent repositories"
        >
          ▾
        </button>
        {open && (
          <div className="dropdown-menu dropdown-menu-left">
            <div className="dropdown-label">Recent</div>
            {recent.map((p) => (
              <button
                key={p}
                className="dropdown-item"
                title={p}
                onClick={() => {
                  setOpen(false);
                  handleOpen(p);
                }}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>
      {activeTab && (
        <div className="repo-path" title={activeTab.repoPath}>
          {activeTab.repoPath}
        </div>
      )}
      {pickError && <div className="repo-error">{pickError}</div>}
    </div>
  );
}
