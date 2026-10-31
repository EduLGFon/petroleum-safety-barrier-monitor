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
  reload: () => Promise<void>;
}

export function useAdminResource<T>(
  loader: () => Promise<T[]>,
): AdminResource<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Keep the latest loader in a ref so reload() has a stable identity even
  // when callers pass an inline loader (which would otherwise change every
  // render and re-trigger the mount effect in a request loop).
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      const list = await loaderRef.current();
      setItems(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { items, setItems, loading, error, setError, reload };
}
