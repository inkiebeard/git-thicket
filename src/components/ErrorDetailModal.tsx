import { useState } from "react";
import type { Toast } from "../store/repoStore";
import { ModalOverlay } from "./ModalOverlay";

interface ErrorDetailModalProps {
  toast: Toast;
  onClose: () => void;
}

export function ErrorDetailModal({ toast, onClose }: ErrorDetailModalProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(toast.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal modal-wide">
        <div className="modal-title">{toast.action} failed</div>
        <pre className="modal-log">{toast.text}</pre>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
          <button className="btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
