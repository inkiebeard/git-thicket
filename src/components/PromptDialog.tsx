import { useState } from "react";
import { ModalOverlay } from "./ModalOverlay";

interface PromptDialogProps {
  title: string;
  label: string;
  confirmLabel: string;
  initialValue?: string;
  /** Autocomplete suggestions offered via a native <datalist>. */
  suggestions?: string[];
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({
  title,
  label,
  confirmLabel,
  initialValue = "",
  suggestions,
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const trimmed = value.trim();
  const listId = suggestions ? "prompt-dialog-suggestions" : undefined;

  return (
    <ModalOverlay onClose={onCancel}>
      <div className="modal">
        <div className="modal-title">{title}</div>
        <label className="modal-label">
          {label}
          <input
            className="modal-input"
            autoFocus
            list={listId}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && trimmed) onConfirm(trimmed);
              if (e.key === "Escape") onCancel();
            }}
          />
          {suggestions && (
            <datalist id={listId}>
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
        </label>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={!trimmed}
            onClick={() => onConfirm(trimmed)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
