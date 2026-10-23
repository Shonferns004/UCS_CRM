// The three warning levels an admin can send from the Telecaller Performance
// board's Warn button, and the message each one delivers to the FRO.
//
// Only the LEVEL travels over the wire (`{ workerId, level }`); the wording is
// resolved here so every channel reads the same copy — the FRO's on-screen
// modal, the web bell (notification_log) and the FCM push. It also means an
// idle alert can never be sent with arbitrary text.
//
// The copy escalates with the board's colours: past an hour is a heads-up,
// past 1h30m is the warning letter the FRO's own 1-hour notice already
// mentions, and past 2h is urgent. No imports here so `node --test` can load
// the module on its own.
export const IDLE_ALERT_LEVELS = {
  green: {
    title: 'FIRST WARNING',
    body: (name) => `It has been observed that your idle time has exceeded *1 hour*. This is a serious concern, as every employee is expected to remain active, attentive, and focused on their assigned calling tasks during working hours.\n\nPlease note that *no deduction will be made from your remuneration at this stage. However, this message should be treated as your *FIRST WARNING*.\n\nGoing forward, please ensure that you minimise unnecessary idle time, maintain proper concentration during calls, and utilise your working hours productively.\n\nWe expect immediate improvement in your performance and discipline. Please take this warning seriously and ensure that this issue does not recur.\n\nRegards, \nHR Department\n\n${name}`,
  },
  yellow: {
    title: 'FIRST WARNING',
    body: (name) => `It has been observed that your idle time has exceeded *1 hour*. This is a serious concern, as every employee is expected to remain active, attentive, and focused on their assigned calling tasks during working hours.\n\nPlease note that *no deduction will be made from your remuneration at this stage. However, this message should be treated as your *FIRST WARNING*.\n\nGoing forward, please ensure that you minimise unnecessary idle time, maintain proper concentration during calls, and utilise your working hours productively.\n\nWe expect immediate improvement in your performance and discipline. Please take this warning seriously and ensure that this issue does not recur.\n\nRegards, \nHR Department\n\n${name}`,
  },
  orange: {
    title: 'SECOND WARNING',
    body: (name) => `It has been observed that your idle time has exceeded *1 hour and 41 minutes*. This is a serious concern, as every one is expected to remain active, attentive, and focused on their assigned calling tasks during working hours.\n\nPlease note that *no deduction will be made from your remuneration at this stage. However, this message should be treated as your *SECOND WARNING*.\n\nGoing forward, please ensure that you minimise unnecessary idle time, maintain proper concentration during calls, and utilise your working hours productively.\n\nPlease be aware that if your idle time exceeds *2 hours and 10 minutes*, remuneration deduction may apply.\n\nWe expect immediate improvement in your performance and discipline. Please take this warning seriously and ensure that this issue does not recur.\n\nRegards,\nHR Department\n\n${name}`,
  },
  red: {
    title: 'THIRD AND FINAL WARNING',
    body: (name) => `It has been observed that your idle time has exceeded *2 hours and 41 minutes*. This is a serious concern, as every volunteer is expected to remain active, attentive, and focused on their assigned calling responsibilities during working hours.\n\nPlease be informed that this is your THIRD AND FINAL WARNING. Crossing this idle-time limit will lead to a *deduction in remuneration* as per management policy.\n\nYou are expected to minimise unnecessary idle time, maintain proper concentration during calls, and utilise your working hours productively.\n\nPlease take this warning seriously and ensure immediate improvement to avoid further action.\n\nRegards,\nHR Department\n\n${name}`,
  },
};

export const isIdleAlertLevel = (level) =>
  Object.prototype.hasOwnProperty.call(IDLE_ALERT_LEVELS, level);

// Returns { level, title, body } for a known level, or null so the caller can
// fall back to the older free-text `message` path.
export function idleAlertFor(level, name) {
  if (!isIdleAlertLevel(level)) return null;
  const who = String(name || '').trim() || 'Telecaller';
  const spec = IDLE_ALERT_LEVELS[level];
  return { level, title: spec.title, body: spec.body(who) };
}
