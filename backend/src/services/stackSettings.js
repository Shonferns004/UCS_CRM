// ─── Stack assignments switch (per station) ──────────────────────────────────
// Stacks are enabled one (NGO, station) at a time — turning them on for BOD-1
// must not turn them on for BOD-2 or another NGO's station with the same name.
//
// Stored in the existing `settings` key/value table as:
//   key = 'stacks_enabled:<ngo_id>:<station>'   value = '1' | '0'
//
// No default rows are written: a missing key means OFF, so every station starts
// with stacks disabled and donors stay with the FRO they are assigned to.

import { getSetting, upsertSetting, getAllSettings } from '../models/settingsModel.js';

export const STACKS_SETTING_PREFIX = 'stacks_enabled:';

export const stacksSettingKey = (ngoId, station) =>
  `${STACKS_SETTING_PREFIX}${ngoId ?? ''}:${String(station ?? '').trim()}`;

const parse = (raw) => raw === '1' || raw === 'true' || raw === true;

export const isStacksEnabledForStation = async (ngoId, station) => {
  if (!station) return false;
  try {
    const raw = await getSetting(stacksSettingKey(ngoId, station));
    return parse(raw);
  } catch (e) {
    // Fail CLOSED here: if the switch cannot be read, the safer default is that
    // stack routing is off and donors keep their normal assigned FRO.
    console.warn('[stacks-enabled] settings read failed, treating as disabled:', e?.message || String(e));
    return false;
  }
};

export const setStacksEnabledForStation = async (ngoId, station, enabled) => {
  const value = !!enabled;
  await upsertSetting(stacksSettingKey(ngoId, station), value ? '1' : '0');
  return value;
};

// Map used by the Station Management row menus: { "<ngo_id>:<station>": true }.
// Only enabled stations are present, so callers can treat absence as OFF.
export const listStackSettings = async () => {
  const all = await getAllSettings();
  const stations = {};
  for (const [key, value] of Object.entries(all || {})) {
    if (!key.startsWith(STACKS_SETTING_PREFIX)) continue;
    if (!parse(value)) continue;
    stations[key.slice(STACKS_SETTING_PREFIX.length)] = true;
  }
  return stations;
};
