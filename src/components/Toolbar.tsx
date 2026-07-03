import { useEffect, useState } from "react";
import { stashList as fetchStashList, type StashEntry } from "../api/git";
import { useClickOutside } from "../lib/useClickOutside";
import { useActiveTab, useRepoStore } from "../store/repoStore";
import { AddRemoteDialog } from "./AddRemoteDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { FetchIcon, PullIcon, PushIcon, RemoteIcon, StashIcon } from "./icons";

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
  const repoPath = useActiveTab()?.repoPath ?? null;
  const busy = useActiveTab()?.busy ?? false;
  const [open, setOpen] = useState(false);
  const [stashes, setStashes] = useState<StashEntry[]>([]);
  const ref = useClickOutside(() => setOpen(false));

  async function toggleOpen() {
    if (!open && repoPath) {
      try {
        setStashes(await fetchStashList(repoPath));
      } catch {
        setStashes([]);
      }
    }
    setOpen((o) => !o);
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
            <button
              key={s.index}
              className="dropdown-item dropdown-item-muted"
              onClick={() => {
                setOpen(false);
                doStashPop(s.index);
              }}
              title={s.message}
            >
              stash@{"{" + s.index + "}"} {s.message}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RemoteSplitButton() {
  const remotes = useActiveTab()?.remotes ?? [];
  const busy = useActiveTab()?.busy ?? false;
  const doAddRemote = useRepoStore((s) => s.doAddRemote);
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  return (
    <div className="split-button" ref={ref}>
      <button
        className="btn-toolbar"
        disabled={busy}
        onClick={() => setDialogOpen(true)}
        title="Add a remote"
      >
        <RemoteIcon />
        {remotes.length === 0 ? "Add Remote" : remotes[0].name}
      </button>
      {remotes.length > 0 && (
        <button
          className="btn-toolbar btn-caret"
          disabled={busy}
          onClick={() => setOpen((o) => !o)}
          aria-label="Remote options"
        >
          ▾
        </button>
      )}
      {open && (
        <div className="dropdown-menu">
          {remotes.map((r) => (
            <div key={r.name} className="dropdown-item-info" title={r.url}>
              {r.name} — {r.url}
            </div>
          ))}
          {remotes.length > 0 && <div className="dropdown-separator" />}
          <button
            className="dropdown-item"
            onClick={() => {
              setOpen(false);
              setDialogOpen(true);
            }}
          >
            Add remote…
          </button>
        </div>
      )}
      {dialogOpen && (
        <AddRemoteDialog
          onCancel={() => setDialogOpen(false)}
          onConfirm={(name, url) => {
            doAddRemote(name, url);
            setDialogOpen(false);
          }}
        />
      )}
    </div>
  );
}

export function Toolbar() {
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

  const upstream = refs.find((r) => r.kind === "head")?.upstream ?? null;
  const diverged = aheadBehind && (aheadBehind.ahead > 0 || aheadBehind.behind > 0);
  const hasRemote = remotes.length > 0;
  const hasChanges = workingStatus.some(
    (f) => f.indexStatus !== "none" || f.worktreeStatus !== "none",
  );

  useEffect(() => {
    if (!toast) return;
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
          <span className="toolbar-branch">
            {branch}
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
            onClick={dismissToast}
          >
            {toast.text}
          </span>
        )}
        <RemoteSplitButton />
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
      </div>
    </div>
  );
}
