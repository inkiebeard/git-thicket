import { useState } from "react";
import type { RefInfo, ResetMode } from "../api/git";
import { useRepoStore } from "../store/repoStore";
import { ConfirmDialog } from "./ConfirmDialog";
import { ModalOverlay } from "./ModalOverlay";

interface ReconcileBranchDialogProps {
  /** The local branch tracking `remoteRef`, possibly the checked-out one. */
  localBranch: RefInfo;
  /** The remote-tracking ref that was double-clicked. */
  remoteRef: RefInfo;
  onClose: () => void;
}

type PendingAction = "ff" | "rebase" | ResetMode;

/**
 * Offered when double-clicking a remote-tracking ref that already has a
 * local branch pointed at it. Fast-forward and rebase only make sense on
 * the currently checked-out branch, so if `localBranch` isn't checked out
 * we switch to it first — same as a plain checkout would, just with one
 * extra step tacked on.
 */
export function ReconcileBranchDialog({
  localBranch,
  remoteRef,
  onClose,
}: ReconcileBranchDialogProps) {
  const doCheckoutRef = useRepoStore((s) => s.doCheckoutRef);
  const doFastForwardBranch = useRepoStore((s) => s.doFastForwardBranch);
  const doRebaseBranch = useRepoStore((s) => s.doRebaseBranch);
  const doResetToCommit = useRepoStore((s) => s.doResetToCommit);

  const [choosingResetType, setChoosingResetType] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);

  async function execute(action: PendingAction) {
    if (localBranch.kind !== "head") {
      await doCheckoutRef(localBranch.name);
    }
    if (action === "ff") {
      await doFastForwardBranch(remoteRef.name);
    } else if (action === "rebase") {
      await doRebaseBranch(remoteRef.name);
    } else {
      await doResetToCommit(remoteRef.hash, action);
    }
    onClose();
  }

  if (pending) {
    const shortSha = remoteRef.hash.slice(0, 7);
    const messages: Record<PendingAction, string> = {
      ff: `Fast-forward "${localBranch.name}" to ${shortSha} (${remoteRef.name})? This only succeeds if "${localBranch.name}" has no commits the remote lacks.`,
      rebase: `Rebase "${localBranch.name}" onto "${remoteRef.name}"? This rewrites any local commits not yet on the remote.`,
      soft: `Reset "${localBranch.name}" to ${shortSha} (soft)? Commits past that point become uncommitted staged changes.`,
      mixed: `Reset "${localBranch.name}" to ${shortSha} (mixed)? Commits past that point become uncommitted, unstaged changes.`,
      hard: `Reset "${localBranch.name}" to ${shortSha} (hard)? This discards commits and uncommitted changes past that point. This cannot be undone.`,
    };
    const titles: Record<PendingAction, string> = {
      ff: "Fast-forward",
      rebase: "Rebase",
      soft: "Reset (soft)",
      mixed: "Reset (mixed)",
      hard: "Reset (hard)",
    };
    const action = pending;
    return (
      <ConfirmDialog
        title={titles[pending]}
        message={messages[pending]}
        confirmLabel={titles[pending]}
        danger={pending === "hard"}
        onCancel={onClose}
        onConfirm={() => execute(action)}
      />
    );
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal">
        <div className="modal-title">Update "{localBranch.name}"</div>
        <div className="modal-message">
          Local branch "{localBranch.name}" tracks "{remoteRef.name}". How should it be updated to{" "}
          {remoteRef.hash.slice(0, 7)}?
        </div>
        {!choosingResetType ? (
          <div className="modal-choice-row">
            <button className="btn-secondary" onClick={() => setPending("ff")}>
              Fast-forward
            </button>
            <button className="btn-secondary" onClick={() => setPending("rebase")}>
              Rebase
            </button>
            <button className="btn-secondary" onClick={() => setChoosingResetType(true)}>
              Reset…
            </button>
          </div>
        ) : (
          <div className="modal-choice-row">
            <button className="btn-secondary" onClick={() => setPending("soft")}>
              Soft
            </button>
            <button className="btn-secondary" onClick={() => setPending("mixed")}>
              Mixed
            </button>
            <button className="btn-danger" onClick={() => setPending("hard")}>
              Hard
            </button>
          </div>
        )}
        <div className="modal-actions">
          {choosingResetType && (
            <button className="btn-secondary" onClick={() => setChoosingResetType(false)}>
              Back
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
