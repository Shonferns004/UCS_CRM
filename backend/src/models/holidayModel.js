import supabase from '../config/supabase.js';

export const createHoliday = async (data) => {
  const { data: result, error } = await supabase
    .from('holidays')
    .insert([data])
    .select()
    .single();
  if (error) throw error;
  return result;
};

export const getAllHolidays = async (ngo_id) => {
  let query = supabase
    .from('holidays')
    .select('*')
    .order('date', { ascending: true });
  if (ngo_id) query = query.eq('ngo_id', ngo_id);
  const { data, error } = await query;
  if (error) throw error;
  return data;
};

export const getHolidaysInRange = async (startDate, endDate) => {
  const { data, error } = await supabase
    .from('holidays')
    .select('date')
    .gte('date', startDate)
    .lte('date', endDate);
  if (error) throw error;
  return data || [];
};

export const getHolidayById = async (id) => {
  const { data, error } = await supabase
    .from('holidays')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
};

export const updateHoliday = async (id, updates) => {
  const { data, error } = await supabase
    .from('holidays')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteHoliday = async (id) => {
  const { error } = await supabase
    .from('holidays')
    .delete()
    .eq('id', id);
  if (error) throw error;
  return { message: 'Holiday deleted' };
};
