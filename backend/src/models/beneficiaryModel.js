import db from '../config/db.js';

// Allocate `count` unique beneficiary codes atomically. The sequence row is
// locked for the duration of the transaction so concurrent registrations and
// imports can never hand out the same code, and the counter is lifted to the
// highest code already stored before allocating so a stale/out-of-sync counter
// (or a code written by an older import) can never collide with a fresh one.
// Codes are handed out from the same counter, so a reserved block is simply
// unused if the import aborts.
export async function reserveBeneficiaryCodes(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n === 0) return [];

  const client = await db._pool.connect();
  try {
    await client.query('BEGIN');
    // Serialise every allocation across processes/connections.
    await client.query('SELECT pg_advisory_xact_lock(987654321)');

    // Seed the sequence row if it does not exist yet.
    await client.query(
      `INSERT INTO beneficiary_sequences (current_value)
       SELECT 0
       WHERE NOT EXISTS (SELECT 1 FROM beneficiary_sequences)`
    );

    // Keep the counter ahead of the highest code already on file.
    await client.query(
      `UPDATE beneficiary_sequences
          SET current_value = GREATEST(
                COALESCE(current_value, 0),
                COALESCE((SELECT MAX(CAST(SUBSTRING(beneficiary_code FROM 4) AS INTEGER))
                            FROM beneficiaries
                           WHERE beneficiary_code ~ '^BS-[0-9]+$'), 0)
              )
        WHERE id = (SELECT id FROM beneficiary_sequences ORDER BY id LIMIT 1)`
    );

    const { rows } = await client.query(
      `UPDATE beneficiary_sequences
          SET current_value = current_value + $1,
              updated_at = NOW()
        WHERE id = (SELECT id FROM beneficiary_sequences ORDER BY id LIMIT 1)
        RETURNING current_value`,
      [n]
    );
    if (!rows || !rows.length) throw new Error('beneficiary_sequences row missing');

    await client.query('COMMIT');

    const final = Number(rows[0].current_value);
    const start = final - n + 1;
    return Array.from({ length: n }, (_, i) => `BS-${String(start + i).padStart(6, '0')}`);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}

export async function generateBeneficiaryCode() {
  const [code] = await reserveBeneficiaryCodes(1);
  return code;
}

// Every member already on file whose number matches one of the sheet's numbers
// (either slot), keyed by the number that matched. One query instead of one per
// row. A member registered under both slots is returned once per number, which
// is what the per-row lookup did too.
export async function findByNumbers(mobiles) {
  const wanted = [...new Set((mobiles || []).filter(Boolean))];
  if (wanted.length === 0) return new Map();

  const found = new Map();
  const CHUNK = 100; // keep the .in() filter inside a safe URL length
  for (let i = 0; i < wanted.length; i += CHUNK) {
    const slice = wanted.slice(i, i + CHUNK);
    const { data, error } = await db
      .from('beneficiaries')
      .select('*')
      .or(`mobile.in.(${slice.join(',')}),alternate_mobile.in.(${slice.join(',')})`);
    if (error) throw error;
    for (const b of data || []) {
      for (const num of slice) {
        if (b.mobile === num || b.alternate_mobile === num) {
          if (!found.has(num)) found.set(num, b);
        }
      }
    }
  }
  return found;
}

// Which columns the beneficiaries table actually has, read once per process.
// The table has grown over time and different installations are at different
// points, so a write names only the columns that exist rather than assuming
// the newest schema. `needed`, for example, is added by the bootstrap repair
// and is absent from migration 120.
let beneficiaryColumnCache = null;
export async function beneficiaryColumns() {
  if (!beneficiaryColumnCache) {
    beneficiaryColumnCache = (async () => {
      // db._pool is raw node-postgres, so the rows come back on `rows` — not on
      // the `data`/`error` shape the query builder returns.
      const { rows, error } = await db._pool.query(
        `select column_name from information_schema.columns
          where table_schema = current_schema() and table_name = 'beneficiaries'`,
      );
      if (error) throw error;
      return new Set((rows || []).map((r) => r.column_name));
    })().catch((e) => { beneficiaryColumnCache = null; throw e; });
  }
  return beneficiaryColumnCache;
}

