import {
  getMailboxAttachment,
  getMailboxMessage,
  listMailboxMessages,
  setMailboxMessageRead,
  syncMailbox,
} from '../services/mailboxService.js';

// ---------------------------------------------------------------------------
// Bulk Email > Mailbox tab. Read-only mailbox mirror: list, open, mark read and
// download attachments. Sending from here is deliberately out of scope; the
// campaign flow owns outgoing mail.
// ---------------------------------------------------------------------------

function safeFilename(value) {
  return String(value || 'attachment').replace(/["\r\n\\]/g, '_').slice(0, 180) || 'attachment';
}

export async function listMessages(req, res) {
  try {
    const data = await listMailboxMessages({
      email: req.query?.email,
      folder: req.query?.folder,
      search: req.query?.search,
      unreadOnly: String(req.query?.unread || '') === '1',
      limit: req.query?.limit,
      before: req.query?.before || null,
    });
    return res.json(data);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

export async function getMessage(req, res) {
  try {
    const message = await getMailboxMessage(req.params.id);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    return res.json(message);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

export async function downloadAttachment(req, res) {
  try {
    const file = await getMailboxAttachment(req.params.id, req.params.index);
    if (!file) return res.status(404).json({ message: 'Attachment not found on the mail server' });
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(file.filename)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(file.content);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

export async function sync(req, res) {
  try {
    const email = String(req.body?.email || '').trim();
    if (!email) return res.status(400).json({ message: 'Mailbox email is required' });
    const result = await syncMailbox(email);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

export async function markRead(req, res) {
  try {
    const read = req.body?.read !== false;
    const updated = await setMailboxMessageRead(req.params.id, read);
    if (!updated) return res.status(404).json({ message: 'Message not found' });
    return res.json(updated);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}
