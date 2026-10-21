import { Toast } from "@phyllo/ui";
import { useCallback, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import styles from "./ToastHost.module.css";
import { DEFAULT_TOAST_DURATION_MS, MAX_VISIBLE_TOASTS, ToastContext } from "./toastContext";
import type { ToastApi, ToastInput } from "./toastContext";

interface Entry extends ToastInput {
  id: number;
}

export interface ToastProviderProps {
  children: ReactNode;
}

/**
 * Owns the app's toast queue (React state only, no stores) and renders it once, top right: newest on top, at most
 * three visible, the rest wait their turn. Each toast keeps the Toast molecule's `role="status"` / `role="alert"`.
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setEntries((list) => list.filter((entry) => entry.id !== id)), []);
  const push = useCallback((toast: ToastInput) => {
    const id = nextId.current++;
    setEntries((list) => [{ ...toast, id }, ...(toast.key === undefined ? list : list.filter((entry) => entry.key !== toast.key))]);
    return id;
  }, []);
  const api = useMemo<ToastApi>(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastHost entries={entries} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

interface ToastHostProps {
  entries: readonly Entry[];
  onDismiss(id: number): void;
}

function ToastHost({ entries, onDismiss }: ToastHostProps) {
  if (entries.length === 0) return null;
  return (
    <div className={styles["host"]} data-toast-host="">
      {entries.slice(0, MAX_VISIBLE_TOASTS).map((entry) => {
        const tone = entry.tone ?? "neutral";
        return (
          <Toast
            key={entry.id}
            title={entry.title}
            {...(entry.body ? { detail: entry.body } : {})}
            {...(entry.action ? { action: entry.action } : {})}
            tone={tone}
            duration={entry.duration ?? (tone === "error" ? 0 : DEFAULT_TOAST_DURATION_MS)}
            onDismiss={() => onDismiss(entry.id)}
          />
        );
      })}
    </div>
  );
}
