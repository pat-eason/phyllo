import { useRef, useState } from "react";

export interface GuardedAction {
  /** Runs `action` unless one is already in flight. Resolves `true` when it finished without an error message. */
  run: (action: () => Promise<string | null>) => Promise<boolean>;
  pending: boolean;
  error: string | null;
  clearError: () => void;
}

/**
 * One async action at a time. The in-flight flag is a ref, set before the first await, so a fast double click can't
 * start two writes; `pending` only drives the visual state. `action` resolves with an error message, or null on success.
 */
export function useGuardedAction(): GuardedAction {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<string | null>): Promise<boolean> {
    if (inFlight.current) return false;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const message = await action();
      if (message !== null) {
        setError(message);
        return false;
      }
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return false;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return { run, pending, error, clearError: () => setError(null) };
}
