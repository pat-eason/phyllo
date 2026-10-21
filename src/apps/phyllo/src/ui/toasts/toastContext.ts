import { createContext, useContext } from "react";

export type ToastTone = "neutral" | "error";

export interface ToastInput {
  title: string;
  /** Second line (the Toast molecule's `detail`). */
  body?: string;
  /** Single action, e.g. "Reveal". */
  action?: { label: string; onClick: () => void };
  /** `error` announces as an alert and stays until dismissed. Default `neutral`. */
  tone?: ToastTone;
  /** Auto-dismiss delay in ms; `0` = sticky. Default 6000 for neutral toasts, sticky for errors. */
  duration?: number;
  /** Re-pushing a toast with the same key replaces the one in the queue instead of stacking a duplicate. */
  key?: string;
}

export interface ToastApi {
  /** Queues a toast; returns its id. */
  push(toast: ToastInput): number;
  dismiss(id: number): void;
}

export const DEFAULT_TOAST_DURATION_MS = 6000;
/** Toasts on screen at once; more wait (newest first) until one is dismissed. */
export const MAX_VISIBLE_TOASTS = 3;

export const ToastContext = createContext<ToastApi | null>(null);

const UNMOUNTED: ToastApi = {
  push(toast) {
    console.warn("[phyllo] toast dropped (no <ToastProvider>):", toast.title);
    return 0;
  },
  dismiss() {},
};

/** `push` / `dismiss` for the app-level toast queue. Outside a `<ToastProvider>` toasts are logged and dropped. */
export function useToasts(): ToastApi {
  return useContext(ToastContext) ?? UNMOUNTED;
}
