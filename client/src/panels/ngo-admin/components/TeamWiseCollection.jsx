import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Megaphone } from 'lucide-react';
import { getTeamWiseCollection, apiPost } from '../api/auth';
import { toast } from '../../../components/Toast';
import CollectionRaceBoard, { rupee } from '../../../components/CollectionRaceBoard';

// "1st" / "2nd" / "4th". Falls back to the bare number past 20, where "21st" is a
// guess about language rather than a derivation, and a wrong ordinal in a footnote
// about the viewer's own standing is worse than a plain digit.
const ORDINALS = ['th', 'st', 'nd', 'rd'];
const ordinal = (n) => (n >= 1 && n <= 20 ? `${n}${ORDINALS[n % 100] || 'th'}` : `${n}th`);

// The team-wise collection race. All of the rendering lives in the shared
// CollectionRaceBoard; this file only fetches and words the card.
//
// Two panels show this exact card: the NGO-admin dashboard (against the global
// filter) and the FRO panel's Collection Race popup. They differ only in where the
// numbers come from, so `fetcher` is a prop rather than a second component - a copy
// of this file would be a copy that quietly drifts from the admin card it is
// supposed to match.
//
// Fetches itself rather than receiving rows as props so that changing the global
// dashboard filter is a one-line dependency change here, and so the card cannot be
// rendered with a filter it did not actually query for.
export default function TeamWiseCollection({ from, to, ngoId, froId, periodLabel, fetcher }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [celebrating, setCelebrating] = useState(false);
  const [burstTick, setBurstTick] = useState(0);
  const celebratedRef = useRef(new Set());

  const fetchBoard = fetcher || getTeamWiseCollection;

  const filterKey = `${from || ''}|${to || ''}|${ngoId || 'all'}|${froId || ''}`;

  useEffect(() => {
    // The admin card is driven by the global dashboard filter, so rendering it
    // without that filter would be a bug - it cannot invent its own window. The FRO
    // popup has no filter at all and its endpoint defaults the range server-side, so
    // requiring from/to here would leave it permanently blank.
    if (!fetcher && (!from || !to)) return;
    const controller = new AbortController();
    setLoading(true);
    fetchBoard({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(ngoId && ngoId !== 'all' ? { ngo_id: ngoId } : {}),
      ...(froId ? { fro_id: froId } : {}),
    })
      .then((d) => { if (!controller.signal.aborted) { setData(d || null); setError(''); } })
      .catch((e) => { if (!controller.signal.aborted) { setData(null); setError(e.message || 'Team collection unavailable.'); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [fetchBoard, from, to, ngoId, froId]);

  const teams = useMemo(() => (Array.isArray(data?.teams) ? data.teams : []), [data]);
  const unassigned = data?.unassigned || { amount: 0, receipts: 0 };
  const total = Number(data?.total) || 0;

  const rows = useMemo(() => teams.map((t, i) => ({
    key: `${t.team}-${i}`,
    label: t.team,
    labelTitle: t.unrostered ? `${t.team} (not in the team roster)` : t.team,
    amount: Number(t.amount) || 0,
    share: Number(t.share) || 0,
    rank: i + 1,
    // Flagged by the server, which is where both the viewer's team and the board's
    // team names are already normalised - comparing them in the browser would mean
    // re-implementing the case/trim rules and could silently miss the highlight.
    isYou: !!t.is_you,
    muted: !!t.unrostered,
  })), [teams]);

  const leader = teams[0] || null;
  const runnerUp = teams[1] || null;
  const gap = leader && runnerUp ? (Number(leader.amount) || 0) - (Number(runnerUp.amount) || 0) : 0;

  const celebrate = useCallback(async () => {
    if (!leader || celebrating) return;
    const key = `${filterKey}|${leader.team}`;
    if (celebratedRef.current.has(key)) {
      toast(`${leader.team} was already congratulated for this filter.`, 'info');
      return;
    }
    setCelebrating(true);
    try {
      await apiPost('/notifications/fro-team-broadcast', { teams: [leader.team] });
      celebratedRef.current.add(key);
      setBurstTick((b) => b + 1);
      toast(`Congratulations sent to ${leader.team}!`, 'success');
    } catch (e) {
      toast(e.message || 'Could not send the congratulation.', 'error');
    } finally {
      setCelebrating(false);
    }
  }, [leader, celebrating, filterKey]);

  const headline = useMemo(() => {
    if (!leader || total <= 0) return 'No collections in this range yet — the first receipt starts the race.';
    if (!runnerUp || runnerUp.amount <= 0) return `${leader.team} is the only team on the board. Own it.`;
    if (gap === 0) return `${leader.team} and ${runnerUp.team} are neck and neck.`;
    return `${leader.team} leads ${runnerUp.team} by ${rupee(gap)} — the podium is still open.`;
  }, [leader, runnerUp, total, gap]);

  const activeFros = teams.reduce((s, t) => s + (Number(t.members) || 0), 0);
  const receipts = teams.reduce((s, t) => s + (Number(t.receipts) || 0), 0);

  const period = periodLabel || (from && to ? `${from} → ${to}` : 'Today');
  const scopeLabel = [period, ngoId && ngoId !== 'all' ? 'NGO filtered' : 'All NGOs', froId ? '1 telecaller' : 'All Telecallers']
    .filter(Boolean).join(' · ');

  const footLines = [
    `${teams.length} teams · ${activeFros} FROs · ${receipts} receipts`,
    // Where the viewer sits, stated as a fact rather than left to be inferred from
    // the outline. Silently absent when the viewer has no team on the board: "Your
    // team is not on this board" would be a worse thing to assert than to omit.
    (() => {
      const mine = teams.find((t) => t.is_you);
      if (!mine) return null;
      const place = teams.indexOf(mine) + 1;
      return `You are in ${mine.team} — ${ordinal(place)} of ${teams.length}`;
    })(),
    // No Team is deliberately not a lane on the race, so its money is footnoted
    // here instead - otherwise this card's total would read lower than the
    // Collection card beside it with nothing on screen explaining the difference.
    unassigned.amount > 0 ? `outside any team ${rupee(unassigned.amount)}` : null,
    Number(data?.unrostered_count) > 0 ? `${data.unrostered_count} unrostered` : null,
    leader?.top_fro && leader.amount > 0 ? `Top collector: ${leader.top_fro.name} ${rupee(leader.top_fro.amount)}` : null,
  ];

  return (
    <CollectionRaceBoard
      title="UCS Team-wise Collection"
      scopeLabel={scopeLabel}
      total={total}
      rows={rows}
      headline={headline}
      footLines={footLines}
      emptyText="No teams configured yet — add one in Accounts > Teams."
      loading={loading}
      error={error}
      errorText="Team collection unavailable."
      burstKey={`${filterKey}|${leader?.team || ''}|${total}|${burstTick}`}
      // Congratulating broadcasts to every FRO in the leading team, so it is an
      // admin action. The FRO popup renders the board read-only - an FRO tapping
      // this would message a whole team they do not manage.
      headerRight={fetcher ? null : (
        <button className="twc-celebrate" title={`Congratulate ${leader?.team || 'the leading team'}`}
          disabled={!leader || leader.amount <= 0 || celebrating} onClick={celebrate}>
          <Megaphone size={13} />
          {celebrating ? 'Sending…' : 'Celebrate'}
        </button>
      )}
    />
  );
}
