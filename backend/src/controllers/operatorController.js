import {
  createOperatorEvent, updateOperatorEvent, getOperatorEventById,
  listOperatorEvents, deleteOperatorEvent, assignOperatorEvent,
  getOperatorAssignmentsByDate, getTodayAssignment,
} from '../models/operatorModel.js';
import { getWorkerBySession } from '../models/workerModel.js';

const NORMALIZED_DATE = () => new Date().toISOString().split('T')[0];

export const addOperatorEvent = async (req, res) => {
  try {
    const { title, description, event_date, start_time, end_time, location, state, selfie_url } = req.body;
    if (!title || !event_date) {
      return res.status(400).json({ message: 'Title and event date are required' });
    }
    const event = await createOperatorEvent({
      title,
      description,
      event_date,
      start_time: start_time || null,
      end_time: end_time || null,
      location: location || null,
      state: state || null,
      selfie_url: selfie_url || null,
      created_by: req.user?.name || req.user?.email || 'system',
    });
    return res.status(201).json({ message: 'Event created', event });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const editOperatorEvent = async (req, res) => {
  try {
    const { title, description, event_date, start_time, end_time, location, state, selfie_url } = req.body;
    const updates = {};
    if (title) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (event_date) updates.event_date = event_date;
    if (start_time !== undefined) updates.start_time = start_time;
    if (end_time !== undefined) updates.end_time = end_time;
    if (location !== undefined) updates.location = location;
    if (state !== undefined) updates.state = state;
    if (selfie_url !== undefined) updates.selfie_url = selfie_url;
    const event = await updateOperatorEvent(req.params.id, updates);
    return res.json({ message: 'Event updated', event });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getOperatorEvent = async (req, res) => {
  try {
    const event = await getOperatorEventById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    return res.json(event);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const listOperatorEventsController = async (req, res) => {
  try {
    const { date, state } = req.query;
    const events = await listOperatorEvents({ date, state });
    return res.json(events);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const removeOperatorEvent = async (req, res) => {
  try {
    const result = await deleteOperatorEvent(req.params.id);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const assignEvent = async (req, res) => {
  try {
    const { operator_id, state, event_id, assignment_date } = req.body;
    if (!operator_id || !event_id || !assignment_date) {
      return res.status(400).json({ message: 'operator_id, event_id and assignment_date are required' });
    }
    const event = await getOperatorEventById(event_id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    const assignment = await assignOperatorEvent({
      operator_id,
      state: state || event.state || null,
      event_id,
      assignment_date,
    });
    return res.status(201).json({ message: 'Assignment created', assignment });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const operatorDashboard = async (req, res) => {
  try {
    const worker = await getWorkerBySession(req.user);
    if (!worker) return res.status(404).json({ message: 'Operator not found' });

    const today = NORMALIZED_DATE();
    let state = null;
    let event = null;

    const assignment = await getTodayAssignment(worker.id, today);
    if (assignment) {
      state = assignment.state || null;
      event = assignment.operator_events || null;
    }

    return res.json({
      operator: { id: worker.id, name: worker.name, login_id: worker.login_id, role: req.user.role },
      state,
      event,
      selfie: event?.selfie_url || null,
      has_event: !!event,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const listOperatorDayAssignments = async (req, res) => {
  try {
    const { date } = req.query;
    const worker = await getWorkerBySession(req.user);
    if (!worker) return res.status(404).json({ message: 'Operator not found' });
    const day = date || NORMALIZED_DATE();
    const assignments = await getOperatorAssignmentsByDate(worker.id, day);
    return res.json(assignments);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};