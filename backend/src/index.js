import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import supabase from './config/supabase.js';
import authRoutes from './routes/authRoutes.js';
import workerRoutes from './routes/workerRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import qrRoutes from './routes/qrRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import leaveRoutes from './routes/leaveRoutes.js';
import ngoRoutes from './routes/ngoRoutes.js';
import userRoutes from './routes/userRoutes.js';
import hrRoutes from './routes/hrRoutes.js';
import letterRoutes from './routes/letterRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import eventRoutes from './routes/eventRoutes.js';
import noticeRoutes from './routes/noticeRoutes.js';
import achievementRoutes from './routes/achievementRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import notificationAdminRoutes from './routes/notificationAdminRoutes.js';
import onboardingRoutes from './routes/onboardingRoutes.js';
import leadRoutes from './routes/leadRoutes.js';
import recruiterRoutes from './routes/recruiterRoutes.js';
import holidayRoutes from './routes/holidayRoutes.js';
import calendarRoutes from './routes/calendarRoutes.js';
import salaryRoutes from './routes/salaryRoutes.js';
import incentiveRoutes from './routes/incentiveRoutes.js';
import callLogRoutes from './routes/callLogRoutes.js';
import causeRoutes from './routes/causeRoutes.js';
import dataSourceRoutes from './routes/dataSourceRoutes.js';
import dataImportRoutes from './routes/dataImportRoutes.js';
import ngoAdminRoutes from './routes/ngoAdminRoutes.js';
import froRoutes from './routes/froRoutes.js';
import accountsRoutes from './routes/accountsRoutes.js';
import loanRoutes from './routes/loanRoutes.js';
import attendanceCorrectionRoutes from './routes/attendanceCorrectionRoutes.js';
import bankAuditRoutes from './routes/bankAuditRoutes.js';
import emailImportRoutes from './routes/emailImportRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import bankStatementRoutes from './routes/bankStatementRoutes.js';
import whatsappRoutes from './routes/whatsappRoutes.js';
import eventHeadRoutes from './routes/eventHeadRoutes.js';
import ocrRoutes from './routes/ocrRoutes.js';
import superAdminRoutes from './routes/superAdminRoutes.js';
import froWhatsAppRoutes from './routes/froWhatsAppRoutes.js';
import bulkAgentImportRoutes from './routes/bulkAgentImportRoutes.js';
import agentTransferRoutes from './routes/agentTransferRoutes.js';
import userSettingsRoutes from './routes/userSettingsRoutes.js';
import ticketRoutes from './routes/ticketRoutes.js';
import { whatsappLogin } from './controllers/froWhatsAppAuthController.js';

dotenv.config();

const _log = console.log;
if (process.env.LOG_LEVEL !== 'debug') {
  console.log = () => {};
  console.warn = () => {};
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => { req.rawBody = buf.toString(); },
}));

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const froDist = path.resolve(__dirname, '../../fro-panel/dist');
const ngoAdminDist = path.resolve(__dirname, '../../ngo-admin-panel/dist');
const accountsDist = path.resolve(__dirname, '../../accounts-panel/dist');
const whatsappDist = path.resolve(__dirname, '../../whatsapp-crm/dist');

