const SHOW_REMOTE_BRANCHES_KEY = "thicket:showRemoteBranches";

/**
 * Whether the commit graph walks `refs/remotes/*` too, so teammates'
 * branches with no local counterpart show up as their own (labeled) lanes.
 * On by default; turning it off restricts the graph to local branches,
 * tags, and HEAD.
 */
export function getShowRemoteBranches(): boolean {
  return localStorage.getItem(SHOW_REMOTE_BRANCHES_KEY) !== "false";
}

export function setShowRemoteBranches(value: boolean) {
  localStorage.setItem(SHOW_REMOTE_BRANCHES_KEY, String(value));
}
