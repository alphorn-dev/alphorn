"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// Same-tab writes don't fire "storage", so writers notify subscribers directly.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * JSON value persisted in localStorage, per viewer. Renders `fallback` on the
 * server and the first client pass, so hydration never mismatches.
 */
export function useLocalStorage<T>(key: string, fallback: T): [T, (value: T) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );

  const value = useMemo(() => {
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
    // fallback is a default; only the stored string drives re-parsing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  const setValue = useCallback(
    (next: T) => {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Private mode / quota: the preference just isn't remembered.
      }
      listeners.forEach((l) => l());
    },
    [key],
  );

  return [value, setValue];
}
