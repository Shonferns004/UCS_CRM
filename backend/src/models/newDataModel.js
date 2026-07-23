import supabase from '../config/supabase.js';

export const insertNewDataBatch = async (rows) => {
  const { data, error } = await supabase
    .from('new_data')
    .insert(rows)
    .select();
  if (error) throw error;
  return data;
};

export const getImportBatches = async () => {
  const { data, error } = await supabase
    .from('new_data')
    .select('import_batch_id, data_source_id, import_date, created_at, data_sources(name)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;

  const seen = {};
  const batches = [];
  for (const row of data) {
    if (!seen[row.import_batch_id]) {
      seen[row.import_batch_id] = true;
      batches.push({
        import_batch_id: row.import_batch_id,
        data_source_id: row.data_source_id,
        data_source_name: row.data_sources?.name || 'Unknown',
        import_date: row.import_date,
        created_at: row.created_at,
      });
    }
  }
  return batches;
};

export const getBatchRecords = async (batchId) => {
  const { data, error } = await supabase
    .from('new_data')
    .select('*')
    .eq('import_batch_id', batchId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
};

export const getBatchCount = async (batchId) => {
  const { count, error } = await supabase
    .from('new_data')
    .select('*', { count: 'exact', head: true })
    .eq('import_batch_id', batchId);
  if (error) throw error;
  return count || 0;
};

export const updateNewDataStatus = async (mobiles, ngoName, status) => {
  if (!ngoName) throw new Error('ngoName is required for updateNewDataStatus');
  const query = supabase
    .from('new_data')
    .update({ status })
    .in('mobile_number', mobiles)
    .eq('ngo', ngoName);
  const { data, error } = await query;
  if (error) throw error;
  return data;
};

export const updateNewDataStatusByNgoAndMobiles = async (ngoName, mobiles, status) => {
  const { data, error } = await supabase
    .from('new_data')
    .update({ status })
    .eq('ngo', ngoName)
    .in('mobile_number', mobiles);
  if (error) throw error;
  return data;
};

export const getAllExistingMobiles = async () => {
  const { data, error } = await supabase
    .from('new_data')
    .select('mobile_number')
    .not('mobile_number', 'is', null);
  if (error) throw error;
  return new Set((data || []).map(r => r.mobile_number));
};

export const getBatchById = async (batchId) => {
  const { data, error } = await supabase
    .from('new_data')
    .select('import_batch_id, data_source_id, import_date, created_at, data_sources(name)')
    .eq('import_batch_id', batchId)
    .limit(1);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return {
    import_batch_id: data[0].import_batch_id,
    data_source_id: data[0].data_source_id,
    data_source_name: data[0].data_sources?.name || 'Unknown',
    import_date: data[0].import_date,
    created_at: data[0].created_at,
  };
};
