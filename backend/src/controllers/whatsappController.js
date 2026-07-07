import { sendReceiptMessage, sendTextMessage, testConnection } from '../services/whatsappService.js';
import supabase from '../config/supabase.js';

export async function test(req, res) {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ message: 'Phone number is required' });

    const result = await sendTextMessage(to, 'WhatsApp API is working! - UFS CRM');
    return res.json({ success: true, message: 'Test message sent', data: result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function sendReceipt(req, res) {
  try {
    const { logId } = req.params;
    const { mobile, number } = req.body;
    const phone = mobile || number;

    if (!phone) return res.status(400).json({ message: 'Donor phone number is required' });

    const { data: log, error: logError } = await supabase
      .from('fro_donor_logs')
      .select(`
        amount_collected,
        fro_assignments(
          donor_id,
          donor_profiles(id, name, mobile_number)
        )
      `)
      .eq('id', logId)
      .single();

    if (logError || !log) return res.status(404).json({ message: 'Log entry not found' });

    const assignment = Array.isArray(log.fro_assignments) ? log.fro_assignments[0] : log.fro_assignments;
    const donor = Array.isArray(assignment?.donor_profiles) ? assignment?.donor_profiles[0] : assignment?.donor_profiles;
    const donorName = donor?.name || 'Donor';
    const amount = log.amount_collected || 0;

    const { data: receipt } = await supabase
      .from('receipts')
      .select('receipt_no')
      .eq('log_id', logId)
      .maybeSingle();

    const receiptNo = receipt?.receipt_no || 'N/A';
    const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

    const result = await sendReceiptMessage(phone, donorName, amount, receiptNo, date);

    return res.json({ success: true, message: 'Receipt sent via WhatsApp', data: result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function status(req, res) {
  try {
    const result = await testConnection();
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
