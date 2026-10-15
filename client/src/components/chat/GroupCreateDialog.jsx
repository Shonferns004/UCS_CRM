import { useState, useEffect, useRef, useCallback } from 'react'
import { Avatar } from '../ui'
import { chatApi, isAuthError } from './chatApi'
import { roleLabel } from './chatIdentity'
import { ChatState } from './ChatState'
import { SearchIcon, CloseIcon, LockIcon } from './chatIcons'

const chipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 6px 3px 10px',
  borderRadius: 999,
  background: 'var(--chat-own-bubble)',
  color: 'var(--chat-primary-hover)',
  fontSize: 12,
  fontWeight: 600,
  border: '1px solid var(--chat-border)',
}

const chipXStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 16,
  height: 16,
  borderRadius: '50%',
  background: 'transparent',
  color: 'var(--chat-primary-hover)',
}

const sectionDivider = {
  height: 1,
  background: 'var(--chat-border)',
  border: 0,
  margin: '16px 0',
}

/**
 * Group create dialog — Super Admin, Accounts and Admin only.
 *
 * Asks four things before creating the room: a name, who can SEE it (the same
 * question as who gets seated — privacy is the point, so it is asked first,
 * with a plain-language promise under the heading), who may post, and the
 * per-person write mode.
 *
 * Departments are a convenience over the same directory the people tab uses,
 * so picking "HR" expands to every HR member and the final payload is still a
 * flat list of uids — the server never has to know the difference. Membership
 * is the access control: chatModel only ever lists conversations joined
 * through chat_participants, so an HR+FRO group is invisible to everyone else.
 */
