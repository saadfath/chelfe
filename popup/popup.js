/* popup.js — the click-box.
 * Shows the shelf in a compact popup, with a "save this page" bar on top.
 * Reuses lib/storage.js, lib/dust.js and lib/wormy.js. No inline JS (MV3 CSP).
 */

const DEFAULT_FAVICON = chrome.runtime.getURL("icons/icon48.png");

/* compact geometry (the box is ~380px wide) */
const GAP = 8;        // must match .box-shelf .plank .row `gap`
const ROW_PAD = 6;    // must match .box-shelf .plank .row horizontal padding
const BOX_PAD = 12;   // must match .box-shelf horizontal padding

const WIDTHS = {
  article: { 5: 30, 20: 40, 60: 54 },
  course: { 5: 60, 20: 70, 60: 84 },
};

let items = [];
let openId = null;
let renderToken = 0;

let activeTab = null;
let minutes = 20;    // selected duration
let remind = "none"; // selected reminder kind

/* Wormy state */
let wormyMood = "happy";
let bubbleState = "message"; // "message" | "question" | "answer"
let cheerTimer = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  wireSave();
  wireCard();
  mountWormy();
  activeTab = await getActiveTab();
  renderSaveTab();
  await render();
  // stay in sync if the shelf changes elsewhere (e.g. the shortcut)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[CHELFE_KEY]) render();
  });
}

/* ---- save this page -------------------------------------------------- */

function getActiveTab() {
  return chrome.tabs
    .query({ active: true, currentWindow: true })
    .then((tabs) => tabs[0] || null)
    .catch(() => null);
}

function wireSave() {
  const toggle = document.getElementById("saveToggle");
  const panel = document.getElementById("savePanel");

  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.classList.toggle("is-open", !panel.hidden);
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) document.getElementById("date").hidden = remind !== "date";
  });

  document.getElementById("minutes").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-min]");
    if (!btn) return;
    minutes = Number(btn.dataset.min);
    selectChip("#minutes", btn);
  });

  document.getElementById("remind").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remind]");
    if (!btn) return;
    remind = btn.dataset.remind;
    selectChip("#remind", btn);
    const date = document.getElementById("date");
    date.hidden = remind !== "date";
    if (remind === "date") date.focus();
  });

  document.getElementById("save").addEventListener("click", onSave);
  document.getElementById("expand").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("shelf/shelf.html") });
  });

  // our own icon can't really 404, but keep the fallback honest
  const logo = document.getElementById("boxLogo");
  logo.addEventListener("error", () => { logo.src = DEFAULT_FAVICON; });
}

function selectChip(selector, btn) {
  document.querySelectorAll(selector + " .chip").forEach((c) => c.classList.toggle("is-on", c === btn));
}

function renderSaveTab() {
  const page = document.getElementById("savePage");
  const warn = document.getElementById("warn");
  const save = document.getElementById("save");

  if (!activeTab || !activeTab.url) {
    page.textContent = "No page to save.";
    save.disabled = true;
    save.textContent = "Nothing to shelve";
    return;
  }

  page.textContent = activeTab.title || activeTab.url;

  if (!isSavableUrl(activeTab.url)) {
    warn.hidden = false;
    warn.textContent = "Chrome pages can't be shelved — try a normal website.";
    save.disabled = true;
    save.textContent = "Can't shelve this page";
  } else {
    warn.hidden = true;
    save.disabled = false;
    save.textContent = "Put on the shelf";
  }
}

async function onSave() {
  if (!activeTab || !isSavableUrl(activeTab.url)) return;

  const save = document.getElementById("save");
  const dateStr = document.getElementById("date").value;

  if (remind === "date" && !dateStr) {
    toast("Pick a date, or choose None.", true);
    return;
  }

  save.disabled = true;
  try {
    await saveItem(
      buildItem({
        url: activeTab.url,
        title: activeTab.title,
        favicon: activeTab.favIconUrl,
        minutes,
        remindAt: reminderAt(remind, dateStr),
      })
    );
    toast("Put on the shelf! 🪱", false);
    document.getElementById("savePanel").hidden = true;
    document.getElementById("saveToggle").classList.remove("is-open");
    await render();
  } catch (e) {
    save.disabled = false;
    toast("Couldn't save that. Try again?", true);
  }
}

