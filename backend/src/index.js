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
import { authenticate } from './middleware/authMiddleware.js';

dotenv.config();

const _log = console.log;

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : ['*'];
app.use(cors({
  origin: allowedOrigins.length === 1 && allowedOrigins[0] === '*' ? '*' : allowedOrigins,
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

app.post('/api/whatsapp/send', authenticate, express.json(), async (req, res) => {
  try {
    const { conversationId, contactId, messageText, mediaUrl, mediaMimeType, userId, phoneNumber, messageId } = req.body;
    if (!conversationId) return res.status(400).json({ message: 'Missing conversationId' });

    let toPhone = phoneNumber;
    let convInfo = null;
    if (!toPhone && contactId) {
      const { data: c } = await supabase.from('contacts').select('phone_normalized').eq('id', contactId).maybeSingle();
      if (c) toPhone = c.phone_normalized;
    }
    if (!toPhone) {
      const { data: conv } = await supabase.from('conversations').select('*, contact:contacts(phone_normalized)').eq('id', conversationId).maybeSingle();
      toPhone = conv?.contact?.phone_normalized;
      convInfo = conv;
    }
    if (!toPhone) return res.status(400).json({ message: 'No phone number found' });

    let accounts = [];
    const accId = convInfo?.whatsapp_account_id;
    if (accId) {
      const { data } = await supabase.from('whatsapp_accounts').select('phone_number_id, access_token').eq('id', accId).eq('is_active', true);
      if (data && data.length > 0) accounts = data;
    }
    if (accounts.length === 0) {
      const { data } = await supabase.from('whatsapp_accounts').select('phone_number_id, access_token').eq('is_active', true);
      if (data) accounts = data;
    }
    if (!accounts.length) return res.status(500).json({ message: 'No active WhatsApp account' });

    const mime = mediaMimeType || '';
    const msgType = mediaUrl ? (mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'document') : 'text';

    let msg;
    if (messageId) {
      const { data: existing } = await supabase.from('messages').select('*').eq('id', messageId).maybeSingle();
      msg = existing;
    }
    if (!msg) {
      const { data: newMsg, error: msgErr } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        contact_id: contactId || null,
        user_id: userId || null,
        direction: 'outbound',
        message_type: msgType,
        body_text: mediaUrl ? '' : (messageText || ''),
        media_url: mediaUrl || null,
        media_mime_type: mediaMimeType || null,
        status: 'queued',
      }).select().single();
      if (msgErr) return res.status(500).json({ message: msgErr.message });
      msg = newMsg;
    }

    if (mediaUrl && (mediaMimeType?.startsWith('audio/') || mime.startsWith('audio/'))) {
      try {
        const download = await fetch(mediaUrl);
        if (!download.ok) throw new Error('Failed to download media');
        const buffer = Buffer.from(await download.arrayBuffer());
        const ext = (mediaMimeType || 'audio/mp4').split('/')[1]?.split(';')[0] || 'mp4';
        const boundary = 'up' + Math.random().toString(36).slice(2);
        const metaBody = Buffer.concat([
          Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="messaging_product"\r\n\r\nwhatsapp\r\n' +
            '--' + boundary + '\r\nContent-Disposition: form-data; name="type"\r\n\r\n' + (mediaMimeType || 'audio/mp4') + '\r\n' +
            '--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="audio.' + ext + '"\r\nContent-Type: ' + (mediaMimeType || 'audio/mp4') + '\r\n\r\n'),
          buffer,
          Buffer.from('\r\n--' + boundary + '--\r\n'),
        ]);
        const upRes = await fetch(`https://graph.facebook.com/v23.0/${accounts[0].phone_number_id}/media`, {
          method: 'POST', headers: { Authorization: `Bearer ${accounts[0].access_token}`, 'Content-Type': 'multipart/form-data; boundary=' + boundary },
          body: metaBody,
        });
        const upData = await upRes.json();
        if (upRes.ok && upData.id) {
          const sendRes = await fetch(`https://graph.facebook.com/v23.0/${accounts[0].phone_number_id}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accounts[0].access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messaging_product: 'whatsapp', to: toPhone.replace(/[^0-9]/g, ''),
              type: 'audio', audio: { id: upData.id },
            }),
          });
          const sendData = await sendRes.json();
          if (sendRes.ok && sendData.messages?.[0]?.id) {
            await supabase.from('messages').update({ status: 'sent', wa_message_id: sendData.messages[0].id, status_updated_at: new Date().toISOString() }).eq('id', msg.id);
            return res.json({ success: true });
          }
        }
      } catch (audioErr) {
        console.error('Audio send error:', audioErr);
      }
    }

    await supabase.from('messages').update({ status: 'failed', failure_reason: 'Meta send failed', status_updated_at: new Date().toISOString() }).eq('id', msg.id);
    res.json({ message: 'Meta send failed', msg });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/whatsapp/send-file', authenticate, uploadApi.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file' });
    const { messageId, conversationId, contactId, userId } = req.body;
    if (!messageId || !conversationId) return res.status(400).json({ message: 'Missing fields' });

    const file = req.file;
    const ext = (file.mimetype || 'bin').split('/')[1]?.split(';')[0] || 'bin';
    const fileName = `msg_${messageId}_${Date.now()}.${ext}`;
    const { error: storeErr } = await supabase.storage.from('whatsapp-media').upload(fileName, file.buffer, { contentType: file.mimetype, upsert: true });
    if (storeErr) return res.status(500).json({ message: 'Storage upload failed', error: storeErr.message });

    const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(fileName);
    const mediaUrl = urlData?.publicUrl || '';

    const mimeType = file.mimetype.startsWith('image/') ? 'image' : file.mimetype.startsWith('video/') ? 'video' : file.mimetype.startsWith('audio/') ? 'audio' : 'document';
    await supabase.from('messages').update({ media_url: mediaUrl, media_mime_type: file.mimetype, message_type: mimeType }).eq('id', messageId);

    let toPhone = '';
    if (contactId) {
      const { data: c } = await supabase.from('contacts').select('phone_normalized').eq('id', contactId).maybeSingle();
      if (c) toPhone = c.phone_normalized;
    }
    if (!toPhone) {
      const { data: conv } = await supabase.from('conversations').select('*, contact:contacts(phone_normalized)').eq('id', conversationId).maybeSingle();
      if (conv?.contact) toPhone = conv.contact.phone_normalized;
    }
    if (!toPhone) {
      await supabase.from('messages').update({ status: 'sent', failure_reason: 'No phone' }).eq('id', messageId);
      return res.json({ message: 'No phone found, saved to storage only', mediaUrl });
    }

    let accounts = [];
    const { data: convAcc } = await supabase.from('conversations').select('whatsapp_account_id').eq('id', conversationId).maybeSingle();
    const fileAccId = convAcc?.whatsapp_account_id;
    if (fileAccId) {
      const { data } = await supabase.from('whatsapp_accounts').select('phone_number_id, access_token').eq('id', fileAccId).eq('is_active', true);
      if (data && data.length > 0) accounts = data;
    }
    if (accounts.length === 0) {
      const { data } = await supabase.from('whatsapp_accounts').select('phone_number_id, access_token').eq('is_active', true);
      if (data) accounts = data;
    }
    if (!accounts.length) {
      await supabase.from('messages').update({ status: 'sent', failure_reason: 'No WhatsApp account' }).eq('id', messageId);
      return res.json({ message: 'No active account, saved to storage only', mediaUrl });
    }

    let metaDelivered = false;
    try {
      const boundary = 'up' + Math.random().toString(36).slice(2);
      const metaBody = Buffer.concat([
        Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="messaging_product"\r\n\r\nwhatsapp\r\n' +
          '--' + boundary + '\r\nContent-Disposition: form-data; name="type"\r\n\r\n' + file.mimetype + '\r\n' +
          '--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="media.' + ext + '"\r\nContent-Type: ' + file.mimetype + '\r\n\r\n'),
        file.buffer,
        Buffer.from('\r\n--' + boundary + '--\r\n'),
      ]);
      const upR = await fetch(`https://graph.facebook.com/v23.0/${accounts[0].phone_number_id}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accounts[0].access_token}`, 'Content-Type': 'multipart/form-data; boundary=' + boundary },
        body: metaBody,
      });
      const upD = await upR.json();
      if (upR.ok && upD.id) {
        const payload = {
          messaging_product: 'whatsapp',
          to: toPhone.replace(/[^0-9]/g, ''),
          type: mimeType,
          [mimeType]: mimeType === 'document' ? { id: upD.id, caption: '' } : { id: upD.id },
        };
        const sR = await fetch(`https://graph.facebook.com/v23.0/${accounts[0].phone_number_id}/messages`, {
          method: 'POST', headers: { Authorization: `Bearer ${accounts[0].access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        const sD = await sR.json();
        if (sR.ok && sD.messages?.[0]?.id) {
          await supabase.from('messages').update({ status: 'sent', wa_message_id: sD.messages[0].id, status_updated_at: new Date().toISOString() }).eq('id', messageId);
          metaDelivered = true;
        }
      }
    } catch (e) { console.error('Meta send error:', e); }

    if (!metaDelivered) {
      await supabase.from('messages').update({ status: 'sent', status_updated_at: new Date().toISOString() }).eq('id', messageId);
    }

    await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
    res.json({ success: true, mediaUrl, metaDelivered });
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

const CRON_API_KEY = process.env.CRON_API_KEY || null;
const requireCronAuth = (req, res, next) => {
  if (CRON_API_KEY && req.headers['x-api-key'] !== CRON_API_KEY) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
};

    app.post('/api/cron/notifications', requireCronAuth, async (req, res) => {
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

    app.post('/api/cron/email-import', requireCronAuth, async (req, res) => {
      try {
        const { pollEmailInbox } = await import('./services/emailImporter.js');
        const result = await pollEmailInbox();
        res.json(result);
      } catch (error) {
        console.error('Email import cron error:', error.message);
        res.status(500).json({ success: false, message: error.message });
      }
    });

    app.post('/api/cron/generate-daily-codes', requireCronAuth, async (req, res) => {
      try {
        const { generateDailyCodes } = await import('./services/dailyCodeService.js');
        const result = await generateDailyCodes();
        res.json(result);
      } catch (error) {
        console.error('Daily codes cron error:', error.message);
        res.status(500).json({ success: false, message: error.message });
      }
    });

    app.post('/api/cron/razorpay-sync', requireCronAuth, async (req, res) => {
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
