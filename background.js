/* background.js — MV3 service worker.
 * Alarms, notifications, the toolbar badge and the Alt+Shift+S shortcut.
 * Nothing is cached in variables here: the worker can be killed at any
 * moment, so every handler re-reads chrome.storage.local / chrome.alarms.
 */

importScripts("lib/storage.js", "lib/dust.js");

const REMIND_PREFIX = "remind-";
const DUST_ALARM = "dust-daily";
const DAILY_HOUR = 10; // the daily dust nudge lands at 10:00 local

/* ---- lifecycle ------------------------------------------------------- */

chrome.runtime.onInstalled.addListener(sync);
chrome.runtime.onStartup.addListener(sync);

// Any change to saved items (popup, shortcut, shelf) re-syncs alarms + badge.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[CHELFE_KEY]) sync();
});

chrome.alarms.onAlarm.addListener(onAlarm);
chrome.notifications.onClicked.addListener(onNotificationClick);

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "save-current-tab") return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !isSavableUrl(tab.url)) return;

  await saveItem(
    buildItem({
      url: tab.url,
      title: tab.title,
      favicon: tab.favIconUrl,
      minutes: 20,
      remindAt: null,
    })
  );
  flashBadge(tab.id);
});

/* ---- syncing --------------------------------------------------------- */

async function sync() {
  const items = await getItems();
  await syncAlarms(items);
  await updateBadge(items);
}

/* Rebuild alarms from storage. Alarms can be lost across browser restarts. */
async function syncAlarms(items) {
  const now = Date.now();
  const wanted = new Set();

  for (const it of items) {
    // Past reminders are not re-armed (they'd fire on every startup); they
    // surface through the overdue badge + the daily dust nudge instead.
    if (it.done || !it.remindAt || it.remindAt <= now) continue;
    const name = REMIND_PREFIX + it.id;
    wanted.add(name);
    await chrome.alarms.create(name, { when: it.remindAt });
  }

  // drop reminder alarms that no longer map to a pending item
  for (const a of await chrome.alarms.getAll()) {
    if (a.name.startsWith(REMIND_PREFIX) && !wanted.has(a.name)) {
      await chrome.alarms.clear(a.name);
    }
  }

  // exactly one recurring daily alarm, first fire at the next 10:00
  await chrome.alarms.create(DUST_ALARM, {
    when: nextDailyAt(),
    periodInMinutes: 24 * 60,
  });
}

function nextDailyAt() {
  const d = new Date();
  d.setHours(DAILY_HOUR, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.getTime();
}

async function updateBadge(items) {
  const count = (items || []).filter(isOverdue).length;
  chrome.action.setBadgeBackgroundColor({ color: "#9a4a37" });
  chrome.action.setBadgeText({ text: count ? String(count) : "" });
}

/* ---- alarms ---------------------------------------------------------- */

async function onAlarm(alarm) {
  if (alarm.name === DUST_ALARM) return notifyDustiest();

  if (alarm.name.startsWith(REMIND_PREFIX)) {
    const id = alarm.name.slice(REMIND_PREFIX.length);
    const items = await getItems();
    const it = items.find((x) => x.id === id);
    if (!it || it.done) return;
    await notify(`${REMIND_PREFIX}${it.id}`, "Chelfe is calling", `Time for: ${short(it.title)}`);
    await updateBadge(items);
  }
}

/* One notification a day, about the dustiest unfinished item. */
async function notifyDustiest() {
  const items = (await getItems()).filter((i) => !i.done);
  await updateBadge(items);
  if (!items.length) return;

  const best = items.reduce((a, b) => (dustLevel(b) > dustLevel(a) ? b : a));
  const days = ageInDays(best);
  if (days < 1) return; // nothing worth nagging about

  await notify(
    `dust-${best.id}`,
    "Chelfe — dusty shelf",
    `This has been collecting dust for ${days} day${days === 1 ? "" : "s"}: ${short(best.title)}`
  );
}

async function onNotificationClick(notifId) {
  const id = notifId.replace(/^remind-/, "").replace(/^dust-/, "");
  const items = await getItems();
  const it = items.find((x) => x.id === id);
  if (it && it.url) chrome.tabs.create({ url: it.url });
  chrome.notifications.clear(notifId);
}

function notify(id, title, message) {
  return chrome.notifications.create(id, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title,
    message,
    priority: 2,
  });
}

/* ---- misc ------------------------------------------------------------ */

function short(s, n = 70) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "\u2026" : s;
}

/* Tiny "it worked" tick on the toolbar, then clear it. */
function flashBadge(tabId) {
  chrome.action.setBadgeBackgroundColor({ color: "#6b4322" });
  chrome.action.setBadgeText({ tabId, text: "\u2713" });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: "" }), 1500);
}
