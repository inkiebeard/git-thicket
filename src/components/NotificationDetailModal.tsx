import { useState } from "react";
import type { Toast } from "../store/repoStore";
import { ModalOverlay } from "./ModalOverlay";

interface NotificationDetailModalProps {
  toast: Toast;
  onClose: () => void;
}

export function NotificationDetailModal({ toast, onClose }: NotificationDetailModalProps) {
  const [copied, setCopied] = useState(false);
  const title = toast.kind === "success" ? `${toast.action} succeeded` : `${toast.action} failed`;

  async function copy() {
    await navigator.clipboard.writeText(toast.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal modal-wide">
        <div className="modal-title">{title}</div>
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