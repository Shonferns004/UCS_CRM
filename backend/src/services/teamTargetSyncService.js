// Team monthly targets that are the SUM of the team's members' individual
// monthly targets.
//
// WHY THIS EXISTS. `fro_monthly_targets` already holds one target per FRO (set by
// HR / the NGO board, with the auto + carried-forward rules in
// services/froMonthlyTarget.js). The team-wise plan in Accounts > Reports was a
// separate, hand-typed number in the `team_monthly_targets` setting, so the two
// could disagree without anyone noticing: a team could "have" a 5,00,000 target
// while the six people in it held 4,20,000 between them.
//
// THE RULE. For a team in AUTO mode the target is exactly the sum of its members'
// effective individual targets. MANUAL keeps a typed override so Accounts can
// still set a stretch number; the editor shows the drift between the two.
//
// STORAGE. The setting keeps its original flat shape -
//
//   { months: { '2026-11': { UFS1: 450000 } } }
//
// because four other readers already consume it that way (teamCollectionService's
// board, the NGO-admin dashboard card, Accounts > Reports, the legacy migration in
// normalizeTeamTargetMonths). Modes and sync metadata are ADDITIVE keys:
//
//   { months, modes: { '2026-11': { UFS1: 'auto' } }, sync: { '2026-11': {...} } }
//
// A month written before this feature has no `modes` entry. It is treated as
// MANUAL when it already carries a positive number (respect the number somebody
// typed) and AUTO otherwise (nothing to preserve, so start syncing). Old readers
// that only see `months` keep working unchanged.

import db from '../config/db.js';
import { getSetting, upsertSetting } from '../models/settingsModel.js';
import { getActiveSalaryByWorkers } from '../models/salaryModel.js';
import { getTargetsForWorkersMonth, getLatestTargetsBeforeMonthForWorkers } from '../models/froTargetModel.js';
import { resolveMonthlyTarget } from './froMonthlyTarget.js';
import { getTeamRoster, invalidateTeamTargetCache, normalizeTeamTargetMonths } from './teamCollectionService.js';
import { normalizeRoster, NO_TEAM_KEY } from '../utils/teamCollection.js';

const KEY = 'team_monthly_targets';
const MONTH_RE = /^\d{4}-\d{2}$/;

export const TEAM_TARGET_MODE = { AUTO: 'auto', MANUAL: 'manual' };

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Same normalisation the board uses (`UPPER(btrim(w.team))`), so "ufs1" and
// "UFS1" cannot become two lanes here either.
export function teamKeyOf(raw) {
  const key = String(raw ?? '').trim().toUpperCase();
  return key || NO_TEAM_KEY;
}

export function isMonthKey(value) {
  return MONTH_RE.test(String(value ?? '').trim());
}

export function resolveMonthKey(value) {
  const m = String(value ?? '').trim();
  return isMonthKey(m) ? m : new Date().toISOString().slice(0, 7);
}

// A worker who left must not keep inflating their old team's target. The NGO
// board still LISTS absconded FROs (flagged), so this filter is deliberately
// narrower than "has a row in workers".
function isCountableWorker(w) {
  if (!w) return false;
  if (w.is_test === true) return false;
  if (w.is_active === false) return false;
  const status = String(w.employment_status || '').toLowerCase();
  return !['terminated', 'absconded', 'resigned', 'inactive'].includes(status);
}

