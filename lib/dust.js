/* lib/dust.js
 * Dust maths, shared by the shelf page and the service worker.
 * Numbers only — no DOM in here, so background.js can importScripts() it.
 */

const DUST_FULL_DAYS = 14; // 14 clean days => fully dusty
const DAY_MS = 86400000;

function daysSince(ts) {
  return Math.max(0, (Date.now() - ts) / DAY_MS);
}

/* Overdue = a reminder exists, its time has passed, and the item isn't done. */
function isOverdue(item) {
  return !!item && !item.done && !!item.remindAt && item.remindAt < Date.now();
}

/* 0 = brand new, 1 = buried.
 * 0 days -> 0, 14 days -> 1. Overdue items gather dust twice as fast. */
function dustLevel(item) {
  if (!item || item.done) return 0;
  const rate = isOverdue(item) ? 2 : 1;
  const level = (daysSince(item.savedAt) * rate) / DUST_FULL_DAYS;
  return level > 1 ? 1 : level;
}

/* Whole days on the shelf (for "collecting dust for X days" messages). */
function ageInDays(item) {
  return Math.floor(daysSince(item.savedAt));
}
