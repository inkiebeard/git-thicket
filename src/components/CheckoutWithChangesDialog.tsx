import { useState } from "react";
import { ModalOverlay } from "./ModalOverlay";

interface CheckoutWithChangesDialogProps {
  targetRefName: string;
  onStashAndCheckout: () => Promise<void>;
  onPrepareCommit: () => void;
  onCancel: () => void;
}

export function CheckoutWithChangesDialog({
  targetRefName,
  onStashAndCheckout,
  onPrepareCommit,
  onCancel,
}: CheckoutWithChangesDialogProps) {
  const [isStashing, setIsStashing] = useState(false);

  const handleStashAndCheckout = async () => {
    setIsStashing(true);
    try {
      await onStashAndCheckout();
    } finally {
      setIsStashing(false);
    }
  };

  return (
    <ModalOverlay onClose={onCancel}>
      <div className="modal">
        <div className="modal-title">Checkout "{targetRefName}"</div>
        <div className="modal-message">
          You have uncommitted changes. Choose how to proceed:
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel} disabled={isStashing}>
            Cancel
          </button>
          <button
            className="btn-secondary"
            onClick={() => {
              onPrepareCommit();
              onCancel();
            }}
            disabled={isStashing}
          >
            Commit now
          </button>
          <button
            className="btn-primary"
            onClick={handleStashAndCheckout}
            disabled={isStashing}
          >
            {isStashing ? "Stashing…" : "Stash & reapply"}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
