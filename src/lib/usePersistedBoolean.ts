import { useEffect, useState } from "react";

export function usePersistedBoolean(initial: boolean, storageKey: string) {
  const [value, setValue] = useState<boolean>(() => {
    const stored = localStorage.getItem(storageKey);
    return stored === null ? initial : stored === "true";
  });

  useEffect(() => {
    localStorage.setItem(storageKey, String(value));
  }, [value, storageKey]);

  return [value, setValue] as const;
}
