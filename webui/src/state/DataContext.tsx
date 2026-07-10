import {
  createContext, useContext, useEffect, useState, useCallback, type ReactNode,
} from 'react';
import { loadData } from '../lib/data';
import { buildModel, type Model } from '../lib/model';
import { hasCredentials } from '../lib/supabase';

interface DataState {
  model: Model | null;
  loading: boolean;
  error: string | null;
  /** Gọi sau khi upload/rollback để dashboard cập nhật */
  reload: () => void;
}

const Ctx = createContext<DataState>({
  model: null, loading: true, error: null, reload: () => {},
});

export function DataProvider({ children }: { children: ReactNode }) {
  const [model, setModel] = useState<Model | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!hasCredentials) {
      setError(
        'Thiếu cấu hình Supabase. Set VITE_SUPABASE_URL và VITE_SUPABASE_KEY ' +
          '(local: tự đọc từ bi-case-study/.env — kiểm tra file này tồn tại).'
      );
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadData()
      .then((bundle) => {
        if (!cancelled) setModel(buildModel(bundle));
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return (
    <Ctx.Provider value={{ model, loading, error, reload }}>{children}</Ctx.Provider>
  );
}

export const useData = () => useContext(Ctx);
