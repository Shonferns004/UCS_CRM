import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useToast } from '../hooks/useToast';
import {
  smartReplyApi,
  type ReplySuggestion,
  type ReplyTemplate,
  type ReplyTemplateInput,
} from '../services/smartReplies';
import './SmartReplies.css';

type Draft = { id?: string; question: string; answer: string; keywords: string; enabled: boolean };

const EMPTY_DRAFT: Draft = { question: '', answer: '', keywords: '', enabled: true };

/**
 * The questions the smart-reply assistant knows the answers to.
 *
 * Nothing here is sent to a donor: the chat page drafts a reply from a match and the operator has
 * to press Send. That is why the copy on this page is about *approved answers*, not automation.
 */
export function SmartReplies() {
  useDocumentTitle('Smart replies');
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToast();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [testText, setTestText] = useState('');
  const [tested, setTested] = useState<ReplySuggestion | null>(null);
  const [testing, setTesting] = useState(false);

  const templatesQuery = useQuery({
    queryKey: ['whatsapp-reply-templates'],
    queryFn: smartReplyApi.list,
    staleTime: 15_000,
  });
  const templates = templatesQuery.data?.templates ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['whatsapp-reply-templates'] });

  const saveMutation = useMutation({
    mutationFn: (input: ReplyTemplateInput & { id?: string }) =>
      input.id ? smartReplyApi.update(input.id, input) : smartReplyApi.create(input),
    onSuccess: () => {
      showSuccess('Saved', 'The answer is available to the assistant now.');
      setDraft(null);
      void invalidate();
    },
    onError: error => showError('Could not save', error instanceof Error ? error.message : undefined),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      smartReplyApi.update(id, { enabled }),
    onSuccess: () => void invalidate(),
    onError: error => showError('Could not update', error instanceof Error ? error.message : undefined),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => smartReplyApi.remove(id),
    onSuccess: () => {
      showSuccess('Deleted');
      void invalidate();
    },
    onError: error => showError('Could not delete', error instanceof Error ? error.message : undefined),
  });

  const enabledCount = useMemo(() => templates.filter(row => row.enabled).length, [templates]);

  const openNew = () => setDraft({ ...EMPTY_DRAFT });
  const openEdit = (row: ReplyTemplate) =>
    setDraft({
      id: row.id,
      question: row.question,
      answer: row.answer,
      keywords: row.keywords || '',
      enabled: row.enabled,
    });

  const runTest = async () => {
    const text = testText.trim();
    if (!text || testing) return;
    setTesting(true);
    try {
      setTested(await smartReplyApi.suggest(text, true));
    } catch (error) {
      showError('Could not check', error instanceof Error ? error.message : undefined);
      setTested(null);
    } finally {
      setTesting(false);
    }
  };

  const submitDraft = () => {
    if (!draft) return;
    saveMutation.mutate({
      id: draft.id,
      question: draft.question,
      answer: draft.answer,
      keywords: draft.keywords,
      enabled: draft.enabled,
    });
  };

  return (
    <div className="smart-replies-page">
      <PageHeader
        title="Smart replies"
        subtitle="Approved answers the chat page can draft for you — every reply is still sent by a person"
        actions={
          <button type="button" className="btn-primary" onClick={openNew}>
            <Plus size={16} />
            Add question
          </button>
        }
      />

      <section className="smart-replies-tester">
        <div className="smart-replies-tester-row">
          <Sparkles size={16} />
          <input
            type="text"
            value={testText}
            placeholder="Try a donor message, e.g. “minimum donation kitna hai?”"
            onChange={event => setTestText(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') void runTest();
            }}
          />
          <button type="button" className="btn-secondary" onClick={() => void runTest()} disabled={testing}>
            {testing ? <Loader2 size={15} className="animate-spin" /> : null}
            Check
          </button>
        </div>

        {tested && (
          <div className="smart-replies-result">
            {tested.matched ? (
              <>
                <p className="smart-replies-result-match">
                  Matched <strong>{tested.matched.question}</strong>
                  <span className="smart-replies-score">
                    {Math.round(tested.matched.score * 100)}% match
                  </span>
                  <span className={`smart-replies-source ${tested.source}`}>
                    {tested.source === 'ai' ? 'AI-polished' : 'Approved answer'}
                  </span>
                </p>
                <p className="smart-replies-result-draft">{tested.draft}</p>
                {tested.aiError && <p className="smart-replies-warning">AI: {tested.aiError}</p>}
              </>
            ) : (
              <p className="smart-replies-result-empty">
                No approved answer matches that message closely enough. Add the question below, or
                reply manually in the chat.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="smart-replies-list">
        <div className="smart-replies-list-head">
          <h2>Knowledge base</h2>
          <span>
            {enabledCount} of {templates.length} active
          </span>
        </div>

        {templatesQuery.isLoading ? (
          <div className="smart-replies-state">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : templatesQuery.isError ? (
          <div className="smart-replies-state" role="alert">
            Could not load the questions.
          </div>
        ) : templates.length === 0 ? (
          <div className="smart-replies-state">
            No questions yet. Add the first one — the chat page starts drafting from it immediately.
          </div>
        ) : (
          <div className="smart-replies-table">
            <div className="smart-replies-row smart-replies-header">
              <span>Question</span>
              <span>Approved answer</span>
              <span>Keywords</span>
              <span>Active</span>
              <span />
            </div>
            {templates.map(row => (
              <div key={row.id} className={`smart-replies-row ${row.enabled ? '' : 'is-off'}`}>
                <span className="smart-replies-question" title={row.question}>
                  {row.question}
                </span>
                <span className="smart-replies-answer" title={row.answer}>
                  {row.answer}
                </span>
                <span className="smart-replies-keywords">{row.keywords || '—'}</span>
                <span>
                  <label className="smart-replies-switch">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={event =>
                        toggleMutation.mutate({ id: row.id, enabled: event.target.checked })
                      }
                      aria-label={`${row.enabled ? 'Disable' : 'Enable'} ${row.question}`}
                    />
                    <span className="smart-replies-slider" />
                  </label>
                </span>
                <span className="smart-replies-actions">
                  <button
                    type="button"
                    className="smart-replies-icon"
                    title="Edit"
                    aria-label={`Edit ${row.question}`}
                    onClick={() => openEdit(row)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    className="smart-replies-icon danger"
                    title="Delete"
                    aria-label={`Delete ${row.question}`}
                    onClick={() => {
                      if (window.confirm(`Delete “${row.question}”?`)) deleteMutation.mutate(row.id);
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {draft && (
        <Modal
          open
          onClose={() => setDraft(null)}
          title={draft.id ? 'Edit question' : 'Add a question'}
          className="smart-replies-modal"
          closeLabel="Close"
          footer={
            <>
              <button type="button" className="btn-secondary" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={submitDraft}
                disabled={saveMutation.isPending || draft.question.trim().length < 3 || draft.answer.trim().length < 2}
              >
                {saveMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : null}
                Save
              </button>
            </>
          }
        >
          <label className="smart-replies-field">
            <span>Question a donor asks</span>
            <input
              type="text"
              value={draft.question}
              onChange={event => setDraft({ ...draft, question: event.target.value })}
              placeholder="What is the minimum donation amount?"
              maxLength={400}
            />
          </label>

          <label className="smart-replies-field">
            <span>Approved answer</span>
            <textarea
              value={draft.answer}
              onChange={event => setDraft({ ...draft, answer: event.target.value })}
              rows={5}
              placeholder="The minimum donation is Rs 500…"
              maxLength={4000}
            />
            <small>
              Only these words are used. The AI can rephrase them for the donor, but it cannot add
              facts, amounts or promises.
            </small>
          </label>

          <label className="smart-replies-field">
            <span>Extra trigger words (comma separated)</span>
            <input
              type="text"
              value={draft.keywords}
              onChange={event => setDraft({ ...draft, keywords: event.target.value })}
              placeholder="minimum, kam se kam, smallest amount"
              maxLength={400}
            />
          </label>

          <label className="smart-replies-enabled">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={event => setDraft({ ...draft, enabled: event.target.checked })}
            />
            Use this answer in suggestions
          </label>
        </Modal>
      )}
    </div>
  );
}