function toast(text, isError) {
  const t = document.getElementById("toast");
  t.textContent = text;
  t.classList.toggle("is-error", !!isError);
  t.hidden = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { t.hidden = true; }, 1900);
}

/* Reminder timestamps: day-based options land at 9:00 local. */
function reminderAt(kind, dateStr) {
  const at9 = (d) => { const x = new Date(d); x.setHours(9, 0, 0, 0); return x.getTime(); };
  const now = new Date();

  switch (kind) {
    case "tomorrow": {
      const d = new Date(now); d.setDate(d.getDate() + 1); return at9(d);
    }
    case "weekend": {
      const d = new Date(now);
      let add = (6 - d.getDay() + 7) % 7;
      if (add === 0) add = 7;
      d.setDate(d.getDate() + add);
      return at9(d);
    }
    case "twoweeks": {
      const d = new Date(now); d.setDate(d.getDate() + 14); return at9(d);
    }
    case "date": {
      if (!dateStr) return null;
      return at9(new Date(dateStr + "T00:00:00"));
    }
    default:
      return null;
  }
}

/* ---- rendering ------------------------------------------------------- */

async function render() {
  const box = document.getElementById("shelf");
  const empty = document.getElementById("empty");
  const count = document.getElementById("count");

  const token = ++renderToken;
  items = (await getItems()).filter((i) => !i.done).sort((a, b) => b.savedAt - a.savedAt);
  if (token !== renderToken) return;

  count.textContent = items.length
    ? `${items.length} item${items.length === 1 ? "" : "s"} on the shelf`
    : "empty shelf";

  if (!items.length) {
    box.replaceChildren();
    box.hidden = true;
    empty.hidden = false;
  } else {
    box.hidden = false;
    empty.hidden = true;
    const avail = Math.max(200, box.clientWidth - (BOX_PAD + ROW_PAD) * 2);
    box.replaceChildren(...packPlanks(items, avail).map(buildPlank));
  }

  syncCard();
  updateWormy();
}

function packPlanks(list, avail) {
  const planks = [];
  let cur = [];
  let w = 0;

  for (const it of list) {
    const need = widthOf(it) + (cur.length ? GAP : 0);
    if (cur.length && w + need > avail) {
      planks.push(cur);
      cur = [];
      w = 0;
    }
    cur.push(it);
    w += widthOf(it) + GAP;
  }
  if (cur.length) planks.push(cur);
  return planks;
}

function buildPlank(list) {
  const plank = document.createElement("section");
  plank.className = "plank";
  const row = document.createElement("div");
  row.className = "row";
  for (const it of list) row.appendChild(makeShelfItem(it));
  plank.appendChild(row);
  return plank;
}

function makeShelfItem(it) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "item item-" + it.type;
  el.dataset.id = it.id;
  el.style.setProperty("--w", widthOf(it) + "px");
  el.style.setProperty("--h", heightOf(it) + "px");
  el.style.setProperty("--hue", hueOf(it));
  el.title = it.title;
  el.setAttribute("aria-label", it.title);

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = truncate(it.title, 120);

  if (it.type === "video") {
    const win = document.createElement("span");
    win.className = "vhs-window";
    win.append(reel(), reel());
    el.append(win, label);
  } else if (it.type === "course") {
    const band = document.createElement("span");
    band.className = "band";
    el.append(band, label);
  } else {
    el.append(label);
  }

  el.addEventListener("click", () => openCard(it.id));
  applyDust(el, it);
  return el;
}

/* ---- dust ------------------------------------------------------------ */

