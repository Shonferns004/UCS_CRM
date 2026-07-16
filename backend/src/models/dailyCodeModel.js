import supabase from '../config/supabase.js';

export const getDailyCodeByCode = async (dailyCode, date) => {
  const { data, error } = await supabase
    .from('daily_qr_codes')
    .select('*, qr_codes(*)')
    .eq('daily_code', dailyCode)
    .eq('date', date)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
};

export const getDailyCodesForDate = async (date) => {
  const { data, error } = await supabase
    .from('daily_qr_codes')
    .select('*, qr_codes(label, latitude, longitude, radius_meters)')
    .eq('date', date);
  if (error) throw error;
  return data || [];
};

export const upsertDailyCode = async (qrCodeId, date, dailyCode) => {
  await supabase
    .from('daily_qr_codes')
    .delete()
    .eq('qr_code_id', qrCodeId)
    .eq('date', date);
  const { data, error } = await supabase
    .from('daily_qr_codes')
    .insert({ qr_code_id: qrCodeId, date, daily_code: dailyCode })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteOldDailyCodes = async (beforeDate) => {
  const { error } = await supabase
    .from('daily_qr_codes')
    .delete()
    .lt('date', beforeDate);
  if (error) throw error;
};
