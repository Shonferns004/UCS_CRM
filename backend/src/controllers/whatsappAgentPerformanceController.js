import {
  listAgentRoster,
  getAgentStats,
  listAgentConversations,
} from '../models/whatsappAgentPerfModel.js';

// The reporting window is an IST calendar range, not a rolling N*24h.
//
// Every other figure in this CRM is day-bounded (froIdle.js:22 istDateStr,
// ngoAdminController.js:1316-1329), and the mismatch is not cosmetic: a rolling
// 24h window opened at 18:00 splits the working day across two report rows, so
// "today" would lose the morning. India has no DST, so a fixed +05:30 shift is
// exact.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 86400000;

const RANGES = { today: 1, '7d': 7, '30d': 30 };

function resolveWindow(range) {
  const days = RANGES[range] || RANGES.today;
  const now = Date.now();
  const istMidnightToday = Math.floor((now + IST_OFFSET_MS) / DAY_MS);
  const from = new Date((istMidnightToday - (days - 1)) * DAY_MS - IST_OFFSET_MS);
  return {
    range: days === 1 ? 'today' : `${days}d`,
    days,
    from: from.toISOString(),
    to: new Date(now).toISOString(),
  };
}

// Normalise a project filter.
//
// Not a fixed list: whatsapp_accounts.project holds free text and the live data
// carries bsct, bsct2, mann and aflf — a hard-coded allowlist silently turned
// "bsct2" into "all projects", which looks like a filter that ignored you. The
// shape check is still here, so junk becomes NULL (everything) rather than an
// empty board that reads as "nobody worked today". The client builds its dropdown
// from the projects this endpoint returns, so a new one appears with no code edit.
const normalizeProject = (p) => {
  const v = String(p ?? '').trim().toLowerCase();
  return /^[a-z0-9_]{1,32}$/.test(v) ? v : null;
};

const round2 = (n) => (n == null ? null : Math.round(Number(n) * 100) / 100);

export async function agentPerformance(req, res) {
  try {
    const project = normalizeProject(req.query.project);
    const win = resolveWindow(req.query.range);

    const [roster, stats] = await Promise.all([
      listAgentRoster({ project }),
      getAgentStats({ project, from: win.from, to: win.to }),
    ]);

    const byWorker = new Map(stats.map((s) => [String(s.worker_id), s]));

    // The roster is the LEFT side of the join on purpose: an agent who is
    // assigned to a number and has not replied yet must still appear, with
    // zeroes. Dropping them would make an idle roster indistinguishable from a
    // broken query.
    const agents = roster.map((w) => {
      const s = byWorker.get(String(w.worker_id));
      return {
        worker_id: w.worker_id,
        name: w.name,
        login_id: w.login_id,
        phone: w.phone,
        agent_label: w.agent_label,
        projects: w.projects ? String(w.projects).split(',').filter(Boolean) : [],
        account_count: w.account_count,
        chats: s?.chats ?? 0,
        messages_sent: s?.messages_sent ?? 0,
        replies_received: s?.replies_received ?? 0,
        failed_messages: s?.failed_messages ?? 0,
        avg_first_response_mins: round2(s?.avg_first_response_mins),
        last_activity_at: s?.last_activity_at ?? null,
      };
    });

    agents.sort(
      (a, b) => b.chats - a.chats || b.messages_sent - a.messages_sent || String(a.name).localeCompare(String(b.name))
    );

    const total = agents.reduce(
      (acc, a) => ({
        agents: acc.agents + (a.chats > 0 ? 1 : 0),
        chats: acc.chats + a.chats,
        messages_sent: acc.messages_sent + a.messages_sent,
        replies_received: acc.replies_received + a.replies_received,
        failed_messages: acc.failed_messages + a.failed_messages,
      }),
      { agents: 0, chats: 0, messages_sent: 0, replies_received: 0, failed_messages: 0 }
    );

    // Weighted by chats, not a plain mean of the per-agent averages: an agent who
    // answered one chat in 4 minutes and another in 90 is a 47-minute agent, and
    // averaging the two figures says 45 for everyone.
    const respondedChats = agents.reduce(
      (acc, a) => acc + (a.avg_first_response_mins == null ? 0 : a.chats),
      0
    );
    const weighted = agents.reduce(
      (acc, a) => acc + (a.avg_first_response_mins == null ? 0 : a.avg_first_response_mins * a.chats),
      0
    );
    total.avg_first_response_mins = respondedChats > 0 ? round2(weighted / respondedChats) : null;

    // Every project the roster touches, so the client can render the filter from
    // the data instead of a hard-coded list that drifts whenever a project is
    // added (bsct2 already had).
    const projects = [...new Set(agents.flatMap((a) => a.projects))].sort();

    return res.json({ window: win, project, projects, totals: total, agents });
  } catch (error) {
    return res.status(500).json({ message: 'Could not load agent performance', detail: error.message });
  }
}

export async function agentConversations(req, res) {
  try {
    const project = normalizeProject(req.query.project);
    const win = resolveWindow(req.query.range);
    const workerId = String(req.params.agentId || '').trim();
    if (!workerId) return res.status(400).json({ message: 'agentId is required' });

    const rows = await listAgentConversations({
      workerId,
      project,
      from: win.from,
      to: win.to,
      limit: parseInt(req.query.limit, 10) || 100,
    });

    return res.json({ window: win, project, conversations: rows });
  } catch (error) {
    return res.status(500).json({ message: 'Could not load agent conversations', detail: error.message });
  }
}