import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";
import type { RefInfo } from "../api/git";
import { layoutGraph, maxLane, type GraphNode } from "../lib/graphLayout";
import { useActiveTab, useRepoStore } from "../store/repoStore";

const ROW_HEIGHT = 28;
const LANE_WIDTH = 16;
const DOT_RADIUS = 4;
const GRAPH_PADDING = 10;

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
        />
      )}
      {node.parentLanes.map((p) => (
        <path
          key={p.parentHash}
          d={`M ${laneX(node.lane)} ${midY} L ${laneX(p.lane)} ${ROW_HEIGHT}`}
          stroke={laneColorVar(p.color)}
          strokeWidth={2}
          fill="none"
        />
      ))}
      <circle
        cx={laneX(node.lane)}
        cy={midY}
        r={DOT_RADIUS}
        fill={laneColorVar(node.color)}
      />
    </>
  );
}

export function CommitGraph() {
  const activeTab = useActiveTab();
  const commits = activeTab?.commits ?? [];
  const refs = activeTab?.refs ?? [];
  const selectedSha = activeTab?.selectedSha ?? null;
  const loadingCommits = activeTab?.loadingCommits ?? false;
  const selectCommit = useRepoStore((s) => s.selectCommit);

  const nodes = useMemo(() => layoutGraph(commits), [commits]);
  const refMap = useMemo(() => refsByHash(refs), [refs]);
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

  if (loadingCommits) {
    return <div className="empty-state">Loading commits…</div>;
  }
  if (nodes.length === 0) {
    return <div className="empty-state">No commits to show</div>;
  }

  return (
    <div className="commit-graph" ref={parentRef}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((row) => {
          const node = nodes[row.index];
          const commitRefs = refMap.get(node.commit.hash) ?? [];
          const isSelected = node.commit.hash === selectedSha;
          return (
            <div
              key={node.commit.hash}
              className={`commit-row${isSelected ? " selected" : ""}`}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: ROW_HEIGHT,
                transform: `translateY(${row.start}px)`,
              }}
              onClick={() => selectCommit(node.commit.hash)}
            >
              <svg width={graphWidth} height={ROW_HEIGHT} className="commit-graph-svg">
                <RowGraphic node={node} />
              </svg>
              <div className="commit-refs">
                {commitRefs
                  .filter((r) => r.kind === "branch" || r.kind === "tag" || r.kind === "head")
                  .map((r) => (
                    <span
                      key={r.name}
                      className={`ref-badge ref-${r.kind}${
                        r.kind !== "tag" && !r.upstream ? " ref-local-only" : ""
                      }`}
                      title={
                        r.kind === "tag"
                          ? undefined
                          : r.upstream
                            ? `tracks ${r.upstream}`
                            : "local only, not published to a remote"
                      }
                    >
                      {r.name}
                    </span>
                  ))}
              </div>
              <div className="commit-subject" title={node.commit.subject}>
                {node.commit.subject}
              </div>
              <div className="commit-author">{node.commit.author}</div>
              <div className="commit-date">
                {new Date(node.commit.date).toLocaleDateString()}
              </div>
              <div className="commit-hash">{node.commit.hash.slice(0, 7)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
