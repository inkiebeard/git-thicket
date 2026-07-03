import { useRepoStore } from "../store/repoStore";

function repoName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function Tabs() {
  const tabs = useRepoStore((s) => s.tabs);
  const activeRepoPath = useRepoStore((s) => s.activeRepoPath);
  const setActiveTab = useRepoStore((s) => s.setActiveTab);
  const closeTab = useRepoStore((s) => s.closeTab);

  if (tabs.length === 0) return null;

  return (
    <div className="tabs">
      {tabs.map((t) => (
        <div
          key={t.repoPath}
          className={`tab${t.repoPath === activeRepoPath ? " active" : ""}`}
          title={t.repoPath}
          onClick={() => setActiveTab(t.repoPath)}
        >
          <span className="tab-name">{repoName(t.repoPath)}</span>
          {t.busy && <span className="tab-busy" />}
          <button
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(t.repoPath);
            }}
            aria-label={`Close ${repoName(t.repoPath)}`}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
