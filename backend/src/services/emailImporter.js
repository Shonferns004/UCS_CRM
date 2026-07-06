import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import groq from '../config/groq.js';
import emailConfig from '../config/emailConfig.js';
import supabase from '../config/supabase.js';
import { isEmailProcessed, logImport } from '../models/emailImportLogModel.js';
import { getSources } from '../models/bankAuditModel.js';
import { createEntry } from '../models/bankAuditModel.js';

let lastPollResult = { success: null, message: 'Not run yet', count: 0, timestamp: null, error: null };

const BANK_EMAIL_DOMAINS = [
  { domain: 'axisbank.com', source: 'Axis Bank' },
  { domain: 'hdfcbank.com', source: 'HDFC Bank' },
  { domain: 'icicibank.com', source: 'ICICI Bank' },
  { domain: 'sbicard.com', source: 'SBI' },
  { domain: 'onlinesbi.com', source: 'SBI' },
  { domain: 'sbi.co.in', source: 'SBI' },
  { domain: 'yesbank.in', source: 'Yes Bank' },
  { domain: 'kotak.com', source: 'Kotak Mahindra' },
  { domain: 'rblbank.com', source: 'RBL Bank' },
  { domain: 'idfcfirstbank.com', source: 'IDFC First Bank' },
  { domain: 'indusind.com', source: 'IndusInd Bank' },
  { domain: 'federalbank.co.in', source: 'Federal Bank' },
  { domain: 'canarabank.com', source: 'Canara Bank' },
  { domain: 'pnb.co.in', source: 'PNB' },
  { domain: 'bankofbaroda.com', source: 'Bank of Baroda' },
  { domain: 'unionbankofindia.com', source: 'Union Bank' },
  { domain: 'bankofindia.co.in', source: 'Bank of India' },
  { domain: 'centralbankofindia.co.in', source: 'Central Bank' },
  { domain: 'dbs.com', source: 'DBS Bank' },
  { domain: 'gpay.com', source: 'GPay' },
  { domain: 'googlepay', source: 'GPay' },
  { domain: 'razorpay.com', source: 'Razorpay' },
  { domain: 'paytm.com', source: 'Paytm' },
  { domain: 'phonepe.com', source: 'PhonePe' },
];

function detectSourceFromSender(emailFrom) {
  if (!emailFrom) return null;
  const lower = emailFrom.toLowerCase();
  for (const entry of BANK_EMAIL_DOMAINS) {
    if (lower.includes(entry.domain)) return entry.source;
  }
  return null;
}

function normalizeSourceName(name) {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  const map = {
    'gpay': 'GPay',
    'google pay': 'GPay',
    'googlepay': 'GPay',
    'g-pay': 'GPay',
    'phonepe': 'PhonePe',
    'phone pe': 'PhonePe',
    'paytm': 'Paytm',
    'razorpay': 'Razorpay',
    'axis bank': 'Axis Bank',
    'axis': 'Axis Bank',
    'saraswat bank': 'Saraswat Bank',
    'saraswat': 'Saraswat Bank',
    'hdfc': 'HDFC Bank',
    'hdfc bank': 'HDFC Bank',
    'icici': 'ICICI Bank',
    'icici bank': 'ICICI Bank',
    'sbi': 'SBI',
    'state bank of india': 'SBI',
    'yes bank': 'Yes Bank',
    'kotak': 'Kotak Mahindra',
    'kotak mahindra': 'Kotak Mahindra',
    'idfc': 'IDFC First Bank',
    'idfc first': 'IDFC First Bank',
    'indusind': 'IndusInd Bank',
    'federal bank': 'Federal Bank',
    'canara bank': 'Canara Bank',
    'pnb': 'PNB',
    'bank of baroda': 'Bank of Baroda',
    'union bank': 'Union Bank',
    'bank of india': 'Bank of India',
    'central bank': 'Central Bank',
    'dbs bank': 'DBS Bank',
    'rbl bank': 'RBL Bank',
    'check': 'Check',
    'cheque': 'Check',
    'cash': 'Cash',
    'bank transfer': 'Bank Transfer',
    'neft': 'Bank Transfer',
    'imps': 'Bank Transfer',
    'rtgs': 'Bank Transfer',
    'upi': 'UPI',
  };
  return map[n] || name.trim();
}

async function getOrCreateSourceId(sources, name) {
  const normalized = normalizeSourceName(name);
  if (!normalized) return null;
  let match = sources.find(s => s.name.toLowerCase() === normalized.toLowerCase());
  if (match) return match.id;
  const { data: newSource, error } = await supabase
    .from('bank_audit_sources')
    .insert({ name: normalized, sort_order: 99 })
    .select()
    .single();
  if (error) return null;
  sources.push(newSource);
  return newSource.id;
}

