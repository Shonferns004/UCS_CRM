import {
  listDepartments,
  getDepartment,
  updateDepartment,
  listDepartmentMembers,
  setDepartmentMembers,
  searchWorkers,
  getDepartmentRoster,
  getAllRosters,
  findVoterDepartment,
  getWorkerByLoginId,
  createSession,
  listSessions,
  getSession,
  getActiveSession,
  getRecentSession,
  getPublicStatus,
  listTurns,
  getTurn,
  getOpenTurn,
  openTurn as openTurnModel,
  closeTurn as closeTurnModel,
  updateSession,
  getBallot,
  insertBallot,
  tallyResults,
  countBallotsForTurn,
  addAudit,
  listAudit,
  hashVoterKey,
  pickNextTurn,
} from '../models/votingModel.js';
import { emitRealtime } from '../socket.js';

const VOTING_ROOM = 'voting';

// Every response carries server_now so the app can show a countdown that does
// not depend on the device clock being right.
const withServerNow = (payload) => ({ ...payload, server_now: new Date().toISOString() });

const actorOf = (req) => req.user?.login_id || req.user?.email || req.user?.name || null;

/**
 * A turn is only genuinely open while its window is still in the future.
 *
 * The stored `status` can be 'open' after the window lapses (HR has not clicked
 * close yet). Treating the stored value as truth would let anyone keep voting
 * past the deadline, so every read and write goes through this instead.
 */
const isTurnLive = (turn, now = new Date()) => {
  if (!turn || turn.status !== 'open') return false;
  if (!turn.closes_at) return false;
  return new Date(turn.closes_at).getTime() > now.getTime();
};

const shapeDepartment = (d) => ({
  id: d.id,
  name: d.name,
  order_index: d.order_index,
  match_department: d.match_department,
  is_locked: !!d.is_locked,
  member_count: Array.isArray(d.members) ? d.members.length : undefined,
});

/**
 * The final winners, one per department. Shared by the HR board and the booth's
 * end-of-ceremony reveal so they can never disagree. It only appears once every
 * turn is done — the votes stay private until then.
 */
const buildWinners = (departments, tally) =>
  departments.map((d) => {
    const rows = (tally || []).filter((r) => Number(r.department_id) === Number(d.id) && r.nominee_id);
    const votes = rows.reduce((s, r) => s + (r.votes || 0), 0);
    const top = rows.reduce((best, r) => (!best || (r.votes || 0) > best.votes ? r : best), null);
    const tied = top ? rows.filter((r) => r.votes === top.votes).length : 0;
    return {
      department: { id: d.id, name: d.name, order_index: d.order_index },
      votes_cast: votes,
      winner:
        top && votes > 0
          ? {
              nominee_id: top.nominee_id,
              name: top.nominee_name,
              employee_id: top.nominee_employee_id,
              photo_url: top.nominee_photo_url,
              votes: top.votes,
            }
          : null,
      is_tie: !!(top && votes > 0 && tied > 1),
      tied_count: tied,
    };
  });

const broadcast = (sessionId, type, extra = {}) => {
  emitRealtime('voting:update', { type, session_id: sessionId, ...extra }, VOTING_ROOM);
};

/** Resolve the caller's worker row, or a clear 401 if the token is not a worker. */
const requireWorker = async (req, res) => {
  const loginId = req.user?.login_id;
  if (!loginId) {
    res.status(401).json({ message: 'Please log in with your employee account to vote' });
    return null;
  }
  const worker = await getWorkerByLoginId(loginId);
  if (!worker) {
    res.status(403).json({ message: 'Your employee record could not be found' });
    return null;
  }
  return worker;
};

/**
 * Public: is a ceremony running right now?
 *
 * The only unauthenticated endpoint in this module, and the only one a
 * non-signed-in browser can reach. It exists so the login screen can tell people
 * to come back later instead of taking a password for a ceremony that is not
 * open, and it returns nothing but a title and a status.
 */
