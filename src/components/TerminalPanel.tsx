import { useMemo, useState } from "react";
import { runGitArgs } from "../api/git";
import { useActiveTab, useRepoStore } from "../store/repoStore";
import { ConfirmDialog } from "./ConfirmDialog";

interface TerminalPanelProps {
  height: number;
  onClose: () => void;
}

type Action = "push" | "fetch" | "pull" | "merge" | "checkout" | "reset" | "tag";

type PushTarget = "same-name" | "upstream" | "custom";
type PushForce = "none" | "force-with-lease" | "force";
type CheckoutMode = "existing" | "new-branch";
type ResetMode = "soft" | "mixed" | "hard";
type TagMode = "create" | "push" | "delete" | "delete-remote";

const FORCE_FLAG: Record<PushForce, string | null> = {
  none: null,
  "force-with-lease": "--force-with-lease",
  force: "--force",
};

/** Strips the leading "<remote>/" off an upstream ref like "origin/master"
 * to get just the branch name, tolerating branch names that themselves
 * contain slashes (e.g. "origin/feat/foo" -> "feat/foo"). */
function upstreamBranchName(upstream: string): string {
  return upstream.split("/").slice(1).join("/");
}

export function TerminalPanel({ height, onClose }: TerminalPanelProps) {
  const activeTab = useActiveTab();
  const refreshRepo = useRepoStore((s) => s.refreshRepo);
  const repoPath = activeTab?.repoPath ?? null;
  const remotes = activeTab?.remotes ?? [];
  const refs = activeTab?.refs ?? [];
  const upstream = refs.find((r) => r.kind === "head")?.upstream ?? null;
  const currentBranch = refs.find((r) => r.kind === "head")?.name ?? null;
  const localBranches = refs.filter((r) => r.kind === "branch" || r.kind === "head");
  const remoteBranches = refs.filter((r) => r.kind === "remote-branch");
  const tags = refs.filter((r) => r.kind === "tag");
  const mergeableRefs = [...localBranches, ...remoteBranches, ...tags].filter(
    (r) => r.name !== currentBranch,
  );

  const [action, setAction] = useState<Action>("push");
  const [destination, setDestination] = useState(remotes[0]?.name ?? "origin");

  // push
  const [targetMode, setTargetMode] = useState<PushTarget>(upstream ? "upstream" : "same-name");
  const [customLocalRef, setCustomLocalRef] = useState("HEAD");
  const [customRemoteRef, setCustomRemoteRef] = useState("");
  const [force, setForce] = useState<PushForce>("none");
  const [noVerify, setNoVerify] = useState(false);

  // fetch
  const [fetchAll, setFetchAll] = useState(false);
  const [fetchPrune, setFetchPrune] = useState(false);

  // pull
  const [pullRebase, setPullRebase] = useState(false);

  // merge
  const [mergeRef, setMergeRef] = useState(mergeableRefs[0]?.name ?? "");
  const [mergeNoFf, setMergeNoFf] = useState(false);

  // checkout
  const [checkoutMode, setCheckoutMode] = useState<CheckoutMode>("existing");
  const [checkoutRef, setCheckoutRef] = useState(
    mergeableRefs[0]?.name ?? currentBranch ?? "",
  );
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchStart, setNewBranchStart] = useState("HEAD");

  // reset
  const [resetMode, setResetMode] = useState<ResetMode>("mixed");
  const [resetTarget, setResetTarget] = useState("HEAD~1");

  // tag
  const [tagMode, setTagMode] = useState<TagMode>("create");
  const [tagName, setTagName] = useState(tags[0]?.name ?? "");
  const [tagTarget, setTagTarget] = useState("HEAD");

  const [confirmDanger, setConfirmDanger] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const args = useMemo<string[]>(() => {
    const dest = destination || "origin";
    switch (action) {
      case "push": {
        const flag = FORCE_FLAG[force];
        const flags = flag ? [flag] : [];
        if (noVerify) flags.push("--no-verify");
        if (targetMode === "same-name") return ["push", ...flags, dest, "HEAD"];
        if (targetMode === "upstream" && upstream) {
          return ["push", ...flags, dest, `HEAD:${upstreamBranchName(upstream)}`];
        }
        const remoteRef = customRemoteRef.trim();
        const target = remoteRef ? `${customLocalRef.trim()}:${remoteRef}` : customLocalRef.trim();
        return ["push", ...flags, dest, target];
      }
      case "fetch": {
        const flags = fetchPrune ? ["--prune"] : [];
        return fetchAll ? ["fetch", ...flags, "--all"] : ["fetch", ...flags, dest];
      }
      case "pull": {
        const flags = pullRebase ? ["--rebase"] : [];
        return ["pull", ...flags, dest];
      }
      case "merge": {
        if (!mergeRef) return [];
        const flags = mergeNoFf ? ["--no-ff"] : [];
        return ["merge", ...flags, mergeRef];
      }
      case "checkout": {
        if (checkoutMode === "new-branch") {
          if (!newBranchName.trim()) return [];
          const start = newBranchStart.trim();
          return start && start !== "HEAD"
            ? ["checkout", "-b", newBranchName.trim(), start]
            : ["checkout", "-b", newBranchName.trim()];
        }
        return checkoutRef ? ["checkout", checkoutRef] : [];
      }
      case "reset": {
        const target = resetTarget.trim() || "HEAD";
        return ["reset", `--${resetMode}`, target];
      }
      case "tag": {
        const name = tagName.trim();
        if (!name) return [];
        if (tagMode === "create") {
          const target = tagTarget.trim();
          return target && target !== "HEAD" ? ["tag", name, target] : ["tag", name];
        }
        if (tagMode === "push") return ["push", dest, name];
        if (tagMode === "delete") return ["tag", "-d", name];
        return ["push", dest, "--delete", name];
      }
      default:
        return [];
    }
  }, [
    action,
    destination,
    targetMode,
    upstream,
    customLocalRef,
    customRemoteRef,
    force,
    noVerify,
    fetchAll,
    fetchPrune,
    pullRebase,
    mergeRef,
    mergeNoFf,
    checkoutMode,
    checkoutRef,
    newBranchName,
    newBranchStart,
    resetMode,
    resetTarget,
    tagMode,
    tagName,
    tagTarget,
  ]);

  const commandPreview = `git ${args.join(" ")}`;

  const isDangerous =
    (action === "push" && force !== "none") || action === "reset";

  async function run() {
    if (!repoPath || args.length === 0) return;
    setRunning(true);
    setResult(null);
    try {
      const output = await runGitArgs(repoPath, args);
      setResult({ kind: "success", text: output.trim() || "Done" });
      await refreshRepo();
    } catch (e) {
      setResult({ kind: "error", text: String(e) });
    } finally {
      setRunning(false);
    }
  }

  function onRunClick() {
    if (isDangerous) {
      setConfirmDanger(true);
      return;
    }
    run();
  }

  function dangerCopy(): { title: string; message: string } {
    if (action === "reset") {
      return {
        title: `Reset (--${resetMode})`,
        message:
          resetMode === "hard"
            ? "This moves the branch tip and discards all uncommitted changes and any commits after the target. Local work not reachable elsewhere will be lost."
            : "This moves the branch tip to the target, leaving the commits after it dangling (recoverable via reflog, but not shown in the graph).",
      };
    }
    return {
      title: force === "force" ? "Force push" : "Force push (with lease)",
      message:
        force === "force"
          ? "This overwrites the remote branch with your local history, discarding any commits made there since you last fetched. This cannot be undone remotely."
          : "This overwrites the remote branch, but aborts if someone else pushed since you last fetched. Safer than a plain --force, still rewrites remote history.",
    };
  }

  return (
    <div className="terminal-panel" style={{ height }}>
      <div className="terminal-panel-header">
        <span className="terminal-panel-title">Terminal</span>
        <button className="terminal-panel-close" onClick={onClose} aria-label="Close terminal">
          ×
        </button>
      </div>
      <div className="terminal-panel-body">
        <div className="terminal-command-row">
          <span className="terminal-prompt">$</span>
          <span className="terminal-token">git</span>
          <select
            className="terminal-select"
            value={action}
            onChange={(e) => setAction(e.target.value as Action)}
          >
            <option value="push">push</option>
            <option value="fetch">fetch</option>
            <option value="pull">pull</option>
            <option value="merge">merge</option>
            <option value="checkout">checkout</option>
            <option value="reset">reset</option>
            <option value="tag">tag</option>
          </select>

          {action === "push" && (
            <>
              <select
                className="terminal-select"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              >
                {remotes.length === 0 && <option value="origin">origin</option>}
                {remotes.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
              <select
                className="terminal-select"
                value={targetMode}
                onChange={(e) => setTargetMode(e.target.value as PushTarget)}
              >
                <option value="same-name">same name (HEAD)</option>
                <option value="upstream" disabled={!upstream}>
                  upstream branch{upstream ? ` (${upstreamBranchName(upstream)})` : " (none configured)"}
                </option>
                <option value="custom">custom refspec…</option>
              </select>
              <select
                className="terminal-select"
                value={force}
                onChange={(e) => setForce(e.target.value as PushForce)}
              >
                <option value="none">(no force)</option>
                <option value="force-with-lease">--force-with-lease</option>
                <option value="force">--force</option>
              </select>
              <label className="terminal-checkbox">
                <input
                  type="checkbox"
                  checked={noVerify}
                  onChange={(e) => setNoVerify(e.target.checked)}
                />
                --no-verify
              </label>
            </>
          )}

          {action === "fetch" && (
            <>
              <select
                className="terminal-select"
                value={destination}
                disabled={fetchAll}
                onChange={(e) => setDestination(e.target.value)}
              >
                {remotes.length === 0 && <option value="origin">origin</option>}
                {remotes.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
              <label className="terminal-checkbox">
                <input
                  type="checkbox"
                  checked={fetchAll}
                  onChange={(e) => setFetchAll(e.target.checked)}
                />
                --all
              </label>
              <label className="terminal-checkbox">
                <input
                  type="checkbox"
                  checked={fetchPrune}
                  onChange={(e) => setFetchPrune(e.target.checked)}
                />
                --prune
              </label>
            </>
          )}

          {action === "pull" && (
            <>
              <select
                className="terminal-select"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              >
                {remotes.length === 0 && <option value="origin">origin</option>}
                {remotes.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
              <label className="terminal-checkbox">
                <input
                  type="checkbox"
                  checked={pullRebase}
                  onChange={(e) => setPullRebase(e.target.checked)}
                />
                --rebase
              </label>
            </>
          )}

          {action === "merge" && (
            <>
              <select
                className="terminal-select"
                value={mergeRef}
                onChange={(e) => setMergeRef(e.target.value)}
              >
                {mergeableRefs.length === 0 && <option value="">(no other refs)</option>}
                {mergeableRefs.map((r) => (
                  <option key={`${r.kind}:${r.name}`} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
              <label className="terminal-checkbox">
                <input
                  type="checkbox"
                  checked={mergeNoFf}
                  onChange={(e) => setMergeNoFf(e.target.checked)}
                />
                --no-ff
              </label>
            </>
          )}

          {action === "checkout" && (
            <select
              className="terminal-select"
              value={checkoutMode}
              onChange={(e) => setCheckoutMode(e.target.value as CheckoutMode)}
            >
              <option value="existing">existing ref</option>
              <option value="new-branch">new branch…</option>
            </select>
          )}
          {action === "checkout" && checkoutMode === "existing" && (
            <select
              className="terminal-select"
              value={checkoutRef}
              onChange={(e) => setCheckoutRef(e.target.value)}
            >
              {mergeableRefs.length === 0 && currentBranch && (
                <option value={currentBranch}>{currentBranch}</option>
              )}
              {mergeableRefs.map((r) => (
                <option key={`${r.kind}:${r.name}`} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          )}

          {action === "reset" && (
            <select
              className="terminal-select"
              value={resetMode}
              onChange={(e) => setResetMode(e.target.value as ResetMode)}
            >
              <option value="soft">--soft</option>
              <option value="mixed">--mixed</option>
              <option value="hard">--hard</option>
            </select>
          )}

          {action === "tag" && (
            <>
              <select
                className="terminal-select"
                value={tagMode}
                onChange={(e) => setTagMode(e.target.value as TagMode)}
              >
                <option value="create">create</option>
                <option value="push">push</option>
                <option value="delete">delete</option>
                <option value="delete-remote">delete on remote</option>
              </select>
              {(tagMode === "push" || tagMode === "delete-remote") && (
                <select
                  className="terminal-select"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                >
                  {remotes.length === 0 && <option value="origin">origin</option>}
                  {remotes.map((r) => (
                    <option key={r.name} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
        </div>

        {action === "checkout" && checkoutMode === "new-branch" && (
          <div className="terminal-custom-row">
            <input
              className="terminal-input"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="new branch name"
            />
            <span className="terminal-token">from</span>
            <input
              className="terminal-input"
              value={newBranchStart}
              onChange={(e) => setNewBranchStart(e.target.value)}
              placeholder="start point (default HEAD)"
            />
          </div>
        )}

        {action === "reset" && (
          <div className="terminal-custom-row">
            <span className="terminal-token">target</span>
            <input
              className="terminal-input"
              value={resetTarget}
              onChange={(e) => setResetTarget(e.target.value)}
              placeholder="e.g. HEAD~1, a commit sha, a branch"
            />
          </div>
        )}

        {action === "tag" && (
          <div className="terminal-custom-row">
            <input
              className="terminal-input"
              list="terminal-tag-names"
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              placeholder="tag name"
            />
            {tags.length > 0 && (
              <datalist id="terminal-tag-names">
                {tags.map((t) => (
                  <option key={t.name} value={t.name} />
                ))}
              </datalist>
            )}
            {tagMode === "create" && (
              <>
                <span className="terminal-token">at</span>
                <input
                  className="terminal-input"
                  value={tagTarget}
                  onChange={(e) => setTagTarget(e.target.value)}
                  placeholder="target (default HEAD)"
                />
              </>
            )}
          </div>
        )}

        {action === "push" && targetMode === "custom" && (
          <div className="terminal-custom-row">
            <input
              className="terminal-input"
              value={customLocalRef}
              onChange={(e) => setCustomLocalRef(e.target.value)}
              placeholder="local ref (e.g. HEAD, main)"
            />
            <span className="terminal-token">:</span>
            <input
              className="terminal-input"
              value={customRemoteRef}
              onChange={(e) => setCustomRemoteRef(e.target.value)}
              placeholder="remote ref (e.g. master)"
            />
          </div>
        )}

        <div className="terminal-preview">{commandPreview}</div>
        <div className="terminal-actions">
          <button
            className={isDangerous ? "btn-danger" : "btn-primary"}
            disabled={running || !repoPath || args.length === 0}
            onClick={onRunClick}
          >
            {running ? "Running…" : "Run"}
          </button>
        </div>
        {result && (
          <pre className={`terminal-output terminal-output-${result.kind}`}>{result.text}</pre>
        )}
      </div>
      {confirmDanger && (
        <ConfirmDialog
          title={dangerCopy().title}
          message={dangerCopy().message}
          confirmLabel={action === "reset" ? "Reset" : "Force push"}
          danger
          onCancel={() => setConfirmDanger(false)}
          onConfirm={() => {
            setConfirmDanger(false);
            run();
          }}
        />
      )}
    </div>
  );
}
