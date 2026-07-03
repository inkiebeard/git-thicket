import type { CommitInfo } from "../api/git";

export interface GraphNode {
  commit: CommitInfo;
  lane: number;
  /** Lanes this commit's edges pass through on their way down to parents, with the color each targets. */
  parentLanes: { parentHash: string; lane: number; color: number }[];
  color: number;
  /** Lanes unrelated to this commit that are simply continuing through this row, with their color. */
  passThroughLanes: { lane: number; color: number }[];
  /** Whether a line should be drawn from the top of this row down to this commit's dot. */
  hasIncoming: boolean;
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

    let lane: number;
    if (waitingLanes.length > 0) {
      lane = waitingLanes[0];
      // Free up any duplicate lanes that were also waiting for this commit
      // (happens when multiple branches converge on the same commit).
      for (const dup of waitingLanes.slice(1)) {
        lanes[dup] = null;
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
    });
  }

  return nodes;
}

export function maxLane(nodes: GraphNode[]): number {
  return nodes.reduce((max, n) => {
    const lanes = [n.lane, ...n.parentLanes.map((p) => p.lane)];
    return Math.max(max, ...lanes);
  }, 0);
}
