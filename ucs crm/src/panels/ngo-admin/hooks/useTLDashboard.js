import { useState, useEffect, useCallback, useRef } from 'react';
import { apiGet } from '../api/auth';

export function useTLDashboard(selectedNgoId, accessibleNgos, dateRange) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [polling, setPolling] = useState(true);
  const intervalRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedNgoId !== 'all') params.set('ngo_id', selectedNgoId);
      if (dateRange?.from) params.set('from', dateRange.from);
      if (dateRange?.to) params.set('to', dateRange.to);
      const res = await apiGet(`/ngo-admin/tl-dashboard?${params}`, { timeout: 180000 });
      setData(res);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [selectedNgoId, dateRange]);

  useEffect(() => {
    let cancelled = false;
    
    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedNgoId !== 'all') params.set('ngo_id', selectedNgoId);
        if (dateRange?.from) params.set('from', dateRange.from);
        if (dateRange?.to) params.set('to', dateRange.to);
        const res = await apiGet(`/ngo-admin/tl-dashboard?${params}`, { timeout: 180000 });
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    // Poll every 30 seconds
    if (polling) {
      intervalRef.current = setInterval(load, 30000);
    }

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [selectedNgoId, polling]);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  const setPollingEnabled = useCallback((enabled) => {
    setPolling(enabled);
    if (enabled && !intervalRef.current) {
      intervalRef.current = setInterval(fetchAll, 30000);
    } else if (!enabled && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [fetchAll]);

  return { data, loading, error, refresh, polling, setPollingEnabled };
}

export function useDonationFunnel(selectedNgoId) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const ngoParam = selectedNgoId !== 'all' ? `?ngo_id=${selectedNgoId}` : '';
    setLoading(true);
    apiGet(`/ngo-admin/dashboard/donation-funnel${ngoParam}`)
      .then(res => { if (!cancelled) setData(res); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedNgoId]);

  return { data, loading, error };
}

export function useHourlyPerformance(selectedNgoId, date) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (selectedNgoId !== 'all') params.set('ngo_id', selectedNgoId);
    if (date) params.set('date', date);
    setLoading(true);
    apiGet(`/ngo-admin/dashboard/hourly-performance?${params}`)
      .then(res => { if (!cancelled) setData(res); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedNgoId, date]);

  return { data, loading, error };
}

export function useFollowups(selectedNgoId, bucket) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (selectedNgoId !== 'all') params.set('ngo_id', selectedNgoId);
    if (bucket) params.set('bucket', bucket);
    setLoading(true);
    apiGet(`/ngo-admin/followups?${params}`)
      .then(res => { if (!cancelled) setData(res); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedNgoId, bucket]);

  return { data, loading, error };
}

export function useAssignedData(selectedNgoId, period, customFrom, customTo) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (selectedNgoId !== 'all') params.set('ngo_id', selectedNgoId);
    if (period) params.set('period', period);
    if (customFrom) params.set('from', customFrom);
    if (customTo) params.set('to', customTo);
    setLoading(true);
    apiGet(`/ngo-admin/assigned-data?${params}`)
      .then(res => { if (!cancelled) setData(res); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedNgoId, period, customFrom, customTo]);

  return { data, loading, error };
}

export function useTopPerformers(selectedNgoId) {
  const [data, setData] = useState({ amount: [], donors: [], conversion: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const ngoParam = selectedNgoId !== 'all' ? `?ngo_id=${selectedNgoId}` : '';
    setLoading(true);
    apiGet(`/ngo-admin/dashboard/top-performers${ngoParam}`)
      .then(res => { if (!cancelled) setData(res); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedNgoId]);

  return { data, loading, error };
}

export function useBottomPerformers(selectedNgoId) {
  const [data, setData] = useState({ target: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const ngoParam = selectedNgoId !== 'all' ? `?ngo_id=${selectedNgoId}` : '';
    setLoading(true);
    apiGet(`/ngo-admin/dashboard/bottom-performers${ngoParam}`)
      .then(res => { if (!cancelled) setData(res); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedNgoId]);

  return { data, loading, error };
}

export function useIdleAlerts(selectedNgoId) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const fetch = useCallback(async () => {
    try {
      const ngoParam = selectedNgoId !== 'all' ? `?ngo_id=${selectedNgoId}` : '';
      const res = await apiGet(`/ngo-admin/dashboard/idle-alerts${ngoParam}`);
      setData(res);
    } catch (err) {
      setError(err.message);
    }
  }, [selectedNgoId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch().finally(() => { if (!cancelled) setLoading(false); });

    intervalRef.current = setInterval(() => {
      if (!cancelled) fetch();
    }, 30000);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetch]);

  return { data, loading, error };
}

export function useCombinedTLDashboard(selectedNgoId, accessibleNgos, dateRange) {
  const dashboard = useTLDashboard(selectedNgoId, accessibleNgos, dateRange);
  const funnel = useDonationFunnel(selectedNgoId);
  const hourly = useHourlyPerformance(selectedNgoId);
  const followups = useFollowups(selectedNgoId);
  const assigned = useAssignedData(selectedNgoId);
  const top = useTopPerformers(selectedNgoId);
  const bottom = useBottomPerformers(selectedNgoId);
  const idle = useIdleAlerts(selectedNgoId);

  const loading = dashboard.loading || funnel.loading || hourly.loading || 
                  followups.loading || assigned.loading || top.loading || 
                  bottom.loading || idle.loading;

  return {
    dashboard: dashboard.data,
    funnel: funnel.data,
    hourly: hourly.data,
    followups: followups.data,
    assigned: assigned.data,
    top: top.data,
    bottom: bottom.data,
    idle: idle.data,
    loading,
    error: dashboard.error || funnel.error || hourly.error || followups.error || assigned.error || top.error || bottom.error || idle.error,
    refresh: dashboard.refresh,
  };
}

export default useTLDashboard;