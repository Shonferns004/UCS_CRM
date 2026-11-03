import { listAccounts, getAccountById, createAccount, updateAccount, deleteAccount } from '../models/whatsappAccountModel.js';
import { createTemplateForAccount, listTemplatesForAccountAll, deleteTemplateForAccount, uploadTemplateHeaderMedia } from '../services/templateSyncService.js';
import { testConnection } from '../services/whatsappService.js';

export async function list(req, res) {
  try {
    const accounts = await listAccounts();
    return res.json(accounts);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function getById(req, res) {
  try {
    const account = await getAccountById(req.params.accountId);
    if (!account) return res.status(404).json({ message: 'Account not found' });
    return res.json(account);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function create(req, res) {
  try {
    const { name, project, phone_number_id, access_token, waba_id, template_name, template_language, is_active, is_default } = req.body;
    if (!name || !project || !phone_number_id || !access_token || !waba_id) {
      return res.status(400).json({ message: 'name, project, phone_number_id, access_token, and waba_id are required' });
    }
    const trimmedToken = String(access_token).trim();
    if (trimmedToken.startsWith('enc:')) {
      return res.status(400).json({ message: 'access_token must be a plaintext Meta token, not an encrypted value' });
    }
    const conn = await testConnection({ phone_number_id, access_token: trimmedToken });
    if (!conn.success) {
      return res.status(400).json({ message: 'Meta connection test failed: ' + conn.message });
    }
    const account = await createAccount({ name, project, phone_number_id, access_token: trimmedToken, waba_id, template_name, template_language, is_active, is_default });
    return res.status(201).json(account);
  } catch (error) {
    if (error.message.includes('already exists')) return res.status(409).json({ message: error.message });
    return res.status(500).json({ message: error.message });
  }
}

export async function update(req, res) {
  try {
    const existing = await getAccountById(req.params.accountId);
    if (!existing) return res.status(404).json({ message: 'Account not found' });

    const updates = { ...req.body };
    if (updates.access_token !== undefined) {
      const trimmedToken = String(updates.access_token).trim();
      if (trimmedToken.startsWith('enc:')) {
        return res.status(400).json({ message: 'access_token must be a plaintext Meta token, not an encrypted value' });
      }
      const phoneId = updates.phone_number_id || existing.phone_number_id;
      const conn = await testConnection({ phone_number_id: phoneId, access_token: trimmedToken });
      if (!conn.success) {
        return res.status(400).json({ message: 'Meta connection test failed: ' + conn.message });
      }
      updates.access_token = trimmedToken;
    }
    const account = await updateAccount(req.params.accountId, updates);
    return res.json(account);
  } catch (error) {
    if (error.message.includes('already exists')) return res.status(409).json({ message: error.message });
    return res.status(500).json({ message: error.message });
  }
}

export async function remove(req, res) {
  try {
    const existing = await getAccountById(req.params.accountId);
    if (!existing) return res.status(404).json({ message: 'Account not found' });

    await deleteAccount(req.params.accountId);
    return res.json({ success: true, message: 'Account deleted' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function createTemplate(req, res) {
  try {
    const result = await createTemplateForAccount(req.params.accountId, req.body || {});
    return res.status(201).json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

export async function uploadTemplateMedia(req, res) {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const handle = await uploadTemplateHeaderMedia(req.params.accountId, {
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
    });
    return res.json({ handle });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}
export async function listAccountTemplates(req, res) {
  try {
    const templates = await listTemplatesForAccountAll(req.params.accountId);
    return res.json(templates);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

export async function deleteAccountTemplate(req, res) {
  try {
    await deleteTemplateForAccount(req.params.accountId, req.params.name);
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}
