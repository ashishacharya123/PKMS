import { useState, useEffect, useCallback, useMemo } from 'react';

export interface DataLoaderOptions<T> {
  initialData?: T | null;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  dependencies?: any[];
  autoLoad?: boolean;
  keepDataWhileLoading?: boolean; // NEW: Prevent flickering by keeping data visible during refresh
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
    autoLoad = true,
    keepDataWhileLoading = true // DEFAULT: true to prevent flickering
  } = options;

  const [data, setData] = useState<T | null>(initialData);
  const [loading, setLoading] = useState<boolean>(autoLoad);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false); // NEW: Track refresh state
  const [error, setError] = useState<string | null>(null);

  // Stringify dependencies for stable comparison
  // This ensures loadData only changes when dependency VALUES change, not array reference
  const depsKey = useMemo(() => JSON.stringify(dependencies), [dependencies]);

  // Memoize hasData boolean to prevent infinite loops
  // Only changes when data transitions between null/non-null, not on every data update
  const hasData = useMemo(() => data !== null, [data]);

  // Memoize dependencies to prevent unnecessary re-renders
  // Note: loadFn should be stable (useCallback in parent) to avoid infinite loops
  // Note: onSuccess and onError should be wrapped in useCallback in parent component
  const loadData = useCallback(async (isManualRefresh = false) => {
    // If keepDataWhileLoading is true and we have data, show refresh state instead of full loading
    if (keepDataWhileLoading && hasData && isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
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
      setIsRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadFn, depsKey, hasData, keepDataWhileLoading]);

  useEffect(() => {
    if (autoLoad) {
      loadData(false);
    }
  }, [autoLoad, loadData]);

  // Wrapper for manual refresh that sets the isManualRefresh flag
  const refetch = useCallback(() => loadData(true), [loadData]);

  const result = useMemo(() => ({
    data,
    loading: loading || isRefreshing, // Show loading if either state is true
    isRefreshing, // NEW: Expose refresh state separately for UX
    error,
    refetch, // Use wrapper instead of loadData directly
    setData,
  }), [data, loading, isRefreshing, error, refetch, setData]);

  return result;
}


