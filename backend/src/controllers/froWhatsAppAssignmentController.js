import { listAgentsForAccount, assignAgentToAccount, assignAgentsToAccount, removeAgentFromAccount, listAssignableWorkers, getAccountForFro } from '../models/froWhatsAppAssignmentModel.js';

export async function listAgents(req, res) {
  try {
    const agents = await listAgentsForAccount(req.params.accountId);
    return res.json(agents);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

/**
 * Every FRO that can be assigned to a WhatsApp account, in one response.
 *
 * The assign panel loads this once and filters it in the browser, so opening
 * the panel never waits on a round trip per keystroke and the roster is not
 * cut off at 20 rows.
 */
export async function listAssignableAgents(req, res) {
  try {
    const workers = await listAssignableWorkers(req.query.q || '');
    return res.json(workers);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function assignAgent(req, res) {
  try {
    const { froWorkerId, froWorkerIds } = req.body || {};
    const ids = Array.isArray(froWorkerIds)
      ? froWorkerIds.filter(Boolean)
      : froWorkerId
        ? [froWorkerId]
        : [];

    if (!ids.length) return res.status(400).json({ message: 'froWorkerId is required' });

    if (ids.length === 1) {
      const agent = await assignAgentToAccount(ids[0], req.params.accountId);
      return res.status(201).json(agent);
    }

    // Batch: one statement for the whole selection. FROs that were already
    // assigned are skipped rather than failing the batch.
    const inserted = await assignAgentsToAccount(ids, req.params.accountId);
    return res.status(201).json({
      assigned: inserted.length,
      skipped: ids.length - inserted.length,
      agents: inserted,
    });
  } catch (error) {
    if (error.message.includes('already assigned')) return res.status(409).json({ message: error.message });
    return res.status(500).json({ message: error.message });
  }
}

export async function removeAgent(req, res) {
  try {
    await removeAgentFromAccount(req.params.froId, req.params.accountId);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function searchAgents(req, res) {
  try {
    const { q } = req.query;
    const workers = await listAssignableWorkers(q || '');
    return res.json(workers);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function myAccount(req, res) {
  try {
    const assignment = await getAccountForFro(req.user.id);
    return res.json(assignment);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}
