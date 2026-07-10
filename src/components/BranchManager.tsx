import { useState } from "react";
import { splitRemoteRef } from "../lib/refNames";
import { otherWorktreeBranches } from "../lib/worktrees";
import { useActiveTab, useRepoStore } from "../store/repoStore";
import { ConfirmDialog } from "./ConfirmDialog";
import { ModalOverlay } from "./ModalOverlay";
import { PromptDialog } from "./PromptDialog";

interface BranchManagerProps {
  onClose: () => void;
}

export function BranchManager({ onClose }: BranchManagerProps) {
  const activeTab = useActiveTab();
  const doCheckoutRef = useRepoStore((s) => s.doCheckoutRef);
  const doCreateBranch = useRepoStore((s) => s.doCreateBranch);
  const doRenameBranch = useRepoStore((s) => s.doRenameBranch);
  const doMoveBranch = useRepoStore((s) => s.doMoveBranch);
  const doSetUpstream = useRepoStore((s) => s.doSetUpstream);
  const doDeleteBranch = useRepoStore((s) => s.doDeleteBranch);
  const doDeleteRemoteBranch = useRepoStore((s) => s.doDeleteRemoteBranch);

  const refs = activeTab?.refs ?? [];
  const currentBranch = refs.find((r) => r.kind === "head")?.name ?? null;
  const worktreeBranches = otherWorktreeBranches(
    activeTab?.worktrees ?? [],
    activeTab?.repoPath ?? "",
  );
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase();
  const matchesFilter = (name: string) => !query || name.toLowerCase().includes(query);
  const localBranches = refs
    .filter((r) => r.kind === "branch" || r.kind === "head")
    .filter((r) => matchesFilter(r.name));
  const remoteBranches = refs
    .filter((r) => r.kind === "remote-branch")
    .filter((r) => matchesFilter(r.name));
  // Unfiltered, so repoint/upstream suggestions always offer every remote branch.
  const remoteBranchNames = refs.filter((r) => r.kind === "remote-branch").map((r) => r.name);

  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [repointTarget, setRepointTarget] = useState<string | null>(null);
  const [upstreamTarget, setUpstreamTarget] = useState<string | null>(null);
  const [deleteLocalTarget, setDeleteLocalTarget] = useState<string | null>(null);
  const [deleteRemoteTarget, setDeleteRemoteTarget] = useState<{
    remote: string;
    name: string;
  } | null>(null);

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal modal-wide">
        <div className="modal-title">Branches</div>

        <input
          className="modal-input branch-filter-input"
          placeholder="Filter branches…"
          autoFocus
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              if (filter) setFilter("");
              else onClose();
            }
          }}
        />

        <div className="branch-section-header">
          <span>Local</span>
          <button className="btn-secondary" onClick={() => setCreateOpen(true)}>
            New branch…
          </button>
        </div>
        <div className="branch-list">
          {localBranches.map((b) => {
            const isCurrent = b.name === currentBranch;
            const worktreePath = worktreeBranches.get(b.name);
            const worktreeTitle = worktreePath
              ? `Checked out in another worktree: ${worktreePath}`
              : undefined;
            return (
              <div className="branch-row" key={`local:${b.name}`}>
                <div className="branch-row-name">
                  {isCurrent && <span className="branch-current-dot" title="Current branch" />}
                  <span>{b.name}</span>
                  {worktreePath && (
                    <span className="branch-row-worktree" title={worktreeTitle}>
                      worktree: {worktreePath}
                    </span>
                  )}
                </div>
                <span className="branch-row-upstream">{b.upstream ?? "—"}</span>
                <div className="branch-row-actions">
                  <button
                    disabled={isCurrent || !!worktreePath}
                    title={worktreeTitle}
                    onClick={() => doCheckoutRef(b.name)}
                  >
                    Checkout
                  </button>
                  <button onClick={() => setRenameTarget(b.name)}>Rename…</button>
                  <button
                    disabled={isCurrent}
                    title={
                      isCurrent
                        ? "Can't repoint the current branch — use Reset from the commit list instead"
                        : undefined
                    }
                    onClick={() => setRepointTarget(b.name)}
                  >
                    Repoint…
                  </button>
                  <button onClick={() => setUpstreamTarget(b.name)}>Set upstream…</button>
                  <button
                    disabled={isCurrent || !!worktreePath}
                    title={worktreeTitle}
                    className="branch-row-danger"
                    onClick={() => setDeleteLocalTarget(b.name)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
          {localBranches.length === 0 && (
            <div className="branch-list-empty">
              {query ? "No local branches match" : "No local branches"}
            </div>
          )}
        </div>

        <div className="branch-section-header">
          <span>Remote</span>
        </div>
        <div className="branch-list">
          {remoteBranches.map((r) => {
            const { remote, branch } = splitRemoteRef(r.name);
            return (
              <div className="branch-row" key={`remote:${r.name}`}>
                <div className="branch-row-name">
                  <span>{r.name}</span>
                </div>
                <span className="branch-row-upstream" />
                <div className="branch-row-actions">
                  <button onClick={() => doCheckoutRef(r.name)}>Checkout</button>
                  <button
                    className="branch-row-danger"
                    onClick={() => setDeleteRemoteTarget({ remote, name: branch })}
                  >
                    Delete on remote
                  </button>
                </div>
              </div>
            );
          })}
          {remoteBranches.length === 0 && (
            <div className="branch-list-empty">
              {query ? "No remote branches match" : "No remote-tracking branches"}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {createOpen && (
        <PromptDialog
          title="Create branch"
          label="Branch name"
          confirmLabel="Create"
          onCancel={() => setCreateOpen(false)}
          onConfirm={(name) => {
            doCreateBranch(name, "HEAD");
            setCreateOpen(false);
          }}
        />
      )}
      {renameTarget && (
        <PromptDialog
          title="Rename branch"
          label="New name"
          confirmLabel="Rename"
          initialValue={renameTarget}
          onCancel={() => setRenameTarget(null)}
          onConfirm={(newName) => {
            doRenameBranch(renameTarget, newName);
            setRenameTarget(null);
          }}
        />
      )}
      {repointTarget && (
        <PromptDialog
          title={`Repoint ${repointTarget}`}
          label="Target commit, branch, or tag"
          confirmLabel="Repoint"
          suggestions={remoteBranchNames}
          onCancel={() => setRepointTarget(null)}
          onConfirm={(target) => {
            doMoveBranch(repointTarget, target);
            setRepointTarget(null);
          }}
        />
      )}
      {upstreamTarget && (
        <PromptDialog
          title={`Set upstream for ${upstreamTarget}`}
          label="Upstream (e.g. origin/main)"
          confirmLabel="Set upstream"
          initialValue={
            refs.find((r) => r.name === upstreamTarget)?.upstream ?? remoteBranchNames[0] ?? ""
          }
          suggestions={remoteBranchNames}
          onCancel={() => setUpstreamTarget(null)}
          onConfirm={(upstream) => {
            doSetUpstream(upstreamTarget, upstream);
            setUpstreamTarget(null);
          }}
        />
      )}
      {deleteLocalTarget && (
        <ConfirmDialog
          title="Delete branch"
          message={`Delete local branch "${deleteLocalTarget}"? If it isn't fully merged into your current branch, this will fail.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setDeleteLocalTarget(null)}
          onConfirm={() => {
            doDeleteBranch(deleteLocalTarget, false);
            setDeleteLocalTarget(null);
          }}
        />
      )}
      {deleteRemoteTarget && (
        <ConfirmDialog
          title="Delete remote branch"
          message={`Delete "${deleteRemoteTarget.name}" from ${deleteRemoteTarget.remote}? Anyone else tracking this branch will lose it on their next fetch.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setDeleteRemoteTarget(null)}
          onConfirm={() => {
            doDeleteRemoteBranch(deleteRemoteTarget.remote, deleteRemoteTarget.name);
            setDeleteRemoteTarget(null);
          }}
        />
      )}
    </ModalOverlay>
  );
}
