/**
 * DB-backed AI tagging queue.
 *
 * Leads start as `pending`. This worker claims a small batch, asks Gemini for a
 * verdict, and writes tags/score/reason back. Nothing is lost on a restart: a
 * row left in `running` is put back to `pending` on boot. A slow model call
 * never blocks a capture request because the worker runs outside it.
 */
import db from '../config/db.js';
import { aiModelName, isAiConfigured, tagLeadsWithGemini } from './gemini.js';

const WORKSPACE = 'default';
const BATCH_SIZE = 12;
const TICK_MS = 10_000;
const MAX_BATCHES_PER_TICK = 10;

let running = false;
let timer = null;
let started = false;

async function listKeywords() {
  const { rows } = await db._pool.query(
    `SELECT keyword FROM extractor_ai_keywords
      WHERE workspace_id = $1
      ORDER BY created_at, keyword`,
    [WORKSPACE],
  );
  return rows.map((row) => row.keyword);
}

async function releaseRunning() {
  try {
    await db._pool.query(
      `UPDATE extractor_leads
          SET ai_status = 'pending'
        WHERE workspace_id = $1 AND ai_status = 'running'`,
      [WORKSPACE],
    );
  } catch (err) {
    console.error('extractor ai: could not release running rows:', err?.message || err);
  }
}

async function claimBatch(limit) {
  const { rows } = await db._pool.query(
    `UPDATE extractor_leads
        SET ai_status = 'running'
      WHERE id IN (
        SELECT id FROM extractor_leads
         WHERE workspace_id = $1 AND ai_status = 'pending'
         ORDER BY created_at
         LIMIT $2
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id, display_name, category, address, website, email, source_names`,
    [WORKSPACE, limit],
  );
  return rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    category: row.category,
    address: row.address,
    website: row.website,
    email: row.email,
    sourceNames: row.source_names ?? [],
  }));
}

async function recordResult(leadId, verdict, model) {
  await db._pool.query(
    `UPDATE extractor_leads
        SET ai_tags = $2,
            ai_score = $3,
            ai_reason = $4,
            ai_status = 'done',
            ai_model = $5,
            ai_processed_at = NOW(),
            ai_attempts = ai_attempts + 1
      WHERE id = $1`,
    [leadId, verdict.tags, verdict.score, verdict.reason, model],
  );
}

async function recordFailure(leadId, message) {
  await db._pool.query(
    `UPDATE extractor_leads
        SET ai_status = 'error',
            ai_reason = left($2, 500),
            ai_processed_at = NOW(),
            ai_attempts = ai_attempts + 1
      WHERE id = $1`,
    [leadId, message],
  );
}

async function drain() {
  if (running || !isAiConfigured()) return;
  running = true;

  try {
    const keywords = await listKeywords();
    if (keywords.length === 0) return;

    for (let pass = 0; pass < MAX_BATCHES_PER_TICK; pass += 1) {
      const leads = await claimBatch(BATCH_SIZE);
      if (leads.length === 0) break;

      try {
        const verdicts = await tagLeadsWithGemini(leads, keywords);
        const model = aiModelName();

        for (const lead of leads) {
          const verdict = verdicts.get(lead.id);
          if (!verdict) {
            await recordFailure(lead.id, 'The model did not return a verdict for this lead.');
            continue;
          }
          await recordResult(lead.id, verdict, model);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The Gemini request failed.';
        for (const lead of leads) {
          await recordFailure(lead.id, message);
        }
        // The key, quota or network is the problem; retrying in this pass would
        // only burn more quota. The next tick tries again.
        break;
      }

      if (leads.length < BATCH_SIZE) break;
    }
  } catch (error) {
    console.error('extractor ai worker failed:', error?.message || error);
  } finally {
    running = false;
  }
}

/** Run a pass now (after a capture, or after a manual "run" action). */
export function kickExtractorAiWorker() {
  if (!started) return;
  void drain();
}

export function startExtractorAiWorker() {
  if (started) return;
  started = true;

  if (!isAiConfigured()) {
    console.log('extractor ai: GEMINI_API_KEY is not set; tagging stays queued.');
  }

  void releaseRunning().then(() => drain());

  timer = setInterval(() => {
    void drain();
  }, TICK_MS);
  // Do not keep the process alive just for this queue.
  if (typeof timer.unref === 'function') timer.unref();
}

export function stopExtractorAiWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

/** Trigger an immediate pass even if the periodic worker has not started. */
export function kickExtractorAiWorkerNow() {
  void drain();
}
