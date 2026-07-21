import { useState } from "react";
import type { WorkingFileEntry } from "../api/git";
import { isConflicted } from "../lib/conflicts";
import { ModalOverlay } from "./ModalOverlay";
import { ConflictResolutionDialog } from "./ConflictResolutionDialog";

interface StashPopConflictDialogProps {
  repoPath: string;
  stashMessage: string;
  conflictedFiles: WorkingFileEntry[];
  onComplete: () => Promise<void>;
  onAbort: () => Promise<void>;
}

/**
 * Dialog shown after stash pop encounters merge conflicts.
 * Lists conflicted files and allows user to resolve each one.
 */
export function StashPopConflictDialog({
  repoPath,
  stashMessage,
  conflictedFiles,
  onComplete,
  onAbort,
}: StashPopConflictDialogProps) {
  const [resolving, setResolving] = useState<string | null>(null);
  const [isAborting, setIsAborting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  async function handleAbort() {
    setIsAborting(true);
    try {
      await onAbort();
    } finally {
      setIsAborting(false);
    }
  }

  async function handleComplete() {
    setIsCompleting(true);
    try {
      await onComplete();
    } finally {
      setIsCompleting(false);
    }
  }

  // Count resolved vs total
  const remainingConflicts = conflictedFiles.filter((f) => isConflicted(f));
  const resolvedCount = conflictedFiles.length - remainingConflicts.length;

  if (resolving) {
    return (
      <ConflictResolutionDialog
        repoPath={repoPath}
        path={resolving}
        onClose={() => setResolving(null)}
      />
    );
  }

  return (
    <ModalOverlay onClose={() => {}}>
      <div className="modal modal-wide">
        <div className="modal-title">Resolve stash pop conflicts</div>
        <div className="modal-message">
          Stash "{stashMessage}" has {conflictedFiles.length} merge conflict
          {conflictedFiles.length === 1 ? "" : "s"}. Resolve them below:
        </div>

        <div className="modal-content">
          <div className="conflict-file-list">
            {conflictedFiles.map((file) => {
              const isConflictedFile = isConflicted(file);
              return (
                <div
                  key={file.path}
                  className={`conflict-file-item${isConflictedFile ? " unresolved" : " resolved"}`}
                >
                  <span className="conflict-file-status">
                    {isConflictedFile ? "⚠️ Conflict" : "✓ Resolved"}
                  </span>
                  <button
                    className={`conflict-file-name${isConflictedFile ? "" : " disabled"}`}
                    disabled={!isConflictedFile}
                    onClick={() => setResolving(file.path)}
                  >
                    {file.path}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="modal-label">
            Progress: {resolvedCount}/{conflictedFiles.length} resolved
          </div>
        </div>

        <div className="modal-actions">
          <button
            className="btn-secondary"
            disabled={isAborting || isCompleting}
            onClick={handleAbort}
          >
            {isAborting ? "Aborting…" : "Abort stash pop"}
          </button>
          <button
            className="btn-primary"
            disabled={remainingConflicts.length > 0 || isCompleting}
            onClick={handleComplete}
            title={
              remainingConflicts.length > 0
                ? "Resolve all conflicts before completing"
                : "Complete stash pop"
            }
          >
            {isCompleting ? "Completing…" : "Complete"}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
