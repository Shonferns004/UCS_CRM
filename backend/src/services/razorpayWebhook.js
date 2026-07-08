import crypto from 'crypto';
import Razorpay from 'razorpay';
import config from '../config/paymentGatewayConfig.js';
import { processPayment } from './paymentWebhookService.js';

function verifyWebhookSignature(rawBody, signature, webhookSecret) {
  if (!webhookSecret) return false;
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

const razorpayClient = config.razorpay.enabled && config.razorpay.keyId
  ? new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret,
    })
  : null;

export async function handleRazorpayWebhook(rawBody, signature) {
  if (!config.razorpay.enabled) {
    return { success: false, status: 503, message: 'Razorpay integration disabled' };
  }

  if (!verifyWebhookSignature(rawBody, signature, config.razorpay.webhookSecret)) {
    return { success: false, status: 401, message: 'Invalid webhook signature' };
  }

  const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  const event = body.event;
  const payload = body.payload;

  if (event === 'payment.captured' && payload?.payment?.entity) {
    const payment = payload.payment.entity;
    const amount = (payment.amount || 0) / 100;
    const paymentId = payment.id;
    const orderId = payment.order_id;
    const method = payment.method || 'unknown';
    const email = payment.email || null;
    const contact = payment.contact || null;
    const bank = payment.bank || null;
    const cardLast4 = payment.card?.last4 || null;

    let gatewaySource = method;
    if (method === 'upi') gatewaySource = 'UPI';
    else if (method === 'netbanking') gatewaySource = bank || 'Net Banking';
    else if (method === 'card') gatewaySource = cardLast4 ? `Card (${cardLast4})` : 'Card';
    else if (method === 'wallet') gatewaySource = 'Wallet';
    else if (method === 'emi') gatewaySource = 'EMI';

    return await processPayment({
      gateway: 'razorpay',
      paymentId,
      orderId,
      amount,
      gatewaySource,
      senderName: payment.name || null,
      senderEmail: email,
      senderPhone: contact,
      eventType: event,
      rawPayload: payment,
    });
  }

  if (event === 'payment.failed' && payload?.payment?.entity) {
    const payment = payload.payment.entity;
    const amount = (payment.amount || 0) / 100;
    return {
      success: true,
      message: `Payment failed recorded: ${payment.error_description || 'Unknown reason'}`,
      amount,
      paymentId: payment.id,
    };
  }

  return { success: true, message: `Unhandled event: ${event}` };
}

export async function fetchRazorpayPayments(options = {}) {
  if (!razorpayClient) {
    throw new Error('Razorpay not configured');
  }
  const from = options.from || Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
  const to = options.to || Math.floor(Date.now() / 1000);
  const payments = await razorpayClient.payments.all({
    from,
    to,
    count: options.count || 100,
    skip: options.skip || 0,
  });
  return payments;
}

export async function syncRazorpayPayments() {
  if (!razorpayClient) {
    return { success: false, message: 'Razorpay not configured', count: 0 };
  }

  let imported = 0;
  let errors = 0;

  try {
    const payments = await fetchRazorpayPayments({ count: 50 });
    const captured = (payments.items || []).filter(p => p.status === 'captured');

    for (const payment of captured) {
      try {
        const amount = (payment.amount || 0) / 100;
        const paymentId = payment.id;
        const orderId = payment.order_id;
        const method = payment.method || 'unknown';
        const email = payment.email || null;
        const contact = payment.contact || null;
        const bank = payment.bank || null;

        let gatewaySource = method;
        if (method === 'upi') gatewaySource = 'UPI';
        else if (method === 'netbanking') gatewaySource = bank || 'Net Banking';
        else if (method === 'card') gatewaySource = payment.card?.last4 ? `Card (${payment.card.last4})` : 'Card';

        const result = await processPayment({
          gateway: 'razorpay',
          paymentId,
          orderId,
          amount,
          gatewaySource,
          senderName: payment.name || null,
          senderEmail: email,
          senderPhone: contact,
          eventType: 'sync',
          rawPayload: payment,
        });

        if (result.success) imported++;
        else errors++;
      } catch (e) {
        errors++;
      }
    }

    return { success: true, message: `Synced: ${imported} imported, ${errors} errors`, count: imported };
  } catch (error) {
    return { success: false, message: error.message, count: 0 };
  }
}
