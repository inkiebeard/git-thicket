import type { CommitInfo, StashEntry } from "../api/git";

export interface GraphNode {
  commit: CommitInfo;
  lane: number;
  /** Lanes this commit's edges pass through on their way down to parents, with the color each targets. */
  parentLanes: { parentHash: string; lane: number; color: number; dashed?: boolean }[];
  color: number;
  /** Lanes unrelated to this commit that are simply continuing through this row, with their color. */
  passThroughLanes: { lane: number; color: number }[];
  /** Whether a line should be drawn from the top of this row down to this commit's dot. */
  hasIncoming: boolean;
  /** Whether that incoming line should render dashed (it's coming from the ghost commit). */
  incomingDashed?: boolean;
  /**
   * Other lanes that also converge on this commit's dot this row — a fork
   * point with more than one visible descendant branch. Each needs its own
   * diagonal line drawn in from the top of the row, distinct from the single
   * `hasIncoming` line (which only covers this node's own lane).
   */
  convergingLanes: { lane: number; color: number }[];
  /** A synthetic row representing uncommitted changes, not a real commit. */
  isGhost?: boolean;
  /** A synthetic row representing a stash entry, not a real commit. */
  isStash?: boolean;
  stash?: StashEntry;
}

export const LANE_COLORS = 12;

/**
 * Assigns each commit to a horizontal lane so branch lines never cross
 * their own history. Commits must arrive in the order `git log` produces
 * (reverse-topological: children before parents).
 *
 * Algorithm: keep a list of "open" lanes, each holding the hash of the
 * commit it's waiting to reach. When a commit is processed, it takes over
 * the lane(s) waiting for it (or opens a new lane if none is), then that
 * lane is reassigned to wait for its first parent, and any additional
 * parents (merges) open new lanes.
 */
// A lane freed by a same-row convergence (see below) is marked with this
// sentinel rather than `null` until the row finishes processing, so it
// can't be immediately handed to a brand-new branch fanning out of the same
// dot. Distinct from any real 40-char hex commit hash.
const CLOSING = "__closing__";

export function layoutGraph(commits: CommitInfo[]): GraphNode[] {
  // lanes[i] = hash this lane is currently waiting for, or null if free
  const lanes: (string | null)[] = [];
  const laneColor: number[] = [];
  let nextColor = 0;

  const nodes: GraphNode[] = [];

  for (const commit of commits) {
    const activeBefore = lanes.reduce<number[]>((acc, hash, idx) => {
      if (hash !== null) acc.push(idx);
      return acc;
    }, []);

    // Find every lane waiting for this commit.
    const waitingLanes = lanes.reduce<number[]>((acc, hash, idx) => {
      if (hash === commit.hash) acc.push(idx);
      return acc;
    }, []);

    const hasIncoming = waitingLanes.length > 0;
    const convergingLanes: { lane: number; color: number }[] = [];

    let lane: number;
    if (waitingLanes.length > 0) {
      lane = waitingLanes[0];
      // Free up any duplicate lanes that were also waiting for this commit
      // (happens when this commit is a fork point with multiple visible
      // descendant branches) — each gets its own converging line into the
      // dot instead of just vanishing. Marked CLOSING, not null, so a new
      // branch fanning out of this same commit below can't immediately
      // reclaim the slot — that would touch the exact same dot with no
      // visual gap, reading as one branch morphing into the next instead of
      // two unrelated branches that happen to share a lane over time.
      for (const dup of waitingLanes.slice(1)) {
        convergingLanes.push({ lane: dup, color: laneColor[dup] });
        lanes[dup] = CLOSING;
      }
    } else {
      // No lane expects this commit (e.g. tip of a branch); open a new one.
      lane = lanes.findIndex((h) => h === null);
      if (lane === -1) {
        lane = lanes.length;
        lanes.push(null);
        laneColor.push(nextColor++ % LANE_COLORS);
      } else {
        laneColor[lane] = nextColor++ % LANE_COLORS;
      }
    }

    const parentLanes: { parentHash: string; lane: number; color: number }[] = [];

    if (commit.parents.length === 0) {
      lanes[lane] = null;
    } else {
      // First parent continues in the same lane.
      lanes[lane] = commit.parents[0];
      parentLanes.push({ parentHash: commit.parents[0], lane, color: laneColor[lane] });

      // Additional parents (merges) each get their own lane.
      for (const parentHash of commit.parents.slice(1)) {
        const existing = lanes.findIndex((h) => h === parentHash);
        if (existing !== -1) {
          parentLanes.push({ parentHash, lane: existing, color: laneColor[existing] });
          continue;
        }
        let free = lanes.findIndex((h) => h === null);
        if (free === -1) {
          free = lanes.length;
          lanes.push(parentHash);
          laneColor.push(nextColor++ % LANE_COLORS);
        } else {
          lanes[free] = parentHash;
          laneColor[free] = nextColor++ % LANE_COLORS;
        }
        parentLanes.push({ parentHash, lane: free, color: laneColor[free] });
      }
    }

    // CLOSING lanes become genuinely free from the next row onward.
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === CLOSING) lanes[i] = null;
    }

    const passThroughLanes = activeBefore
      .filter((idx) => idx !== lane && lanes[idx] !== null)
      .map((idx) => ({ lane: idx, color: laneColor[idx] }));

    nodes.push({
      commit,
      lane,
      parentLanes,
      color: laneColor[lane],
      passThroughLanes,
      hasIncoming,
      convergingLanes,
    });
  }

  return nodes;
}

