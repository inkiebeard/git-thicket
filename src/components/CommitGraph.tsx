import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { stashShow, type CommitInfo, type RefInfo, type StashEntry } from "../api/git";
import { useColumnOrder } from "../lib/useColumnOrder";
import { useColumnWidths } from "../lib/useColumnWidths";
import { usePersistedBoolean } from "../lib/usePersistedBoolean";
import { useResizableWidths } from "../lib/useResizableWidths";
import { layoutGraph, maxLane, withGhostCommit, type GraphNode } from "../lib/graphLayout";
import { useActiveTab, useRepoStore } from "../store/repoStore";
import { CommitContextMenu } from "./CommitContextMenu";
import { ConfirmDialog } from "./ConfirmDialog";
import { ContextMenu, type ContextMenuEntry } from "./ContextMenu";
import { ReconcileBranchDialog } from "./ReconcileBranchDialog";
import { RefContextMenu } from "./RefContextMenu";
import { ResizeHandle } from "./ResizeHandle";
import { StashDiffModal } from "./StashDiffModal";

const ROW_HEIGHT = 28;
const LANE_WIDTH = 16;
const DOT_RADIUS = 4;
const GRAPH_PADDING = 10;
const GRAPH_COLUMN_MIN_WIDTH = 40;
const REFS_AUTO_FIT_GAP = 4;
const AUTO_FIT_PADDING = 12;

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

/** Finds the local branch (checked out or not) whose upstream is `remoteRef.name`. */
function findLocalTrackingBranch(refs: RefInfo[], remoteRef: RefInfo): RefInfo | null {
  return (
    refs.find(
      (r) => (r.kind === "branch" || r.kind === "head") && r.upstream === remoteRef.name,
    ) ?? null
  );
}

function RefBadges({
  refs,
  allRefs,
  onRefContextMenu,
  onRefDoubleClick,
}: {
  refs: RefInfo[];
  allRefs: RefInfo[];
  onRefContextMenu: (e: React.MouseEvent, ref: RefInfo) => void;
  onRefDoubleClick: (ref: RefInfo) => void;
}) {
  const badges = refs.filter(
    (r) => r.kind === "branch" || r.kind === "tag" || r.kind === "head" || r.kind === "remote-branch",
  );
  if (badges.length === 0) return null;

  return (
    <span className="commit-refs">
      {badges.map((r) => {
        // Git won't let a real branch be named "HEAD" — a synthetic ref by
        // that name only ever means HEAD is detached here (see list_refs
        // in git.rs), not that we're on a branch called "HEAD".
        const isDetachedHead = r.kind === "head" && r.name === "HEAD";
        return (
          <span
            key={r.name}
            className={`ref-badge ref-${r.kind}${
              isDetachedHead
                ? " ref-detached"
                : (r.kind === "branch" || r.kind === "head") && !r.upstream
                  ? " ref-local-only"
                  : ""
            }`}
            title={
              isDetachedHead
                ? "HEAD is detached here — not on any branch. Check out a branch to avoid losing this position when you move HEAD again."
                : r.kind === "tag"
                  ? undefined
                  : r.kind === "remote-branch"
                    ? findLocalTrackingBranch(allRefs, r)
                      ? `${r.name} — double-click to fast-forward, rebase, or reset the local branch`
                      : `${r.name} on the remote — no local branch is on this commit; double-click to check it out`
                    : r.kind === "branch"
                      ? `Local branch "${r.name}" — double-click to check out${r.upstream ? `; upstream is ${r.upstream}` : ""}`
                      : r.upstream
                        ? `Local branch "${r.name}" — upstream is ${r.upstream}`
                        : "local only, not published to a remote"
            }
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRefContextMenu(e, r);
            }}
            onDoubleClick={(e) => {
              if (r.kind !== "branch" && r.kind !== "remote-branch") return;
              e.stopPropagation();
              onRefDoubleClick(r);
            }}
          >
            {r.name}
          </span>
        );
      })}
    </span>
  );
}

