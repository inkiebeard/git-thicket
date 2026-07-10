/** Best-effort webview UA sniff — Tauri doesn't need a full OS-detection
 * plugin just to gate a one-time macOS-only permissions nudge. */
export function isMacOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Macintosh|Mac OS X/i.test(navigator.userAgent);
}