// Drop any key the table does not have, so one missing column cannot make the
// whole insert fail. Returns the fields that had to be left out.
export const supportedFields = (values, columns) => {
  const kept = {};
  const dropped = [];
  for (const [k, v] of Object.entries(values)) {
    if (columns.has(k)) kept[k] = v; else dropped.push(k);
  }
  return { kept, dropped };
};

export const createBeneficiaries = async (rows) => {
  if (!rows?.length) return [];
  const { data, error } = await db.from('beneficiaries').insert(rows).select('*');
  if (error) throw error;
  return data || [];
};

// Run tasks with a small cap on how many are in flight at once. The importer
// only has per-row work on the merge path (a handful of re-imports), and firing
// those concurrently keeps a re-import from serialising hundreds of updates.
export const runPooled = async (items, limit, task) => {
  const size = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;
  const workers = Array.from({ length: size }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      await task(items[i], i);
    }
  });
  await Promise.all(workers);
};

export const createBeneficiary = async (data) => {
  const { data: result, error } = await db
    .from('beneficiaries')
    .insert(data)
    .select('*')
    .single();
  if (error) throw error;
  return result;
};

export const getBeneficiaryById = async (id) => {
  const { data, error } = await db
    .from('beneficiaries')
    .select('*, ngos(name, code)')
    .eq('id', id)
    .single();
  if (error) return null;
  return data;
};

// Stores the latest re-issue collection OTP on the beneficiary row so the
// accounts panel can show it (beneficiaries app "Already collected" → Accept).
// A fresh OTP invalidates any earlier verification.
export const setBeneficiaryCollectionOtp = async (id, otp) => {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('beneficiaries')
    .update({
      collection_otp: otp,
      collection_otp_at: now,
      collection_otp_verified_at: null,
      updated_at: now,
    })
    .eq('id', id)
    .select('id, collection_otp, collection_otp_at, collection_otp_verified_at')
    .single();
  if (error) throw error;
  return data;
};

// Records a successful OTP verification (must happen within the OTP TTL).
export const setBeneficiaryOtpVerified = async (id) => {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('beneficiaries')
    .update({ collection_otp_verified_at: now, updated_at: now })
    .eq('id', id)
    .select('id, collection_otp_verified_at')
    .single();
  if (error) throw error;
  return data;
};

export const getBeneficiaryByCode = async (code) => {
  const { data, error } = await db
    .from('beneficiaries')
    .select('*')
    .eq('beneficiary_code', code)
    .single();
  if (error) return null;
  return data;
};

