import { useEffect } from "react";
import { CommitDetail } from "./components/CommitDetail";
import { CommitGraph } from "./components/CommitGraph";
import { DiffViewer } from "./components/DiffViewer";
import { FileList } from "./components/FileList";
import { ResizeHandle } from "./components/ResizeHandle";
import { Tabs } from "./components/Tabs";
import { Toolbar } from "./components/Toolbar";
import { useResizableWidths } from "./lib/useResizableWidths";
import { useActiveTab, useRepoStore } from "./store/repoStore";
import "./App.css";

function App() {
  const activeTab = useActiveTab();
  const restoreSession = useRepoStore((s) => s.restoreSession);
  const clearSelection = useRepoStore((s) => s.clearSelection);
  const { widths, resize } = useResizableWidths([420], "thicket:paneWidths");
  const hasSelection = !!activeTab?.selectedSha || !!activeTab?.viewingWorkingTree;

  useEffect(() => {
    restoreSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app">
      {activeTab && (
        <header className="app-header">
          <Toolbar />
          {activeTab.error && <div className="app-error">{activeTab.error}</div>}
        </header>
      )}
      <Tabs />
      {activeTab ? (
        <main className="app-body">
          <section
            className="pane pane-commits"
            style={hasSelection ? { width: widths[0] } : { flex: 1 }}
          >
            <CommitGraph key={activeTab.repoPath} />
          </section>
          {hasSelection && (
            <>
              <ResizeHandle onDrag={(dx) => resize(0, dx)} />
              <section className="pane-right">
                <button
                  className="pane-right-close"
                  onClick={clearSelection}
                  aria-label="Deselect commit"
                  title="Deselect commit"
                >
                  ×
                </button>
                <CommitDetail />
                <FileList />
                <div className="pane pane-diff">
                  <DiffViewer />
                </div>
              </section>
            </>
          )}
        </main>
      ) : (
        <div className="empty-state app-empty">Open a repository to get started</div>
      )}
    </div>
  );
}

export default App;
