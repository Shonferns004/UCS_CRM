import supabase from '../config/supabase.js';

export const getNgoDailyTargets = async (req, res) => {
  try {
    const { data: ngos, error } = await supabase
      .from('ngos')
      .select('id, name, daily_collection_target');

    if (error) return res.status(500).json({ message: error.message });

    const today = new Date().toISOString().slice(0, 10);

    const result = await Promise.all((ngos || []).map(async (ngo) => {
      let todayCollection = 0;
      let monthlyCollection = 0;

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthStartStr = monthStart.toISOString();

      const { data: donors, error: donorErr } = await supabase
        .from('donor_profiles')
        .select('id')
        .eq('ngo_id', ngo.id);

      if (donorErr || !donors || donors.length === 0) {
        return {
          id: ngo.id,
          name: ngo.name,
          daily_target: ngo.daily_collection_target || 0,
          today_collection: 0,
          monthly_collection: 0,
        };
      }

      const donorIds = donors.map(d => d.id);

      const { data: assignments, error: assignErr } = await supabase
        .from('fro_assignments')
        .select('id')
        .in('donor_id', donorIds);

      if (assignErr || !assignments || assignments.length === 0) {
        return {
          id: ngo.id,
          name: ngo.name,
          daily_target: ngo.daily_collection_target || 0,
          today_collection: 0,
          monthly_collection: 0,
        };
      }

      const assignmentIds = assignments.map(a => a.id);

      const { data: logs, error: logsErr } = await supabase
        .from('fro_donor_logs')
        .select('amount_collected, verified_at, created_at')
        .in('assignment_id', assignmentIds)
        .eq('disposition_detail', 'lead_done')
        .eq('accounts_status', 'verified')
        .gte('verified_at', monthStartStr);

      if (logsErr) {
        return {
          id: ngo.id,
          name: ngo.name,
          daily_target: ngo.daily_collection_target || 0,
          today_collection: 0,
          monthly_collection: 0,
        };
      }

      for (const log of (logs || [])) {
        const amount = Number(log.amount_collected || 0);
        monthlyCollection += amount;
        const verifiedDate = (log.verified_at || log.created_at || '').slice(0, 10);
        if (verifiedDate === today) {
          todayCollection += amount;
        }
      }

      return {
        id: ngo.id,
        name: ngo.name,
        daily_target: ngo.daily_collection_target || 0,
        today_collection: todayCollection,
        monthly_collection: monthlyCollection,
      };
    }));

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const setNgoDailyTarget = async (req, res) => {
  try {
    const { ngoId } = req.params;
    const { daily_target } = req.body;

    if (daily_target == null || daily_target < 0) {
      return res.status(400).json({ message: 'daily_target must be a positive number' });
    }

    const { error } = await supabase
      .from('ngos')
      .update({ daily_collection_target: daily_target })
      .eq('id', ngoId);

    if (error) return res.status(500).json({ message: error.message });

    return res.json({ message: 'Daily target updated', daily_target });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
