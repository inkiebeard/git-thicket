import { useEffect } from "react";
import { CommitDetail } from "./components/CommitDetail";
import { CommitGraph } from "./components/CommitGraph";
import { DiffViewer } from "./components/DiffViewer";
import { FileList } from "./components/FileList";
import { RepoPicker } from "./components/RepoPicker";
import { ResizeHandle } from "./components/ResizeHandle";
import { Tabs } from "./components/Tabs";
import { Toolbar } from "./components/Toolbar";
import { useResizableWidths } from "./lib/useResizableWidths";
import { useActiveTab, useRepoStore } from "./store/repoStore";
import "./App.css";

function App() {
  const activeTab = useActiveTab();
  const restoreSession = useRepoStore((s) => s.restoreSession);
  const { widths, resize } = useResizableWidths([420], "gitux:paneWidths");

  useEffect(() => {
    restoreSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <RepoPicker />
        {activeTab && <Toolbar />}
        {activeTab?.error && <div className="app-error">{activeTab.error}</div>}
      </header>
      <Tabs />
      {activeTab ? (
        <main className="app-body">
          <section className="pane pane-commits" style={{ width: widths[0] }}>
            <CommitGraph />
          </section>
          <ResizeHandle onDrag={(dx) => resize(0, dx)} />
          <section className="pane-right">
            <CommitDetail />
            <FileList />
            <div className="pane pane-diff">
              <DiffViewer />
            </div>
          </section>
        </main>
      ) : (
        <div className="empty-state app-empty">Open a repository to get started</div>
      )}
    </div>
  );
}

export default App;
