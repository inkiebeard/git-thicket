import { useState } from "react";
import {
  MIN_BACKGROUND_FETCH_INTERVAL_SEC,
  getBackgroundFetchEnabled,
  getBackgroundFetchIntervalSec,
  setBackgroundFetchEnabled,
  setBackgroundFetchIntervalSec,
} from "../lib/backgroundFetchSettings";
import { ConfirmDialog } from "./ConfirmDialog";
import { ModalOverlay } from "./ModalOverlay";

interface SettingsDialogProps {
  onClose: () => void;
}

const RECENT_REPOS_KEY = "thicket:recentRepos";

/** Keys/prefixes that make up "layout": pane and column sizing the user may
 * have dragged into an awkward state. Deliberately excludes session state
 * (open tabs, active tab, recent repos) — those aren't layout. */
const LAYOUT_KEY_PREFIXES = [
  "thicket:paneWidths",
  "thicket:terminalHeight",
  "thicket:commitColOrder",
  "thicket:commitColWidths2:",
  "thicket:commitRefsColWidth:",
];

function countRecentRepos(): number {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_REPOS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function clearLayoutKeys() {
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && LAYOUT_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      toRemove.push(key);
    }
  }
  toRemove.forEach((key) => localStorage.removeItem(key));
}

export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const [recentCount, setRecentCount] = useState(countRecentRepos);
  const [confirmResetLayout, setConfirmResetLayout] = useState(false);
  const [fetchEnabled, setFetchEnabled] = useState(getBackgroundFetchEnabled);
  const [fetchIntervalInput, setFetchIntervalInput] = useState(() =>
    String(getBackgroundFetchIntervalSec()),
  );

  function clearRecentRepos() {
    localStorage.removeItem(RECENT_REPOS_KEY);
    setRecentCount(0);
  }

  function updateFetchEnabled(value: boolean) {
    setFetchEnabled(value);
    setBackgroundFetchEnabled(value);
  }

  function commitFetchInterval() {
    const parsed = Number(fetchIntervalInput);
    const seconds = Number.isFinite(parsed)
      ? Math.max(MIN_BACKGROUND_FETCH_INTERVAL_SEC, Math.round(parsed))
      : getBackgroundFetchIntervalSec();
    setFetchIntervalInput(String(seconds));
    setBackgroundFetchIntervalSec(seconds);
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal modal-wide">
        <div className="modal-title">Settings</div>

        <div className="settings-section">
          <div className="settings-section-title">Background sync</div>
          <label className="settings-row">
            <span>Automatically fetch from remotes in the background</span>
            <input
              type="checkbox"
              checked={fetchEnabled}
              onChange={(e) => updateFetchEnabled(e.target.checked)}
            />
          </label>
          <label className="settings-row">
            <span>
              Refresh interval (seconds, min {MIN_BACKGROUND_FETCH_INTERVAL_SEC}) — also applies
              to picking up local commits/changes when this repo has no remote, or fetch is off
            </span>
            <input
              className="modal-input settings-number-input"
              type="number"
              min={MIN_BACKGROUND_FETCH_INTERVAL_SEC}
              value={fetchIntervalInput}
              onChange={(e) => setFetchIntervalInput(e.target.value)}
              onBlur={commitFetchInterval}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitFetchInterval();
              }}
            />
          </label>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Recent repositories</div>
          <div className="settings-row">
            <span>{recentCount} saved</span>
            <button
              className="btn-secondary"
              disabled={recentCount === 0}
              onClick={clearRecentRepos}
            >
              Clear recent repositories
            </button>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Layout</div>
          <div className="settings-row">
            <span>Pane widths, column widths/order, and terminal height</span>
            <button className="btn-secondary" onClick={() => setConfirmResetLayout(true)}>
              Reset saved layout…
            </button>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {confirmResetLayout && (
        <ConfirmDialog
          title="Reset saved layout"
          message="This clears saved pane widths, commit graph column widths/order, and the terminal panel height, then reloads the window so everything falls back to its default size. Your repos, tabs, and git data are unaffected."
          confirmLabel="Reset and reload"
          onCancel={() => setConfirmResetLayout(false)}
          onConfirm={() => {
            clearLayoutKeys();
            window.location.reload();
          }}
        />
      )}
    </ModalOverlay>
  );
}
