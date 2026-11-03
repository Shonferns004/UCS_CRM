import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Send, Sparkles, X } from 'lucide-react';
import { messageApi } from '../services/api';
import { smartReplyApi } from '../services/smartReplies';
import { messagesQueryKey } from '../hooks/useChatMessages';
import { useToast } from '../hooks/useToast';
import './SmartReplyPanel.css';

interface SmartReplyPanelProps {
  sessionId: string;
  chatId: string;
  /** The newest unanswered inbound message, or null when there is nothing to answer. */
  inbound: { id: string; body: string } | null;
  onSent?: (text: string) => void;
}

/**
 * A draft reply for the chat's latest inbound message.
 *
 * It NEVER sends by itself. The approved answer appears immediately (no model in the way), the AI
 * polish replaces it a moment later when the provider answers, and the operator edits and presses
 * Send — or dismisses the card for this message.
 */
export function SmartReplyPanel({ sessionId, chatId, inbound, onSent }: SmartReplyPanelProps) {
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToast();
  const [draft, setDraft] = useState('');
  const [dismissed, setDismissed] = useState('');
  const [regenerate, setRegenerate] = useState(0);
  const [sending, setSending] = useState(false);

  const messageId = inbound?.id || '';
  const hidden = !inbound || dismissed === messageId;

  // Step 1: the approved answer, straight from the knowledge base. Fast and offline-safe.
  const base = useQuery({
    queryKey: ['smart-reply', sessionId, chatId, messageId, 'base', regenerate],
    queryFn: () => smartReplyApi.suggest(inbound!.body, false),
    enabled: Boolean(inbound) && !hidden,
    staleTime: Infinity,
    retry: 0,
  });

  // Step 2: the polish. Only once a stored answer matched, and only if a provider is configured.
  const ai = useQuery({
    queryKey: ['smart-reply', sessionId, chatId, messageId, 'ai', regenerate],
    queryFn: () => smartReplyApi.suggest(inbound!.body, true),
    enabled: Boolean(inbound) && !hidden && Boolean(base.data?.matched) && Boolean(base.data?.aiConfigured),
    staleTime: Infinity,
    retry: 0,
  });

  const suggestion = ai.data?.source === 'ai' ? ai.data : base.data;

  useEffect(() => {
    setDraft(suggestion?.draft || '');
  }, [suggestion?.draft, messageId, regenerate]);

  if (!inbound || hidden) return null;
  // No stored answer matched: stay out of the way rather than guess.
  if (!base.data?.matched) return null;

  const refining = base.data.aiConfigured && ai.isFetching;
  const sourceLabel =
    suggestion?.source === 'ai'
      ? 'AI-polished from your answer'
      : base.data.aiConfigured
        ? 'Your approved answer'
        : 'Your approved answer';

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await messageApi.sendText(sessionId, chatId, text);
      await queryClient.invalidateQueries({ queryKey: messagesQueryKey(sessionId, chatId) });
      showSuccess('Reply sent');
      setDismissed(messageId);
      onSent?.(text);
    } catch (err) {
      showError('Could not send the reply', err instanceof Error ? err.message : undefined);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="smart-reply" role="region" aria-label="Suggested reply">
      <div className="smart-reply-head">
        <span className="smart-reply-badge">
          <Sparkles size={13} />
          Suggested reply
        </span>
        <span className="smart-reply-match" title={base.data.matched.question}>
          matched: {base.data.matched.question}
          <b>{Math.round(base.data.matched.score * 100)}%</b>
        </span>
        {refining && (
          <span className="smart-reply-refining">
            <Loader2 size={12} className="animate-spin" /> refining…
          </span>
        )}
        <div className="smart-reply-head-actions">
          <button
            type="button"
            className="smart-reply-icon"
            title="Regenerate"
            aria-label="Regenerate suggestion"
            onClick={() => setRegenerate(value => value + 1)}
            disabled={sending || ai.isFetching}
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            className="smart-reply-icon"
            title="Dismiss"
            aria-label="Dismiss suggestion"
            onClick={() => setDismissed(messageId)}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <textarea
        className="smart-reply-draft"
        value={draft}
        rows={Math.min(5, Math.max(2, draft.split('\n').length))}
        onChange={event => setDraft(event.target.value)}
        aria-label="Reply draft"
      />

      <div className="smart-reply-foot">
        <span className="smart-reply-source">{sourceLabel}</span>
        <button
          type="button"
          className="btn-primary smart-reply-send"
          onClick={() => void handleSend()}
          disabled={sending || !draft.trim()}
        >
          {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          Send
        </button>
      </div>
    </div>
  );
}
