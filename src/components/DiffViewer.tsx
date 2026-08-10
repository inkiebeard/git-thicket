import { useEffect, useState } from "react";
import { getFileDiff, streamWorkingFileDiff } from "../api/git";
import {
  parseDiff,
  toSplitRows,
  type DiffHunk,
  type DiffLine,
} from "../lib/diffParser";
import { useActiveTab, useRepoStore } from "../store/repoStore";
import { ConfirmDialog } from "./ConfirmDialog";
import { MinusIcon, PlusIcon, TrashIcon } from "./icons";

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
  const stageHunk = useRepoStore((s) => s.stageHunk);
  const unstageHunk = useRepoStore((s) => s.unstageHunk);
  const discardHunk = useRepoStore((s) => s.discardHunk);

  const [hunks, setHunks] = useState<DiffHunk[]>([]);
  const [isBinary, setIsBinary] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  const [refreshToken, setRefreshToken] = useState(0);
  const [pendingHunk, setPendingHunk] = useState<number | null>(null);
  const [discardHunkConfirm, setDiscardHunkConfirm] = useState<number | null>(null);

  const isUntracked =
    viewingWorkingTree &&
    !selectedFileStaged &&
    workingStatus.find((f) => f.path === selectedFilePath)?.worktreeStatus === "untracked";

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

    if (viewingWorkingTree) {
      // Stream large working tree diffs to avoid buffering entire content
      let diffBuffer = "";
      streamWorkingFileDiff(repoPath, selectedFilePath, selectedFileStaged, isUntracked, (chunk) => {
        if (cancelled) return;
        diffBuffer += chunk.chunk;
        if (chunk.is_final) {
          const parsed = parseDiff(diffBuffer);
          setHunks(parsed.hunks);
          setIsBinary(parsed.isBinary);
          setLoading(false);
        }
      }).catch((e) => {
        if (!cancelled) {
          setError(String(e));
          setLoading(false);
        }
      });
    } else {
      // Committed diffs are usually smaller, keep synchronous
      getFileDiff(repoPath, selectedSha as string, selectedFilePath)
        .then((raw) => {
          if (cancelled) return;
          const parsed = parseDiff(raw);
          setHunks(parsed.hunks);
          setIsBinary(parsed.isBinary);
        })
        .catch((e) => !cancelled && setError(String(e)))
        .finally(() => !cancelled && setLoading(false));
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoPath, selectedSha, selectedFilePath, viewingWorkingTree, selectedFileStaged, refreshToken]);

  // Applying a hunk shifts the indices of every hunk after it, so the only
  // safe move is to fully refetch and reparse the file's diff rather than
  // patch local state — the next click then targets indices that match what
  // the backend will see when it re-derives the diff itself.
  async function runHunkAction(hunkIndex: number, action: () => Promise<boolean>) {
    setPendingHunk(hunkIndex);
    try {
      const ok = await action();
      if (ok) setRefreshToken((t) => t + 1);
    } finally {
      setPendingHunk(null);
    }
  }

  function handleStageHunk(hunkIndex: number) {
    if (!selectedFilePath) return;
    runHunkAction(hunkIndex, () => stageHunk(selectedFilePath, !!isUntracked, hunkIndex));
  }

  function handleUnstageHunk(hunkIndex: number) {
    if (!selectedFilePath) return;
    runHunkAction(hunkIndex, () => unstageHunk(selectedFilePath, hunkIndex));
  }

  function handleDiscardHunkConfirm() {
    if (discardHunkConfirm === null || !selectedFilePath) return;
    const hunkIndex = discardHunkConfirm;
    setDiscardHunkConfirm(null);
    runHunkAction(hunkIndex, () => discardHunk(selectedFilePath, !!isUntracked, hunkIndex));
  }

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
        const isPending = pendingHunk === idx;
        return (
          <div className="diff-hunk" key={idx}>
            <div className="diff-hunk-header" onClick={() => toggleHunk(idx)}>
              <span className="diff-hunk-toggle">{isCollapsed ? "▶" : "▼"}</span>
              <span className="diff-hunk-header-text">{hunk.header}</span>
              {viewingWorkingTree && (
                <div className="diff-hunk-actions" onClick={(e) => e.stopPropagation()}>
                  {selectedFileStaged ? (
                    <button
                      className="diff-hunk-action-btn diff-hunk-action-btn-danger"
                      disabled={isPending}
                      title="Unstage hunk"
                      onClick={() => handleUnstageHunk(idx)}
                    >
                      <MinusIcon />
                    </button>
                  ) : (
                    <>
                      <button
                        className="diff-hunk-action-btn diff-hunk-action-btn-stage"
                        disabled={isPending}
                        title="Stage hunk"
                        onClick={() => handleStageHunk(idx)}
                      >
                        <PlusIcon />
                      </button>
                      <button
                        className="diff-hunk-action-btn diff-hunk-action-btn-danger"
                        disabled={isPending}
                        title="Discard hunk"
                        onClick={() => setDiscardHunkConfirm(idx)}
                      >
                        <TrashIcon />
                      </button>
                    </>
                  )}
                </div>
              )}
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
      {discardHunkConfirm !== null && (
        <ConfirmDialog
          title="Discard hunk"
          message="Discard this hunk's changes? This cannot be undone."
          confirmLabel="Discard"
          danger
          onConfirm={handleDiscardHunkConfirm}
          onCancel={() => setDiscardHunkConfirm(null)}
        />
      )}
    </div>
  );
}
