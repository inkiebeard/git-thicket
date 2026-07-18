import { useState } from "react";
import { ModalOverlay } from "./ModalOverlay";

interface CreatePullRequestDialogProps {
  currentBranch: string;
  targetBranch: string;
  onCancel: () => void;
  onConfirm: (title: string, description: string, draft: boolean) => void;
}

export function CreatePullRequestDialog({
  currentBranch,
  targetBranch,
  onCancel,
  onConfirm,
}: CreatePullRequestDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState(false);

  const handleConfirm = () => {
    if (!title.trim()) {
      alert("PR title is required");
      return;
    }
    onConfirm(title, description, draft);
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
          <input
            type="text"
            value={targetBranch}
            disabled
            className="modal-input"
          />
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
