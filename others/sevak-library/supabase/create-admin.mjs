import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  const env = {}
  const p = resolve(__dirname, '..', '.env')
  try {
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    // no .env file - rely on process.env
  }
  return env
}

const env = { ...process.env, ...loadEnv() }

const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY
const ADMIN_EMAIL = env.ADMIN_EMAIL || 'admin@sevaklibrary.org'
const ADMIN_PASSWORD = env.ADMIN_PASSWORD || 'ChangeMe-12345'

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    'Missing env. Create a root .env file with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
  )
  process.exit(1)
}

async function jfetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: res.status, body }
}

async function main() {
  console.log('Creating admin user for', ADMIN_EMAIL)

  const create = await jfetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
    }),
  })

  const alreadyExists =
    (create.body && create.body.code === 'user_exists') ||
    (create.body && create.body.error_code === 'email_exists')

  if (create.status !== 200 && create.status !== 201 && !alreadyExists) {
    throw new Error(`Auth create failed (${create.status}): ${JSON.stringify(create.body)}`)
  }

  const list = await jfetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(ADMIN_EMAIL)}`)
  const uid = list.body?.users?.[0]?.id
  if (!uid) throw new Error('Could not resolve admin user id')

  const staff = await jfetch(`${SUPABASE_URL}/rest/v1/staff`, {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({ uid, email: ADMIN_EMAIL }),
  })

  if (staff.status !== 200 && staff.status !== 201) {
    throw new Error(`Staff insert failed (${staff.status}): ${JSON.stringify(staff.body)}`)
  }

  console.log('Admin ready:')
  console.log('  Email   :', ADMIN_EMAIL)
  console.log('  Password:', ADMIN_PASSWORD)
  console.log('Sign in from the admin panel at /#/admin using these credentials.')
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
