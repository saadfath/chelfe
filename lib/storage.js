/* lib/storage.js
 * All Chelfe persistence. Shared by the popup and the service worker.
 * The service worker can be killed at any moment, so nothing is cached in
 * memory here: every call reads/writes chrome.storage.local.
 */

const CHELFE_KEY = "chelfe_items";

const VIDEO_HOSTS = ["youtube.com", "youtu.be", "vimeo.com"];
const COURSE_HOSTS = ["udemy", "coursera", "edx", "freecodecamp", "khanacademy"];
const VALID_MINUTES = [5, 20, 60];

/* ---- pure helpers ---------------------------------------------------- */

/* Only normal web pages can be shelved (chrome://, the Web Store, etc. cannot). */
function isSavableUrl(url) {
  return typeof url === "string" && /^(https?|file):/.test(url);
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch (e) {
    return "";
  }
}

/* Type detection is done by domain. */
function detectType(url) {
  const host = hostOf(url);
  if (VIDEO_HOSTS.some((d) => host === d || host.endsWith("." + d))) return "video";
  if (COURSE_HOSTS.some((d) => host.includes(d))) return "course";
  return "article";
}

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "it_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* Build a fresh item from a tab-ish object. */
function buildItem({ url, title, favicon, minutes, remindAt }) {
  const clean = String(title || "").trim();
  return {
    id: makeId(),
    url: url || "",
    // never store a blank title: fall back to the host, then a literal
    title: (clean || hostOf(url) || "Untitled").slice(0, 300),
    favicon: favicon || "",
    type: detectType(url),
    minutes: VALID_MINUTES.includes(minutes) ? minutes : 20,
    savedAt: Date.now(),
    remindAt: remindAt || null,
    done: false,
  };
}

/* ---- storage CRUD ---------------------------------------------------- */

async function getItems() {
  const data = await chrome.storage.local.get(CHELFE_KEY);
  return Array.isArray(data[CHELFE_KEY]) ? data[CHELFE_KEY] : [];
}

async function setItems(items) {
  await chrome.storage.local.set({ [CHELFE_KEY]: items });
}

/* Upsert. Same id OR same url updates the existing item (prevents duplicates).
 * Identity and the original savedAt are preserved so re-saving does not reset dust. */
async function saveItem(item) {
  const items = await getItems();
  let i = item.id ? items.findIndex((x) => x.id === item.id) : -1;
  if (i < 0 && item.url) i = items.findIndex((x) => x.url === item.url);

  if (i >= 0) {
    const old = items[i];
    items[i] = { ...old, ...item, id: old.id, savedAt: old.savedAt };
    await setItems(items);
    return items[i];
  }

  items.push(item);
  await setItems(items);
  return item;
}

async function updateItem(id, patch) {
  const items = await getItems();
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) return null;
  items[i] = { ...items[i], ...patch, id };
  await setItems(items);
  return items[i];
}

async function removeItem(id) {
  const items = await getItems();
  const next = items.filter((x) => x.id !== id);
  await setItems(next);
  return next.length !== items.length;
}

async function findItemByUrl(url) {
  const items = await getItems();
  return items.find((x) => x.url === url) || null;
}