export const getStatus = async (req, res) => {
  try {
    return res.json(withServerNow(await getPublicStatus()));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ── voter-facing ───────────────────────────────────────────────────────────

/**
 * Everything a voter needs to know where they stand, in one call.
 * Deliberately carries no vote counts and no other department's detail — a
 * ballot is anonymous and this is the endpoint every voter can call.
 */
export const getCeremony = async (req, res) => {
  try {
    const worker = await requireWorker(req, res);
    if (!worker) return;

    const session = await getActiveSession();

    // No live or draft ceremony? If the last one is finished, the only honest
    // screen is the results — the winner is decided after everyone has voted
    // and the time has ended, so that is exactly when this state appears.
    if (!session) {
      const recent = await getRecentSession();
      if (recent && recent.status === 'completed') {
        const [tally, depts] = await Promise.all([tallyResults(recent.id), listDepartments()]);
        return res.json(
          withServerNow({
            session: {
              id: recent.id,
              title: recent.title,
              tagline: recent.tagline,
              award_label: recent.award_label,
              status: recent.status,
              turn_minutes: recent.turn_minutes,
              started_at: recent.started_at,
              completed_at: recent.completed_at,
            },
            state: 'results',
            results: buildWinners(depts, tally),
            department: null,
            turn: null,
          }),
        );
      }
      return res.json(withServerNow({ session: null, state: 'no_ceremony', department: null, turn: null }));
    }

    const membership = await findVoterDepartment(worker);
    const depts = await listDepartments();
    const turns = await listTurns(session.id);
    const myTurn = membership ? turns.find((t) => Number(t.department_id) === Number(membership.dept.id)) : null;
    const voted = myTurn ? await getBallot(myTurn.id, hashVoterKey(myTurn.id, req.user.login_id)) : null;

    let state = 'waiting';
    if (!membership) state = 'not_in_ceremony';
    else if (voted) state = 'voted';
    else if (myTurn?.status === 'closed') state = 'missed';
    else if (isTurnLive(myTurn)) state = 'voting';
    else if (session.status !== 'live') state = 'not_started';

    return res.json(
      withServerNow({
        session: {
          id: session.id,
          title: session.title,
          tagline: session.tagline,
          award_label: session.award_label,
          status: session.status,
          turn_minutes: session.turn_minutes,
          started_at: session.started_at,
        },
        state,
        department: membership ? shapeDepartment(membership.dept) : null,
        roster_size: membership ? membership.members.length : 0,
        turn: myTurn
          ? {
              id: myTurn.id,
              status: isTurnLive(myTurn) ? 'open' : myTurn.status === 'open' ? 'expired' : myTurn.status,
              opens_at: myTurn.opens_at,
              closes_at: myTurn.closes_at,
            }
          : null,
        already_voted: !!voted,
        // Turn state per group so a voter can see who is up before them. State
        // only — no vote counts, which stay on the HR board.
        departments: depts.map((d) => {
          const t = turns.find((x) => Number(x.department_id) === Number(d.id));
          return {
            id: d.id,
            name: d.name,
            order_index: d.order_index,
            turn_status: t
              ? isTurnLive(t) ? 'open' : t.status === 'open' ? 'expired' : t.status
              : 'pending',
            closes_at: t?.closes_at || null,
          };
        }),
      }),
    );
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/** The nominee list for the caller, only while their own turn is genuinely open. */
export const getMyBallot = async (req, res) => {
  try {
    const worker = await requireWorker(req, res);
    if (!worker) return;

    const session = await getActiveSession();
    if (!session) return res.status(404).json({ message: 'There is no ceremony running right now' });

    const membership = await findVoterDepartment(worker);
    if (!membership) {
      return res.status(403).json({ message: 'Your department is not part of this ceremony' });
    }

    const turn = await getTurn(session.id, membership.dept.id);
    if (!isTurnLive(turn)) {
      return res.status(409).json({ message: 'Voting is not open for your department' });
    }

    const nominees = membership.members
      .filter((m) => session.allow_self_vote || String(m.id) !== String(worker.id))
      .map((m) => ({ id: m.id, name: m.name, employee_id: m.employee_id, department: m.department, team: m.team, photo_url: m.photo_url }));

    return res.json(
      withServerNow({
        session: { id: session.id, title: session.title, award_label: session.award_label },
        department: shapeDepartment(membership.dept),
        turn: { id: turn.id, closes_at: turn.closes_at },
        nominees,
      }),
    );
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/**
 * Cast one vote.
 *
 * The response is a bare confirmation — it deliberately does not echo the
 * nominee back, so a shared screen cannot reveal what anyone picked.
 */
export const castVote = async (req, res) => {
  try {
    const worker = await requireWorker(req, res);
    if (!worker) return;

    const nomineeId = String(req.body?.nominee_id || '').trim();
    if (!nomineeId) return res.status(400).json({ message: 'Please select one person' });

    const session = await getActiveSession();
    if (!session) return res.status(404).json({ message: 'There is no ceremony running right now' });

    const membership = await findVoterDepartment(worker);
    if (!membership) return res.status(403).json({ message: 'Your department is not part of this ceremony' });

    const turn = await getTurn(session.id, membership.dept.id);
    if (!isTurnLive(turn)) return res.status(409).json({ message: 'Voting is not open for your department' });

    const nominees = membership.members.filter(
      (m) => session.allow_self_vote || String(m.id) !== String(worker.id),
    );
    if (!nominees.some((m) => String(m.id) === nomineeId)) {
      return res.status(400).json({ message: 'That person is not on your department ballot' });
    }

    const voterHash = hashVoterKey(turn.id, req.user.login_id);
    if (await getBallot(turn.id, voterHash)) {
      return res.status(409).json({ message: 'You have already voted' });
    }

    try {
      await insertBallot({
        session_id: session.id,
        turn_id: turn.id,
        department_id: membership.dept.id,
        nominee_id: nomineeId,
        voter_hash: voterHash,
      });
    } catch (e) {
      // 23505 = unique_violation. Two taps, or two tabs, raced each other past
      // the check above. The constraint is the real guarantee, so report it as
      // "already voted" rather than a server error.
      if (e?.code === '23505') return res.status(409).json({ message: 'You have already voted' });
      throw e;
    }

    await addAudit(session.id, 'vote_cast', null, { department_id: membership.dept.id });
    broadcast(session.id, 'vote_cast', { department_id: membership.dept.id });

    return res.status(201).json({ message: 'Your vote has been recorded', server_now: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ── HR / admin ─────────────────────────────────────────────────────────────

export const listAllDepartments = async (req, res) => {
  try {
    const rosters = await getAllRosters();
    return res.json(withServerNow({ departments: rosters.map(shapeDepartment) }));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/** A group's stored membership rows plus its resolved roster. */
export const inspectDepartment = async (req, res) => {
  try {
    const dept = await getDepartment(req.params.id);
    if (!dept) return res.status(404).json({ message: 'Department not found' });
    const members = await listDepartmentMembers(dept.id);
    const roster = await getDepartmentRoster(dept);
    return res.json(withServerNow({ department: shapeDepartment(dept), overrides: members, roster }));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const editDepartment = async (req, res) => {
  try {
    const dept = await getDepartment(req.params.id);
    if (!dept) return res.status(404).json({ message: 'Department not found' });
    const updated = await updateDepartment(dept.id, req.body || {});
    broadcast(null, 'departments_changed');
    return res.json({ message: 'Department saved', department: shapeDepartment(updated) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const saveDepartmentMembers = async (req, res) => {
  try {
    const dept = await getDepartment(req.params.id);
    if (!dept) return res.status(404).json({ message: 'Department not found' });
    const include = Array.isArray(req.body?.include) ? req.body.include : [];
    const exclude = Array.isArray(req.body?.exclude) ? req.body.exclude : [];
    await setDepartmentMembers(dept.id, { include, exclude });
    const roster = await getDepartmentRoster(dept);
    broadcast(null, 'departments_changed');
    return res.json({ message: 'Members saved', department: shapeDepartment(dept), roster });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const lookupWorkers = async (req, res) => {
  try {
    const workers = await searchWorkers(req.query.q, req.query.limit);
    return res.json(withServerNow({ workers }));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const listAllSessions = async (req, res) => {
  try {
    return res.json(withServerNow({ sessions: await listSessions() }));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const startSession = async (req, res) => {
  try {
    const session = await createSession(req.body || {}, actorOf(req));
    await addAudit(session.id, 'ceremony_created', actorOf(req), { title: session.title });
    broadcast(session.id, 'ceremony_created');
    return res.status(201).json({ message: 'Ceremony created', session });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

/**
 * Open the next turn.
 *
 * The order is enforced, not advisory: the target must be the first still-pending
 * turn in ceremony order, and no other turn may be open. That is what makes the
 * ceremony strictly one department at a time rather than six simultaneous races.
 */
export const openTurn = async (req, res) => {
  try {
    const session = await getSession(req.params.id);
    if (!session) return res.status(404).json({ message: 'Ceremony not found' });
    if (session.status === 'completed') return res.status(409).json({ message: 'This ceremony has already finished' });

    const alreadyOpen = await getOpenTurn(session.id);
    if (alreadyOpen) {
      return res.status(409).json({ message: 'Another department is voting right now. Close it first.' });
    }

    const turns = await listTurns(session.id);
    // Strictly the head of the queue. Anything else would let HR run the
    // departments out of order, which is the one thing the ceremony cannot do.
    const next = pickNextTurn(turns);
    if (!next) return res.status(409).json({ message: 'Every department has already voted' });

    if (Number(next.department_id) !== Number(req.params.deptId)) {
      return res.status(409).json({
        message: `Not yet — department #${next.order_index + 1} votes first.`,
        expected_department_id: next.department_id,
      });
    }

    const minutes = Math.min(Math.max(Number(req.body?.minutes) || session.turn_minutes || 5, 1), 120);
    const turn = await openTurnModel({
      sessionId: session.id,
      departmentId: next.department_id,
      minutes,
      actor: actorOf(req),
    });

    await updateSession(session.id, {
      status: 'live',
      current_department_id: next.department_id,
      started_at: session.started_at || new Date().toISOString(),
    });
    await addAudit(session.id, 'turn_opened', actorOf(req), { department_id: next.department_id, minutes });
    broadcast(session.id, 'turn_opened', { department_id: next.department_id });

    return res.json({ message: 'Voting is now open', turn });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/**
 * Close a turn. Closing a turn that never opened is how HR skips a department
 * (for example one with nobody on the roster) without breaking the order.
 */
export const closeTurn = async (req, res) => {
  try {
    const session = await getSession(req.params.id);
    if (!session) return res.status(404).json({ message: 'Ceremony not found' });

    const turn = await getTurn(session.id, req.params.deptId);
    if (!turn) return res.status(404).json({ message: 'That department is not in this ceremony' });
    if (turn.status === 'closed') return res.status(409).json({ message: 'That department is already closed' });

    const skipped = turn.status === 'pending';
    if (skipped) {
      // Skipping is only allowed at the head, otherwise the running order
      // quietly stops being the order everyone was told to expect.
      const turns = await listTurns(session.id);
      const next = pickNextTurn(turns);
      if (next && Number(next.department_id) !== Number(turn.department_id)) {
        return res.status(409).json({
          message: `Not yet — department #${next.order_index + 1} comes first.`,
          expected_department_id: next.department_id,
        });
      }
    }

    await closeTurnModel({ sessionId: session.id, departmentId: turn.department_id, actor: actorOf(req) });

    // Leaving the session pointing at a finished turn makes the waiting room
    // tell voters the wrong department is on, so clear it.
    if (Number(session.current_department_id) === Number(turn.department_id)) {
      await updateSession(session.id, { current_department_id: null });
    }

    await addAudit(session.id, skipped ? 'turn_skipped' : 'turn_closed', actorOf(req), { department_id: turn.department_id });
    broadcast(session.id, 'turn_closed', { department_id: turn.department_id });

    return res.json({ message: skipped ? 'Department skipped' : 'Voting closed' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const completeSession = async (req, res) => {
  try {
    const session = await getSession(req.params.id);
    if (!session) return res.status(404).json({ message: 'Ceremony not found' });

    const open = await getOpenTurn(session.id);
    if (open) return res.status(409).json({ message: 'Close the open turn before finishing' });

    await updateSession(session.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      current_department_id: null,
    });
    await addAudit(session.id, 'ceremony_completed', actorOf(req));
    broadcast(session.id, 'ceremony_completed');

    return res.json({ message: 'Ceremony complete' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/**
 * The live board: every group's order, roster size, turn state, how many have
 * voted, and the tally. Counts only — the tally query has no voter column.
 */
export const getBoard = async (req, res) => {
  try {
    const session = await getSession(req.params.id);
    if (!session) return res.status(404).json({ message: 'Ceremony not found' });

    const rosters = await getAllRosters();
    const turns = await listTurns(session.id);
    const tally = await tallyResults(session.id);
    const now = new Date();

    const departments = rosters.map((d) => {
      const turn = turns.find((t) => Number(t.department_id) === Number(d.id)) || null;
      const rows = tally.filter((r) => Number(r.department_id) === Number(d.id) && r.nominee_id);
      const votes = rows.reduce((s, r) => s + (r.votes || 0), 0);
      const top = rows.reduce((best, r) => (!best || r.votes > best.votes ? r : best), null);
      const tied = top ? rows.filter((r) => r.votes === top.votes).map((r) => r.nominee_id) : [];

      return {
        ...shapeDepartment(d),
        turn_status: turn ? (isTurnLive(turn, now) ? 'open' : turn.status === 'open' ? 'expired' : turn.status) : 'pending',
        opens_at: turn?.opens_at || null,
        closes_at: turn?.closes_at || null,
        votes_cast: votes,
        ballots: votes,
        eligible: d.members.length,
        results: rows.map((r) => ({
          nominee_id: r.nominee_id,
          name: r.nominee_name,
          employee_id: r.nominee_employee_id,
          photo_url: r.nominee_photo_url,
          votes: r.votes || 0,
        })),
        winner: top && votes > 0 ? { nominee_id: top.nominee_id, name: top.nominee_name, votes: top.votes } : null,
        is_tie: !!(top && votes > 0 && tied.length > 1),
        tied_count: tied.length,
      };
    });

    return res.json(
      withServerNow({
        session: {
          id: session.id,
          title: session.title,
          tagline: session.tagline,
          award_label: session.award_label,
          status: session.status,
          turn_minutes: session.turn_minutes,
          started_at: session.started_at,
          completed_at: session.completed_at,
        },
        departments,
      }),
    );
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getSessionAudit = async (req, res) => {
  try {
    return res.json(withServerNow({ audit: await listAudit(req.params.id) }));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/** Ballots recorded in an open turn — used by the board to show progress. */
export const getTurnProgress = async (req, res) => {
  try {
    const turn = await getTurn(req.params.id, req.params.deptId);
    if (!turn) return res.status(404).json({ message: 'That department is not in this ceremony' });
    return res.json(withServerNow({ votes: await countBallotsForTurn(turn.id) }));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