app.use('/api/auth', authRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/ngos', ngoRoutes);
app.use('/api/users', userRoutes);
app.use('/api/hrs', hrRoutes);
app.use('/api/letters', letterRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin/notifications', notificationAdminRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/call-logs', callLogRoutes);
app.use('/api/recruiters', recruiterRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/salary', salaryRoutes);
app.use('/api/incentive', incentiveRoutes);
app.use('/api/causes', causeRoutes);
app.use('/api/data-sources', dataSourceRoutes);
app.use('/api/data-import', dataImportRoutes);
app.use('/api/ngo-admin', ngoAdminRoutes);
app.post('/api/whatsapp/fro-login', whatsappLogin);
app.use('/api/fro', froRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/advances', loanRoutes);
app.use('/api/attendance-corrections', attendanceCorrectionRoutes);
app.use('/api/accounts/bank-audit', bankAuditRoutes);
app.use('/api/accounts/email-import', emailImportRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/accounts/bank-statement', bankStatementRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/ocr', ocrRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/event-head', eventHeadRoutes);
app.use('/api/user-settings', userSettingsRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/whatsapp/agents', bulkAgentImportRoutes);
app.use('/api/whatsapp/agents', agentTransferRoutes);
app.use('/api/fro/whatsapp', froWhatsAppRoutes);

import multer from 'multer';
const uploadApi = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
app.post('/api/upload', uploadApi.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file' });
  const ext = (req.file.mimetype || '').split('/')[1]?.split(';')[0] || 'bin';
  const fileName = `upload_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error: uploadErr } = await supabase.storage.from('whatsapp-media').upload(fileName, req.file.buffer, {
    contentType: req.file.mimetype, upsert: false,
  });
  if (uploadErr) return res.status(500).json({ message: uploadErr.message });
  const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(fileName);
  res.json({ url: urlData?.publicUrl, name: req.file.originalname, type: req.file.mimetype });
});

app.post('/api/whatsapp/send', express.json(), async (req, res) => {
  try {
    const { conversationId, contactId, messageText, mediaUrl, mediaMimeType, userId, phoneNumber } = req.body;
    if (!conversationId || !phoneNumber) return res.status(400).json({ message: 'Missing required fields' });

    const { data: accounts } = await supabase.from('whatsapp_accounts').select('phone_number_id, access_token').eq('is_active', true);
    if (!accounts?.length) return res.status(500).json({ message: 'No active WhatsApp account' });

    const mime = mediaMimeType || '';
    const msgType = mediaUrl ? (mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'document') : 'text';

    let safeContactId = contactId;
    if (safeContactId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safeContactId)) {
      const { data: existing } = await supabase.from('contacts').select('id').eq('phone_normalized', phoneNumber.replace(/[^0-9]/g, '')).maybeSingle();
      if (existing) safeContactId = existing.id;
      else { const { data: nc } = await supabase.from('contacts').insert({ phone: phoneNumber, phone_normalized: phoneNumber.replace(/[^0-9]/g, ''), source: 'api' }).select().single(); if (nc) safeContactId = nc.id; }
    }

    const { data: msg, error: msgErr } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      contact_id: safeContactId || null,
      user_id: userId || null,
      direction: 'outbound',
      message_type: msgType,
      body_text: mediaUrl ? '' : (messageText || ''),
      media_url: mediaUrl || null,
      media_mime_type: mediaMimeType || null,
      status: 'queued',
    }).select().single();
    if (msgErr) return res.status(500).json({ message: msgErr.message });

    if (mediaUrl && (mediaMimeType?.startsWith('audio/') || mime.startsWith('audio/'))) {
      const download = await fetch(mediaUrl);
      const blob = await download.blob();
      const ext = (blob.type || 'audio/webm').split('/')[1]?.split(';')[0] || 'webm';
      const form = new FormData();
      form.append('messaging_product', 'whatsapp');
      form.append('file', blob, `audio.${ext}`);
      form.append('type', blob.type || 'audio/webm');
      const upRes = await fetch(`https://graph.facebook.com/v23.0/${accounts[0].phone_number_id}/media`, {
        method: 'POST', headers: { Authorization: `Bearer ${accounts[0].access_token}` }, body: form,
      });
      const upData = await upRes.json();
      if (!upRes.ok || !upData.id) return res.json({ message: 'Meta upload failed', error: upData, msg });

      const sendRes = await fetch(`https://graph.facebook.com/v23.0/${accounts[0].phone_number_id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accounts[0].access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', to: phoneNumber.replace(/[^0-9]/g, ''),
          type: 'audio', audio: { id: upData.id },
        }),
      });
      const sendData = await sendRes.json();
      if (sendRes.ok && sendData.messages?.[0]?.id) {
        await supabase.from('messages').update({ status: 'sent', wa_message_id: sendData.messages[0].id, status_updated_at: new Date().toISOString() }).eq('id', msg.id);
        return res.json({ success: true, msg });
      }
      return res.json({ message: 'Meta send failed', error: sendData, msg });
    }

    res.json({ success: true, msg });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

if (fs.existsSync(whatsappDist)) {
  app.use('/whatsapp/assets', express.static(path.join(whatsappDist, 'assets')));
  app.get('/whatsapp*', (req, res) => {
    res.sendFile(path.join(whatsappDist, 'index.html'));
  });
}

if (fs.existsSync(froDist)) {
  app.use('/assets', express.static(path.join(froDist, 'assets')));
  app.get(/^\/(?!api\/|admin$|admin\/|accounts$|accounts\/|whatsapp).*$/, (req, res) => {
    res.sendFile(path.join(froDist, 'index.html'));
  });
  app.get('/', (req, res) => {
    res.sendFile(path.join(froDist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.json({ message: 'Attendance API is running' });
  });
}

if (fs.existsSync(ngoAdminDist)) {
  app.use('/admin/assets', express.static(path.join(ngoAdminDist, 'assets')));
  app.get('/admin*', (req, res) => {
    res.sendFile(path.join(ngoAdminDist, 'index.html'));
  });
}

if (fs.existsSync(accountsDist)) {
  app.use('/accounts/assets', express.static(path.join(accountsDist, 'assets')));
  app.get('/accounts*', (req, res) => {
    res.sendFile(path.join(accountsDist, 'index.html'));
  });
}

    app.post('/api/cron/notifications', async (req, res) => {
      try {
        const { runNotificationCycle, sendScheduledNotifications, sendPunchInReminders, sendPunchOutReminders } =
          await import('./services/notificationScheduler.js');
        await Promise.all([
          runNotificationCycle().catch(() => {}),
          sendScheduledNotifications().catch(() => {}),
          sendPunchInReminders().catch(() => {}),
          sendPunchOutReminders().catch(() => {}),
        ]);
        res.json({ success: true, message: 'All notification checks completed' });
      } catch (error) {
        console.error('Notifications cron error:', error.message);
        res.status(500).json({ success: false, message: error.message });
      }
    });

    app.post('/api/cron/email-import', async (req, res) => {
      try {
        const { pollEmailInbox } = await import('./services/emailImporter.js');
        const result = await pollEmailInbox();
        res.json(result);
      } catch (error) {
        console.error('Email import cron error:', error.message);
        res.status(500).json({ success: false, message: error.message });
      }
    });

    app.post('/api/cron/generate-daily-codes', async (req, res) => {
      try {
        const { generateDailyCodes } = await import('./services/dailyCodeService.js');
        const result = await generateDailyCodes();
        res.json(result);
      } catch (error) {
        console.error('Daily codes cron error:', error.message);
        res.status(500).json({ success: false, message: error.message });
      }
    });

    app.post('/api/cron/razorpay-sync', async (req, res) => {
      try {
        const { syncAllRazorpayAccounts } = await import('./services/razorpayWebhook.js');
        const result = await syncAllRazorpayAccounts();
        res.json(result);
      } catch (error) {
        console.error('Razorpay sync cron error:', error.message);
        res.status(500).json({ success: false, message: error.message });
      }
    });

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

app.get('/api/debug', async (req, res) => {
  const tables = ['rejected_lead_tickets', 'alerts', 'notification_log', 'fcm_tokens'];
  const results = {};
  for (const t of tables) {
    try {
      const { error } = await supabase.from(t).select('id').limit(1);
      results[t] = error ? `error: ${error.message}` : 'ok';
    } catch (e) { results[t] = `exception: ${e.message}`; }
  }
  res.json({ version: 'd6f25bd', node: process.version, tables: results, vercel: !!process.env.VERCEL });
});

async function checkLeavesTable() {
  try {
    await supabase.from('leaves').select('id').limit(1);
  } catch {
    console.warn(
      '\n=== MISSING TABLE: leaves ===\n' +
      'The "leaves" table does not exist in your Supabase database.\n' +
      'Run the SQL in backend/migrations/ in your Supabase SQL Editor.\n' +
      '========================\n'
    );
  }
}

if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    _log(`Server running on port ${PORT}`);
    checkLeavesTable();
    import('./services/notificationScheduler.js');
  });
}

export default app;
