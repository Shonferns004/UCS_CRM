// Pre-score WhatsApp reply leads with the AI model and cache the result on the
// lead row. Re-runnable: only leads with ai_at IS NULL are scored.
//
//   node scripts/ss-ai-prescore.mjs --limit=100
//   node scripts/ss-ai-prescore.mjs --limit=20 --force
// ---------------------------------------------------------------------------
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../.env') });
const pg = (await import('pg')).default;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
const { aiScoreSsReply, SS_AI_VERSION } = await import('../src/services/ssLeadAiService.js');

const arg = (name, def) => {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return def;
  const eq = hit.indexOf('=');
  return eq >= 0 ? hit.slice(eq + 1) : true;
};
const LIMIT = Math.max(1, Number(arg('limit', 100)));
const FORCE = !!arg('force', false);

const parse = (text) => {
  const t = String(text || '');
  return {
    button: (t.match(/\[(?:Button|Reply):\s*([^\]]+)\]/i) || [])[1] || '',
    template: (t.match(/\[Template:\s*([^\]]+)\]/i) || [])[1] || '',
    message: t.split('\n').filter((l) => !/^\[(Template|Account|Button|Reply|Lead):/i.test(l.trim())).join('\n').trim(),
  };
};

try {
  const { rows } = await pool.query(
    `select id, name, notes from leads
      where source = 'WhatsApp Bulk Reply'
        ${FORCE ? '' : 'and ai_at is null'}
      order by created_at desc
      limit $1`,
    [LIMIT],
  );

  console.log(`scoring ${rows.length} lead(s)…`);
  let ok = 0; let fail = 0;
  for (const r of rows) {
    try {
      const ai = await aiScoreSsReply(parse(r.notes));
      await pool.query(
        `update leads
            set ai_label = $2, ai_score = $3, ai_reason = $4,
                ai_model = $5, ai_version = $6, ai_at = now()
          where id = $1`,
        [r.id, ai.label, ai.score, ai.reasons?.[0] || null, ai.model || null, SS_AI_VERSION],
      );
      ok += 1;
      if (ok % 10 === 0) console.log(`  ${ok}/${rows.length}…`);
    } catch (e) {
      fail += 1;
      console.error('  failed:', r.id, e.message);
      if (/not configured/i.test(e.message)) break;
    }
  }
  console.log(`done — scored ${ok}, failed ${fail}`);
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await pool.end();
}
