import db from '../config/db.js';
import { emitDbChange } from '../socket.js';

const serialize = (meeting) => meeting ? {
  active: true,
  id: meeting.id,
  title: meeting.title || 'Meeting',
  started_by: meeting.started_by,
  started_by_name: meeting.started_by_name || 'Admin',
  started_at: meeting.started_at,
} : { active: false };

export const getMeetingStatus = async (req, res) => {
  try {
    const { data, error } = await db
      .from('meetings')
      .select('*')
      .eq('is_active', true)
      .order('started_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    return res.json(serialize(data?.[0] || null));
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch meeting status', error: error.message });
  }
};

export const startMeeting = async (req, res) => {
  try {
    const title = typeof req.body?.title === 'string' && req.body.title.trim() ? req.body.title.trim().slice(0, 120) : 'Meeting';
    // A new meeting replaces any active one (globally single active meeting).
    await db
      .from('meetings')
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq('is_active', true);

    const { data, error } = await db
      .from('meetings')
      .insert({
        is_active: true,
        title,
        started_by: String(req.user.id ?? ''),
        started_by_name: req.user.name || 'Admin',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    emitDbChange({ table: 'meetings', eventType: 'INSERT', new: data });
    return res.json(serialize(data));
  } catch (error) {
    return res.status(500).json({ message: 'Failed to start meeting', error: error.message });
  }
};

export const endMeeting = async (req, res) => {
  try {
    const { data, error } = await db
      .from('meetings')
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq('is_active', true)
      .select()
      .single();
    if (error) throw error;
    if (data) emitDbChange({ table: 'meetings', eventType: 'UPDATE', new: data });
    return res.json(serialize(data || null));
  } catch (error) {
    return res.status(500).json({ message: 'Failed to end meeting', error: error.message });
  }
};