import {
  BatchMessageResult,
  BatchMessageStatus,
  BatchProgress,
  BatchStatus,
} from './entities/message-batch.entity';
import { MessageStatus } from './entities/message.entity';

/**
 * Delivery + reply report for one bulk batch.
 *
 * A bulk batch records only whether each send was accepted or refused (BatchMessageStatus). The
 * recipient's delivery receipt arrives later as an ack that updates the stored `messages` row, and
 * their answer is a separate inbound row. This module joins the two so the broadcast page can say
 * how many were delivered and how many replied yes/no, instead of only "sent / failed".
 *
 * Pure on purpose: the service does the two queries, everything below is deterministic and testable.
 */

export type BatchReportDelivery = 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'cancelled';
export type BatchReportReply = 'yes' | 'no' | 'other' | null;

export interface BatchReportOutbound {
  waMessageId: string;
  status: string;
  createdAt: Date;
}

export interface BatchReportInbound {
  chatId: string;
  from: string;
  body: string | null;
  createdAt: Date;
}

export interface BatchReportBatch {
  status: BatchStatus;
  progress?: BatchProgress | null;
  results?: BatchMessageResult[] | null;
  createdAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

export interface BatchReportLabel {
  name?: string | null;
  mobile?: string | null;
}

export interface BatchReportRow {
  chatId: string;
  messageId: string | null;
  delivery: BatchReportDelivery;
  sentAt: string | null;
  reply: BatchReportReply;
  replyText: string | null;
  repliedAt: string | null;
  /** Donor name carried by the batch's own template variables, when the caller sent one. */
  name?: string | null;
  /** Phone carried by the batch's own template variables; a report falls back to the chat id. */
  mobile?: string | null;
}

/** Summary row for the broadcast history list (no per-recipient rows). */
export interface BatchReportSummary {
  batchId: string;
  status: BatchStatus;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  preview: string | null;
  total: number;
  delivered: number;
  read: number;
  failed: number;
  replied: number;
  repliedYes: number;
  repliedNo: number;
  repliedOther: number;
  noReply: number;
}

export interface BatchReportResponse {
  batchId: string;
  status: BatchStatus;
  total: number;
  attempted: number;
  accepted: number;
  delivered: number;
  read: number;
  failed: number;
  pending: number;
  cancelled: number;
  replied: number;
  repliedYes: number;
  repliedNo: number;
  repliedOther: number;
  noReply: number;
  recipients: BatchReportRow[];
}

// First meaningful word a donor can answer with. Kept to short, unambiguous tokens: a marketing
// reply such as "no problem, send details" leads with "no", and counting it as a refusal is the
// honest reading of what the donor typed.
const YES_WORDS = new Set([
  'yes', 'y', 'yeah', 'yep', 'yup', 'ok', 'okay', 'sure', 'haan', 'han', 'ha', '1',
  'confirm', 'confirmed', 'interested', 'done', 'send',
]);
const NO_WORDS = new Set([
  'no', 'n', 'nope', 'nah', 'nahi', 'not', '2', 'never', 'stop', 'cancel', 'unsubscribe',
]);

/** Classify a free-text (or button-text) reply as yes / no / other. Null when there is no text. */
export function classifyBatchReply(body: string | null | undefined): BatchReportReply {
  const text = String(body ?? '').trim();
  if (!text) return null;
  // Strip leading emoji/punctuation and split on everything that is not a letter or digit, so
  // "✅ Yes!" and "1. YES" both read as yes. The first three tokens are enough to catch the usual
  // "ok sure" / "not now" forms without scanning a whole sentence.
  const tokens = text
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 3);
  if (tokens.length === 0) return 'other';
  if (YES_WORDS.has(tokens[0])) return 'yes';
  if (NO_WORDS.has(tokens[0])) return 'no';
  if (tokens.some(token => YES_WORDS.has(token))) return 'yes';
  if (tokens.some(token => NO_WORDS.has(token))) return 'no';
  return 'other';
}

