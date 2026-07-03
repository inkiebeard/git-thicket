import { useRef, type MouseEvent, type ReactNode } from "react";

interface ModalOverlayProps {
  onClose: () => void;
  children: ReactNode;
}

/**
 * Backdrop for modal dialogs. Closes only when *both* mousedown and mouseup
 * land directly on the backdrop itself — a plain `onClick` on the overlay
 * also fires when a text-selection drag starts inside the dialog (e.g.
 * selecting error log text) and the mouse happens to be released past the
 * dialog's edge, incorrectly closing it mid-selection.
 */
export function ModalOverlay({ onClose, children }: ModalOverlayProps) {
  const downOnBackdrop = useRef(false);

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e: MouseEvent) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e: MouseEvent) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
        downOnBackdrop.current = false;
      }}
    >
      {children}
    </div>
  );
}
