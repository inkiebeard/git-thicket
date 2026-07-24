import { useState } from "react";
import type { Toast } from "../store/repoStore";
import { ErrorDetailModal } from "./ErrorDetailModal";
import "./ToastContainer.css";

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (toastId: number) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  const [expandedToastId, setExpandedToastId] = useState<number | null>(null);
  const expandedToast = toasts.find((t) => t.id === expandedToastId);

  return (
    <>
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.kind}`}>
            <div className="toast-content" onClick={() => setExpandedToastId(toast.id)}>
              <div className="toast-title">{toast.action}</div>
              <div className="toast-message">{toast.text}</div>
            </div>
            <button
              className="toast-close"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {expandedToast && (
        <ErrorDetailModal toast={expandedToast} onClose={() => setExpandedToastId(null)} />
      )}
    </>
  );
}
