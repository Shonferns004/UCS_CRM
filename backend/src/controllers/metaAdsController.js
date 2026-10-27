import db from '../config/db.js';

export async function metaAdsStatus(req, res) {
  return res.json({
    connected: false,
    message: 'Meta Ads integration is not configured. Add META_APP_ID and META_APP_SECRET to enable.',
  });
}

export async function listMetaAdAccounts(req, res) {
  return res.json([]);
}

export async function listMetaCampaigns(req, res) {
  return res.json([]);
}

export async function getMetaCampaignInsights(req, res) {
  return res.json({ message: 'Meta Ads not connected' });
}