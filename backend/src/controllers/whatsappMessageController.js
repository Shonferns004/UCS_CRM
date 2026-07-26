import supabase from '../config/supabase.js';

export const sendMessage = async (req, res) => {
  try {
    const { conversationId, messageText, mediaUrl, mediaMimeType } = req.body;
    if (!conversationId && !messageText && !mediaUrl) {
      return res.status(400).json({ error: 'conversationId and messageText or mediaUrl required' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return res.status(503).json({ message: 'Edge function not configured (missing SUPABASE_URL or SUPABASE_SERVICE_KEY)' });
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/send-message`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversationId, messageText, mediaUrl, mediaMimeType }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error || 'Failed to send' });
    }
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
