import { useRef, useState } from "react";
import { stashShow, type RefInfo, type StashEntry } from "../api/git";
import { isMacOS } from "../lib/platform";
import { useClickOutside } from "../lib/useClickOutside";
import { useActiveTab, useRepoStore } from "../store/repoStore";
import { BranchManager } from "./BranchManager";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  CheckoutIcon,
  EyeIcon,
  EyeOffIcon,
  FetchIcon,
  HamburgerIcon,
  LocateIcon,
  PullIcon,
  PushIcon,
  StashIcon,
} from "./icons";
import { PermissionsModal } from "./PermissionsModal";
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
  const activeTab = useActiveTab();
  const repoPath = activeTab?.repoPath ?? null;
  const busy = activeTab?.busy ?? false;
  const stashes = activeTab?.stashes ?? [];
  const [open, setOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState<StashEntry | null>(null);
  const [diffTarget, setDiffTarget] = useState<StashEntry | null>(null);
  const [diffText, setDiffText] = useState("");
  const ref = useClickOutside(() => setOpen(false));

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
        onClick={() => setOpen((o) => !o)}
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

function RefFilterMenuButton() {
  const activeTab = useActiveTab();
  const repoPath = activeTab?.repoPath ?? null;
  const refs = activeTab?.refs ?? [];
  const refFilter = activeTab?.refFilter ?? [];
  const busy = activeTab?.busy ?? false;
  const toggleRefFilter = useRepoStore((s) => s.toggleRefFilter);
  const clearRefFilter = useRepoStore((s) => s.clearRefFilter);
  const scrollToCommit = useRepoStore((s) => s.scrollToCommit);
  const doCheckoutRef = useRepoStore((s) => s.doCheckoutRef);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useClickOutside(() => setOpen(false));
  const filterInputRef = useRef<HTMLInputElement>(null);

  if (!repoPath) return null;

  const query = filter.trim().toLowerCase();
  const matchesFilter = (name: string) => !query || name.toLowerCase().includes(query);
  const localBranches = refs.filter((r) => (r.kind === "branch" || r.kind === "head") && matchesFilter(r.name));
  const remoteBranches = refs.filter((r) => r.kind === "remote-branch" && matchesFilter(r.name));
  const tags = refs.filter((r) => r.kind === "tag" && matchesFilter(r.name));
  const noMatches = localBranches.length === 0 && remoteBranches.length === 0 && tags.length === 0;

  function renderRefItem(r: RefInfo) {
    const filterActive = refFilter.length > 0;
    const included = refFilter.includes(r.name);
    // With no filter active every ref is "visible" (open eye, neutral
    // color); once a filter exists, only refs actually in it stay visible
    // (green) — the rest show the struck-through eye (amber) to signal
    // they're the ones currently being hidden.
    const visible = !filterActive || included;
    const eyeTitle = !filterActive
      ? `Click to show only ${r.name}`
      : included
        ? "In the filter — click to remove"
        : "Hidden by filter — click to add";
    return (
      <div className="dropdown-item-row" key={r.name}>
        <span className="ref-filter-item-name" title={r.name}>
          {r.name}
        </span>
        <button
          className="dropdown-item-small"
          title="Scroll into view"
          onClick={() => {
            scrollToCommit(repoPath!, r.hash);
            setOpen(false);
          }}
        >
          <LocateIcon />
        </button>
        <button
          className="dropdown-item-small"
          title={r.kind === "head" ? "Already checked out" : `Checkout ${r.name}`}
          disabled={r.kind === "head"}
          onClick={() => {
            doCheckoutRef(r.name);
            setOpen(false);
          }}
        >
          <CheckoutIcon />
        </button>
        <button
          className={`dropdown-item-small${
            filterActive ? (included ? " ref-eye-shown" : " ref-eye-hidden") : ""
          }`}
          title={eyeTitle}
          onClick={() => toggleRefFilter(repoPath!, r.name)}
        >
          {visible ? <EyeIcon /> : <EyeOffIcon />}
        </button>
      </div>
    );
  }

  return (
    <div className="menu-anchor" ref={ref}>
      <button
        className="btn-toolbar"
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        title="Filter the graph and commit list to selected refs"
      >
        Refs{refFilter.length > 0 ? ` (${refFilter.length})` : ""} ▾
      </button>
      {open && (
        <div className="dropdown-menu">
          <div className="search-input-wrap">
            <input
              ref={filterInputRef}
              className="modal-input branch-filter-input"
              placeholder="Filter refs…"
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  if (filter) setFilter("");
                  else setOpen(false);
                }
              }}
            />
            {filter && (
              <button
                className="search-input-clear"
                aria-label="Clear filter text"
                title="Clear filter text"
                onClick={() => {
                  setFilter("");
                  filterInputRef.current?.focus();
                }}
              >
                ×
              </button>
            )}
          </div>
          {refFilter.length > 0 && (
            <button
              className="dropdown-item dropdown-item-muted"
              onClick={() => clearRefFilter(repoPath!)}
            >
              Clear filter ({refFilter.length})
            </button>
          )}
          <div className="ref-filter-list">
          {noMatches && <div className="dropdown-empty">No refs match</div>}
          {localBranches.length > 0 && (
            <>
              <div className="dropdown-section-label">Local</div>
              {localBranches.map(renderRefItem)}
            </>
          )}
          {remoteBranches.length > 0 && (
            <>
              <div className="dropdown-section-label">Remote</div>
              {remoteBranches.map(renderRefItem)}
            </>
          )}
          {tags.length > 0 && (
            <>
              <div className="dropdown-section-label">Tags</div>
              {tags.map(renderRefItem)}
            </>
          )}
          </div>
        </div>
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
  const [permissionsOpen, setPermissionsOpen] = useState(false);
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
          {isMacOS() && (
            <button
              className="dropdown-item"
              onClick={() => {
                setOpen(false);
                setPermissionsOpen(true);
              }}
            >
              Grant folder access…
            </button>
          )}
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
      {permissionsOpen && <PermissionsModal onClose={() => setPermissionsOpen(false)} />}
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
  const doFetch = useRepoStore((s) => s.doFetch);
  const doPull = useRepoStore((s) => s.doPull);

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
        <RefFilterMenuButton />
        <AdvancedMenuButton terminalOpen={terminalOpen} onToggleTerminal={onToggleTerminal} />
      </div>
    </div>
  );
}
