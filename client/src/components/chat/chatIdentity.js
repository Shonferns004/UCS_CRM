/**
 * Chat identity + capability resolution.
 *
 * Two different login flows feed the eight panels, and their tokens are not
 * shaped the same: the Accounts session carries little more than an id, while
 * most other panels carry name/email. So every display name here goes through a
 * fallback chain instead of trusting a single field.
 *
 * Capability derivation is purely for rendering. Hiding the composer is a
 * courtesy — the server is the only thing that actually enforces the matrix.
 */

export const CHAT_WRITER_ROLES = ['super_admin', 'accounts', 'admin', 'fro']

/**
 * Who may create a group room. Mirrors CHAT_GROUP_CREATOR_ROLES in
 * backend/src/middleware/chatAccess.js: FRO can post and read, but cannot open
 * a room of their own.
 */
export const CHAT_GROUP_CREATOR_ROLES = ['super_admin', 'accounts', 'admin']

/**
 * Who counts as an admin for an admins-only group. Mirrors CHAT_ADMIN_ROLES in
 * the backend, so the composer is hidden for FRO in a restricted group before
 * they can type a message the server would reject.
 */
export const CHAT_ADMIN_ROLES = ['super_admin', 'accounts', 'admin']

/** True when this role may create a group room. */
export function canCreateGroup(role) {
  return CHAT_GROUP_CREATOR_ROLES.includes(normalizeChatRole(role))
}

/** True when this role counts as an admin inside an admins-only group. */
export function isChatAdmin(role) {
  return CHAT_ADMIN_ROLES.includes(normalizeChatRole(role))
}

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  accounts: 'Accounts',
  admin: 'Admin',
  hr: 'HR',
  recruiter: 'Recruiter',
  fro: 'FRO',
  event_head: 'Event Head',
  // authController.js maps both department 'digital' and anything containing
  // 'develop' to role 'digital'. The Digital (Duars Digital) team opens the
  // Social panel and is reviewed under Social Media, so it is labelled
  // 'Digital', not 'Developer'.
  digital: 'Digital',
  developers: 'Developer',
  worker: 'Worker',
}

export function normalizeChatRole(role) {
  if (!role) return ''
  const s = String(role).trim().toLowerCase()
  if (s === 'accountant') return 'accounts'
  if (s === 'superadmin' || s === 'super admin') return 'super_admin'
  if (s === 'ngo admin' || s === 'ngo_admin') return 'admin'
  if (s === 'developer' || s === 'dev' || s === 'dev-panel') return 'developers'
  if (s === 'event head' || s === 'event-head') return 'event_head'
  if (s === 'hr-recruiter') return 'recruiter'
  return s
}

export function roleLabel(role) {
  const r = normalizeChatRole(role)
  return ROLE_LABELS[r] || r || 'Staff'
}

function pickName(user) {
  if (!user) return ''
  return (
    user.name ||
    user.full_name ||
    user.fullName ||
    user.display_name ||
    user.username ||
    user.user_name ||
    user.email ||
    ''
  )
}

/**
 * Must stay identical to chatUidFor() in backend/src/models/chatModel.js.
 *
 * The previous version only looked at id-ish fields and returned a bare id. That
 * was wrong twice over:
 *
 *   - The env-configured Super Admin's session user is
 *     `{ name, email, role }` with no id at all, so this returned '' and
 *     ChatWorkspace rendered "Sign in to use Community / Your session has
 *     expired." for a perfectly valid, logged-in session. No request was ever
 *     made, so the token and the backend were both innocent.
 *   - The two shapes disagreed, so any session carrying both an id and an email
 *     would have produced a different uid in the browser than the server used.
 *
 * Email wins over id, exactly as the backend resolves it: a worker's session
 * payload carries no email (so they get `login:<id>`, matching the uid already
 * stored in chat_participants), while the Super Admin's carries an email and
 * their subject_id is the literal '0'.
 */
function getTokenPayload() {
  try {
    const token = localStorage.getItem('ucs_token')
    if (!token) return null
    const parts = String(token).split('.')
    if (parts.length !== 3) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      atob(b64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

function pickUid(user) {
  // Mirror chatUidFor() on the backend EXACTLY. The backend resolves the uid
  // from the JWT claims (email wins when present, otherwise the id), NOT from
  // the worker record's email column. The session user object stored in
  // localStorage carries the worker's email even for worker-panel logins, whose
  // JWT has no email claim — trusting user.email here would produce an
  // email:<addr> uid that the backend never uses, so the caller's own messages
  // render on the wrong side and their socket rooms never match.
  const payload = getTokenPayload()
  if (payload) {
    const email = String(payload.email || '').trim().toLowerCase()
    if (email) return `email:${email}`
    const id = payload.id ?? payload.workerId ?? payload.worker_id ?? payload.sub ?? null
    if (id != null && String(id) !== '') return `login:${id}`
  }
  // Fallback for sessions without a decodable token (e.g. tests): keep the old
  // behaviour, but only from the user object as a last resort.
  if (user) {
    const email = String(user.email || '').trim().toLowerCase()
    if (email) return `email:${email}`
    const id = user.id ?? user.uid ?? user.user_id ?? user.worker_id ?? user.uuid ?? null
    if (id != null && String(id) !== '') return `login:${id}`
  }
  return ''
}

/**
 * @param {object|null} user - session user from `useUcs()`
 * @returns {{uid:string,name:string,role:string,roleLabel:string,canPost:boolean,canDm:boolean,canCreateGroup:boolean,canModerate:boolean,isWriter:boolean,online:boolean}}
 */
export function resolveChatIdentity(user) {
  const role = normalizeChatRole(user?.role)
  const isWriter = CHAT_WRITER_ROLES.includes(role)
  const name = pickName(user).trim() || 'UCS Staff'
  return {
    uid: pickUid(user),
    name,
    role,
    roleLabel: roleLabel(role),
    // Posting, uploading, editing and deleting are all the same gate.
    canPost: isWriter,
    // Direct messages are writer-only; a read-only role has no DM targets.
    canDm: isWriter,
    // Only Admin/Accounts/Super Admin may open a room of their own.
    canCreateGroup: CHAT_GROUP_CREATOR_ROLES.includes(role),
    // Chat admins (Super Admin, Accounts, Admin) can delete anyone's message. Editing stays sender-only.
    canModerate: CHAT_ADMIN_ROLES.includes(role),
    isWriter,
    online: true,
  }
}

/** 4000-char cap, matches the server-side rule in plan.md §6.1. */
export const CHAT_MAX_BODY = 4000
export const CHAT_MAX_FILE_BYTES = 25 * 1024 * 1024

export const CHAT_MIME_ALLOW = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-word': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
}

/** @returns {{ok:true,ext:string}|{ok:false,reason:string}} */
export function validateChatFile(file) {
  if (!file) return { ok: false, reason: 'No file selected' }
  if (file.size > CHAT_MAX_FILE_BYTES) {
    return { ok: false, reason: 'File is larger than 25 MB' }
  }
  const ext = CHAT_MIME_ALLOW[file.type]
  if (!ext) {
    return { ok: false, reason: 'That file type is not allowed' }
  }
  return { ok: true, ext }
}

export function isImageMime(mime) {
  return typeof mime === 'string' && mime.startsWith('image/')
}

export function humanFileSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n < 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
