import { useEffect, useState } from "react";
import { stashList as fetchStashList, stashShow, type StashEntry } from "../api/git";
import { useClickOutside } from "../lib/useClickOutside";
import { useActiveTab, useRepoStore } from "../store/repoStore";
import { BranchManager } from "./BranchManager";
import { ConfirmDialog } from "./ConfirmDialog";
import { ErrorDetailModal } from "./ErrorDetailModal";
import { FetchIcon, HamburgerIcon, PullIcon, PushIcon, StashIcon } from "./icons";
import { RemotesDialog } from "./RemotesDialog";
import { SettingsDialog } from "./SettingsDialog";
import { StashDiffModal } from "./StashDiffModal";

function PushSplitButton({ hasRemote }: { hasRemote: boolean }) {
  const doPush = useRepoStore((s) => s.doPush);
  const busy = useActiveTab()?.busy ?? false;
  const disabled = busy || !hasRemote;
  const [open, setOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"force" | "force-with-lease" | null>(
    null,
  );
  const ref = useClickOutside(() => setOpen(false));

  return (
    <div className="split-button" ref={ref}>
      <button
        className="btn-toolbar"
        disabled={disabled}
        onClick={() => doPush(null)}
        title={hasRemote ? "Push" : "No remote configured"}
      >
        <PushIcon />
        Push
      </button>
      <button
        className="btn-toolbar btn-caret"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-label="Push options"
      >
        ▾
      </button>
      {open && (
        <div className="dropdown-menu">
          <button
            className="dropdown-item"
            title="Push without running local pre-push hooks"
            onClick={() => {
              setOpen(false);
              doPush(null, true);
            }}
          >
            Push --no-verify
          </button>
          <button
            className="dropdown-item dropdown-item-danger"
            onClick={() => {
              setOpen(false);
              setConfirmMode("force-with-lease");
            }}
          >
            Push --force-with-lease
          </button>
          <button
            className="dropdown-item dropdown-item-danger"
            onClick={() => {
              setOpen(false);
              setConfirmMode("force");
            }}
          >
            Push --force
          </button>
        </div>
      )}
      {confirmMode && (
        <ConfirmDialog
          title={confirmMode === "force" ? "Force push" : "Force push (with lease)"}
          message={
            confirmMode === "force"
              ? "This overwrites the remote branch with your local history, discarding any commits made there since you last fetched. This cannot be undone remotely."
              : "This overwrites the remote branch, but aborts if someone else pushed since you last fetched. Safer than a plain --force, still rewrites remote history."
          }
          confirmLabel="Force push"
          danger
          onCancel={() => setConfirmMode(null)}
          onConfirm={() => {
            doPush(confirmMode);
            setConfirmMode(null);
          }}
        />
      )}
    </div>
  );
}

function StashSplitButton({ hasChanges }: { hasChanges: boolean }) {
  const doStashPush = useRepoStore((s) => s.doStashPush);
  const doStashPop = useRepoStore((s) => s.doStashPop);
  const doStashDrop = useRepoStore((s) => s.doStashDrop);
  const repoPath = useActiveTab()?.repoPath ?? null;
  const busy = useActiveTab()?.busy ?? false;
  const [open, setOpen] = useState(false);
  const [stashes, setStashes] = useState<StashEntry[]>([]);
  const [dropTarget, setDropTarget] = useState<StashEntry | null>(null);
  const [diffTarget, setDiffTarget] = useState<StashEntry | null>(null);
  const [diffText, setDiffText] = useState("");
  const ref = useClickOutside(() => setOpen(false));

  async function refreshStashes() {
    if (!repoPath) return;
    try {
      setStashes(await fetchStashList(repoPath));
    } catch {
      setStashes([]);
    }
  }

  async function toggleOpen() {
    if (!open) await refreshStashes();
    setOpen((o) => !o);
  }

  async function showDiff(s: StashEntry) {
    setOpen(false);
    setDiffTarget(s);
    setDiffText("Loading…");
    if (!repoPath) return;
    try {
      setDiffText(await stashShow(repoPath, s.index));
    } catch (e) {
      setDiffText(String(e));
    }
  }

  return (
    <div className="split-button" ref={ref}>
      <button
        className="btn-toolbar"
        disabled={busy || !hasChanges}
        onClick={() => doStashPush()}
        title={hasChanges ? "Stash uncommitted changes" : "No uncommitted changes to stash"}
      >
        <StashIcon />
        Stash
      </button>
      <button
        className="btn-toolbar btn-caret"
        disabled={busy}
        onClick={toggleOpen}
        aria-label="Stash options"
      >
        ▾
      </button>
      {open && (
        <div className="dropdown-menu">
          {stashes.length === 0 && (
            <div className="dropdown-empty">No stashes</div>
          )}
          {stashes.length > 0 && (
            <button
              className="dropdown-item"
              onClick={() => {
                setOpen(false);
                doStashPop();
              }}
            >
              Pop latest
            </button>
          )}
          {stashes.map((s) => (
            <div className="dropdown-item-row" key={s.index}>
              <button
                className="dropdown-item dropdown-item-muted"
                onClick={() => {
                  setOpen(false);
                  doStashPop(s.index);
                }}
                title={`Pop stash@{${s.index}}: ${s.message}`}
              >
                stash@{"{" + s.index + "}"} {s.message}
              </button>
              <button
                className="dropdown-item-small"
                title="Show diff"
                onClick={() => showDiff(s)}
              >
                Diff
              </button>
              <button
                className="dropdown-item-small dropdown-item-small-danger"
                title="Drop (discard without applying)"
                onClick={() => {
                  setOpen(false);
                  setDropTarget(s);
                }}
              >
                Drop
              </button>
            </div>
          ))}
        </div>
      )}
      {dropTarget && (
        <ConfirmDialog
          title="Drop stash"
          message={`Permanently discard stash@{${dropTarget.index}}: "${dropTarget.message}"? This cannot be undone.`}
          confirmLabel="Drop"
          danger
          onCancel={() => setDropTarget(null)}
          onConfirm={() => {
            doStashDrop(dropTarget.index);
            setDropTarget(null);
          }}
        />
      )}
      {diffTarget && (
        <StashDiffModal
          title={`stash@{${diffTarget.index}}: ${diffTarget.message}`}
          diff={diffText}
          onClose={() => setDiffTarget(null)}
        />
      )}
    </div>
  );
}

function AdvancedMenuButton({ terminalOpen, onToggleTerminal }: ToolbarProps) {
  const busy = useActiveTab()?.busy ?? false;
  const showRemoteBranches = useRepoStore((s) => s.showRemoteBranches);
  const setShowRemoteBranches = useRepoStore((s) => s.setShowRemoteBranches);
  const [open, setOpen] = useState(false);
  const [remotesOpen, setRemotesOpen] = useState(false);
  const [branchManagerOpen, setBranchManagerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  return (
    <div className="menu-anchor" ref={ref}>
      <button
        className="btn-toolbar"
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        aria-label="Advanced menu"
        title="Advanced"
      >
        <HamburgerIcon />
      </button>
      {open && (
        <div className="dropdown-menu">
          <button
            className="dropdown-item"
            onClick={() => {
              setOpen(false);
              setRemotesOpen(true);
            }}
          >
            Remotes…
          </button>
          <button
            className="dropdown-item"
            onClick={() => {
              setOpen(false);
              setBranchManagerOpen(true);
            }}
          >
            Branches…
          </button>
          <button
            className="dropdown-item"
            onClick={() => {
              setOpen(false);
              onToggleTerminal();
            }}
          >
            {terminalOpen ? "✓ Terminal" : "Terminal"}
          </button>
          <button
            className="dropdown-item"
            title="Show branches that exist only on a remote as their own lanes in the graph"
            onClick={() => {
              setOpen(false);
              setShowRemoteBranches(!showRemoteBranches);
            }}
          >
            {showRemoteBranches ? "✓ Remote branches" : "Remote branches"}
          </button>
          <div className="dropdown-separator" />
          <button
            className="dropdown-item"
            onClick={() => {
              setOpen(false);
              setSettingsOpen(true);
            }}
          >
            Settings…
          </button>
        </div>
      )}
      {remotesOpen && <RemotesDialog onClose={() => setRemotesOpen(false)} />}
      {branchManagerOpen && <BranchManager onClose={() => setBranchManagerOpen(false)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

interface ToolbarProps {
  terminalOpen: boolean;
  onToggleTerminal: () => void;
}

export function Toolbar({ terminalOpen, onToggleTerminal }: ToolbarProps) {
  const activeTab = useActiveTab();
  const repoPath = activeTab?.repoPath ?? null;
  const branch = activeTab?.branch ?? null;
  const refs = activeTab?.refs ?? [];
  const remotes = activeTab?.remotes ?? [];
  const workingStatus = activeTab?.workingStatus ?? [];
  const aheadBehind = activeTab?.aheadBehind ?? null;
  const busy = activeTab?.busy ?? false;
  const toast = activeTab?.toast ?? null;
  const doFetch = useRepoStore((s) => s.doFetch);
  const doPull = useRepoStore((s) => s.doPull);
  const dismissToast = useRepoStore((s) => s.dismissToast);
  const [errorModalOpen, setErrorModalOpen] = useState(false);

  const headRef = refs.find((r) => r.kind === "head");
  const upstream = headRef?.upstream ?? null;
  // `branch` is git's own `HEAD` literal when detached (see current_branch
  // in git.rs) — swap in the short sha so it reads as a position, not a
  // (nonexistent) branch name.
  const isDetachedHead = branch === "HEAD" && headRef?.name === "HEAD";
  const branchLabel = isDetachedHead ? `detached @ ${headRef.hash.slice(0, 7)}` : branch;
  const diverged = aheadBehind && (aheadBehind.ahead > 0 || aheadBehind.behind > 0);
  const hasRemote = remotes.length > 0;
  const hasChanges = workingStatus.some(
    (f) => f.indexStatus !== "none" || f.worktreeStatus !== "none",
  );

  useEffect(() => {
    // Errors stay until dismissed or inspected — only successes auto-clear.
    if (!toast || toast.kind === "error") return;
    const t = setTimeout(dismissToast, 4000);
    return () => clearTimeout(t);
  }, [toast, dismissToast]);

  return (
    <div className="toolbar">
      <div className="toolbar-info">
        {repoPath && (
          <span className="toolbar-repo-path" title={repoPath}>
            {repoPath}
          </span>
        )}
        {branch && (
          <span
            className={`toolbar-branch${isDetachedHead ? " toolbar-branch-detached" : ""}`}
            title={isDetachedHead ? "HEAD is detached — not on any branch" : undefined}
          >
            {branchLabel}
            {diverged && (
              <span
                className="toolbar-ahead-behind"
                title={`${aheadBehind.ahead} ahead, ${aheadBehind.behind} behind ${upstream}`}
              >
                {aheadBehind.ahead > 0 && (
                  <span className="toolbar-ahead">↑{aheadBehind.ahead}</span>
                )}
                {aheadBehind.behind > 0 && (
                  <span className="toolbar-behind">↓{aheadBehind.behind}</span>
                )}
              </span>
            )}
          </span>
        )}
      </div>
      <div className="toolbar-actions">
        {busy && <span className="toolbar-busy">Working…</span>}
        {toast && (
          <span
            className={`toolbar-toast toolbar-toast-${toast.kind}`}
            onClick={() => {
              if (toast.kind === "error") setErrorModalOpen(true);
              else dismissToast();
            }}
            title={toast.kind === "error" ? "Click for details" : undefined}
          >
            <span className="toolbar-toast-text">{toast.text}</span>
            {toast.kind === "error" && (
              <span
                className="toolbar-toast-dismiss"
                title="Dismiss"
                onClick={(e) => {
                  e.stopPropagation();
                  dismissToast();
                }}
              >
                ×
              </span>
            )}
          </span>
        )}
        {errorModalOpen && toast?.kind === "error" && (
          <ErrorDetailModal
            toast={toast}
            onClose={() => {
              setErrorModalOpen(false);
              dismissToast();
            }}
          />
        )}
        <button
          className="btn-toolbar"
          disabled={busy || !hasRemote}
          onClick={doFetch}
          title={hasRemote ? "Fetch" : "No remote configured"}
        >
          <FetchIcon />
          Fetch
        </button>
        <button
          className="btn-toolbar"
          disabled={busy || !hasRemote || !upstream}
          onClick={doPull}
          title={
            !hasRemote
              ? "No remote configured"
              : !upstream
                ? "Current branch has no upstream to pull from"
                : "Pull"
          }
        >
          <PullIcon />
          Pull
        </button>
        <PushSplitButton hasRemote={hasRemote} />
        <StashSplitButton hasChanges={hasChanges} />
        <AdvancedMenuButton terminalOpen={terminalOpen} onToggleTerminal={onToggleTerminal} />
      </div>
    </div>
  );
}
