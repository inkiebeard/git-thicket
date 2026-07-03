import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import type { CommitInfo, RefInfo } from "../api/git";
import { useColumnOrder } from "../lib/useColumnOrder";
import { useColumnWidths } from "../lib/useColumnWidths";
import { usePersistedBoolean } from "../lib/usePersistedBoolean";
import { useResizableWidths } from "../lib/useResizableWidths";
import { layoutGraph, maxLane, withGhostCommit, type GraphNode } from "../lib/graphLayout";
import { useActiveTab, useRepoStore } from "../store/repoStore";
import { CommitContextMenu } from "./CommitContextMenu";
import { ResizeHandle } from "./ResizeHandle";

const ROW_HEIGHT = 28;
const LANE_WIDTH = 16;
const DOT_RADIUS = 4;
const GRAPH_PADDING = 10;

type ColumnKey = "changes" | "message" | "date" | "author" | "sha";

const DEFAULT_COLUMN_ORDER: ColumnKey[] = ["changes", "message", "date", "author", "sha"];
const COLUMN_LABELS: Record<ColumnKey, string> = {
  changes: "Changes",
  message: "Message",
  date: "Date",
  author: "Author",
  sha: "SHA",
};
const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  changes: 90,
  message: 400,
  date: 90,
  author: 110,
  sha: 70,
};
const REFS_COLUMN_INITIAL_WIDTH = 150;

function laneColorVar(color: number) {
  return `var(--lane-${color})`;
}

function laneX(lane: number) {
  return GRAPH_PADDING + lane * LANE_WIDTH;
}

function refsByHash(refs: RefInfo[]): Map<string, RefInfo[]> {
  const map = new Map<string, RefInfo[]>();
  for (const ref of refs) {
    const list = map.get(ref.hash) ?? [];
    list.push(ref);
    map.set(ref.hash, list);
  }
  return map;
}

/**
 * Remote-tracking branches are only worth showing as their own badge when
 * they've diverged from the local branch tracking them (e.g. local hasn't
 * pushed/pulled yet) — a remote ref sitting on the exact same commit as its
 * in-sync local counterpart is redundant clutter.
 */
function visibleRefs(refs: RefInfo[]): RefInfo[] {
  const localByUpstream = new Map<string, RefInfo>();
  for (const r of refs) {
    if ((r.kind === "branch" || r.kind === "head") && r.upstream) {
      localByUpstream.set(r.upstream, r);
    }
  }
  return refs.filter((r) => {
    if (r.kind !== "remote-branch") return true;
    const local = localByUpstream.get(r.name);
    return !local || local.hash !== r.hash;
  });
}

function RefBadges({ refs }: { refs: RefInfo[] }) {
  const badges = refs.filter(
    (r) => r.kind === "branch" || r.kind === "tag" || r.kind === "head" || r.kind === "remote-branch",
  );
  if (badges.length === 0) return null;

  return (
    <span className="commit-refs">
      {badges.map((r) => (
        <span
          key={r.name}
          className={`ref-badge ref-${r.kind}${
            (r.kind === "branch" || r.kind === "head") && !r.upstream ? " ref-local-only" : ""
          }`}
          title={
            r.kind === "tag"
              ? undefined
              : r.kind === "remote-branch"
                ? `${r.name} on the remote — ahead of or diverged from the local branch of the same name`
                : r.upstream
                  ? `Local branch "${r.name}" — upstream is ${r.upstream}`
                  : "local only, not published to a remote"
          }
        >
          {r.name}
        </span>
      ))}
    </span>
  );
}

function RowGraphic({ node }: { node: GraphNode }) {
  const midY = ROW_HEIGHT / 2;

  return (
    <>
      {node.passThroughLanes.map((p) => (
        <line
          key={`pt-${p.lane}`}
          x1={laneX(p.lane)}
          y1={0}
          x2={laneX(p.lane)}
          y2={ROW_HEIGHT}
          stroke={laneColorVar(p.color)}
          strokeWidth={2}
        />
      ))}
      {node.hasIncoming && (
        <line
          x1={laneX(node.lane)}
          y1={0}
          x2={laneX(node.lane)}
          y2={midY}
          stroke={laneColorVar(node.color)}
          strokeWidth={2}
          strokeDasharray={node.incomingDashed ? "3 3" : undefined}
        />
      )}
      {node.convergingLanes.map((c) => (
        <path
          key={`conv-${c.lane}`}
          d={`M ${laneX(c.lane)} 0 L ${laneX(node.lane)} ${midY}`}
          stroke={laneColorVar(c.color)}
          strokeWidth={2}
          fill="none"
        />
      ))}
      {node.parentLanes.map((p) => (
        <path
          key={p.parentHash}
          d={`M ${laneX(node.lane)} ${midY} L ${laneX(p.lane)} ${ROW_HEIGHT}`}
          stroke={laneColorVar(p.color)}
          strokeWidth={2}
          fill="none"
          strokeDasharray={p.dashed ? "3 3" : undefined}
        />
      ))}
      {node.isGhost ? (
        <circle
          cx={laneX(node.lane)}
          cy={midY}
          r={DOT_RADIUS}
          fill="none"
          stroke={laneColorVar(node.color)}
          strokeWidth={2}
          strokeDasharray="2 2"
        />
      ) : (
        <circle
          cx={laneX(node.lane)}
          cy={midY}
          r={DOT_RADIUS}
          fill={laneColorVar(node.color)}
        />
      )}
      {!node.isGhost && (
        // Invisible, larger hit area layered on top — the visible dot alone
        // (4px radius) is too small a target to reliably hover for the
        // author/co-author tooltip.
        <circle
          cx={laneX(node.lane)}
          cy={midY}
          r={DOT_RADIUS * 2.5}
          fill="transparent"
        >
          <title>
            {node.commit.coAuthors.length > 0
              ? `Author: ${node.commit.author}\nCo-authors: ${node.commit.coAuthors.join(", ")}`
              : `Author: ${node.commit.author}`}
          </title>
        </circle>
      )}
    </>
  );
}

