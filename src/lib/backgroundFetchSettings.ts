const ENABLED_KEY = "thicket:backgroundFetchEnabled";
const INTERVAL_KEY = "thicket:backgroundFetchIntervalSec";

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
