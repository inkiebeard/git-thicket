import { useEffect, useState } from "react";

const MIN_WIDTH = 50;

/** Like useResizableWidths, but keyed by column identity instead of array
 * position — so a resized width sticks to "Message" even after the column
 * gets dragged to a different spot, instead of to whatever now sits at that
 * index. */
export function useColumnWidths<K extends string>(
  initial: Record<K, number>,
  storageKey: string,
) {
  const [widths, setWidths] = useState<Record<K, number>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (stored && typeof stored === "object") {
        return { ...initial, ...stored };
      }
    } catch {
      /* ignore malformed storage */
    }
    return initial;
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(widths));
  }, [widths, storageKey]);

  function resize(key: K, deltaX: number) {
    setWidths((prev) => ({
      ...prev,
      [key]: Math.max(MIN_WIDTH, prev[key] + deltaX),
    }));
  }

  function setWidth(key: K, value: number) {
    setWidths((prev) => ({
      ...prev,
      [key]: Math.max(MIN_WIDTH, value),
    }));
  }

  return { widths, resize, setWidth };
}
