import {
  getFroConversations,
  getConversationMessages,
  sendFroReply,
  sendDirectMessage,
  markConversationRead,
  getFroUnreadCount,
  getQuickReplies,
  getTemplates,
  sendTemplateReply,
  searchFroMessages,
  updateConversationLabels,
  uploadFroMedia,
} from '../services/froWhatsAppService.js';

export async function listConversations(req, res) {
  try {
    const conversations = await getFroConversations(req.user.id);
    return res.json(conversations);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function listMessages(req, res) {
  try {
    const { id } = req.params;
    const messages = await getConversationMessages(id);
    return res.json(messages);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function sendMessage(req, res) {
  try {
    const { id } = req.params;
    const { text, mediaUrl } = req.body;

    if ((!text || !text.trim()) && !mediaUrl) {
      return res.status(400).json({ message: 'Message text or media URL is required' });
    }

    const message = await sendFroReply(id, req.user.id, text?.trim() || '', mediaUrl);
    return res.json({ success: true, message });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function sendDirect(req, res) {
  try {
    const { phone, text } = req.body;
    if (!phone || !text || !text.trim()) {
      return res.status(400).json({ message: 'Phone and text are required' });
    }

    const result = await sendDirectMessage(req.user.id, phone, text.trim());
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function markRead(req, res) {
  try {
    const { id } = req.params;
    await markConversationRead(id, req.user.id);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function unreadCount(req, res) {
  try {
    const count = await getFroUnreadCount(req.user.id);
    return res.json({ count });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function listQuickReplies(req, res) {
  try {
    const replies = await getQuickReplies();
    return res.json(replies);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function listTemplates(req, res) {
  try {
    const { project } = req.query;
    const templates = await getTemplates(project);
    return res.json(templates);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function sendTemplate(req, res) {
  try {
    const { conversationId, templateName, paramValues } = req.body;
    if (!conversationId || !templateName) {
      return res.status(400).json({ message: 'conversationId and templateName are required' });
    }
    const message = await sendTemplateReply(conversationId, req.user.id, templateName, paramValues || []);
    return res.json({ success: true, message });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function searchMessages(req, res) {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.json([]);
    }
    const results = await searchFroMessages(req.user.id, q.trim());
    return res.json(results);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function updateLabels(req, res) {
  try {
    const { id } = req.params;
    const { labels } = req.body;
    if (!Array.isArray(labels)) {
      return res.status(400).json({ message: 'labels must be an array' });
    }
    await updateConversationLabels(id, labels);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function uploadMedia(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    const record = await uploadFroMedia(req.user.id, req.file);
    return res.json({ url: record.file_url, name: record.name, type: record.file_type });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}