function applyDust(el, it) {
  const level = dustLevel(it);
  el.style.setProperty("--dust", round3(level));

  let overlay = el.querySelector(".dust");
  if (!overlay) {
    overlay = document.createElement("span");
    overlay.className = "dust";
    el.append(overlay);
  }

  const web = el.querySelector(".cobweb");
  if (level > 0.7 && !web) el.append(cobwebClone());
  else if (level <= 0.7 && web) web.remove();
}

function cobwebClone() {
  return document.getElementById("tpl-cobweb").content.firstElementChild.cloneNode(true);
}

function dustPuff(el, level) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const puff = document.createElement("div");
  puff.className = "puff";
  puff.style.left = r.left + r.width / 2 + "px";
  puff.style.top = r.bottom - 4 + "px";

  const n = 4 + Math.round((level || 0) * 6);
  for (let i = 0; i < n; i++) {
    const p = document.createElement("i");
    p.style.setProperty("--dx", Math.round(Math.random() * 90 - 45) + "px");
    p.style.setProperty("--dy", Math.round(-10 - Math.random() * 30) + "px");
    p.style.setProperty("--s", Math.round(6 + Math.random() * 9) + "px");
    p.style.setProperty("--d", Math.round(i * 35) + "ms");
    puff.appendChild(p);
  }

  document.body.appendChild(puff);
  setTimeout(() => puff.remove(), 1400);
}

function round3(n) { return Math.round(n * 1000) / 1000; }

function reel() {
  const r = document.createElement("span");
  r.className = "reel";
  return r;
}

/* ---- geometry / hashing --------------------------------------------- */

function widthOf(it) {
  if (it.type === "video") return 88;
  return WIDTHS[it.type]?.[it.minutes] ?? 40;
}

function heightOf(it) {
  if (it.type === "video") return 50;
  const base = it.type === "course" ? 82 : 66;
  const span = it.type === "course" ? 20 : 24;
  return base + (hash(it.id) % span);
}

function hueOf(it) {
  return hash(hostOf(it.url) || it.title || "x") % 360;
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ---- card ------------------------------------------------------------ */

function wireCard() {
  document.getElementById("cardClose").addEventListener("click", hideCard);
  document.getElementById("backdrop").addEventListener("click", hideCard);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideCard(); });

  const fav = document.getElementById("cardFavicon");
  fav.addEventListener("error", () => { if (fav.src !== DEFAULT_FAVICON) fav.src = DEFAULT_FAVICON; });

  document.getElementById("cardOpen").addEventListener("click", () => {
    const it = current();
    if (it) chrome.tabs.create({ url: it.url });
    hideCard();
  });
  document.getElementById("cardDone").addEventListener("click", doneItem);
  document.getElementById("cardRemove").addEventListener("click", removeItemAnim);
}

function current() {
  return items.find((i) => i.id === openId) || null;
}

function openCard(id) {
  const it = items.find((x) => x.id === id);
  if (!it) return;
  openId = id;
  itemEl(id)?.classList.add("is-pulled");

  document.getElementById("cardTitle").textContent = it.title;
  document.getElementById("cardMeta").textContent =
    `${typeLabel(it.type)} · ${it.minutes} min · ${savedAgo(it.savedAt)}`;

  const fav = document.getElementById("cardFavicon");
  fav.src = it.favicon || DEFAULT_FAVICON;

  const remind = document.getElementById("cardRemind");
  if (it.remindAt) {
    remind.hidden = false;
    remind.textContent =
      "⏰ Reminder: " +
      new Date(it.remindAt).toLocaleDateString(undefined, {
        weekday: "short", day: "numeric", month: "short", year: "numeric",
      });
  } else {
    remind.hidden = true;
  }

  document.getElementById("backdrop").hidden = false;
  document.getElementById("card").hidden = false;
}

function hideCard() {
  if (openId) itemEl(openId)?.classList.remove("is-pulled");
  openId = null;
  document.getElementById("card").hidden = true;
  document.getElementById("backdrop").hidden = true;
}

function syncCard() {
  if (!openId) return;
  if (!items.some((i) => i.id === openId)) hideCard();
  else itemEl(openId)?.classList.add("is-pulled");
}

