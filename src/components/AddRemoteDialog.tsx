import { useState } from "react";

interface AddRemoteDialogProps {
  onConfirm: (name: string, url: string) => void;
  onCancel: () => void;
}

export function AddRemoteDialog({ onConfirm, onCancel }: AddRemoteDialogProps) {
  const [name, setName] = useState("origin");
  const [url, setUrl] = useState("");
  const trimmedName = name.trim();
  const trimmedUrl = url.trim();
  const canConfirm = trimmedName.length > 0 && trimmedUrl.length > 0;

  function submit() {
    if (canConfirm) onConfirm(trimmedName, trimmedUrl);
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Add remote</div>
        <label className="modal-label">
          Name
          <input
            className="modal-input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onCancel();
            }}
          />
        </label>
        <label className="modal-label">
          URL
          <input
            className="modal-input"
            placeholder="https://github.com/user/repo.git"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onCancel();
            }}
          />
        </label>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!canConfirm} onClick={submit}>
            Add remote
          </button>
        </div>
      </div>
    </div>
  );
}