export async function readTeamTargetPlan() {
  let parsed = null;
  try {
    const raw = await getSetting(KEY);
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  const months = normalizeTeamTargetMonths(parsed);
  const modes = parsed && parsed.modes && typeof parsed.modes === 'object' ? parsed.modes : {};
  const sync = parsed && parsed.sync && typeof parsed.sync === 'object' ? parsed.sync : {};
  return { months, modes, sync };
}

// Short TTL: the board is polled and this computation costs a handful of queries,
// but a target set by HR must show up quickly. Writers call
// invalidateTeamSyncCache() so the next poll is immediate.
let _syncCache = { at: 0, month: null, value: null };
const SYNC_TTL_MS = 15_000;

export function invalidateTeamSyncCache() {
  _syncCache = { at: 0, month: null, value: null };
}

/**
 * Sum every active FRO's effective monthly target by team.
 *
 * Returns the "member side" only: what the individuals add up to. Merging that
 * with the stored plan (manual overrides, modes) is mergeTeamTargetPlan's job,
 * kept separate so it is unit-testable without a database.
 */
export async function computeMemberTargets(monthKey) {
  const month = resolveMonthKey(monthKey);
  const now = Date.now();
  if (_syncCache.value && _syncCache.month === month && now - _syncCache.at < SYNC_TTL_MS) {
    return _syncCache.value;
  }

  const roster = await getTeamRoster();

  const { data: workerRows, error: workersErr } = await db
    .from('workers')
    .select('id, name, login_id, team, ngo_id, created_at, is_active, is_test, employment_status, department');
  if (workersErr) throw workersErr;

  const workers = (workerRows || []).filter((w) =>
    isCountableWorker(w) && String(w.department || '').toUpperCase() === 'FRO');

  const workerIds = workers.map((w) => w.id);
  const targetMonth = `${month}-01`;

  // One query each rather than N: the roster is small today but this runs on a
  // dashboard poll, and the batch helpers already carry the exact tie-breaks the
  // per-worker readers use (newest write wins; prior month is the most recent
  // earlier row).
  const [currentRowMap, priorRowMap, salaryMap] = await Promise.all([
    getTargetsForWorkersMonth(workerIds, targetMonth),
    getLatestTargetsBeforeMonthForWorkers(workerIds, targetMonth),
    getActiveSalaryByWorkers(workerIds),
  ]);

  const refDate = new Date(`${targetMonth}T00:00:00Z`);
  const syncedByTeam = {};
  const memberCountByTeam = {};
  const membersByTeam = {};
  const unassigned = { memberCount: 0, syncedTarget: 0, members: [] };

  for (const team of normalizeRoster(roster)) {
    syncedByTeam[team] = 0;
    memberCountByTeam[team] = 0;
    membersByTeam[team] = [];
  }

  for (const w of workers) {
    const key = String(w.id);
    const salary = salaryMap.get(w.id) || salaryMap.get(key);
    const resolved = resolveMonthlyTarget({
      joiningDate: w.created_at,
      salary: salary ? Number(salary.salary) || 0 : 0,
      currentRow: currentRowMap.get(key) || null,
      priorRow: priorRowMap.get(key) || null,
      refDate,
    });
    const amount = round2(resolved.target || 0);
    const member = {
      id: w.id,
      name: w.name || 'Unknown',
      login_id: w.login_id || null,
      target: amount,
      source: resolved.source,
      source_month: resolved.sourceMonth,
      months_employed: resolved.monthsEmployed,
    };

    const teamKey = teamKeyOf(w.team);
    if (teamKey === NO_TEAM_KEY) {
      unassigned.memberCount += 1;
      unassigned.syncedTarget = round2(unassigned.syncedTarget + amount);
      unassigned.members.push(member);
      continue;
    }

    // A `workers.team` value missing from the roster still gets a lane: dropping
    // it would make the sum of team targets disagree with the sum of individuals,
    // which is the one thing this feature exists to prevent.
    if (!syncedByTeam[teamKey]) syncedByTeam[teamKey] = 0;
    if (!memberCountByTeam[teamKey]) memberCountByTeam[teamKey] = 0;
    if (!membersByTeam[teamKey]) membersByTeam[teamKey] = [];

    syncedByTeam[teamKey] = round2(syncedByTeam[teamKey] + amount);
    memberCountByTeam[teamKey] += 1;
    membersByTeam[teamKey].push(member);
  }

  const value = {
    month,
    roster,
    syncedByTeam,
    memberCountByTeam,
    membersByTeam,
    unassigned,
    computedAt: new Date().toISOString(),
  };
  _syncCache = { at: now, month, value };
  return value;
}

/**
 * Pure merge of the individual-side sums with the saved plan.
 *
 * Mode resolution, in order:
 *   1. an explicitly saved mode for this month/team wins;
 *   2. otherwise a positive saved amount is a legacy MANUAL plan - somebody typed
 *      that number and silently replacing it would be the regression this whole
 *      feature must avoid;
 *   3. otherwise AUTO (nothing was ever set, so syncing cannot destroy anything).
 */
export function mergeTeamTargetPlan({
  roster = [],
  storedByTeam = {},
  modesByTeam = {},
  syncedByTeam = {},
  memberCountByTeam = {},
  membersByTeam = {},
} = {}) {
  const rosterList = normalizeRoster(roster);

  // Stored keys and modes come from a settings row that may predate the writer's
  // upper-casing. Fold them first, otherwise "ufs1" would render as a second lane
  // next to "UFS1" and the target total would be counted twice.
  const stored = {};
  for (const [key, value] of Object.entries(storedByTeam || {})) {
    stored[teamKeyOf(key)] = value;
  }
  const storedModes = {};
  for (const [key, value] of Object.entries(modesByTeam || {})) {
    storedModes[teamKeyOf(key)] = value;
  }

  const keys = new Set([
    ...rosterList,
    ...Object.keys(stored),
    ...Object.keys(syncedByTeam || {}),
  ]);

  // Roster order first, then any stray key alphabetically - the editor renders in
  // the roster's configured order, which is the order Accounts > Teams preserves.
  const keysInOrder = [
    ...rosterList,
    ...[...keys].filter((k) => !rosterList.includes(k)).sort(),
  ];

  const teams = [];
  for (const team of keysInOrder) {
    if (team === NO_TEAM_KEY) continue;
    const storedRaw = stored[team];
    const storedAmount = storedRaw == null ? null : Number(storedRaw) || 0;
    const explicit = storedModes[team];
    const mode = explicit === TEAM_TARGET_MODE.MANUAL || explicit === TEAM_TARGET_MODE.AUTO
      ? explicit
      : (storedAmount != null && storedAmount > 0 ? TEAM_TARGET_MODE.MANUAL : TEAM_TARGET_MODE.AUTO);

    const synced = round2(syncedByTeam?.[team] || 0);
    const target = mode === TEAM_TARGET_MODE.MANUAL ? round2(storedAmount || 0) : synced;

    teams.push({
      team,
      mode,
      target,
      synced,
      stored: storedAmount,
      // Positive = the typed target is higher than the members add up to.
      drift: round2(target - synced),
      member_count: Number(memberCountByTeam?.[team]) || 0,
      members: membersByTeam?.[team] || [],
      unrostered: !rosterList.includes(team),
    });
  }

  const byTeam = {};
  const modes = {};
  let targetTotal = 0;
  let syncedTotal = 0;
  for (const t of teams) {
    byTeam[t.team] = t.target;
    modes[t.team] = t.mode;
    targetTotal += t.target;
    syncedTotal += t.synced;
  }

  return {
    teams,
    byTeam,
    modes,
    totals: { target: round2(targetTotal), synced: round2(syncedTotal) },
  };
}

export async function resolveTeamTargets(monthKey) {
  const month = resolveMonthKey(monthKey);
  const [plan, memberSide] = await Promise.all([
    readTeamTargetPlan(),
    computeMemberTargets(month),
  ]);

  const merged = mergeTeamTargetPlan({
    roster: memberSide.roster,
    storedByTeam: plan.months[month] || {},
    modesByTeam: plan.modes[month] || {},
    syncedByTeam: memberSide.syncedByTeam,
    memberCountByTeam: memberSide.memberCountByTeam,
    membersByTeam: memberSide.membersByTeam,
  });

  return {
    month,
    roster: memberSide.roster,
    ...merged,
    unassigned: memberSide.unassigned,
    syncedAt: plan.sync[month]?.at || null,
    syncedBy: plan.sync[month]?.by || null,
  };
}

const cleanByTeamShape = (byTeam) => {
  const out = {};
  if (byTeam && typeof byTeam === 'object') {
    for (const [team, value] of Object.entries(byTeam)) {
      const key = teamKeyOf(team);
      const amount = Number(value);
      if (key === NO_TEAM_KEY || !Number.isFinite(amount) || amount < 0) continue;
      out[key] = round2(amount);
    }
  }
  return out;
};

/**
 * Persist the editor's save. AUTO teams are materialised to their current
 * individual sum so every legacy reader of `months` is correct immediately;
 * MANUAL teams keep the typed number.
 */
export async function saveTeamTargetPlan({ month, byTeam, modes, savedBy = null }) {
  const monthKey = resolveMonthKey(month);
  const plan = await readTeamTargetPlan();
  const memberSide = await computeMemberTargets(monthKey);
  const wantedModes = modes && typeof modes === 'object' ? modes : {};

  const teamKeys = new Set([
    ...Object.keys(cleanByTeamShape(byTeam)),
    ...Object.keys(wantedModes),
    ...Object.keys(plan.months[monthKey] || {}),
  ]);

  const stored = {};
  const modeForMonth = {};
  for (const team of teamKeys) {
    const key = teamKeyOf(team);
    if (key === NO_TEAM_KEY) continue;
    const mode = wantedModes[team] === TEAM_TARGET_MODE.AUTO || wantedModes[key] === TEAM_TARGET_MODE.AUTO
      ? TEAM_TARGET_MODE.AUTO
      : (wantedModes[team] === TEAM_TARGET_MODE.MANUAL || wantedModes[key] === TEAM_TARGET_MODE.MANUAL
        ? TEAM_TARGET_MODE.MANUAL
        : (Number(plan.months[monthKey]?.[key]) > 0 ? TEAM_TARGET_MODE.MANUAL : TEAM_TARGET_MODE.AUTO));

    modeForMonth[key] = mode;

    if (mode === TEAM_TARGET_MODE.AUTO) {
      stored[key] = round2(memberSide.syncedByTeam[key] || 0);
    } else {
      const typed = Number(byTeam?.[team] ?? byTeam?.[key]);
      if (Number.isFinite(typed) && typed >= 0) stored[key] = round2(typed);
      else stored[key] = round2(Number(plan.months[monthKey]?.[key]) || 0);
    }
  }

  plan.months[monthKey] = stored;
  plan.modes[monthKey] = modeForMonth;
  plan.sync[monthKey] = { at: new Date().toISOString(), by: savedBy || null };

  await upsertSetting(KEY, JSON.stringify({ months: plan.months, modes: plan.modes, sync: plan.sync }));
  invalidateTeamTargetCache();
  invalidateTeamSyncCache();

  return resolveTeamTargets(monthKey);
}

/**
 * "Sync" action: switch the named teams (or every roster team) to AUTO and
 * materialise their current individual sum. Manual overrides elsewhere are left
 * untouched.
 */
export async function syncTeamTargets({ month, teams, savedBy = null } = {}) {
  const monthKey = resolveMonthKey(month);
  const plan = await readTeamTargetPlan();
  const memberSide = await computeMemberTargets(monthKey);
  const roster = normalizeRoster(memberSide.roster);

  const wanted = Array.isArray(teams) && teams.length > 0
    ? teams.map(teamKeyOf).filter((k) => k !== NO_TEAM_KEY)
    : roster;

  const stored = { ...(cleanByTeamShape(plan.months[monthKey]) || {}) };
  const modeForMonth = { ...(plan.modes[monthKey] || {}) };
  for (const team of wanted) {
    stored[team] = round2(memberSide.syncedByTeam[team] || 0);
    modeForMonth[team] = TEAM_TARGET_MODE.AUTO;
  }

  plan.months[monthKey] = stored;
  plan.modes[monthKey] = modeForMonth;
  plan.sync[monthKey] = { at: new Date().toISOString(), by: savedBy || null };

  await upsertSetting(KEY, JSON.stringify({ months: plan.months, modes: plan.modes, sync: plan.sync }));
  invalidateTeamTargetCache();
  invalidateTeamSyncCache();

  return resolveTeamTargets(monthKey);
}
