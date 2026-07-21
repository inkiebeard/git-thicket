const ENABLED_KEY = "thicket:backgroundFetchEnabled";
const INTERVAL_KEY = "thicket:backgroundFetchIntervalSec";
const FILE_WATCH_KEY = "thicket:fileWatchEnabled";

export const DEFAULT_BACKGROUND_FETCH_INTERVAL_SEC = 30;
export const MIN_BACKGROUND_FETCH_INTERVAL_SEC = 5;

export function getBackgroundFetchEnabled(): boolean {
  return localStorage.getItem(ENABLED_KEY) !== "false";
}

export function setBackgroundFetchEnabled(value: boolean) {
  localStorage.setItem(ENABLED_KEY, String(value));
}

export function getBackgroundFetchIntervalSec(): number {
  const raw = Number(localStorage.getItem(INTERVAL_KEY));
  return Number.isFinite(raw) && raw >= MIN_BACKGROUND_FETCH_INTERVAL_SEC
    ? raw
    : DEFAULT_BACKGROUND_FETCH_INTERVAL_SEC;
}

export function setBackgroundFetchIntervalSec(seconds: number) {
  localStorage.setItem(INTERVAL_KEY, String(seconds));
}

// Separate from background fetch: this gates the OS-level filesystem
// watcher on the active repo (see watch_repo in the Rust backend), not
// polling. Exists mainly as an escape hatch — e.g. to isolate whether the
// watcher itself is responsible for a platform-specific quirk (macOS TCC
// permission prompts firing on watch setup) by turning it off without a
// rebuild — but is also a reasonable thing for a user to disable outright.
export function getFileWatchEnabled(): boolean {
  return localStorage.getItem(FILE_WATCH_KEY) !== "false";
}

export function setFileWatchEnabled(value: boolean) {
  localStorage.setItem(FILE_WATCH_KEY, String(value));
}
