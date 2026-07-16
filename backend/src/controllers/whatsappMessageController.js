const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

export const sendMessage = async (req, res) => {
  try {
    const { conversationId, messageText, mediaUrl, mediaMimeType } = req.body;
    if (!conversationId && !messageText && !mediaUrl) {
      return res.status(400).json({ error: 'conversationId and messageText or mediaUrl required' });
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-message`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
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
