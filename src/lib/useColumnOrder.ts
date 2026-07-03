import { useEffect, useState } from "react";

/** Persisted left-to-right ordering for a fixed set of reorderable columns. */
export function useColumnOrder<T extends string>(initial: T[], storageKey: string) {
  const [order, setOrder] = useState<T[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (
        Array.isArray(stored) &&
        stored.length === initial.length &&
        initial.every((k) => stored.includes(k))
      ) {
        return stored as T[];
      }
    } catch {
      /* ignore malformed storage */
    }
    return initial;
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(order));
  }, [order, storageKey]);

  function moveColumn(from: number, to: number) {
    if (from === to) return;
    setOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  return { order, moveColumn };
}
