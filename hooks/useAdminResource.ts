// useAdminResource - shared loading/error/reload state for admin managers.
// Why it exists: every admin manager fetches a list on mount and exposes a
// reload() that sets loading/error; centralizing removes that boilerplate.
import { useCallback, useEffect, useState } from "preact/hooks";

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

  const reload = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      const list = await loader();
      setItems(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [loader]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { items, setItems, loading, error, setError, reload };
}