/**
 * Inserts a synthetic "ghost" row directly above the commit HEAD points at,
 * in the same lane, connected by a dashed line — representing uncommitted
 * working-tree changes sitting on top of the branch tip. No-op if `headHash`
 * isn't present in `nodes` (e.g. detached HEAD with no matching ref).
 */
export function withGhostCommit(
  nodes: GraphNode[],
  headHash: string,
  subject: string,
): GraphNode[] {
  const headIdx = nodes.findIndex((n) => n.commit.hash === headHash);
  if (headIdx === -1) return nodes;
  const headNode = nodes[headIdx];

  const ghost: GraphNode = {
    commit: {
      hash: "__ghost__",
      parents: [headHash],
      author: "",
      date: "",
      subject,
      coAuthors: [],
      insertions: 0,
      deletions: 0,
    },
    lane: headNode.lane,
    color: headNode.color,
    parentLanes: [
      { parentHash: headHash, lane: headNode.lane, color: headNode.color, dashed: true },
    ],
    passThroughLanes: headNode.passThroughLanes,
    hasIncoming: false,
    convergingLanes: [],
    isGhost: true,
  };

  const result = [...nodes];
  result[headIdx] = { ...headNode, hasIncoming: true, incomingDashed: true };
  result.splice(headIdx, 0, ghost);
  return result;
}

/**
 * Inserts a synthetic row for each stash directly above the commit it was
 * created from, each in its own lane (a stash isn't part of any branch's
 * ancestry, so it can't just extend the base commit's lane the way the
 * ghost commit extends HEAD's) with a diagonal line converging into the
 * base commit's dot. Stashes whose base commit isn't in `nodes` (out of the
 * loaded window, or the base was since rebased away) are silently skipped.
 */
export function withStashNodes(nodes: GraphNode[], stashes: StashEntry[]): GraphNode[] {
  if (stashes.length === 0) return nodes;

  const baseIndexOf = new Map<string, number>();
  nodes.forEach((n, i) => baseIndexOf.set(n.commit.hash, i));

  const byBaseIdx = new Map<number, StashEntry[]>();
  for (const s of stashes) {
    const idx = s.baseHash ? baseIndexOf.get(s.baseHash) : undefined;
    if (idx === undefined) continue;
    const list = byBaseIdx.get(idx) ?? [];
    list.push(s);
    byBaseIdx.set(idx, list);
  }
  if (byBaseIdx.size === 0) return nodes;

  let nextLane = maxLane(nodes) + 1;
  const result: GraphNode[] = [];

  nodes.forEach((node, i) => {
    const stashesHere = byBaseIdx.get(i);
    if (!stashesHere) {
      result.push(node);
      return;
    }

    const stashLanes = stashesHere.map((stash) => ({
      stash,
      lane: nextLane++,
      color: (nextLane - 1) % LANE_COLORS,
    }));

    stashLanes.forEach(({ stash, lane, color }, j) => {
      // Lanes for stashes on the same base that sit below this one in the
      // list still need to pass through this row on their way down to it.
      const laterLanes = stashLanes.slice(j + 1).map((sl) => ({ lane: sl.lane, color: sl.color }));
      result.push({
        commit: {
          hash: `__stash_${stash.index}__`,
          parents: [node.commit.hash],
          author: "",
          date: "",
          subject: stash.message,
          coAuthors: [],
          insertions: 0,
          deletions: 0,
        },
        lane,
        color,
        parentLanes: [{ parentHash: node.commit.hash, lane, color, dashed: true }],
        passThroughLanes: [...node.passThroughLanes, ...laterLanes],
        hasIncoming: false,
        convergingLanes: [],
        isStash: true,
        stash,
      });
    });

    result.push({
      ...node,
      convergingLanes: [
        ...node.convergingLanes,
        ...stashLanes.map(({ lane, color }) => ({ lane, color })),
      ],
    });
  });

  return result;
}

export function maxLane(nodes: GraphNode[]): number {
  return nodes.reduce((max, n) => {
    const lanes = [n.lane, ...n.parentLanes.map((p) => p.lane)];
    return Math.max(max, ...lanes);
  }, 0);
}
