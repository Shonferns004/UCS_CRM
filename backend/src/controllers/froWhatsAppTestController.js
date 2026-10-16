// HTTP surface for the controlled WhatsApp send test.
//
// Two verbs, deliberately:
//
//   GET  /test-send/preview?project=&phone=   -- reports which number would
//                                                send and under whose name.
//                                                Sends nothing.
//   POST /test-send                          -- sends exactly one message, to
//                                                the authorised test recipient,
//                                                and only when `confirmed` is
//                                                literally true.
//
// Both sit behind authenticate -> requireWhatsApp -> requireWhatsAppAdmin, so
// this is reachable only by a WhatsApp admin (Agent 1, or a staff role that
// already had the admin panel). Other agents get 403 before any handler runs.
//
// `requireWhatsAppAdmin` grants WhatsApp admin scope only. It does not touch
// req.user.role, so it cannot be a route into /accounts, /sa or /hr.

import {
  previewTestSend,
  sendTestMessage,
  TestSendError,
} from '../services/whatsappTestSend.js';

function fail(res, error) {
  if (error instanceof TestSendError) {
    return res.status(error.status).json({ message: error.message });
  }
  console.error('[testSend] unexpected error:', error?.message);
  return res.status(500).json({ message: error?.message || 'Test send failed' });
}

export async function testSendPreview(req, res) {
  try {
    const result = await previewTestSend({
      project: req.query.project,
      phone: req.query.phone,
      kind: req.query.kind === 'template' ? 'template' : 'text',
    });
    return res.json(result);
  } catch (error) {
    return fail(res, error);
  }
}

export async function testSend(req, res) {
  try {
    // Acknowledgement of the preview, not a default. A default of `true` would
    // make the gate decorative.
    if (req.body?.confirmed !== true) {
      return res.status(400).json({
        message: 'Send nothing. Call the preview first, confirm which number will send and under '
          + 'whose name, then resend with "confirmed": true.',
      });
    }

    const result = await sendTestMessage({
      project: req.body?.project,
      phone: req.body?.phone,
      text: typeof req.body?.text === 'string' ? req.body.text : undefined,
      templateName: typeof req.body?.templateName === 'string' ? req.body.templateName : undefined,
      templateLanguage: req.body?.templateLanguage,
      parameters: Array.isArray(req.body?.parameters) ? req.body.parameters : undefined,
    });

    return res.json(result);
  } catch (error) {
    return fail(res, error);
  }
}