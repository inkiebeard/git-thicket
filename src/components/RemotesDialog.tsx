import { useState } from "react";
import { useActiveTab, useRepoStore } from "../store/repoStore";
import { AddRemoteDialog } from "./AddRemoteDialog";
import { ModalOverlay } from "./ModalOverlay";

interface RemotesDialogProps {
  onClose: () => void;
}

export function RemotesDialog({ onClose }: RemotesDialogProps) {
  const remotes = useActiveTab()?.remotes ?? [];
  const doAddRemote = useRepoStore((s) => s.doAddRemote);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal modal-wide">
        <div className="modal-title">Remotes</div>
        <div className="branch-list">
          {remotes.map((r) => (
            <div className="branch-row" key={r.name}>
              <div className="branch-row-name">
                <span>{r.name}</span>
              </div>
              <span className="branch-row-upstream">{r.url}</span>
            </div>
          ))}
          {remotes.length === 0 && (
            <div className="branch-list-empty">No remotes configured</div>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => setAddOpen(true)}>
            Add remote…
          </button>
          <button className="btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      {addOpen && (
        <AddRemoteDialog
          onCancel={() => setAddOpen(false)}
          onConfirm={(name, url) => {
            doAddRemote(name, url);
            setAddOpen(false);
          }}
        />
      )}
    </ModalOverlay>
  );
}
