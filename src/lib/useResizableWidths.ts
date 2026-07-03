import { useEffect, useState } from "react";

const MIN_WIDTH = 160;

export function useResizableWidths(initial: number[], storageKey: string) {
  const [widths, setWidths] = useState<number[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (Array.isArray(stored) && stored.length === initial.length) return stored;
    } catch {
      /* ignore malformed storage */
    }
    return initial;
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(widths));
  }, [widths, storageKey]);

  function resize(index: number, deltaX: number) {
    setWidths((prev) => {
      const next = [...prev];
      next[index] = Math.max(MIN_WIDTH, next[index] + deltaX);
      return next;
    });
  }

  return { widths, resize };
}