export const updateBeneficiary = async (id, updates) => {
  updates.updated_at = new Date().toISOString();
  const { data, error } = await db
    .from('beneficiaries')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

// UDID / disability certificate numbers live in the child
// `beneficiary_disabilities` table, so PostgREST cannot fold them into the
// same `or` expression as the master columns. Resolve the matching
// beneficiary ids first and OR on `id` instead. Stored certificates are
// compact (spaces stripped), so the term is compacted too.
const beneficiaryIdsByUdid = async (term) => {
  const compact = term.replace(/[\s-]/g, '');
  if (compact.length < 3) return [];
  const { data, error } = await db
    .from('beneficiary_disabilities')
    .select('beneficiary_id')
    .ilike('certificate_number', `%${compact}%`)
    .limit(500);
  if (error || !data) return [];
  return [...new Set(data.map((r) => r.beneficiary_id).filter((v) => v != null))];
};

// Builds the PostgREST `or` expression used by the list/export/search paths so
// a single typed term matches code, name, mobile, Aadhaar AND UDID.
const beneficiarySearchOr = async (term) => {
  const filters = [
    `beneficiary_code.ilike.%${term}%`,
    `full_name.ilike.%${term}%`,
    `mobile.ilike.%${term}%`,
    `aadhaar_number.ilike.%${term}%`,
    `kit_event_name.ilike.%${term}%`,
  ];
  const udidIds = await beneficiaryIdsByUdid(term);
  if (udidIds.length > 0) filters.push(`id.in.(${udidIds.join(',')})`);
  return filters.join(',');
};

// Occupations offered by the All Beneficiaries filter. The app saves the picked
// occupation and the operator's free-text specifics in one column as
// "Occupation - details" (see add_beneficiary_page.dart), and older imports also
// wrote spellings like "Hawker (...)" / "Unemployment". The dropdown only shows
// these canonical labels; each one matches every stored variant below.
export const BENEFICIARY_OCCUPATION_TYPES = [
  'Business',
  'Demo',
  'Hawkers',
  'Housewife',
  'Local Small Stall',
  'Massage',
  'Pco Booth Operator',
  'Professional',
  'Service /Job',
  'Student',
  'Unemployed',
];

const OCCUPATION_PATTERNS = {
  Business: ['Business', 'Business - %'],
  Demo: ['Demo', 'Demo - %'],
  Hawkers: ['Hawkors', 'Hawkors - %', 'Hawker%', 'Street Hawker%'],
  Housewife: ['Housewife', 'Housewife - %'],
  'Local Small Stall': ['Local Small Stall', 'Local Small Stall - %'],
  Massage: ['Massage', 'Massage - %'],
  'Pco Booth Operator': ['Pco Booth Operator', 'Pco Booth Operator - %', 'PCO Booth%'],
  Professional: ['Professional', 'Professional - %'],
  'Service /Job': ['Service /Job', 'Service /Job - %', 'Service / Job%'],
  Student: ['Student', 'Student - %'],
  Unemployed: ['Unemployed', 'Unemployment', 'Unemployed - %', 'Unemployment - %'],
};

// Builds the PostgREST `or` expression that matches every stored variant of a
// canonical occupation label (exact, "label - details", or known spellings).
const occupationFilterOr = (value) => {
  const label = String(value).trim();
  if (!label) return null;
  const patterns = OCCUPATION_PATTERNS[label] || [label, `${label} - %`];
  const safe = patterns
    .map((p) => p.replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (!safe.length) return null;
  return safe.map((p) => `occupation.ilike.${p}`).join(',');
};

export const listBeneficiaries = async ({ page = 1, pageSize = 25, search, status, ngo_id, category_id, state, city, kit_given, event_id, event_name, created_by, has_otp, occupation, occupation_detail, date_from, date_to }) => {
  let query = db.from('beneficiaries').select('*, ngos(name, code)', { count: 'exact' });

  if (created_by) query = query.eq('created_by', created_by);
  // OTP tab: only beneficiaries with a generated collection OTP.
  if (has_otp === true || has_otp === 'true') query = query.not('collection_otp', 'is', null);

  if (search) {
    // Commas and parens are PostgREST or= separators, so a typed event name
    // like "Diwali, Camp" must not reach the expression raw.
    const term = String(search).replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (term) {
      query = query.or(await beneficiarySearchOr(term));
    }
  }
  if (status) query = query.eq('status', status);
  if (ngo_id) query = query.eq('ngo_id', ngo_id);
  if (occupation) {
    const or = occupationFilterOr(occupation);
    if (or) query = query.or(or);
  }
  if (occupation_detail) {
    const detail = String(occupation_detail).replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (detail) query = query.ilike('occupation', `%${detail}%`);
  }
  if (state) query = query.eq('state', state);
  if (city) query = query.eq('city', city);
  // Date-wise filter on the day the member was registered. created_at is the
  // column every row has (imports don't always populate registration_date), and
  // the session timezone is pinned to IST so a bare YYYY-MM-DD means that local
  // calendar day.
  if (date_from) query = query.gte('created_at', date_from);
  if (date_to) query = query.lte('created_at', `${date_to}T23:59:59.999`);
  if (event_id) query = query.eq('kit_event_id', parseInt(event_id, 10));
  // Kit Given page filters by the event NAME: most handout rows only carry the
  // typed name (kit_event_id stays null), so an id filter would miss them.
  if (event_name) query = query.eq('kit_event_name', event_name);
  if (kit_given !== undefined && kit_given !== null) {
    query = query.eq('kit_given', kit_given === true || kit_given === 'true');
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  if (has_otp === true || has_otp === 'true') {
    // OTP tab: newest OTP first so fresh re-issues sit at the top.
    query = query
      .order('collection_otp_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(from, to);
  } else if (kit_given !== undefined && kit_given !== null) {
    // Kit-given history: newest handout first (matches the app's "Given Today"
    // overview count so the freshly-given beneficiaries appear at the top).
    query = query
      .order('kit_given_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(from, to);
  } else {
    query = query.order('created_at', { ascending: false }).range(from, to);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data || [], total: count || 0, page, pageSize };
};

// Distinct events that actually appear on kit-given rows. Powers the Kit Given
// page's event dropdown so it offers only the events present in that list
// (instead of every operator event). Returns [{ name, count }].
export const listKitGivenEvents = async () => {
  const { data, error } = await db
    .from('beneficiaries')
    .select('kit_event_name, count')
    .eq('kit_given', true)
    .not('kit_event_name', 'is', null)
    .order('kit_event_name', { ascending: true });
  if (error) throw error;
  return (data || [])
    .map((r) => ({ name: String(r.kit_event_name || '').trim(), count: Number(r.count) || 0 }))
    .filter((r) => r.name);
};

// Options for the All Beneficiaries occupation filter. A fixed canonical list
// keeps the dropdown clean (Housewife, Student, Business, …). The raw column
// holds messy variants such as "Hawker (...)" or "Unemployment"; those are
// matched by occupationFilterOr instead of being listed.
export const listBeneficiaryOccupations = async () => BENEFICIARY_OCCUPATION_TYPES;

// Export: same filters as listBeneficiaries but WITHOUT pagination so the
// web panel can download every matching beneficiary in one request. Rows are
// pulled in 1000-row pages so a PostgREST row cap can never silently truncate
// the file.
export const exportBeneficiaries = async ({ search, status, ngo_id, event_id, event_name, created_by, occupation, occupation_detail, date_from, date_to } = {}) => {
  let searchOr = null;
  if (search) {
    const term = String(search).replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (term) searchOr = await beneficiarySearchOr(term);
  }

  const build = () => {
    let query = db.from('beneficiaries').select('*, ngos(name, code)');

    if (created_by) query = query.eq('created_by', created_by);
    if (searchOr) query = query.or(searchOr);
    if (status) query = query.eq('status', status);
    if (ngo_id) query = query.eq('ngo_id', ngo_id);
    if (occupation) {
      const or = occupationFilterOr(occupation);
      if (or) query = query.or(or);
    }
    if (occupation_detail) {
      const detail = String(occupation_detail).replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim();
      if (detail) query = query.ilike('occupation', `%${detail}%`);
    }
    if (date_from) query = query.gte('created_at', date_from);
    if (date_to) query = query.lte('created_at', `${date_to}T23:59:59.999`);
    if (event_id) query = query.eq('kit_event_id', parseInt(event_id, 10));
    if (event_name) query = query.eq('kit_event_name', event_name);
    return query.order('created_at', { ascending: false });
  };

  const BATCH = 1000;
  const rows = [];
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await build().range(from, from + BATCH - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < BATCH) break;
  }
  return rows;
};

export const searchBeneficiaries = async (q) => {
  if (!q || q.length < 2) return [];
  const term = String(q).replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!term) return [];
  const { data, error } = await db
    .from('beneficiaries')
    .select('id, beneficiary_code, full_name, mobile, status, city, photo, needed')
    .or(await beneficiarySearchOr(term))
    .limit(20);
  if (error) throw error;
  return data || [];
};

// Overview stats for the web dashboard. `categoryId` scopes EVERY beneficiary
// stat (totals, status counts, NGO breakdown) to one beneficiary category
// ("type"), so the dashboard filter and the cards always agree.
export const getBeneficiaryOverview = async ({ categoryId = null } = {}) => {
  // Membership ids for the requested type — an empty list must yield zero
  // counts, not fall back to unfiltered. category_id 0 is the sentinel for
  // "Uncategorized" (no real category has id 0).
  let scopeIds = null;
  if (categoryId != null) {
    const { data: assignments } = await db
      .from('beneficiary_category_assignments')
      .select('beneficiary_id')
      .eq('category_id', categoryId);
    scopeIds = (assignments || []).map((r) => r.beneficiary_id);
  }
  const scope = (q) => {
    if (scopeIds === null) return q;
    // `.in('id', [])` is not reliable across query-builder versions, so an
    // empty membership is expressed as an id that can never exist.
    if (scopeIds.length === 0) return q.eq('id', -1);
    return q.in('id', scopeIds);
  };

  const { count: total } = await scope(db.from('beneficiaries').select('id', { count: 'exact', head: true }));
  const { count: active } = await scope(db.from('beneficiaries').select('id', { count: 'exact', head: true })).eq('status', 'ACTIVE');
  const { count: inactive } = await scope(db.from('beneficiaries').select('id', { count: 'exact', head: true })).eq('status', 'INACTIVE');
  const { count: pendingFingerprint } = await scope(db.from('beneficiaries').select('id', { count: 'exact', head: true })).eq('fingerprint_status', 'NOT_REGISTERED');

  const thisMonth = new Date();
  thisMonth.setDate(1);
  const { count: newThisMonth } = await scope(db.from('beneficiaries').select('id', { count: 'exact', head: true }))
    .gte('created_at', thisMonth.toISOString());

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count: kitGivenToday } = await scope(db.from('beneficiaries').select('id', { count: 'exact', head: true }))
    .eq('kit_given', true)
    .gte('kit_given_at', todayStart.toISOString());

  const { count: programsCount } = await db.from('bnf_programs').select('id', { count: 'exact', head: true });
  const { count: distributionsCount } = await db.from('benefit_distributions').select('id', { count: 'exact', head: true });

  // Total donations collected (verified receipts). sum.0 so a missing/empty
  // receipts table never breaks the home screen overview.
  const { rows: donationRows } = await db._pool
    .query(`SELECT COALESCE(SUM(amount), 0)::float8 AS total FROM receipts WHERE receipt_no IS NOT NULL`)
    .catch(() => ({ rows: [{ total: 0 }] }));

  // Members per NGO (drives the Beneficiaries app "NGO Members" breakdown)
  // and per type ("Types of Beneficiaries" filter card). Both survive a
  // missing/empty table so the dashboard still renders.
  const [{ data: ngoIdRows }, { data: ngos }, typeBreakdown] = await Promise.all([
    Promise.resolve(scope(db.from('beneficiaries').select('ngo_id'))),
    db.from('ngos').select('id, name, code'),
    getTypeBreakdown().catch(() => []),
  ]);
  const countByNgo = {};
  for (const r of ngoIdRows || []) {
    const key = r.ngo_id == null ? 'unassigned' : String(r.ngo_id);
    countByNgo[key] = (countByNgo[key] || 0) + 1;
  }
  const ngoBreakdown = (ngos || []).map((n) => ({
    id: n.id,
    name: n.name || `NGO #${n.id}`,
    code: n.code || null,
    count: countByNgo[String(n.id)] || 0,
  }));
  if (countByNgo.unassigned) {
    ngoBreakdown.push({ id: null, name: 'Unassigned', code: null, count: countByNgo.unassigned });
  }
  ngoBreakdown.sort((a, b) => b.count - a.count);

  return {
    total_beneficiaries: total || 0,
    active: active || 0,
    inactive: inactive || 0,
    pending_fingerprint: pendingFingerprint || 0,
    new_this_month: newThisMonth || 0,
    kit_given_today: kitGivenToday || 0,
    total_donated: parseFloat(donationRows[0]?.total) || 0,
    programs: programsCount || 0,
    benefits_distributed: distributionsCount || 0,
    ngos: ngoBreakdown,
    categories: typeBreakdown,
    active_category_id: categoryId || null,
  };
};

// Every beneficiary type with its member count, plus the members that have no
// type assigned ("Uncategorized") so the numbers always add up to the total.
const getTypeBreakdown = async () => {
  const { rows: cats } = await db._pool.query(`
    SELECT bc.id, bc.name, COUNT(bca.beneficiary_id)::int AS count
    FROM beneficiary_categories bc
    LEFT JOIN beneficiary_category_assignments bca ON bc.id = bca.category_id
    GROUP BY bc.id, bc.name
    ORDER BY count DESC, bc.name ASC
  `).catch(() => ({ rows: [] }));
  const { rows: uncategorized } = await db._pool.query(`
    SELECT COUNT(*)::int AS count
    FROM beneficiaries b
    WHERE NOT EXISTS (
      SELECT 1 FROM beneficiary_category_assignments bca WHERE bca.beneficiary_id = b.id
    )
  `).catch(() => ({ rows: [{ count: 0 }] }));

  const result = [...(cats || [])];
  result.push({ id: null, name: 'Uncategorized', count: uncategorized[0]?.count || 0 });
  return result;
};

export const searchByQRToken = async (qrToken) => {
  const { data: card, error: cardErr } = await db
    .from('beneficiary_cards')
    .select('beneficiary_id, card_number, card_type')
    .eq('qr_token', qrToken)
    .eq('status', 'ACTIVE')
    .single();
  if (cardErr || !card) return null;

  const { data: beneficiary, error: benErr } = await db
    .from('beneficiaries')
    .select('id, beneficiary_code, full_name, status, mobile, photo')
    .eq('id', card.beneficiary_id)
    .single();
  if (benErr || !beneficiary) return null;

  return { ...beneficiary, card };
};

export const searchByMobile = async (mobile) => {
  const { data, error } = await db
    .from('beneficiaries')
    .select('id, beneficiary_code, full_name, status, mobile, photo')
    .eq('mobile', mobile)
    .limit(5);
  if (error) throw error;
  return data || [];
};

export const markKitGiven = async (id, givenBy, event = null, kit = null) => {
  const now = new Date().toISOString();
  const update = {
    kit_given: true,
    kit_given_at: now,
    kit_given_by: givenBy || 'system',
    updated_at: now,
  };
  // Only overwrite the recorded event when this handout actually had one —
  // a kit given with no event assigned keeps the beneficiary's last known event.
  if (event && event.id != null) {
    update.kit_event_id = event.id;
    update.kit_event_name = event.name || null;
  }
  // Which kit was handed out (the operator's kit for the day). Same rule as the
  // event: a handout with no kit picked keeps the beneficiary's last known kit.
  if (kit && kit.id != null) {
    update.kit_id = kit.id;
    update.kit_name = kit.name || null;
  }
  const { data, error } = await db
    .from('beneficiaries')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

// Tables holding per-beneficiary subordinate data. Deleted explicitly because
// FK constraints are often dropped in the RDS migration — we never rely on
// ON DELETE CASCADE. benefit_distribution_items is handled separately because
// it hangs off benefit_distributions, not beneficiaries directly.
const BENEFICIARY_CHILD_TABLES = [
  'beneficiary_documents',
  'biometric_credentials',
  'beneficiary_cards',
  'beneficiary_disabilities',
  'beneficiary_family_members',
  'beneficiary_education',
  'beneficiary_employment',
  'beneficiary_assistance_requirements',
  'beneficiary_category_assignments',
  'beneficiary_source_records',
  'program_beneficiaries',
];

// Permanently deletes beneficiaries and every record that belongs to them
// (fingerprints, documents, disabilities, family, education, employment,
// assistance, category assignments, cards, source records, program links and
// benefit distributions). audit_logs are intentionally kept as an
// accountability trail. Runs in a single transaction so a failure rolls back
// the whole batch.
export const deleteBeneficiaries = async (ids) => {
  const pool = db._pool;
  const cleanIds = [...new Set((ids || []).map((n) => parseInt(n, 10)).filter((n) => Number.isInteger(n) && n > 0))];
  if (cleanIds.length === 0) return { deleted: 0 };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Benefit distribution items first (they reference distributions).
    await client
      .query(
        `DELETE FROM benefit_distribution_items WHERE distribution_id IN
           (SELECT id FROM benefit_distributions WHERE beneficiary_id = ANY($1::int[]))`,
        [cleanIds]
      )
      .catch(() => {});
    await client
      .query('DELETE FROM benefit_distributions WHERE beneficiary_id = ANY($1::int[])', [cleanIds])
      .catch(() => {});

    for (const t of BENEFICIARY_CHILD_TABLES) {
      await client.query(`DELETE FROM ${t} WHERE beneficiary_id = ANY($1::int[])`, [cleanIds]).catch(() => {});
    }

    // Loosely-referenced staging rows: null the link instead of dropping them.
    await client
      .query('UPDATE import_rows SET beneficiary_id = NULL WHERE beneficiary_id = ANY($1::int[])', [cleanIds])
      .catch(() => {});

    const res = await client.query('DELETE FROM beneficiaries WHERE id = ANY($1::int[])', [cleanIds]);

    await client.query('COMMIT');
    return { deleted: res.rowCount || 0 };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
