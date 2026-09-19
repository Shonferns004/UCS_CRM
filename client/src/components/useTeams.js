import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../api/auth';

const DEFAULT_TEAMS = ['UFS1', 'UFS2', 'UFS3', 'UFS4'];
let cache = null;
let inflight = null;

// Shared team list from /api/teams (settings table). Falls back to UFS1-UFS4
// while loading. Module-level cache keeps the two panels in sync without a
// provider.
export function useTeams() {
  const [teams, setTeams] = useState(cache ? cache.teams : DEFAULT_TEAMS);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (cache) { setTeams(cache.teams); return; }
    if (!inflight) {
      inflight = api('/teams', { _prefix: 'ucs' })
        .then(res => { cache = { teams: Array.isArray(res?.teams) ? res.teams.filter(Boolean) : DEFAULT_TEAMS }; return cache; })
        .catch(() => { cache = { teams: DEFAULT_TEAMS }; return cache; })
        .finally(() => { inflight = null; });
    }
    inflight.then(c => { if (mounted.current) setTeams(c.teams); });
    return () => { mounted.current = false; };
  }, []);

  const saveTeams = useCallback(async (list) => {
    const res = await api('/teams', { method: 'PUT', body: JSON.stringify({ teams: list }), _prefix: 'ucs' });
    const next = Array.isArray(res?.teams) ? res.teams.filter(Boolean) : list.filter(Boolean);
    cache = { teams: next };
    setTeams(next);
    return next;
  }, []);

  return { teams, saveTeams };
}