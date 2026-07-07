import config from '../config/whatsappConfig.js';

const API_BASE = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;

async function sendViaSupabase(to, messageText) {
  const body = {
    phone: String(to).replace(/[^0-9]/g, ''),
    messageText,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);

  try {
    const res = await fetch(config.supabaseFunctionUrl, {
      method: 'POST',
      headers: {
        'x-api-key': config.supabaseApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || JSON.stringify(data));
    return { source: 'supabase', data };
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('WhatsApp function timed out after 55s');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function trySupabaseFirst(fn) {
  if (!config.supabaseFunctionUrl || !config.supabaseApiKey) return null;
  return fn;
}

export async function sendTextMessage(to, text) {
  if (!config.enabled) throw new Error('WhatsApp not configured');

  const supabaseFn = trySupabaseFirst(() => sendViaSupabase(to, text));
  if (supabaseFn) {
    try {
      return await supabaseFn();
    } catch (error) {
      console.error('Supabase WhatsApp failed, falling back to Facebook API:', error.message);
    }
  }

  return sendViaFacebook(to, 'text', { text: { body: text } });
}

export async function sendTemplateMessage(to, templateName, parameters, lang = 'en') {
  if (!config.enabled) throw new Error('WhatsApp not configured');

  const supabaseFn = trySupabaseFirst(() => {
    const paramsStr = parameters.map((p, i) => `{{${i + 1}}}`).join(', ');
    const messageText = `Template: ${templateName} | Params: ${paramsStr} | Values: ${parameters.join(', ')}`;
    return sendViaSupabase(to, messageText);
  });
  if (supabaseFn) {
    try {
      return await supabaseFn();
    } catch (error) {
      console.error('Supabase WhatsApp failed, falling back to Facebook API:', error.message);
    }
  }

  return sendViaFacebook(to, 'template', {
    template: {
      name: templateName,
      language: { code: lang },
      components: [
        {
          type: 'body',
          parameters: parameters.map(p => ({ type: 'text', text: String(p) })),
        },
      ],
    },
  });
}

export async function sendReceiptMessage(to, donorName, amount, receiptNo, date) {
  const formattedAmount = typeof amount === 'number' ? '\u20B9' + amount.toLocaleString('en-IN') : amount;
  const messageText = `Receipt: ${receiptNo}\nDonor: ${donorName}\nAmount: ${formattedAmount}\nDate: ${date}`;

  const supabaseFn = trySupabaseFirst(() => sendViaSupabase(to, messageText));
  if (supabaseFn) {
    try {
      return await supabaseFn();
    } catch (error) {
      console.error('Supabase WhatsApp failed, falling back to Facebook API:', error.message);
    }
  }

  return sendTemplateMessage(to, config.receiptTemplate, [
    donorName,
    formattedAmount,
    receiptNo,
    date,
  ]);
}

export async function sendNgoInfoTemplate(to, name) {
  const ngoName = 'Being Sevak Charitable Trust';
  const num1 = '8879035035';
  const num2 = '8879034034';
  const email = 'being.sevak@gmail.com';
  const messageText = `NGO: ${ngoName}\nDonor: ${name}\nContact: ${num1}, ${num2}\nEmail: ${email}`;

  const supabaseFn = trySupabaseFirst(() => sendViaSupabase(to, messageText));
  if (supabaseFn) {
    try {
      return await supabaseFn();
    } catch (error) {
      console.error('Supabase WhatsApp failed, falling back to Facebook API:', error.message);
    }
  }

  return sendViaFacebook(to, 'template', {
    template: {
      name: 'ngo_information',
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: ngoName },
            { type: 'text', text: name },
            { type: 'text', text: ngoName },
            { type: 'text', text: '8879035035' },
            { type: 'text', text: '8879034034' },
            { type: 'text', text: email },
          ],
        },
      ],
    },
  });
}

export async function sendDocumentMessage(to, documentUrl, caption, filename) {
  if (!config.enabled) throw new Error('WhatsApp not configured');

  const supabaseFn = trySupabaseFirst(() => {
    const messageText = `${caption}\n\nDocument: ${documentUrl}`;
    return sendViaSupabase(to, messageText);
  });
  if (supabaseFn) {
    try {
      return await supabaseFn();
    } catch (error) {
      console.error('Supabase WhatsApp failed, falling back to Facebook API:', error.message);
    }
  }

  return sendViaFacebook(to, 'document', {
    document: {
      link: documentUrl,
      caption: caption || '',
      filename: filename || 'receipt.pdf',
    },
  });
}

async function sendViaFacebook(to, type, payload) {
  const body = {
    messaging_product: 'whatsapp',
    to: String(to).replace(/[^0-9]/g, ''),
    type,
    ...payload,
  };

  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || JSON.stringify(data));
  return data;
}

export async function testConnection() {
  if (!config.enabled) return { success: false, message: 'WhatsApp not configured' };

  if (config.supabaseFunctionUrl && config.supabaseApiKey) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(config.supabaseFunctionUrl, {
        method: 'POST',
        headers: {
          'x-api-key': config.supabaseApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone: 'test', messageText: 'test' }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) return { success: true, message: 'Supabase WhatsApp function reachable' };
      const data = await res.json();
      return { success: true, message: `Supabase function responded: ${data.error || 'OK'}` };
    } catch (error) {
      console.error('Supabase connection test failed, trying Facebook API:', error.message);
    }
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}`,
      { headers: { Authorization: `Bearer ${config.accessToken}` } }
    );
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.error?.message || 'Connection failed' };
    return { success: true, message: `Phone: ${data.display_phone_number || data.id || 'OK'}` };
  } catch (error) {
    return { success: false, message: error.message };
  }
}