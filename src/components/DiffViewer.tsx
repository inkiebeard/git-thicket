import { useEffect, useState } from "react";
import { getFileDiff, getWorkingFileDiff } from "../api/git";
import {
  parseDiff,
  toSplitRows,
  type DiffHunk,
  type DiffLine,
} from "../lib/diffParser";
import { useActiveTab } from "../store/repoStore";

type ViewMode = "unified" | "split";

const VIEW_MODE_KEY = "thicket:diffViewMode";

function loadViewMode(): ViewMode {
  const stored = localStorage.getItem(VIEW_MODE_KEY);
  return stored === "split" ? "split" : "unified";
}

function UnifiedHunk({ hunk }: { hunk: DiffHunk }) {
  return (
    <div className="diff-hunk-lines">
      {hunk.lines.map((line, lineIdx) => (
        <div key={lineIdx} className={`diff-line diff-line-${line.type}`}>
          <span className="diff-line-num diff-line-num-old">{line.oldLine ?? ""}</span>
          <span className="diff-line-num diff-line-num-new">{line.newLine ?? ""}</span>
          <span className="diff-line-marker">
            {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
          </span>
          <span className="diff-line-content">{line.content}</span>
        </div>
      ))}
    </div>
  );
}

function SplitSide({ line, marker }: { line: DiffLine | null; marker: string }) {
  if (!line) {
    return <div className="diff-split-side diff-line-empty" />;
  }
  return (
    <div className={`diff-split-side diff-line-${line.type}`}>
      <span className="diff-line-num">{line.oldLine ?? line.newLine ?? ""}</span>
      <span className="diff-line-marker">{marker}</span>
      <span className="diff-line-content">{line.content}</span>
    </div>
  );
}

function SplitHunk({ hunk }: { hunk: DiffHunk }) {
  const rows = toSplitRows(hunk.lines);
  return (
    <div className="diff-hunk-lines diff-hunk-split">
      {rows.map((row, idx) => (
        <div className="diff-split-row" key={idx}>
          <SplitSide line={row.left} marker="-" />
          <SplitSide line={row.right} marker="+" />
        </div>
      ))}
    </div>
  );
}

export function DiffViewer() {
  const activeTab = useActiveTab();
  const repoPath = activeTab?.repoPath ?? null;
  const selectedSha = activeTab?.selectedSha ?? null;
  const selectedFilePath = activeTab?.selectedFilePath ?? null;
  const viewingWorkingTree = activeTab?.viewingWorkingTree ?? false;
  const selectedFileStaged = activeTab?.selectedFileStaged ?? false;
  const workingStatus = activeTab?.workingStatus ?? [];

  const [hunks, setHunks] = useState<DiffHunk[]>([]);
  const [isBinary, setIsBinary] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (!repoPath || !selectedFilePath) {
      setHunks([]);
      return;
    }
    if (!viewingWorkingTree && !selectedSha) {
      setHunks([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCollapsed(new Set());

    const diffPromise = viewingWorkingTree
      ? getWorkingFileDiff(
          repoPath,
          selectedFilePath,
          selectedFileStaged,
          !selectedFileStaged &&
            workingStatus.find((f) => f.path === selectedFilePath)?.worktreeStatus ===
              "untracked",
        )
      : getFileDiff(repoPath, selectedSha as string, selectedFilePath);

    diffPromise
      .then((raw) => {
        if (cancelled) return;
        const parsed = parseDiff(raw);
        setHunks(parsed.hunks);
        setIsBinary(parsed.isBinary);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoPath, selectedSha, selectedFilePath, viewingWorkingTree, selectedFileStaged]);

  if (!selectedFilePath) {
    return <div className="empty-state">Select a file to view its diff</div>;
  }
  if (loading) {
    return <div className="empty-state">Loading diff…</div>;
  }
  if (error) {
    return <div className="empty-state error">{error}</div>;
  }
  if (isBinary) {
    return <div className="empty-state">Binary file, diff not shown</div>;
  }
  if (hunks.length === 0) {
    return <div className="empty-state">No changes</div>;
  }

  function toggleHunk(idx: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  return (
    <div className="diff-viewer">
      <div className="diff-file-header">
        <span className="diff-file-path">{selectedFilePath}</span>
        <div className="view-mode-toggle">
          <button
            className={`view-mode-btn${viewMode === "unified" ? " active" : ""}`}
            onClick={() => setViewMode("unified")}
          >
            Unified
          </button>
          <button
            className={`view-mode-btn${viewMode === "split" ? " active" : ""}`}
            onClick={() => setViewMode("split")}
          >
            Split
          </button>
        </div>
      </div>
      {hunks.map((hunk, idx) => {
        const isCollapsed = collapsed.has(idx);
        return (
          <div className="diff-hunk" key={idx}>
            <div className="diff-hunk-header" onClick={() => toggleHunk(idx)}>
              <span className="diff-hunk-toggle">{isCollapsed ? "▶" : "▼"}</span>
              {hunk.header}
            </div>
            {!isCollapsed &&
              (viewMode === "unified" ? (
                <UnifiedHunk hunk={hunk} />
              ) : (
                <SplitHunk hunk={hunk} />
              ))}
          </div>
        );
      })}
    </div>
  );
}
