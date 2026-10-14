import { Router } from 'express';
import { authenticate, requireWhatsAppAdmin } from '../middleware/authMiddleware.js';
import {
  getSettings,
  setEnabled,
  listRules,
  createRule,
  updateRule,
  deleteRule,
  listLogs,
  previewRules,
} from '../services/whatsappAutomationService.js';

// Automation can send messages to real customers unattended, so it is gated by
// requireWhatsAppAdmin: the accounts/super_admin/master staff paths as before,
// plus a CRM agent carrying crm_agents.whatsapp_admin. The flag is NOT a CRM
// role -- an agent granted it reaches these routes and nothing else.
const router = Router();

router.use(authenticate);
router.use(requireWhatsAppAdmin);

/** The toggle. `GET` is what the UI polls; `POST` is the enable/disable button. */
router.get('/settings', async (req, res, next) => {
  try {
    res.json(await getSettings());
  } catch (err) { next(err); }
});

router.post('/settings/enabled', async (req, res, next) => {
  try {
    const enabled = req.body?.enabled === true || req.body?.enabled === 'true';
    const result = await setEnabled(enabled, req.user?.login_id || req.user?.email || req.user?.id || null);
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/rules', async (req, res, next) => {
  try {
    res.json(await listRules({ project: req.query.project }));
  } catch (err) { next(err); }
});

router.post('/rules', async (req, res, next) => {
  try {
    const rule = await createRule({
      ...req.body,
      created_by: req.user?.login_id || req.user?.email || req.user?.id || null,
    });
    res.status(201).json(rule);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.patch('/rules/:id', async (req, res, next) => {
  try {
    const rule = await updateRule(req.params.id, req.body || {});
    if (!rule) return res.status(404).json({ message: 'Rule not found' });
    res.json(rule);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.delete('/rules/:id', async (req, res, next) => {
  try {
    await deleteRule(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/logs', async (req, res, next) => {
  try {
    res.json(await listLogs({
      limit: req.query.limit,
      result: req.query.result,
      ruleId: req.query.ruleId,
      project: req.query.project,
    }));
  } catch (err) { next(err); }
});

/** Dry run. Never sends, never writes -- safe to hit while testing rules. */
router.post('/preview', async (req, res, next) => {
  try {
    const rules = await listRules({ project: req.body?.project });
    res.json({ matches: previewRules(req.body?.text || '', rules) });
  } catch (err) { next(err); }
});

export default router;