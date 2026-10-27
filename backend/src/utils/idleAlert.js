// The three warning tiers on the Telecaller Performance board's Warn button,
// and the message each one delivers to the FRO.
//
// Only the LEVEL travels over the wire (`{ workerId, level }`); the wording is
// resolved here so every channel reads the same copy. It also means an idle
// alert can never be sent with arbitrary text.
//
// The tiers are the board's own colour bands, so the button the admin sees and
// the warning the FRO receives always agree:
//   1:00-1:40 -> green  (FIRST WARNING)
//   1:41-2:10 -> orange (SECOND WARNING)
//   2:11+     -> red    (THIRD AND FINAL WARNING)
//
// `yellow` is kept as an alias of green for older senders. No imports here so
// `node --test` can load the module on its own.
export const IDLE_ALERT_THRESHOLDS = {
  // Strictly greater than an hour, matching the client's warnToneFor(): at
  // exactly 1:00 the board still hides the button.
  green: 3601,
  orange: 6060, // 1:41:00
  red: 7860,    // 2:11:00
};

// Which tier an idle figure belongs to, or null below the first band. Used by
// the automatic idle-warning sweep so it can never disagree with the board.
export function idleAlertLevelForSeconds(seconds) {
  const s = Number(seconds) || 0;
  if (s >= IDLE_ALERT_THRESHOLDS.red) return 'red';
  if (s >= IDLE_ALERT_THRESHOLDS.orange) return 'orange';
  if (s >= IDLE_ALERT_THRESHOLDS.green) return 'green';
  return null;
}

export const IDLE_ALERT_LEVELS = {
  green: {
    title: 'FIRST WARNING',
    body: (name) => `Dear ${name || ''},\n\nIt has been observed that your idle time has exceeded *1 hour*. This is a serious concern, as every employee is expected to remain active, attentive, and focused on their assigned calling tasks during working hours.\n\nPlease note that *no deduction will be made from your remuneration at this stage. However, this message should be treated as your FIRST WARNING*.\n\nGoing forward, please ensure that you minimise unnecessary idle time, maintain proper concentration during calls, and utilise your working hours productively.\n\nWe expect immediate improvement in your performance and discipline. Please take this warning seriously and ensure that this issue does not recur.\n\nRegards,\nHR Department`,
  },
  yellow: {
    title: 'FIRST WARNING',
    body: (name) => `Dear ${name || ''},\n\nIt has been observed that your idle time has exceeded *1 hour*. This is a serious concern, as every employee is expected to remain active, attentive, and focused on their assigned calling tasks during working hours.\n\nPlease note that *no deduction will be made from your remuneration at this stage. However, this message should be treated as your FIRST WARNING*.\n\nGoing forward, please ensure that you minimise unnecessary idle time, maintain proper concentration during calls, and utilise your working hours productively.\n\nWe expect immediate improvement in your performance and discipline. Please take this warning seriously and ensure that this issue does not recur.\n\nRegards,\nHR Department`,
  },
  orange: {
    title: 'SECOND WARNING',
    body: (name) => `Dear ${name || ''},\n\nIt has been observed that your idle time has exceeded *1 hour and 41 minutes*. This is a serious concern, as everyone is expected to remain active, attentive, and focused on their assigned calling tasks during working hours.\n\nPlease note that *no deduction will be made from your remuneration at this stage. However, this message should be treated as your SECOND WARNING*.\n\nGoing forward, please ensure that you minimise unnecessary idle time, maintain proper concentration during calls, and utilise your working hours productively.\n\nPlease be aware that if your idle time exceeds *2 hours and 10 minutes*, remuneration deduction may apply.\n\nWe expect immediate improvement in your performance and discipline. Please take this warning seriously and ensure that this issue does not recur.\n\nRegards,\nHR Department`,
  },
  red: {
    title: 'THIRD AND FINAL WARNING',
    body: (name) => `Dear ${name || ''},\n\nIt has been observed that your idle time has exceeded *2 hours and 11 minutes*. This is a serious concern, as every volunteer is expected to remain active, attentive, and focused on their assigned calling responsibilities during working hours.\n\nPlease be informed that this is your THIRD AND FINAL WARNING. Crossing this idle-time limit will lead to a *deduction in remuneration* as per management policy.\n\nYou are expected to minimise unnecessary idle time, maintain proper concentration during calls, and utilise your working hours productively.\n\nPlease take this warning seriously and ensure immediate improvement to avoid further action.\n\nRegards,\nHR Department`,
  },
};

export const isIdleAlertLevel = (level) =>
  Object.prototype.hasOwnProperty.call(IDLE_ALERT_LEVELS, level);

// Returns { level, title, body } for a known level, or null so the caller can
// fall back to the older free-text `message` path.
export function idleAlertFor(level, name) {
  if (!isIdleAlertLevel(level)) return null;
  // Never invent a placeholder name: the FRO's own name always comes from the
  // workers row, and an older copy that said "Telecaller" was addressed to the
  // wrong person. A blank name still writes "Dear ," rather than a false one.
  const who = String(name || '').trim();
  const spec = IDLE_ALERT_LEVELS[level];
  return { level, title: spec.title, body: spec.body(who) };
}
