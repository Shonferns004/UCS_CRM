import multer from 'multer';
import { parseBankStatement } from '../services/bankStatementParser.js';
import supabase from '../config/supabase.js';
import { getSources } from '../models/bankAuditModel.js';

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.toLowerCase();
    if (ext.endsWith('.csv') || ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel (.xlsx, .xls) files are supported'));
    }
  },
});

export const uploadMiddleware = upload.single('file');

export async function previewStatement(req, res) {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const explicitSource = req.body.source_name || null;
    const result = parseBankStatement(req.file.buffer, req.file.originalname, explicitSource);

    return res.json({
      filename: req.file.originalname,
      size: req.file.size,
      ...result,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

export async function importStatement(req, res) {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const explicitSource = req.body.source_name || null;
    const result = parseBankStatement(req.file.buffer, req.file.originalname, explicitSource);

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'No valid transactions found to import' });
    }

    const sources = await getSources();
    let sourceId = sources.find(s => s.name === result.source_name)?.id;
    if (!sourceId) {
      const { data: newSource } = await supabase
        .from('bank_audit_sources')
        .insert({ name: result.source_name, sort_order: 99 })
        .select()
        .single();
      sourceId = newSource.id;
    }

    const entries = [];
    const errors = [];

    for (const row of result.rows) {
      try {
        const paymentId = row.ref_no || null;
        const remarks = [
          row.description || '',
          row.is_debit ? `Debit: \u20B9${row.debit}` : `Credit: \u20B9${row.credit}`,
          row.balance ? `Bal: \u20B9${row.balance}` : '',
        ].filter(Boolean).join(' | ');

        const { data: entry, error } = await supabase
          .from('bank_audit_entries')
          .insert({
            source_id: sourceId,
            amount: row.amount,
            payment_id: paymentId,
            transaction_date: row.date,
            remarks: remarks.slice(0, 500),
            created_by: req.user.id,
          })
          .select()
          .single();

        if (error) throw error;
        entries.push(entry);
      } catch (err) {
        errors.push({ row: row.row, error: err.message });
      }
    }

    return res.json({
      success: true,
      bank: result.bank,
      source_name: result.source_name,
      imported: entries.length,
      errors: errors.length,
      error_details: errors,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}
