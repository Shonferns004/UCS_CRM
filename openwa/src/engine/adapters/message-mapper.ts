import { EditedMessage, IncomingMessage } from '../interfaces/whatsapp-engine.interface';

/**
 * Bounds on an inbound poll, applied by the engine. WhatsApp itself allows 12 options of 100
 * characters under a 255-character question; these sit well above that, so nothing a client can send
 * is cut, while a malformed poll cannot bloat a stored row, a webhook payload or a socket frame. A poll
 * over a bound is truncated, not dropped.
 */
export const POLL_MAX_OPTIONS = 32;
export const POLL_TEXT_MAX_LENGTH = 1024;

/** A poll question or option text, cut to {@link POLL_TEXT_MAX_LENGTH}. */
export function boundPollText(text: string): string {
  return text.slice(0, POLL_TEXT_MAX_LENGTH);
}

/** A poll's options, cut to {@link POLL_MAX_OPTIONS} entries of at most {@link POLL_TEXT_MAX_LENGTH}. */
export function boundPollOptions(options: string[]): string[] {
  return options.slice(0, POLL_MAX_OPTIONS).map(boundPollText);
}

/**
 * Project an engine-neutral message base into the public edit-event contract. Kept shared so an
 * edit-event producer cannot drift on identity, direction, group, type, or filter fields.
 */
export function buildEditedMessage(message: IncomingMessage, hasMedia: boolean): EditedMessage {
  return {
    messageId: message.id,
    chatId: message.chatId,
    body: message.body,
    senderId: message.author ?? message.from,
    from: message.from,
    to: message.to,
    fromMe: message.fromMe,
    isGroup: message.isGroup,
    type: message.type,
    hasMedia,
    ...(message.author ? { author: message.author } : {}),
    ...(message.mentionedIds ? { mentionedIds: message.mentionedIds } : {}),
    timestamp: message.timestamp,
  };
}