function DataCell({
  columnKey,
  node,
  width,
  showChanges,
}: {
  columnKey: ColumnKey;
  node: GraphNode;
  width: number;
  showChanges: boolean;
}) {
  switch (columnKey) {
    case "changes": {
      const hasChanges =
        showChanges && (node.commit.insertions > 0 || node.commit.deletions > 0);
      return (
        <div className="commit-changes" style={{ width }}>
          {hasChanges && (
            <>
              <span className="commit-changes-add">+{node.commit.insertions}</span>
              <span className="commit-changes-del">−{node.commit.deletions}</span>
            </>
          )}
        </div>
      );
    }
    case "message":
      return (
        <div
          className="commit-subject"
          title={node.commit.subject}
          style={{ width, flexShrink: 0 }}
        >
          {node.commit.subject}
        </div>
      );
    case "date":
      return (
        <div className="commit-date" style={{ width }}>
          {new Date(node.commit.date).toLocaleDateString()}
        </div>
      );
    case "author":
      return (
        <div className="commit-author" style={{ width }}>
          {node.commit.author}
        </div>
      );
    case "sha":
      return (
        <div className="commit-hash" style={{ width }}>
          {node.commit.hash.slice(0, 7)}
        </div>
      );
  }
}

function GhostDataCell({
  columnKey,
  subject,
  changedFileCount,
  width,
}: {
  columnKey: ColumnKey;
  subject: string;
  changedFileCount: number;
  width: number;
}) {
  switch (columnKey) {
    case "message":
      return (
        <div className="commit-subject commit-ghost-label" style={{ width, flexShrink: 0 }}>
          {subject}
        </div>
      );
    case "sha":
      return (
        <div className="commit-hash commit-ghost-count" style={{ width }}>
          {changedFileCount}
        </div>
      );
    case "changes":
      return <div className="commit-changes" style={{ width }} />;
    case "date":
      return <div className="commit-date" style={{ width }} />;
    case "author":
      return <div className="commit-author" style={{ width }} />;
  }
}

interface MenuState {
  x: number;
  y: number;
  commit: CommitInfo;
  branches: RefInfo[];
}

