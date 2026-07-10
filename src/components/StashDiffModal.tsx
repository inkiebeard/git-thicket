import { ModalOverlay } from "./ModalOverlay";

interface StashDiffModalProps {
  title: string;
  diff: string;
  onClose: () => void;
}

export function StashDiffModal({ title, diff, onClose }: StashDiffModalProps) {
  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal modal-wide">
        <div className="modal-title">{title}</div>
        <pre className="modal-log">{diff || "No changes"}</pre>
        <div className="modal-actions">
          <button className="btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
