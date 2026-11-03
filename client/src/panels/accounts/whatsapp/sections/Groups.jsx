import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, Crown, LogOut, Plus, RefreshCw, Search, Shield, Trash2, UserPlus, UsersRound } from 'lucide-react'
import { Badge, Card, Empty, ErrorNote, Field, Modal, Spinner, errorMessage, fmtTime } from '../ui'
import { gateway } from '../gateway'
import { useSessions } from '../useSessions'

function toJid(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  if (trimmed.includes('@')) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  return digits ? `${digits}@c.us` : ''
}

function parseJids(value) {
  const seen = new Set()
  const out = []
  for (const line of String(value || '').split(/[\n,;]+/)) {
    const jid = toJid(line)
    if (!jid || seen.has(jid)) continue
    seen.add(jid)
    out.push(jid)
  }
  return out
}

export default function GroupsSection() {
  const { sessions, sessionId, setSessionId, error: sessionError } = useSessions()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [active, setActive] = useState(null)
  const [info, setInfo] = useState(null)
  const [settings, setSettings] = useState({ announce: false, locked: false, memberAddMode: 'all' })
  const [infoLoading, setInfoLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [addText, setAddText] = useState('')
  const [invite, setInvite] = useState(null)
  const [copied, setCopied] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', participants: '' })
  const [createBusy, setCreateBusy] = useState(false)

  const loadGroups = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    try {
      const data = await gateway.listGroups(sessionId)
      setGroups(Array.isArray(data) ? data : [])
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    setActive(null)
    setInfo(null)
    setInvite(null)
    loadGroups()
  }, [loadGroups])

  const openGroup = async (group) => {
    setActive(group)
    setInfoLoading(true)
    setInvite(null)
    setAddText('')
    try {
      const [detail, groupSettings] = await Promise.all([
        gateway.groupInfo(sessionId, group.id),
        gateway.groupSettings(sessionId, group.id).catch(() => null),
      ])
      setInfo(detail)
      setSubject(detail?.name || group.name || '')
      setDescription(detail?.description || '')
      setSettings({
        announce: Boolean(groupSettings?.announce ?? detail?.announce),
        locked: Boolean(groupSettings?.locked ?? detail?.locked),
        memberAddMode: groupSettings?.memberAddMode || detail?.memberAddMode || 'all',
      })
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setInfoLoading(false)
    }
  }

  const reloadInfo = async () => {
    if (!active) return
    const detail = await gateway.groupInfo(sessionId, active.id)
    setInfo(detail)
    return detail
  }

  const run = async (action, options = {}) => {
    if (options.confirm && !window.confirm(options.confirm)) return
    setBusy(true)
    setError('')
    try {
      await action()
      if (options.reload) await reloadInfo()
      await loadGroups()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const saveSubject = () => run(() => gateway.updateGroupSubject(sessionId, active.id, subject.trim()), { reload: true })
  const saveDescription = () => run(() => gateway.updateGroupDescription(sessionId, active.id, description), { reload: true })
  const saveSettings = () =>
    run(
      () =>
        gateway.updateGroupSettings(sessionId, active.id, {
          announce: settings.announce,
          locked: settings.locked,
          memberAddMode: settings.memberAddMode,
        }),
      { reload: true },
    )

  const addParticipants = () => {
    const participants = parseJids(addText)
    if (participants.length === 0) return
    run(() => gateway.addGroupParticipants(sessionId, active.id, participants), { reload: true }).then(() =>
      setAddText(''),
    )
  }

  const participantAction = (participant, kind) => {
    const label = kind === 'remove' ? 'Remove' : kind === 'promote' ? 'Promote to admin' : 'Demote from admin'
    const confirm = `${
      kind === 'remove' ? `Remove ${participant.name || participant.id} from the group?` : `${label} ${participant.name || participant.id}?`
    }`
    const action =
      kind === 'remove'
        ? () => gateway.removeGroupParticipants(sessionId, active.id, [participant.id])
        : kind === 'promote'
          ? () => gateway.promoteGroupParticipants(sessionId, active.id, [participant.id])
          : () => gateway.demoteGroupParticipants(sessionId, active.id, [participant.id])
    run(action, { confirm, reload: true })
  }

  const loadInvite = async () => {
    try {
      const data = await gateway.groupInviteCode(sessionId, active.id)
      setInvite(data)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(invite?.inviteLink || invite?.inviteCode || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  const leaveGroup = () =>
    run(
      async () => {
        await gateway.leaveGroup(sessionId, active.id)
        setActive(null)
        setInfo(null)
      },
      { confirm: 'Leave this group? Your number is removed from the group.' },
    )

  const createGroup = async () => {
    const name = createForm.name.trim()
    const participants = parseJids(createForm.participants)
    if (!name || participants.length === 0) {
      setError('A group needs a name and at least one participant.')
      return
    }
    setCreateBusy(true)
    setError('')
    try {
      const created = await gateway.createGroup(sessionId, { name, participants })
      setCreateOpen(false)
      setCreateForm({ name: '', participants: '' })
      await loadGroups()
      if (created?.id) await openGroup({ id: created.id, name: created.name || name })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setCreateBusy(false)
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return groups
    return groups.filter(
      (group) => String(group.name || '').toLowerCase().includes(query) || String(group.id || '').includes(query),
    )
  }, [groups, search])

  const participants = Array.isArray(info?.participants) ? info.participants : []

  return (
    <div className="owa-page">
      <ErrorNote error={sessionError || error} onRetry={loadGroups} />

      <Card
        title="Groups"
        subtitle="Manage WhatsApp groups, participants and settings."
        actions={
          <>
            <button className="owa-icon-btn" onClick={loadGroups} disabled={loading} title="Refresh">
              {loading ? <Spinner size={14} /> : <RefreshCw size={14} />}
            </button>
            <button className="owa-btn owa-btn-primary" onClick={() => setCreateOpen(true)} disabled={!sessionId}>
              <Plus size={15} /> New group
            </button>
          </>
        }
      >
        <div className="owa-toolbar">
          <Field label="Session">
            <select value={sessionId} onChange={(event) => setSessionId(event.target.value)} style={{ minWidth: 240 }}>
              {sessions.length === 0 && <option value="">No sessions</option>}
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name} — {session.status}
                </option>
              ))}
            </select>
          </Field>
          <div className="owa-search">
            <Search size={14} />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search groups" />
          </div>
        </div>
      </Card>

      {!sessionId ? (
        <Empty icon={UsersRound} title="No session selected" text="Start a WhatsApp session to manage its groups." />
      ) : (
        <div className="owa-split" style={{ gridTemplateColumns: '320px minmax(0, 1fr)' }}>
          <Card title={`${filtered.length} group${filtered.length === 1 ? '' : 's'}`} pad={false}>
            <div className="owa-list" style={{ maxHeight: 520, overflow: 'auto' }}>
              {loading && groups.length === 0 ? (
                <div className="owa-empty"><Spinner size={20} /></div>
              ) : filtered.length === 0 ? (
                <div className="owa-table-empty">No groups found.</div>
              ) : (
                filtered.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    className={`owa-chat-item ${active?.id === group.id ? 'active' : ''}`}
                    onClick={() => openGroup(group)}
                  >
                    <span className="owa-chat-item-top">
                      <strong>{group.name || group.id}</strong>
                    </span>
                    <small className="owa-mono">{group.id}</small>
                  </button>
                ))
              )}
            </div>
          </Card>

          <Card
            title={active ? active.name || info?.name || 'Group' : 'Group details'}
            subtitle={active ? active.id : 'Select a group to view its members and settings.'}
          >
            {!active ? (
              <Empty icon={UsersRound} title="No group selected" text="Pick a group on the left." />
            ) : infoLoading ? (
              <div className="owa-empty"><Spinner size={22} /></div>
            ) : (
              <>
                <div className="owa-form-grid">
                  <div className="span-2" style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <Field label="Subject">
                        <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={100} />
                      </Field>
                    </div>
                    <button className="owa-btn" onClick={saveSubject} disabled={busy || !subject.trim()}>
                      Save
                    </button>
                  </div>
                  <div className="span-2">
                    <Field label="Description">
                      <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1024} />
                    </Field>
                    <button className="owa-btn owa-btn-sm" onClick={saveDescription} disabled={busy} style={{ marginTop: 6 }}>
                      Save description
                    </button>
                  </div>
                </div>

                <div className="owa-toolbar" style={{ marginTop: 14 }}>
                  <label className="owa-check">
                    <input
                      type="checkbox"
                      checked={settings.announce}
                      onChange={(event) => setSettings({ ...settings, announce: event.target.checked })}
                    />
                    Only admins can send messages
                  </label>
                  <label className="owa-check">
                    <input
                      type="checkbox"
                      checked={settings.locked}
                      onChange={(event) => setSettings({ ...settings, locked: event.target.checked })}
                    />
                    Only admins can edit group info
                  </label>
                  <Field label="Who can add members">
                    <select
                      value={settings.memberAddMode}
                      onChange={(event) => setSettings({ ...settings, memberAddMode: event.target.value })}
                      style={{ minWidth: 140 }}
                    >
                      <option value="all">Anyone</option>
                      <option value="admins">Admins only</option>
                    </select>
                  </Field>
                  <button className="owa-btn" onClick={saveSettings} disabled={busy}>
                    Save settings
                  </button>
                </div>

                <div className="owa-toolbar" style={{ marginTop: 16 }}>
                  <button className="owa-btn" onClick={loadInvite} disabled={busy}>
                    Get invite link
                  </button>
                  {invite?.inviteLink && (
                    <>
                      <span className="owa-key-reveal" style={{ flex: 1 }}>{invite.inviteLink}</span>
                      <button className="owa-icon-btn" onClick={copyInvite} title="Copy invite link">
                        <Copy size={13} />
                      </button>
                      {copied && <Badge tone="ok">Copied</Badge>}
                    </>
                  )}
                  <button className="owa-btn owa-btn-danger" onClick={leaveGroup} disabled={busy} style={{ marginLeft: 'auto' }}>
                    <LogOut size={14} /> Leave group
                  </button>
                </div>

                <div className="owa-toolbar" style={{ marginTop: 18, marginBottom: 6 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700 }}>Participants ({participants.length})</h3>
                </div>
                <div className="owa-table-wrap">
                  <table className="owa-table">
                    <thead><tr><th>Member</th><th>Number</th><th>Role</th><th style={{ width: 220 }} /></tr></thead>
                    <tbody>
                      {participants.map((participant) => (
                        <tr key={participant.id}>
                          <td>
                            <div className="owa-cell-main">
                              <strong>{participant.name || participant.id}</strong>
                              <span className="owa-mono">{participant.id}</span>
                            </div>
                          </td>
                          <td className="owa-nowrap">{participant.number || '—'}</td>
                          <td>
                            <div className="owa-toolbar">
                              {participant.isSuperAdmin ? (
                                <Badge tone="warn"><Crown size={11} /> Owner</Badge>
                              ) : participant.isAdmin ? (
                                <Badge tone="info"><Shield size={11} /> Admin</Badge>
                              ) : (
                                <Badge tone="neutral">Member</Badge>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="owa-row-actions">
                              {!participant.isAdmin && (
                                <button className="owa-btn owa-btn-sm" disabled={busy} onClick={() => participantAction(participant, 'promote')}>
                                  Promote
                                </button>
                              )}
                              {participant.isAdmin && !participant.isSuperAdmin && (
                                <button className="owa-btn owa-btn-sm" disabled={busy} onClick={() => participantAction(participant, 'demote')}>
                                  Demote
                                </button>
                              )}
                              <button
                                className="owa-icon-btn danger"
                                title="Remove from group"
                                disabled={busy}
                                onClick={() => participantAction(participant, 'remove')}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="owa-form-grid" style={{ marginTop: 14 }}>
                  <div className="span-2">
                    <Field label="Add participants" hint="Phone numbers or JIDs, one per line or comma separated.">
                      <textarea
                        value={addText}
                        onChange={(event) => setAddText(event.target.value)}
                        placeholder={'919876543210\n447700900123'}
                        style={{ minHeight: 70 }}
                      />
                    </Field>
                  </div>
                </div>
                <button className="owa-btn owa-btn-primary" onClick={addParticipants} disabled={busy || !addText.trim()} style={{ marginTop: 8 }}>
                  <UserPlus size={14} /> Add participants
                </button>
              </>
            )}
          </Card>
        </div>
      )}

      {createOpen && (
        <Modal
          title="New group"
          subtitle="Create a WhatsApp group for the selected session."
          onClose={() => setCreateOpen(false)}
          footer={
            <>
              <button className="owa-btn" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button className="owa-btn owa-btn-primary" onClick={createGroup} disabled={createBusy}>
                {createBusy ? <Spinner size={14} /> : <Plus size={14} />} Create group
              </button>
            </>
          }
        >
          <Field label="Group name" hint="Up to 100 characters.">
            <input
              autoFocus
              value={createForm.name}
              maxLength={100}
              onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
              placeholder="Support team"
            />
          </Field>
          <Field label="Participants" hint="At least one phone number or JID.">
            <textarea
              value={createForm.participants}
              onChange={(event) => setCreateForm({ ...createForm, participants: event.target.value })}
              placeholder={'919876543210\n447700900123'}
            />
          </Field>
        </Modal>
      )}
    </div>
  )
}