export function CommitGraph() {
  const activeTab = useActiveTab();
  const commits = activeTab?.commits ?? [];
  const refs = activeTab?.refs ?? [];
  const selectedSha = activeTab?.selectedSha ?? null;
  const loadingCommits = activeTab?.loadingCommits ?? false;
  const workingStatus = activeTab?.workingStatus ?? [];
  const viewingWorkingTree = activeTab?.viewingWorkingTree ?? false;
  const selectCommit = useRepoStore((s) => s.selectCommit);
  const selectWorkingTree = useRepoStore((s) => s.selectWorkingTree);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dragKey, setDragKey] = useState<ColumnKey | null>(null);
  const [showChanges, setShowChanges] = usePersistedBoolean(true, "thicket:showChangeCounts");

  const repoPath = activeTab?.repoPath ?? "";

  // Column order is a personal reading-order preference shared across
  // repos; widths are repo-specific (different repos have very different
  // message/author/path lengths) — CommitGraph is remounted (via `key` in
  // App.tsx) on repo switch so these lazy-init from the new repo's storage.
  const { order, moveColumn } = useColumnOrder(DEFAULT_COLUMN_ORDER, "thicket:commitColOrder");
  const { widths: colWidths, resize: resizeCol } = useColumnWidths(
    DEFAULT_COLUMN_WIDTHS,
    `thicket:commitColWidths2:${repoPath}`,
  );
  const { widths: refsWidths, resize: resizeRefsCol } = useResizableWidths(
    [REFS_COLUMN_INITIAL_WIDTH],
    `thicket:commitRefsColWidth:${repoPath}`,
    60,
  );
  const refsWidth = refsWidths[0];

  const refMap = useMemo(() => refsByHash(visibleRefs(refs)), [refs]);
  const headHash = useMemo(() => refs.find((r) => r.kind === "head")?.hash ?? null, [refs]);
  const changedFileCount = useMemo(() => {
    const paths = new Set<string>();
    for (const f of workingStatus) {
      if (f.indexStatus !== "none" || f.worktreeStatus !== "none") paths.add(f.path);
    }
    return paths.size;
  }, [workingStatus]);

  const nodes = useMemo(() => {
    const base = layoutGraph(commits);
    if (changedFileCount > 0 && headHash) {
      return withGhostCommit(base, headHash, "Uncommitted changes");
    }
    return base;
  }, [commits, changedFileCount, headHash]);
  const graphWidth = useMemo(
    () => laneX(maxLane(nodes) + 1) + GRAPH_PADDING,
    [nodes],
  );

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  function handleHeaderDragStart(key: ColumnKey) {
    return (e: DragEvent) => {
      setDragKey(key);
      e.dataTransfer.effectAllowed = "move";
    };
  }

  function handleHeaderDragOver(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleHeaderDrop(targetKey: ColumnKey) {
    return (e: DragEvent) => {
      e.preventDefault();
      if (!dragKey || dragKey === targetKey) return;
      moveColumn(order.indexOf(dragKey), order.indexOf(targetKey));
      setDragKey(null);
    };
  }

  if (loadingCommits) {
    return <div className="empty-state">Loading commits…</div>;
  }

  return (
    <div className="commit-graph" ref={parentRef}>
      {nodes.length === 0 ? (
        <div className="empty-state">No commits to show</div>
      ) : (
        <>
          <div className="commit-list-header">
            <div className="commit-list-header-cell-wrap" style={{ width: refsWidth }}>
              <div className="commit-list-header-cell commit-list-header-cell-fixed">Refs</div>
              <ResizeHandle onDrag={(dx) => resizeRefsCol(0, dx)} />
            </div>
            <div style={{ width: graphWidth, flexShrink: 0 }} />
            {order.map((key) => (
              <div
                key={key}
                className={`commit-list-header-cell-wrap${dragKey === key ? " dragging" : ""}`}
                style={{ width: colWidths[key] }}
              >
                <div
                  className="commit-list-header-cell"
                  draggable
                  onDragStart={handleHeaderDragStart(key)}
                  onDragOver={handleHeaderDragOver}
                  onDrop={handleHeaderDrop(key)}
                  onDragEnd={() => setDragKey(null)}
                  title="Drag to reorder"
                >
                  {key === "changes" && (
                    <input
                      type="checkbox"
                      className="commit-list-header-checkbox"
                      checked={showChanges}
                      draggable={false}
                      title="Show +/- change counts"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onDragStart={(e) => e.stopPropagation()}
                      onChange={(e) => setShowChanges(e.target.checked)}
                    />
                  )}
                  {COLUMN_LABELS[key]}
                </div>
                <ResizeHandle onDrag={(dx) => resizeCol(key, dx)} />
              </div>
            ))}
          </div>
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((row) => {
              const node = nodes[row.index];
              const rowStyle: CSSProperties = {
                position: "absolute",
                top: 0,
                left: 0,
                width: "max-content",
                minWidth: "100%",
                height: ROW_HEIGHT,
                transform: `translateY(${row.start}px)`,
              };

              if (node.isGhost) {
                return (
                  <div
                    key="ghost"
                    className={`commit-row commit-row-ghost${viewingWorkingTree ? " selected" : ""}`}
                    style={rowStyle}
                    onClick={selectWorkingTree}
                  >
                    <div className="commit-refs-cell" style={{ width: refsWidth }} />
                    <svg width={graphWidth} height={ROW_HEIGHT} className="commit-graph-svg">
                      <RowGraphic node={node} />
                    </svg>
                    {order.map((key) => (
                      <GhostDataCell
                        key={key}
                        columnKey={key}
                        subject={node.commit.subject}
                        changedFileCount={changedFileCount}
                        width={colWidths[key]}
                      />
                    ))}
                  </div>
                );
              }

              const commitRefs = refMap.get(node.commit.hash) ?? [];
              const isSelected = node.commit.hash === selectedSha;
              return (
                <div
                  key={node.commit.hash}
                  className={`commit-row${isSelected ? " selected" : ""}`}
                  style={rowStyle}
                  onClick={() => selectCommit(node.commit.hash)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({
                      x: e.clientX,
                      y: e.clientY,
                      commit: node.commit,
                      branches: commitRefs.filter((r) => r.kind === "branch"),
                    });
                  }}
                >
                  <div className="commit-refs-cell" style={{ width: refsWidth }}>
                    <RefBadges refs={commitRefs} />
                  </div>
                  <svg width={graphWidth} height={ROW_HEIGHT} className="commit-graph-svg">
                    <RowGraphic node={node} />
                  </svg>
                  {order.map((key) => (
                    <DataCell
                      key={key}
                      columnKey={key}
                      node={node}
                      width={colWidths[key]}
                      showChanges={showChanges}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
      {menu && (
        <CommitContextMenu
          x={menu.x}
          y={menu.y}
          commit={menu.commit}
          branches={menu.branches}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
