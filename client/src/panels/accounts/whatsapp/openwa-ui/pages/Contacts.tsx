import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Ban, CheckCircle2, Loader2, Search, Users } from 'lucide-react';
import { contactApi, type Contact } from '../services/api';
import { useSessionsQuery } from '../hooks/queries';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRole } from '../hooks/useRole';
import { useToast } from '../hooks/useToast';
import { PageHeader } from '../components/PageHeader';
import './Contacts.css';

/** Two letters for the avatar when the contact has no picture. */
function initials(contact: Contact): string {
  const name = contact.name || contact.pushName || contact.number || contact.id;
  const parts = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function Contacts() {
  const { t } = useTranslation();
  useDocumentTitle('Contacts');
  const { canWrite } = useRole();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: sessions = [] } = useSessionsQuery();
  const readySessions = useMemo(() => sessions.filter(session => session.status === 'ready'), [sessions]);
  const [sessionId, setSessionId] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // The chosen session, else the first ready one. A chosen session that drops off the ready list is replaced,
  // so the list never shows one account's contacts under another's selector.
  useEffect(() => {
    if (!readySessions.some(session => session.id === sessionId)) {
      setSessionId(readySessions[0]?.id ?? '');
    }
  }, [readySessions, sessionId]);

  const { data: contacts = [], isLoading, error } = useQuery<Contact[], Error>({
    queryKey: ['contacts-page', sessionId],
    queryFn: () => contactApi.list(sessionId),
    enabled: Boolean(sessionId),
  });

  // Groups live in the Chats sidebar, not in the address book: the gateway returns them from the contacts
  // route too, so drop every @g.us entry before searching or counting.
  const directContacts = useMemo(() => contacts.filter(contact => !contact.id.endsWith('@g.us')), [contacts]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return directContacts;
    return directContacts.filter(contact =>
      [contact.name, contact.pushName, contact.number, contact.id]
        .filter(Boolean)
        .some(value => value!.toLowerCase().includes(query)),
    );
  }, [directContacts, search]);

  const toggleBlock = async (contact: Contact) => {
    if (!canWrite || busyId) return;
    setBusyId(contact.id);
    try {
      const result = contact.isBlocked
        ? await contactApi.unblock(sessionId, contact.id)
        : await contactApi.block(sessionId, contact.id);
      if (!result.success) throw new Error(t('contacts.declined', { defaultValue: 'The gateway declined the change.' }));
      await queryClient.invalidateQueries({ queryKey: ['contacts-page', sessionId] });
      toast.success(
        contact.isBlocked
          ? t('contacts.unblocked', { defaultValue: 'Contact unblocked' })
          : t('contacts.blocked', { defaultValue: 'Contact blocked' }),
        contact.name || contact.number || contact.id,
      );
    } catch (err) {
      toast.error(
        t('contacts.updateFailed', { defaultValue: 'Could not update the contact' }),
        err instanceof Error ? err.message : t('common.unknownError'),
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="sessions-page contacts-page">
      <PageHeader
        title="Contacts"
        subtitle="The address book of the selected WhatsApp session"
        actions={
          <select
            className="contacts-session-select"
            aria-label="Session"
            value={sessionId}
            onChange={event => setSessionId(event.target.value)}
            disabled={readySessions.length === 0}
          >
            {readySessions.length === 0 ? (
              <option value="">No connected sessions</option>
            ) : (
              readySessions.map(session => (
                <option key={session.id} value={session.id}>
                  {session.name}
                  {session.phone ? ` (${session.phone})` : ''}
                </option>
              ))
            )}
          </select>
        }
      />

      {error ? (
        <div className="error-banner" role="alert">
          <AlertCircle size={20} />
          <span className="error-banner-text">{error.message}</span>
        </div>
      ) : null}

      {readySessions.length === 0 ? (
        <div className="empty-state">
          <Users size={48} strokeWidth={1} />
          <h3>No connected sessions</h3>
          <p>Start a session from the Sessions page to read its address book.</p>
        </div>
      ) : (
        <>
          <div className="filters-bar">
            <div className="search-input">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search contacts…"
                value={search}
                onChange={event => setSearch(event.target.value)}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="contacts-loading">
              <Loader2 className="animate-spin" size={32} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <Users size={48} strokeWidth={1} />
              <h3>{search.trim() ? 'No contacts match your search' : 'No contacts yet'}</h3>
              <p>{search.trim() ? 'Try a different name or number.' : 'Contacts appear once the session syncs its address book.'}</p>
            </div>
          ) : (
            <>
              <div className="contacts-count">
                {filtered.length} contact{filtered.length === 1 ? '' : 's'}
              </div>
              <div className="contacts-table-card">
                <table className="contacts-table">
                  <thead>
                    <tr>
                      <th>Contact</th>
                      <th>Number</th>
                      <th>Status</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(contact => (
                      <tr key={contact.id}>
                        <td>
                          <div className="contacts-identity">
                            <span className="contacts-avatar">
                              {contact.profilePicUrl ? (
                                <img src={contact.profilePicUrl} alt="" />
                              ) : (
                                initials(contact)
                              )}
                            </span>
                            <span className="contacts-identity-text">
                              <span className="contacts-name">{contact.name || contact.pushName || contact.id}</span>
                              <span className="contacts-sub mono">{contact.id}</span>
                            </span>
                          </div>
                        </td>
                        <td className="contacts-number">{contact.number || '—'}</td>
                        <td>
                          <span className="contacts-badges">
                            {contact.isMyContact && <span className="contacts-badge info">Saved</span>}
                            {contact.isBlocked ? (
                              <span className="contacts-badge danger">
                                <Ban size={12} /> Blocked
                              </span>
                            ) : (
                              <span className="contacts-badge ok">
                                <CheckCircle2 size={12} /> Allowed
                              </span>
                            )}
                          </span>
                        </td>
                        <td>
                          <div className="contacts-actions">
                            {canWrite && (
                              <button
                                type="button"
                                className={`btn-secondary contacts-block-btn ${contact.isBlocked ? '' : 'danger'}`}
                                onClick={() => void toggleBlock(contact)}
                                disabled={busyId === contact.id}
                              >
                                {busyId === contact.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : contact.isBlocked ? (
                                  'Unblock'
                                ) : (
                                  'Block'
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