async function doneItem() {
  const it = current();
  if (!it) return;
  const el = itemEl(it.id);
  hideCard();

  if (el) {
    dustPuff(el, dustLevel(it));
    el.classList.add("is-falling");
    await wait(620);
  }
  await removeItem(it.id);
  await render();
  cheerWormy();
}

async function removeItemAnim() {
  const it = current();
  if (!it) return;
  const el = itemEl(it.id);
  hideCard();

  if (el) {
    el.classList.add("is-gone");
    await wait(220);
  }
  await removeItem(it.id);
  await render();
}

/* ---- small helpers --------------------------------------------------- */

function itemEl(id) {
  const safe = window.CSS && CSS.escape ? CSS.escape(id) : id;
  return document.querySelector(`.item[data-id="${safe}"]`);
}

function typeLabel(type) {
  return type === "video" ? "Video" : type === "course" ? "Course" : "Article";
}

function savedAgo(ts) {
  const d = Math.max(0, Math.floor((Date.now() - ts) / 86400000));
  if (d === 0) return "saved today";
  if (d === 1) return "saved 1 day ago";
  return `saved ${d} days ago`;
}

function truncate(s, n) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

/* ---- Wormy (Phase 5) ------------------------------------------------- */

function mountWormy() {
  const fig = document.getElementById("wormyFigure");
  fig.innerHTML = WORMY_SVG; // static markup from our own lib

  const conf = document.getElementById("wormyConfetti");
  for (let i = 0; i < 12; i++) conf.appendChild(document.createElement("i"));

  fig.addEventListener("click", askWormy);
}

function updateWormy() {
  if (cheerTimer) return;
  setWormyMood(pickWormyMood(items));
}

function setWormyMood(mood) {
  wormyMood = mood;
  document.getElementById("wormy").dataset.mood = mood;
  if (bubbleState === "message") showMoodMessage();
}

function showMoodMessage() {
  const focus = wormyFocusItem(items);
  setBubble([el("p", pickWormyMessage(wormyMood, focus))]);
}

function askWormy() {
  bubbleState = "question";
  const row = document.createElement("div");
  row.className = "bubble-actions";
  for (const m of [5, 20, 60]) {
    row.appendChild(bubbleButton(m === 60 ? "1h+" : m + " min", () => answerWormy(m)));
  }
  setBubble([el("p", "How much time do you have?"), row]);
}

function answerWormy(mins) {
  bubbleState = "answer";

  if (!items.length) {
    setBubble([el("p", "Shelf's empty. Save something first, yallah.")]);
    return;
  }

  const pick = recommendWormyItem(items, mins);
  if (!pick) {
    setBubble([el("p", "Nothing that small fits, khoya. Everything here is a bigger bite.")]);
    return;
  }

  const when = mins === 60 ? "An hour" : mins + " minutes";
  const row = document.createElement("div");
  row.className = "bubble-actions";
  row.appendChild(bubbleButton("Open it", () => chrome.tabs.create({ url: pick.url })));
  row.appendChild(bubbleButton("Another time", askWormy));
  setBubble([el("p", `${when}? Try “${pick.title}”.`), row]);
}

function cheerWormy() {
  bubbleState = "message";
  wormyMood = "cheering";
  document.getElementById("wormy").dataset.mood = "cheering";
  showMoodMessage();

  const conf = document.getElementById("wormyConfetti");
  conf.classList.add("is-on");

  clearTimeout(cheerTimer);
  cheerTimer = setTimeout(() => {
    cheerTimer = null;
    conf.classList.remove("is-on");
    updateWormy();
  }, 2600);
}

function setBubble(nodes) {
  const bubble = document.getElementById("wormyBubble");
  bubble.replaceChildren(...nodes);
  bubble.classList.remove("is-pop");
  void bubble.offsetWidth; // restart the pop animation
  bubble.classList.add("is-pop");
}

function bubbleButton(text, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "bubble-chip";
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

function el(tag, text) {
  const n = document.createElement(tag);
  if (text != null) n.textContent = text;
  return n;
}
