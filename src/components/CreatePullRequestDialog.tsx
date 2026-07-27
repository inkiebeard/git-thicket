import { useEffect, useState } from "react";
import { getPullRequestTemplate } from "../api/git";
import { ModalOverlay } from "./ModalOverlay";

interface CreatePullRequestDialogProps {
  repoPath: string;
  currentBranch: string;
  defaultTargetBranch: string;
  defaultTitle: string;
  availableTargetBranches: string[];
  onCancel: () => void;
  onConfirm: (targetBranch: string, title: string, description: string, draft: boolean) => void;
}

export function CreatePullRequestDialog({
  repoPath,
  currentBranch,
  defaultTargetBranch,
  defaultTitle,
  availableTargetBranches,
  onCancel,
  onConfirm,
}: CreatePullRequestDialogProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState(false);
  const [targetBranch, setTargetBranch] = useState(defaultTargetBranch);

  useEffect(() => {
    let cancelled = false;
    getPullRequestTemplate(repoPath)
      .then((template) => {
        if (cancelled) return;
        if (!template.trim()) return;
        // Only prefill if user hasn't typed anything yet.
        setDescription((existing) => (existing.trim().length > 0 ? existing : template));
      })
      .catch(() => {
        // Template loading is best-effort; dialog still works without one.
      });
    return () => {
      cancelled = true;
    };
  }, [repoPath]);

  const handleConfirm = () => {
    if (!title.trim()) {
      alert("PR title is required");
      return;
    }
    if (!targetBranch.trim()) {
      alert("Target branch is required");
      return;
    }
    onConfirm(targetBranch, title, description, draft);
  };

  return (
    <ModalOverlay onClose={onCancel}>
      <div className="modal modal-wide">
        <div className="modal-title">Create Pull Request</div>
        <label className="modal-label">
          From Branch
          <input
            type="text"
            value={currentBranch}
            disabled
            className="modal-input"
          />
        </label>
        <label className="modal-label">
          To Branch
          <select
            value={targetBranch}
            onChange={(e) => setTargetBranch(e.target.value)}
            className="modal-input"
          >
            {availableTargetBranches.map((branch) => (
              <option key={branch} value={branch}>
                {branch}
              </option>
            ))}
          </select>
        </label>
        <label className="modal-label">
          Title *
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="PR title"
            className="modal-input"
            autoFocus
          />
        </label>
        <label className="modal-label">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="PR description (optional)"
            className="modal-input"
            rows={6}
          />
        </label>
        <label className="modal-label" style={{ flexDirection: "row", alignItems: "center", gap: "6px" }}>
          <input
            type="checkbox"
            checked={draft}
            onChange={(e) => setDraft(e.target.checked)}
            style={{ margin: 0, width: "auto", height: "auto" }}
          />
          Mark as draft
        </label>
        <div className="modal-actions">
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button onClick={handleConfirm} className="btn-primary">
            Create PR
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
