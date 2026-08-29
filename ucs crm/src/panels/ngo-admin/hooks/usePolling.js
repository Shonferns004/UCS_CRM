import { useState, useEffect, useCallback, useRef } from 'react';

export function usePolling(fetchFn, intervalMs = 10000, options = {}) {
  const {
    enabled = true,
    immediate = true,
    onError,
    onSuccess,
    deps = [],
  } = options;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRef = useRef(fetchFn);
  const intervalRef = useRef(null);
  const cancelledRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    fetchRef.current = fetchFn;
  }, [fetchFn]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const executeFetch = useCallback(async () => {
    if (!enabled || cancelledRef.current || !mountedRef.current) return;
    
    try {
      const result = await fetchRef.current();
      if (mountedRef.current) {
        setData(result);
        setError(null);
        onSuccess?.(result);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err);
        onError?.(err);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [enabled, onError, onSuccess]);

  const refetch = useCallback(() => {
    if (!cancelledRef.current && mountedRef.current) {
      setLoading(true);
      executeFetch();
    }
  }, [executeFetch]);

  useEffect(() => {
    cancelledRef.current = false;
    
    let initialFetchDone = !immediate;
    
    const tick = async () => {
      if (!cancelledRef.current && mountedRef.current) {
        if (!initialFetchDone) {
          initialFetchDone = true;
          await executeFetch();
        } else {
          await executeFetch();
        }
      }
    };

    // Initial fetch
    if (immediate && enabled) {
      executeFetch();
    }

    // Set up polling interval
    if (enabled && intervalMs > 0) {
      const intervalId = setInterval(() => {
        tick();
      }, intervalMs);
      
      return () => clearInterval(intervalId);
    }
  }, [enabled, intervalMs, executeFetch, immediate]);

  // Cleanup on unmount or disabled
  useEffect(() => {
    if (!enabled) {
      cancelledRef.current = true;
    }
    return () => {
      cancelledRef.current = true;
      mountedRef.current = false;
    };
  }, [enabled]);

  return { data, loading, error, refetch };
}

export default usePolling;