export default function GroupCreateDialog({ me, onClose, onCreated }) {
  const [directory, setDirectory] = useState([])
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')

  const [title, setTitle] = useState('')
  const [tab, setTab] = useState('departments')
  const [q, setQ] = useState('')
  const [deptSel, setDeptSel] = useState(() => new Set())
  const [personSel, setPersonSel] = useState(() => new Set())
  const [postPolicy, setPostPolicy] = useState('everyone')
  const [writeMode, setWriteMode] = useState('everyone')
  const [saving, setSaving] = useState(false)

  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const titleRef = useRef(null)

  const load = useCallback(() => {
    let live = true
    setState('loading')
    chatApi
      .getDirectory(me)
      .then((list) => {
        if (!live) return
        setDirectory(Array.isArray(list) ? list : [])
        setState('ready')
      })
      .catch((e) => {
        if (!live) return
        setError(
          isAuthError(e)
            ? 'You do not have access to group creation.'
            : e.message || 'Could not load staff.'
        )
        setState(isAuthError(e) ? 'locked' : 'error')
      })
    return () => {
      live = false
    }
  }, [me])

  useEffect(() => load(), [load])

  useEffect(() => {
    titleRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const nodes = dialogRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (!nodes?.length) return
      const list = Array.from(nodes).filter((n) => !n.disabled && n.offsetParent !== null)
      if (!list.length) return
      const first = list[0]
      const last = list[list.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // ---- derived ------------------------------------------------------------
  const departments = directory.reduce((acc, p) => {
    if (!acc.has(p.department)) acc.set(p.department, [])
    acc.get(p.department).push(p)
    return acc
  }, new Map())

  const term = q.trim().toLowerCase()
  const shownPeople = term
    ? directory.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.department.toLowerCase().includes(term) ||
          roleLabel(p.role).toLowerCase().includes(term)
      )
    : directory

  // Departments expand to their members; hand-picked people add on top. Same
  // person in both is de-duplicated by the Set.
  const finalMembers = directory.filter(
    (p) => personSel.has(p.uid) || deptSel.has(p.department)
  )
  const memberCount = finalMembers.length
  const canSubmit = title.trim().length > 0 && memberCount > 0 && !saving

  // Chips show what is selected; people already covered by a picked department
  // do not get a chip of their own (the department chip is the thing to click).
  const deptNames = [...deptSel]
  const pickedPeople = [...personSel]
    .map((uid) => directory.find((p) => p.uid === uid))
    .filter(Boolean)
    .filter((p) => !deptSel.has(p.department))

  const toggleDept = (dept) => {
    setDeptSel((prev) => {
      const next = new Set(prev)
      if (next.has(dept)) next.delete(dept)
      else next.add(dept)
      return next
    })
  }

  const togglePerson = (uid) => {
    setPersonSel((prev) => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }

  const submit = (e) => {
    e?.preventDefault?.()
    if (!canSubmit) return
    setSaving(true)
    onCreated({
      title: title.trim(),
      postPolicy,
      writeMode,
      members: finalMembers.map((p) => ({
        uid: p.uid,
        subject_id: String(p.id),
        role: p.role,
        name: p.name,
        email: p.email,
        ngo_id: p.ngo_id,
        // In 'selected' mode every initially-picked person is ticked; the
        // admin can un-tick via the settings dialog later.
        can_post: writeMode === 'selected' ? true : undefined,
      })),
    })
  }

  return (
    <div className="chat-overlay" onClick={onClose}>
      <div
        className="chat-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-group-title"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="chat-dialog-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="chat-dialog-title" id="chat-group-title" style={{ flex: 'none' }}>
              New group
            </h3>
            <p className="chat-state-sub" style={{ margin: '2px 0 0' }}>
              Private room — only the people you pick can see it
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="chat-iconbtn"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <form className="chat-dialog-body" style={{ paddingTop: 12 }} onSubmit={submit}>
          {state === 'loading' && <p className="chat-state-sub">Loading staff…</p>}

          {state === 'locked' && (
            <ChatState
              kind="locked"
              icon={LockIcon}
              title="Groups are not available"
              sub={error}
            />
          )}

          {state === 'error' && (
            <ChatState
              kind="error"
              title="Could not load staff"
              sub={error}
              actionLabel="Try again"
              onAction={load}
            />
          )}

          {state === 'ready' && (
            <>
              <label className="chat-field-label" style={{ display: 'block', marginBottom: 6 }}>
                Group name
              </label>
              <div className="chat-field">
                <input
                  ref={titleRef}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Payment escalations"
                  maxLength={80}
                  aria-label="Group name"
                  style={{ width: '100%' }}
                />
              </div>

              <hr style={sectionDivider} />

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ display: 'flex', color: 'var(--chat-primary)' }}>
                  <LockIcon size={14} />
                </span>
                <span className="chat-field-label" style={{ margin: 0 }}>
                  Who can see this group
                </span>
              </div>
              <p className="chat-state-sub" style={{ margin: '0 0 10px' }}>
                Only the people you pick below will see this group and its messages —
                for example, pick HR and FRO and no one else will even know it exists.
              </p>

              <div className="chat-tabs" role="tablist" aria-label="Who can see this group" style={{ marginBottom: 10 }}>
                <button
                  type="button"
                  role="tab"
                  className="chat-tab"
                  aria-selected={tab === 'departments'}
                  onClick={() => {
                    setTab('departments')
                    setQ('')
                  }}
                >
                  Departments
                </button>
                <button
                  type="button"
                  role="tab"
                  className="chat-tab"
                  aria-selected={tab === 'people'}
                  onClick={() => setTab('people')}
                >
                  People
                </button>
              </div>

              {tab === 'departments' ? (
                <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 10 }}>
                  {[...departments.entries()].map(([dept, members]) => (
                    <label key={dept} className="chat-pickrow">
                      <input
                        type="checkbox"
                        checked={deptSel.has(dept)}
                        onChange={() => toggleDept(dept)}
                        aria-label={`Add everyone in ${dept}`}
                      />
                      <span className="chat-pickrow-body">
                        <span className="chat-person-name">{dept}</span>
                        <br />
                        <span className="chat-person-role">{members.length} people</span>
                      </span>
                    </label>
                  ))}
                  {departments.size === 0 && (
                    <p className="chat-state-sub">No departments found.</p>
                  )}
                </div>
              ) : (
                <>
                  <div className="chat-field" style={{ marginBottom: 8 }}>
                    <span className="chat-field-icon">
                      <SearchIcon size={15} />
                    </span>
                    <input
                      type="search"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search by name, department or role"
                      aria-label="Search people"
                    />
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 10 }}>
                    {shownPeople.map((p) => (
                      <label key={p.uid} className="chat-pickrow">
                        <input
                          type="checkbox"
                          checked={personSel.has(p.uid)}
                          onChange={() => togglePerson(p.uid)}
                          aria-label={`Add ${p.name}`}
                        />
                        <Avatar name={p.name} size={32} />
                        <span className="chat-pickrow-body">
                          <span className="chat-person-name">{p.name}</span>
                          <br />
                          <span className="chat-person-role">
                            {roleLabel(p.role)} · {p.department}
                          </span>
                        </span>
                      </label>
                    ))}
                    {shownPeople.length === 0 && (
                      <p className="chat-state-sub">No one matches “{q.trim()}”.</p>
                    )}
                  </div>
                </>
              )}

              {(deptNames.length > 0 || pickedPeople.length > 0) && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    marginBottom: 8,
                  }}
                  aria-label="Selected members"
                >
                  {deptNames.map((dept) => (
                    <span key={dept} style={chipStyle}>
                      {dept}
                      <button
                        type="button"
                        style={chipXStyle}
                        onClick={() => toggleDept(dept)}
                        aria-label={`Remove everyone in ${dept}`}
                      >
                        <CloseIcon size={11} />
                      </button>
                    </span>
                  ))}
                  {pickedPeople.map((p) => (
                    <span key={p.uid} style={chipStyle}>
                      {p.name}
                      <button
                        type="button"
                        style={chipXStyle}
                        onClick={() => togglePerson(p.uid)}
                        aria-label={`Remove ${p.name}`}
                      >
                        <CloseIcon size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <p className="chat-state-sub" style={{ margin: '0 0 4px' }}>
                {memberCount === 0
                  ? 'Pick at least one department or person.'
                  : `${memberCount} ${memberCount === 1 ? 'person' : 'people'} will be seated. No one else can see, search or join this group.`}
              </p>

              <hr style={sectionDivider} />

              <label className="chat-field-label" style={{ display: 'block', marginBottom: 6 }}>
                Who can post
              </label>
              <div style={{ marginBottom: 16 }}>
                <label className="chat-pickrow">
                  <input
                    type="radio"
                    name="post_policy"
                    checked={postPolicy === 'everyone'}
                    onChange={() => setPostPolicy('everyone')}
                  />
                  <span className="chat-pickrow-body">
                    <span className="chat-person-name">Everyone in the group</span>
                    <br />
                    <span className="chat-person-role">All members can send messages</span>
                  </span>
                </label>
                <label className="chat-pickrow">
                  <input
                    type="radio"
                    name="post_policy"
                    checked={postPolicy === 'admins_only'}
                    onChange={() => setPostPolicy('admins_only')}
                  />
                  <span className="chat-pickrow-body">
                    <span className="chat-person-name">Admins only</span>
                    <br />
                    <span className="chat-person-role">
                      Super Admin, Accounts and Admin can post; others read
                    </span>
                  </span>
                </label>
              </div>

              <label className="chat-field-label" style={{ display: 'block', marginBottom: 6 }}>
                Individual chat permission
              </label>
              <div>
                <label className="chat-pickrow">
                  <input
                    type="radio"
                    name="write_mode"
                    checked={writeMode === 'everyone'}
                    onChange={() => setWriteMode('everyone')}
                  />
                  <span className="chat-pickrow-body">
                    <span className="chat-person-name">All members</span>
                    <br />
                    <span className="chat-person-role">Everyone above the role gate may post</span>
                  </span>
                </label>
                <label className="chat-pickrow">
                  <input
                    type="radio"
                    name="write_mode"
                    checked={writeMode === 'selected'}
                    onChange={() => setWriteMode('selected')}
                  />
                  <span className="chat-pickrow-body">
                    <span className="chat-person-name">Only selected members</span>
                    <br />
                    <span className="chat-person-role">
                      Everyone you picked above can chat; others read-only. Manage
                      per-person later via Group settings.
                    </span>
                  </span>
                </label>
              </div>
            </>
          )}
        </form>

        <div className="chat-dialog-foot">
          <button type="button" className="chat-btn" onClick={onClose}>
            Cancel
          </button>
          {state === 'ready' && (
            <button
              type="button"
              className="chat-btn chat-btn-primary"
              onClick={submit}
              disabled={!canSubmit}
            >
              {saving ? 'Creating…' : 'Create group'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
