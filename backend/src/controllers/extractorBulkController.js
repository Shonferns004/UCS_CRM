import {
  getExtractorOutreachCounts,
  listExtractorCandidates,
  markExtractorPhones,
} from '../services/extractorOutreachService.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /whatsapp/bulk/extractor-leads — recipient picker for Extractor Leads mode. */
export async function listExtractorBulkLeads(req, res) {
  try {
    const data = await listExtractorCandidates({
      q: req.query.q,
      category: req.query.category,
      aiTag: req.query.aiTag,
      minScore: req.query.minScore,
      city: req.query.city,
      batchId: req.query.batchId,
      onlyUnused: String(req.query.onlyUnused || 'true') !== 'false',
      usage: req.query.usage,
      sort: req.query.sort,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.json({ ok: true, ...data });
  } catch (error) {
    console.error('listExtractorBulkLeads failed:', error?.message || error);
    return res.status(500).json({ message: error?.message || 'Could not load extractor leads.' });
  }
}

/** POST /whatsapp/bulk/extractor-leads/mark — manual used / unused override. */
export async function markExtractorBulkLeads(req, res) {
  const phones = Array.isArray(req.body?.phones) ? req.body.phones : [];
  if (phones.length === 0) {
    return res.status(400).json({ message: 'Select at least one number.' });
  }
  if (phones.length > 5000) {
    return res.status(400).json({ message: 'Too many numbers in one request (max 5000).' });
  }

  const campaignId = req.body?.campaignId || null;
  if (campaignId && !UUID_RE.test(String(campaignId))) {
    return res.status(400).json({ message: 'campaignId is not a valid UUID.' });
  }

  try {
    const result = await markExtractorPhones({
      phones,
      used: req.body?.used !== false,
      ngoId: req.body?.ngoId ? String(req.body.ngoId) : null,
      campaignId,
    });
    return res.json({
      ok: true,
      ...result,
      counts: await getExtractorOutreachCounts(),
    });
  } catch (error) {
    console.error('markExtractorBulkLeads failed:', error?.message || error);
    return res.status(500).json({ message: error?.message || 'Could not update the used list.' });
  }
}
