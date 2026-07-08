import supabase from '../config/supabase.js';
import { logWebhook } from '../models/paymentWebhookLogModel.js';
import { getSources } from '../models/bankAuditModel.js';

let cachedSources = null;
let lastSourceFetch = 0;

async function getSourceIdByName(name) {
  const now = Date.now();
  if (!cachedSources || now - lastSourceFetch > 60000) {
    cachedSources = await getSources();
    lastSourceFetch = now;
  }
  const match = cachedSources.find(s => s.name.toLowerCase() === name.toLowerCase());
  if (match) return match.id;
  return null;
}

export async function ensureRazorpaySource() {
  const sources = await getSources();
  const exists = sources.find(s => s.name === 'Razorpay');
  if (exists) return exists.id;
  const { data, error } = await supabase
    .from('bank_audit_sources')
    .insert({ name: 'Razorpay', sort_order: 2 })
    .select()
    .single();
  if (error) throw error;
  cachedSources = null;
  return data.id;
}

export async function ensurePaytmSource() {
  const sources = await getSources();
  const exists = sources.find(s => s.name === 'Paytm');
  if (exists) return exists.id;
  const { data, error } = await supabase
    .from('bank_audit_sources')
    .insert({ name: 'Paytm', sort_order: 7 })
    .select()
    .single();
  if (error) throw error;
  cachedSources = null;
  return data.id;
}

export async function processPayment({
  gateway, paymentId, orderId, amount, gatewaySource,
  senderName, senderEmail, senderPhone, eventType, rawPayload,
}) {
  try {
    let sourceId;
    if (gateway === 'razorpay') {
      sourceId = await ensureRazorpaySource();
    } else if (gateway === 'paytm') {
      sourceId = await ensurePaytmSource();
    } else {
      sourceId = await getSourceIdByName(gateway);
    }

    if (!sourceId) {
      sourceId = 1;
    }

    const remarks = [
      `Via ${gateway}`,
      gatewaySource ? `(${gatewaySource})` : '',
      orderId ? `Order: ${orderId}` : '',
      senderName ? `- ${senderName}` : '',
    ].filter(Boolean).join(' ');

    const { data: entry, error: entryError } = await supabase
      .from('bank_audit_entries')
      .insert({
        source_id: sourceId,
        amount,
        payment_id: paymentId || null,
        transaction_date: new Date().toISOString().slice(0, 10),
        remarks,
        created_by: null,
      })
      .select()
      .single();

    if (entryError) throw entryError;

    await logWebhook({
      gateway,
      event_type: eventType || null,
      payment_id: paymentId || null,
      order_id: orderId || null,
      amount,
      gateway_source: gatewaySource || null,
      sender_name: senderName || null,
      sender_email: senderEmail || null,
      sender_phone: senderPhone || null,
      raw_payload: rawPayload || null,
      bank_entry_id: entry.id,
      status: 'processed',
      error_message: null,
    });

    console.log(`[paymentWebhook] ${gateway}: ₹${amount} (${paymentId || orderId || 'no id'}) -> bank_audit_entry #${entry.id}`);
    return { success: true, entry };
  } catch (error) {
    console.error(`[paymentWebhook] ${gateway} processing error:`, error.message);
    try {
      await logWebhook({
        gateway,
        event_type: eventType || null,
        payment_id: paymentId || null,
        order_id: orderId || null,
        amount,
        gateway_source: gatewaySource || null,
        sender_name: senderName || null,
        sender_email: senderEmail || null,
        sender_phone: senderPhone || null,
        raw_payload: rawPayload || null,
        status: 'failed',
        error_message: error.message,
      });
    } catch {}
    return { success: false, error: error.message };
  }
}