async function extractPaymentDetails(emailText, emailSubject, emailFrom) {
  const textToAnalyze = [
    emailSubject ? `Subject: ${emailSubject}` : '',
    emailFrom ? `From: ${emailFrom}` : '',
    emailText ? `Body:\n${emailText.slice(0, 3000)}` : '',
  ].filter(Boolean).join('\n');

  if (!textToAnalyze) return null;

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are a payment receipt parser. Extract payment details from the email text.

The email could be from:
- Bank transaction alerts (Axis Bank, HDFC, ICICI, SBI etc) - look for "credited", "deposited", "transaction", "NEFT", "IMPS", "RTGS", "UPI ref"
- Payment gateways (GPay, Razorpay, Paytm, PhonePe) - look for "payment received", "money received", "transfer"
- Donor payment confirmation emails

Return ONLY valid JSON with these fields (use null for missing):
{
  "amount": number or null,
  "payment_id": "transaction ID / UPI ref / payment reference or null",
  "transaction_date": "YYYY-MM-DD or null",
  "sender_name": "name of the person who paid or null",
  "payment_source": "Axis Bank / HDFC Bank / ICICI Bank / SBI / GPay / Razorpay / Paytm / PhonePe / etc or null",
  "confidence": "high / medium / low"
}

Rules:
- Amount should be a number (remove currency symbols, commas)
- Payment source: detect from email content - if it mentions a bank name like Axis/HDFC/SBI/ICICI, use that
- For bank transfer emails, set payment_source to the bank name
- Transaction date: prefer date from email if present, else use null
- sender_name: the person who made the payment (for banks, look for "from" or sender name in narration)
- If the email does NOT appear to be a payment/transaction notification, set all fields to null and confidence to "low"`,
        },
        { role: 'user', content: textToAnalyze },
      ],
      model: 'llama-3.3-70b-versatile',
      max_tokens: 200,
      temperature: 0.1,
    });

    const response = completion.choices[0]?.message?.content?.trim() || '';
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Groq parse error:', error.message);
    return null;
  }
}

export async function pollEmailInbox() {
  if (!emailConfig.enabled) {
    lastPollResult = { success: null, message: 'Email import disabled (IMAP_ENABLED=false)', count: 0, timestamp: new Date().toISOString(), error: null };
    return lastPollResult;
  }

  if (!emailConfig.imap.auth.user || !emailConfig.imap.auth.pass) {
    lastPollResult = { success: null, message: 'IMAP credentials not configured', count: 0, timestamp: new Date().toISOString(), error: null };
    return lastPollResult;
  }

  const client = new ImapFlow(emailConfig.imap);
  let processed = 0;
  let errors = 0;
  let skipped = 0;

  try {
    await client.connect();
    await client.mailboxOpen(emailConfig.imapMailbox);

    const messages = await client.search({ seen: false });
    if (!messages || messages.length === 0) {
      await client.logout();
      lastPollResult = { success: true, message: 'No new emails', count: 0, timestamp: new Date().toISOString(), error: null };
      return lastPollResult;
    }

    const sources = await getSources();
    if (!sources || sources.length === 0) {
      console.warn('[emailImporter] No bank audit sources found, creating default ones...');
    }

    for await (const msg of client.fetch(messages, { source: true })) {
      try {
        const parsed = await simpleParser(msg.source);
        const messageId = parsed.messageId || msg.uid?.toString();

        if (!messageId) {
          skipped++;
          continue;
        }

        const existing = await isEmailProcessed(messageId);
        if (existing) {
          skipped++;
          continue;
        }

        const emailSubject = parsed.subject || '';
        const emailFrom = parsed.from?.text || '';
        const emailText = parsed.text || parsed.html || '';
        const receivedAt = parsed.date || new Date().toISOString();

        const senderSource = detectSourceFromSender(emailFrom);
        const details = await extractPaymentDetails(emailText, emailSubject, emailFrom);

        if (details && details.confidence !== 'low' && details.amount != null) {
          let sourceName = details.payment_source;
          if (!sourceName && senderSource) sourceName = senderSource;

          let sourceId = sourceName ? await getOrCreateSourceId(sources, sourceName) : null;
          const paymentSource = sourceName || senderSource || 'GPay';

          const transactionDate = details.transaction_date
            ? details.transaction_date
            : receivedAt ? receivedAt.slice(0, 10) : new Date().toISOString().slice(0, 10);

          const entry = await createEntry({
            source_id: sourceId || 1,
            amount: details.amount,
            payment_id: details.payment_id || null,
            transaction_date: transactionDate,
            remarks: `Auto-imported from email: ${emailSubject}`,
            created_by: null,
          });

          await logImport({
            email_message_id: messageId,
            email_subject: emailSubject,
            email_from: emailFrom,
            received_at: receivedAt,
            parsed_amount: details.amount,
            parsed_payment_id: details.payment_id,
            parsed_transaction_date: transactionDate,
            parsed_source: paymentSource,
            parsed_sender_name: details.sender_name,
            bank_entry_id: entry.id,
            status: 'imported',
            raw_snippet: emailText.slice(0, 500),
          });

          processed++;
          console.log(`[emailImporter] Imported: ${emailSubject} -> \u20B9${details.amount} (${paymentSource})`);
        } else {
          await logImport({
            email_message_id: messageId,
            email_subject: emailSubject,
            email_from: emailFrom,
            received_at: receivedAt,
            status: 'skipped',
            error_message: senderSource ? `Bank alert (${senderSource}) but no amount found` : (details ? 'Low confidence or no payment data' : 'Failed to parse'),
            raw_snippet: emailText.slice(0, 500),
          });
          skipped++;
        }
      } catch (msgError) {
        console.error('[emailImporter] Error processing message:', msgError.message);
        errors++;
      }
    }

    await client.logout();
  } catch (error) {
    console.error('[emailImporter] IMAP error:', error.message);
    try { await client.logout(); } catch {}
    lastPollResult = { success: false, message: `IMAP error: ${error.message}`, count: processed, timestamp: new Date().toISOString(), error: error.message };
    return lastPollResult;
  }

  lastPollResult = {
    success: true,
    message: `Processed: ${processed} imported, ${skipped} skipped, ${errors} errors`,
    count: processed,
    timestamp: new Date().toISOString(),
    error: null,
  };
  return lastPollResult;
}

export function getLastPollResult() {
  return lastPollResult;
}