function digitsOf(id: string | null | undefined): string {
  return String(id ?? '').split('@')[0].replace(/\D/g, '');
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function deliveryOf(result: BatchMessageResult, outbound: BatchReportOutbound | undefined): BatchReportDelivery {
  if (outbound) {
    if (outbound.status === MessageStatus.DELIVERED) return 'delivered';
    if (outbound.status === MessageStatus.READ) return 'read';
    if (outbound.status === MessageStatus.FAILED) return 'failed';
    if (outbound.status === MessageStatus.PENDING) return 'pending';
    return 'sent';
  }
  if (result.status === BatchMessageStatus.SENT) return 'sent';
  if (result.status === BatchMessageStatus.FAILED) return 'failed';
  if (result.status === BatchMessageStatus.CANCELLED) return 'cancelled';
  return 'pending';
}

export function buildBatchReport(input: {
  batchId: string;
  batch: BatchReportBatch;
  outbound: BatchReportOutbound[];
  inbound: BatchReportInbound[];
  /** Optional labels from the batch's own messages (`variables.name` / `variables.mobile`). */
  labels?: Map<string, BatchReportLabel>;
  /**
   * Other ids the same person may reply from, keyed by the batch chat id: WhatsApp sends to
   * `phone@c.us` but the answer can arrive as a privacy `lid@lid`. Empty/absent means exact match.
   */
  aliases?: Map<string, string[]>;
}): BatchReportResponse {
  const { batchId, batch } = input;
  const results = Array.isArray(batch.results) ? batch.results : [];

  const outboundByWaId = new Map<string, BatchReportOutbound>();
  for (const message of input.outbound) outboundByWaId.set(message.waMessageId, message);

  // Every inbound message since the batch started, indexed by chat id and by phone digits. A
  // donor's answer must be after their own message: a message that arrived before the send is not
  // a reply to it, even though it is inside the batch's time window.
  const inboundByChat = new Map<string, BatchReportInbound[]>();
  const inboundByDigits = new Map<string, BatchReportInbound[]>();
  const add = (map: Map<string, BatchReportInbound[]>, key: string, message: BatchReportInbound) => {
    if (!key) return;
    const list = map.get(key);
    if (list) list.push(message);
    else map.set(key, [message]);
  };
  for (const message of input.inbound) {
    add(inboundByChat, message.chatId, message);
    // Both ids matter: a LID chat id's digits are not the phone, so the phone in `from` is the only
    // key that can match a recipient addressed as a number.
    add(inboundByDigits, digitsOf(message.chatId), message);
    add(inboundByDigits, digitsOf(message.from), message);
  }

  const firstReplyAfter = (chatId: string, sentAt: Date | null): BatchReportInbound | undefined => {
    if (!sentAt) return undefined;
    const cutoff = sentAt.getTime();
    // The same message can be reachable by both keys (chat id and `from`); dedupe before choosing.
    const candidates = new Map<string, BatchReportInbound>();
    const keys = input.aliases?.get(chatId) ?? [chatId];
    for (const key of keys) {
      for (const message of [
        ...(inboundByChat.get(key) ?? []),
        ...(inboundByDigits.get(digitsOf(key)) ?? []),
      ]) {
        candidates.set(`${message.chatId}|${message.createdAt.toISOString()}|${message.body ?? ''}`, message);
      }
    }
    return [...candidates.values()]
      .filter(message => message.createdAt.getTime() >= cutoff)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  };

  const recipients: BatchReportRow[] = results.map(result => {
    const outbound = result.messageId ? outboundByWaId.get(result.messageId) : undefined;
    const sentAt = outbound?.createdAt ?? result.sentAt ?? batch.startedAt ?? null;
    const reply = firstReplyAfter(result.chatId, sentAt ? new Date(sentAt) : null);
    const label = input.labels?.get(result.chatId);
    return {
      chatId: result.chatId,
      messageId: result.messageId ?? null,
      delivery: deliveryOf(result, outbound),
      sentAt: toIso(sentAt),
      reply: reply ? classifyBatchReply(reply.body) : null,
      replyText: reply?.body ?? null,
      repliedAt: toIso(reply?.createdAt),
      name: label?.name ?? null,
      mobile: label?.mobile ?? null,
    };
  });

  const delivered = recipients.filter(r => r.delivery === 'delivered' || r.delivery === 'read').length;
  const read = recipients.filter(r => r.delivery === 'read').length;
  const failed = recipients.filter(r => r.delivery === 'failed').length;
  const pending = recipients.filter(r => r.delivery === 'pending').length;
  const cancelled = recipients.filter(r => r.delivery === 'cancelled').length;
  const accepted = recipients.length - failed - pending - cancelled;
  const repliedYes = recipients.filter(r => r.reply === 'yes').length;
  const repliedNo = recipients.filter(r => r.reply === 'no').length;
  const repliedOther = recipients.filter(r => r.reply === 'other').length;
  const replied = repliedYes + repliedNo + repliedOther;
  const total = batch.progress?.total ?? recipients.length;

  return {
    batchId,
    status: batch.status,
    total,
    attempted: recipients.length,
    accepted,
    delivered,
    read,
    failed,
    pending,
    cancelled,
    replied,
    repliedYes,
    repliedNo,
    repliedOther,
    // Nobody in the still-pending tail has replied by definition; count only what was attempted.
    noReply: Math.max(0, recipients.length - replied),
    recipients,
  };
}

/** Reduce a full report to the row the history list shows. */
export function summariseBatchReport(
  report: BatchReportResponse,
  batch: BatchReportBatch,
  preview: string | null,
): BatchReportSummary {
  return {
    batchId: report.batchId,
    status: report.status,
    createdAt: toIso(batch.createdAt),
    startedAt: toIso(batch.startedAt),
    completedAt: toIso(batch.completedAt),
    preview,
    total: report.total,
    delivered: report.delivered,
    read: report.read,
    failed: report.failed,
    replied: report.replied,
    repliedYes: report.repliedYes,
    repliedNo: report.repliedNo,
    repliedOther: report.repliedOther,
    noReply: report.noReply,
  };
}

