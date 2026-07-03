import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isGitRepo, openRepoDialog } from "../api/git";
import { useRepoStore } from "../store/repoStore";

const RECENT_KEY = "thicket:recentRepos";

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveRecent(path: string) {
  const existing = loadRecent().filter((p) => p !== path);
  const updated = [path, ...existing].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  return updated;
}

/** Lives at the end of the tab bar: a small "+" that opens a dropdown with
 * an "Open Repository…" browse action plus the recent-repo list, instead of
 * a permanent giant primary button taking up the top-level header.
 *
 * The dropdown is portaled to `document.body` and positioned `fixed` off
 * the button's own bounding rect — the tab bar sets `overflow-x: auto`,
 * which per the CSS spec also forces `overflow-y` to clip, so a plain
 * `position: absolute` child here would get visually trapped inside the tab
 * bar's box instead of floating above the rest of the app. */
export function AddRepoMenu() {
  const openRepo = useRepoStore((s) => s.openRepo);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [pickError, setPickError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  async function handleOpen(path: string) {
    setPickError(null);
    const valid = await isGitRepo(path);
    if (!valid) {
      setPickError(`Not a git repository: ${path}`);
      return;
    }
    setOpen(false);
    setRecent(saveRecent(path));
    await openRepo(path);
  }

  async function handleBrowse() {
    const path = await openRepoDialog();
    if (path) await handleOpen(path);
  }

  return (
    <div className="add-repo">
      <button
        ref={buttonRef}
        className="tab-add"
        onClick={() => setOpen((o) => !o)}
        aria-label="Open repository"
        title="Open repository"
      >
        +
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            className="dropdown-menu"
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, right: "auto" }}
          >
            <button className="dropdown-item dropdown-item-highlight" onClick={handleBrowse}>
              Open Repository…
            </button>
            {recent.length > 0 && (
              <>
                <div className="dropdown-separator" />
                <div className="dropdown-label">Recent</div>
                {recent.map((p) => (
                  <button key={p} className="dropdown-item" title={p} onClick={() => handleOpen(p)}>
                    {p}
                  </button>
                ))}
              </>
            )}
          </div>,
          document.body,
        )}
      {pickError &&
        createPortal(
          <div
            className="repo-error repo-error-floating"
            style={pos ? { position: "fixed", top: pos.top, left: pos.left } : undefined}
          >
            {pickError}
          </div>,
          document.body,
        )}
    </div>
  );
}
