import { openUrl } from "@tauri-apps/plugin-opener";
import { ModalOverlay } from "./ModalOverlay";

interface PermissionsModalProps {
  onClose: () => void;
}

// Deep-links straight to the Full Disk Access pane instead of just
// Privacy & Security's top level, so there's one less click to find it.
const FULL_DISK_ACCESS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles";

export function PermissionsModal({ onClose }: PermissionsModalProps) {
  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal modal-wide">
        <div className="modal-title">Grant folder access</div>
        <div className="modal-message">
          Thicket reads your repositories by running <code>git</code> directly, and macOS blocks
          that outside a few default folders (Desktop, Documents, Downloads) unless the app has
          Full Disk Access — picking a folder from the open dialog isn't enough on its own.
          Without it, opening repos elsewhere on your Mac will fail with a permission error.
          <br />
          <br />
          Open <strong>System Settings → Privacy &amp; Security → Full Disk Access</strong>,
          enable Thicket, then restart the app.
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Skip for now
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              openUrl(FULL_DISK_ACCESS_URL).catch(() => {});
              onClose();
            }}
          >
            Open System Settings
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
