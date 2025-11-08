import { useState, useEffect, useCallback, useMemo } from 'react';

export interface DataLoaderOptions<T> {
  initialData?: T | null;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  dependencies?: any[];
  autoLoad?: boolean;
}

export function useDataLoader<T>(
  loadFn: () => Promise<T>,
  options: DataLoaderOptions<T> = {}
) {
  const {
    initialData = null,
    onSuccess,
    onError,
    dependencies = [],
    autoLoad = true
  } = options;

  const [data, setData] = useState<T | null>(initialData);
  const [loading, setLoading] = useState<boolean>(autoLoad);
  const [error, setError] = useState<string | null>(null);

  // Memoize dependencies to prevent unnecessary re-renders
  // Note: loadFn should be stable (useCallback in parent) to avoid infinite loops
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadFn();
      setData(result);
      onSuccess?.(result);
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Unknown error');
      setError(e.message);
      onError?.(e);
      return null;
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadFn, onSuccess, onError, dependencies]);

  useEffect(() => {
    if (autoLoad) {
      loadData();
    }
  }, [autoLoad, loadData]);

  const result = useMemo(() => ({
    data,
    loading,
    error,
    refetch: loadData,
    setData,
  }), [data, loading, error, loadData, setData]);

  return result;
}


