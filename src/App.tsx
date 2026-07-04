import { useEffect, useState } from "react";
import { CommitDetail } from "./components/CommitDetail";
import { CommitGraph } from "./components/CommitGraph";
import { DiffViewer } from "./components/DiffViewer";
import { FileList } from "./components/FileList";
import { ResizeHandle } from "./components/ResizeHandle";
import { Tabs } from "./components/Tabs";
import { TerminalPanel } from "./components/TerminalPanel";
import { Toolbar } from "./components/Toolbar";
import { useResizableWidths } from "./lib/useResizableWidths";
import { useActiveTab, useRepoStore } from "./store/repoStore";
import "./App.css";

function App() {
  const activeTab = useActiveTab();
  const restoreSession = useRepoStore((s) => s.restoreSession);
  const clearSelection = useRepoStore((s) => s.clearSelection);
  const { widths, resize } = useResizableWidths([420], "thicket:paneWidths");
  const { widths: terminalHeights, resize: resizeTerminal } = useResizableWidths(
    [320],
    "thicket:terminalHeight",
    120,
  );
  const hasSelection = !!activeTab?.selectedSha || !!activeTab?.viewingWorkingTree;
  const [terminalOpen, setTerminalOpen] = useState(false);

  useEffect(() => {
    restoreSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app">
      {activeTab && (
        <header className="app-header">
          <Toolbar
            terminalOpen={terminalOpen}
            onToggleTerminal={() => setTerminalOpen((o) => !o)}
          />
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
      {terminalOpen && activeTab && (
        <>
          <ResizeHandle axis="y" onDrag={(dy) => resizeTerminal(0, -dy)} />
          <TerminalPanel
            height={terminalHeights[0]}
            onClose={() => setTerminalOpen(false)}
          />
        </>
      )}
    </div>
  );
}

export default App;
