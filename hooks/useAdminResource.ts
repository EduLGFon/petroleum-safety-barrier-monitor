// useAdminResource - shared loading/error/reload state for admin managers.
// Why it exists: every admin manager fetches a list on mount and exposes a
// reload() that sets loading/error; centralizing removes that boilerplate.
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

export interface AdminResource<T> {
  items: T[];
  setItems: (v: T[]) => void;
  loading: boolean;
  error: string;
  setError: (v: string) => void;
  reload: (signal?: AbortSignal) => Promise<void>;
}

export function useAdminResource<T>(
  loader: (signal?: AbortSignal) => Promise<T[]>,
): AdminResource<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Keep the latest loader in a ref so reload() has a stable identity even
  // when callers pass an inline loader (which would otherwise change every
  // render and re-trigger the mount effect in a request loop).
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  // Generation counter: only the latest reload may write state, so fast
  // successive reloads (or unmounted retry) never render stale data.
  const genRef = useRef(0);
  // Tracks unmount so late resolutions never call setState.
  const cancelledRef = useRef(false);
  // Current in-flight controller; aborted when a newer reload supersedes it.
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async (extSignal?: AbortSignal) => {
    const myGen = ++genRef.current;
    // Supersede the previous in-flight load.
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const signal = extSignal ?? ctrl.signal;
    try {
      if (cancelledRef.current || signal.aborted) return;
      setError("");
      setLoading(true);
      const list = await loaderRef.current(signal);
      // Drop superseded / cancelled / aborted results.
      if (myGen !== genRef.current) return;
      if (cancelledRef.current || signal.aborted) return;
      setItems(list);
    } catch (err) {
      if (myGen !== genRef.current) return;
      if (cancelledRef.current) return;
      if (
        (err instanceof DOMException && err.name === "AbortError") ||
        signal.aborted
      ) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      // Only the latest generation clears the spinner; aborted loads leave
      // state untouched so the superseding reload owns loading=true.
      if (myGen === genRef.current && !cancelledRef.current) {
        if (!signal.aborted) setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    void reload();
    return () => {
      cancelledRef.current = true;
      abortRef.current?.abort();
    };
  }, [reload]);

  return { items, setItems, loading, error, setError, reload };
}
