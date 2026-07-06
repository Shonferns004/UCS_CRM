import { handleRazorpayWebhook, syncRazorpayPayments } from '../services/razorpayWebhook.js';
import { handlePaytmWebhook } from '../services/paytmWebhook.js';
import { getWebhookLog, countWebhookByStatus } from '../models/paymentWebhookLogModel.js';

export async function razorpayWebhookEntry(req, res) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const result = await handleRazorpayWebhook(rawBody, signature);
    return res.status(result.status || 200).json(result);
  } catch (error) {
    console.error('[webhook] Razorpay error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function paytmWebhookEntry(req, res) {
  try {
    const signature = req.headers['x-checksum'] || req.headers['x-paytm-checksum'] || req.body.CHECKSUMHASH || '';
    const result = await handlePaytmWebhook(req.body, signature);
    return res.status(result.status || 200).json(result);
  } catch (error) {
    console.error('[webhook] Paytm error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function triggerRazorpaySync(req, res) {
  try {
    const result = await syncRazorpayPayments();
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getWebhookStatus(req, res) {
  try {
    const counts = await countWebhookByStatus();
    return res.json({ counts });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function getWebhookLogs(req, res) {
  try {
    const { gateway, status } = req.query;
    const log = await getWebhookLog({ gateway, status, limit: 100 });
    return res.json(log);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}