function StashBadges({
  stashes,
  onStashClick,
  onStashContextMenu,
}: {
  stashes: StashEntry[];
  onStashClick: (stash: StashEntry) => void;
  onStashContextMenu: (e: React.MouseEvent, stash: StashEntry) => void;
}) {
  if (stashes.length === 0) return null;

  return (
    <span className="commit-refs">
      {stashes.map((s) => (
        <span
          key={s.index}
          className="ref-badge ref-stash"
          title={`stash@{${s.index}}: ${s.message} — click to show diff, right-click for more`}
          onClick={(e) => {
            e.stopPropagation();
            onStashClick(s);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onStashContextMenu(e, s);
          }}
        >
          stash@{"{" + s.index + "}"}
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
        <div className="commit-changes" data-col="changes" style={{ width }}>
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
          data-col="message"
          title={node.commit.subject}
          style={{ width, flexShrink: 0 }}
        >
          {node.commit.subject}
        </div>
      );
    case "date":
      return (
        <div className="commit-date" data-col="date" style={{ width }}>
          {new Date(node.commit.date).toLocaleDateString()}
        </div>
      );
    case "author":
      return (
        <div className="commit-author" data-col="author" style={{ width }}>
          {node.commit.author}
        </div>
      );
    case "sha":
      return (
        <div className="commit-hash" data-col="sha" style={{ width }}>
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
        <div
          className="commit-subject commit-ghost-label"
          data-col="message"
          style={{ width, flexShrink: 0 }}
        >
          {subject}
        </div>
      );
    case "sha":
      return (
        <div className="commit-hash commit-ghost-count" data-col="sha" style={{ width }}>
          {changedFileCount}
        </div>
      );
    case "changes":
      return <div className="commit-changes" data-col="changes" style={{ width }} />;
    case "date":
      return <div className="commit-date" data-col="date" style={{ width }} />;
    case "author":
      return <div className="commit-author" data-col="author" style={{ width }} />;
  }
}

interface MenuState {
  x: number;
  y: number;
  commit: CommitInfo;
  branches: RefInfo[];
}

interface RefMenuState {
  x: number;
  y: number;
  ref: RefInfo;
}

export function CommitGraph() {
  const activeTab = useActiveTab();
  const commits = activeTab?.commits ?? [];
  const refs = activeTab?.refs ?? [];
  const remotes = activeTab?.remotes ?? [];
  const stashes = activeTab?.stashes ?? [];
  const selectedSha = activeTab?.selectedSha ?? null;
  const loadingCommits = activeTab?.loadingCommits ?? false;
  const workingStatus = activeTab?.workingStatus ?? [];
  const viewingWorkingTree = activeTab?.viewingWorkingTree ?? false;
  const selectCommit = useRepoStore((s) => s.selectCommit);
  const selectWorkingTree = useRepoStore((s) => s.selectWorkingTree);
  const doCheckoutRef = useRepoStore((s) => s.doCheckoutRef);
  const doStashPush = useRepoStore((s) => s.doStashPush);
  const doStashPop = useRepoStore((s) => s.doStashPop);
  const doStashDrop = useRepoStore((s) => s.doStashDrop);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [refMenu, setRefMenu] = useState<RefMenuState | null>(null);
  const [workingTreeMenu, setWorkingTreeMenu] = useState<{ x: number; y: number } | null>(null);
  const [stashMenu, setStashMenu] = useState<{ x: number; y: number; stash: StashEntry } | null>(
    null,
  );
  const [stashDiffTarget, setStashDiffTarget] = useState<StashEntry | null>(null);
  const [stashDiffText, setStashDiffText] = useState("");
  const [stashDropTarget, setStashDropTarget] = useState<StashEntry | null>(null);
  const [reconcileTarget, setReconcileTarget] = useState<{
    localBranch: RefInfo;
    remoteRef: RefInfo;
  } | null>(null);
  const [checkoutConfirmTarget, setCheckoutConfirmTarget] = useState<RefInfo | null>(null);
  const [dragKey, setDragKey] = useState<ColumnKey | null>(null);
  const [showChanges, setShowChanges] = usePersistedBoolean(true, "thicket:showChangeCounts");

  const repoPath = activeTab?.repoPath ?? "";

  // Column order is a personal reading-order preference shared across
  // repos; widths are repo-specific (different repos have very different
  // message/author/path lengths) — CommitGraph is remounted (via `key` in
  // App.tsx) on repo switch so these lazy-init from the new repo's storage.
  const { order, moveColumn } = useColumnOrder(DEFAULT_COLUMN_ORDER, "thicket:commitColOrder");
  const { widths: colWidths, resize: resizeCol, setWidth: setColWidth } = useColumnWidths(
    DEFAULT_COLUMN_WIDTHS,
    `thicket:commitColWidths2:${repoPath}`,
  );
  const {
    widths: refsWidths,
    resize: resizeRefsCol,
    setWidth: setRefsColWidth,
  } = useResizableWidths([REFS_COLUMN_INITIAL_WIDTH], `thicket:commitRefsColWidth:${repoPath}`, 60);
  const refsWidth = refsWidths[0];

  const refMap = useMemo(() => refsByHash(visibleRefs(refs)), [refs]);
  const stashesByHash = useMemo(() => {
    const map = new Map<string, StashEntry[]>();
    for (const s of stashes) {
      if (!s.baseHash) continue;
      const list = map.get(s.baseHash) ?? [];
      list.push(s);
      map.set(s.baseHash, list);
    }
    return map;
  }, [stashes]);
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
  // Natural width the graph needs to show every lane unclipped — grows
  // unbounded with branch count, so it's also used as the auto-fit target
  // and as the initial value of the (separately capped) column width below.
  const graphWidth = useMemo(
    () => laneX(maxLane(nodes) + 1) + GRAPH_PADDING,
    [nodes],
  );
  const {
    widths: graphColWidths,
    resize: resizeGraphCol,
    setWidth: setGraphColWidth,
  } = useResizableWidths(
    [graphWidth],
    `thicket:commitGraphColWidth:${repoPath}`,
    GRAPH_COLUMN_MIN_WIDTH,
  );
  // A cap, not a fixed size: repos with few branches still render at their
  // natural (smaller) width instead of being padded out to a stale max.
  const graphColWidth = Math.min(graphColWidths[0], graphWidth);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  async function showStashDiff(s: StashEntry) {
    setStashMenu(null);
    setStashDiffTarget(s);
    setStashDiffText("Loading…");
    if (!repoPath) return;
    try {
      setStashDiffText(await stashShow(repoPath, s.index));
    } catch (e) {
      setStashDiffText(String(e));
    }
  }

  function checkoutOrConfirm(ref: RefInfo) {
    // `git checkout` only refuses when a changed file's *content* would
    // actually be overwritten — it happily carries forward unrelated
    // uncommitted edits without a word. That's surprising when you didn't
    // mean to switch branches, so ask first any time there's working-tree
    // state that could be affected, rather than switching silently.
    if (changedFileCount > 0) {
      setCheckoutConfirmTarget(ref);
    } else {
      doCheckoutRef(ref.name);
    }
  }

  function handleRefDoubleClick(ref: RefInfo) {
    if (ref.kind === "branch") {
      checkoutOrConfirm(ref);
      return;
    }
    if (ref.kind === "remote-branch") {
      const localBranch = findLocalTrackingBranch(refs, ref);
      if (localBranch) {
        setReconcileTarget({ localBranch, remoteRef: ref });
      } else {
        checkoutOrConfirm(ref);
      }
    }
  }

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

  /** Widest currently-rendered cell for a text column — rows outside the
   * virtualized window aren't measured, matching what's actually visible. */
  function measureTextColumn(columnKey: ColumnKey): number | null {
    const cells = parentRef.current?.querySelectorAll<HTMLElement>(`[data-col="${columnKey}"]`);
    if (!cells || cells.length === 0) return null;
    let max = 0;
    cells.forEach((cell) => (max = Math.max(max, cell.scrollWidth)));
    return max;
  }

  /** Ref badges wrap instead of overflowing, so scrollWidth on the row can't
   * be used directly — sum each row's badge widths to get its unwrapped width. */
  function measureRefsColumn(): number | null {
    const rows = parentRef.current?.querySelectorAll<HTMLElement>(".commit-refs-cell");
    if (!rows || rows.length === 0) return null;
    let max = 0;
    let found = false;
    rows.forEach((row) => {
      const badges = row.querySelectorAll<HTMLElement>(".ref-badge");
      if (badges.length === 0) return;
      found = true;
      let sum = REFS_AUTO_FIT_GAP * (badges.length - 1);
      badges.forEach((badge) => (sum += badge.offsetWidth));
      max = Math.max(max, sum);
    });
    return found ? max : null;
  }

  function handleRefsColAutoFit() {
    const measured = measureRefsColumn();
    if (measured != null) setRefsColWidth(0, measured + AUTO_FIT_PADDING);
  }

  function handleGraphColAutoFit() {
    setGraphColWidth(0, graphWidth);
  }

  function handleDataColAutoFit(key: ColumnKey) {
    const measured = measureTextColumn(key);
    if (measured != null) setColWidth(key, measured + AUTO_FIT_PADDING);
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
              <ResizeHandle
                onDrag={(dx) => resizeRefsCol(0, dx)}
                onDoubleClick={handleRefsColAutoFit}
              />
            </div>
            <div className="commit-list-header-cell-wrap" style={{ width: graphColWidth }}>
              <div className="commit-list-header-cell commit-list-header-cell-fixed">Graph</div>
              <ResizeHandle
                onDrag={(dx) => resizeGraphCol(0, dx)}
                onDoubleClick={handleGraphColAutoFit}
              />
            </div>
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
                <ResizeHandle
                  onDrag={(dx) => resizeCol(key, dx)}
                  onDoubleClick={() => handleDataColAutoFit(key)}
                />
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
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setWorkingTreeMenu({ x: e.clientX, y: e.clientY });
                    }}
                  >
                    <div className="commit-refs-cell" style={{ width: refsWidth }} />
                    <div className="commit-graph-cell" style={{ width: graphColWidth }}>
                      <svg width={graphWidth} height={ROW_HEIGHT} className="commit-graph-svg">
                        <RowGraphic node={node} />
                      </svg>
                    </div>
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
              const commitStashes = stashesByHash.get(node.commit.hash) ?? [];
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
                    <RefBadges
                      refs={commitRefs}
                      allRefs={refs}
                      onRefContextMenu={(e, ref) =>
                        setRefMenu({ x: e.clientX, y: e.clientY, ref })
                      }
                      onRefDoubleClick={handleRefDoubleClick}
                    />
                    <StashBadges
                      stashes={commitStashes}
                      onStashClick={showStashDiff}
                      onStashContextMenu={(e, stash) =>
                        setStashMenu({ x: e.clientX, y: e.clientY, stash })
                      }
                    />
                  </div>
                  <div className="commit-graph-cell" style={{ width: graphColWidth }}>
                    <svg width={graphWidth} height={ROW_HEIGHT} className="commit-graph-svg">
                      <RowGraphic node={node} />
                    </svg>
                  </div>
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
      {refMenu && (
        <RefContextMenu
          x={refMenu.x}
          y={refMenu.y}
          ref={refMenu.ref}
          remotes={remotes.map((r) => r.name)}
          onClose={() => setRefMenu(null)}
        />
      )}
      {workingTreeMenu && (
        <ContextMenu
          x={workingTreeMenu.x}
          y={workingTreeMenu.y}
          onClose={() => setWorkingTreeMenu(null)}
          items={
            [
              {
                label: "Stash all changes",
                onSelect: () => {
                  doStashPush();
                  setWorkingTreeMenu(null);
                },
              },
            ] satisfies ContextMenuEntry[]
          }
        />
      )}
      {stashMenu && (
        <ContextMenu
          x={stashMenu.x}
          y={stashMenu.y}
          onClose={() => setStashMenu(null)}
          items={
            [
              {
                label: "Show diff",
                onSelect: () => showStashDiff(stashMenu.stash),
              },
              {
                label: "Pop",
                onSelect: () => {
                  doStashPop(stashMenu.stash.index);
                  setStashMenu(null);
                },
              },
              {
                label: "Drop",
                danger: true,
                onSelect: () => {
                  setStashDropTarget(stashMenu.stash);
                  setStashMenu(null);
                },
              },
            ] satisfies ContextMenuEntry[]
          }
        />
      )}
      {stashDropTarget && (
        <ConfirmDialog
          title="Drop stash"
          message={`Permanently discard stash@{${stashDropTarget.index}}: "${stashDropTarget.message}"? This cannot be undone.`}
          confirmLabel="Drop"
          danger
          onCancel={() => setStashDropTarget(null)}
          onConfirm={() => {
            doStashDrop(stashDropTarget.index);
            setStashDropTarget(null);
          }}
        />
      )}
      {stashDiffTarget && (
        <StashDiffModal
          title={`stash@{${stashDiffTarget.index}}: ${stashDiffTarget.message}`}
          diff={stashDiffText}
          onClose={() => setStashDiffTarget(null)}
        />
      )}
      {reconcileTarget && (
        <ReconcileBranchDialog
          localBranch={reconcileTarget.localBranch}
          remoteRef={reconcileTarget.remoteRef}
          onClose={() => setReconcileTarget(null)}
        />
      )}
      {checkoutConfirmTarget && (
        <ConfirmDialog
          title={`Checkout "${checkoutConfirmTarget.name}"`}
          message={`You have uncommitted changes. Switching to "${checkoutConfirmTarget.name}" will fail if it conflicts with them, but if it doesn't, git carries them onto the new branch untouched — they won't be reverted or lost. Continue?`}
          confirmLabel="Checkout"
          onCancel={() => setCheckoutConfirmTarget(null)}
          onConfirm={() => {
            doCheckoutRef(checkoutConfirmTarget.name);
            setCheckoutConfirmTarget(null);
          }}
        />
      )}
    </div>
  );
}
