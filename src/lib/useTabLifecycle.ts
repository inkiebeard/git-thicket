import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  watchRepo,
  unwatchRepo,
} from "../api/git";
import { getFileWatchEnabled } from "./backgroundFetchSettings";
import { useRepoStore } from "../store/repoStore";

/**
 * Manages the lifecycle of a single tab: loading initial data when it becomes
 * active, setting up file watchers, and cleaning up on unmount.
 *
 * This ensures that:
 * 1. Tab data loads when it first becomes active (via store's loadTabDataFor)
 * 2. File watcher is set up once data is loaded
 * 3. Watchers are cleaned up when tab becomes inactive
 */
export function useTabLifecycle(repoPath: string | null, isActive: boolean) {
  const loadTabDataFor = useRepoStore((s) => s.loadTabDataFor);
  const loadWorkingStatusFor = useRepoStore((s) => s.loadWorkingStatusFor);

  useEffect(() => {
    if (!repoPath || !isActive) return;

    let cancelled = false;
    let unlistenRepoChanged: (() => void) | null = null;

    (async () => {
      try {
        // Load initial data
        await loadTabDataFor(repoPath);
        if (cancelled) return;

        // Set up watcher
        if (getFileWatchEnabled()) {
          try {
            await watchRepo(repoPath);
            // Listen for repo-changed events
            const unlisten = await listen<string>("repo-changed", async (event) => {
              if (event.payload === repoPath && !cancelled) {
                // Refresh working status on file change
                await loadWorkingStatusFor(repoPath);
              }
            });
            if (!cancelled) unlistenRepoChanged = unlisten;
          } catch (e) {
            console.warn(`[useTabLifecycle] watcher setup failed for ${repoPath}:`, e);
          }
        }
      } catch (e) {
        if (!cancelled) {
          console.warn(`[useTabLifecycle] initial load failed for ${repoPath}:`, e);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (unlistenRepoChanged) unlistenRepoChanged();
      unwatchRepo().catch((err: Error) => console.warn(`[useTabLifecycle] unwatchRepo failed:`, err));
    };
  }, [repoPath, isActive, loadTabDataFor, loadWorkingStatusFor]);
}
