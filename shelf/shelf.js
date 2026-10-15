/* shelf.js — Phase 2.
 * Renders saved items as physical objects standing on wooden planks.
 * Layout is computed in JS (greedy packing) so rows wrap to a new plank.
 */

const DEFAULT_FAVICON = chrome.runtime.getURL("icons/icon48.png");

const GAP = 10;        // must match .row `gap`
const ROW_PAD = 8;     // must match .row horizontal padding
const SHELF_PAD = 26;  // must match .shelf horizontal padding

const WIDTHS = {
  article: { 5: 34, 20: 52, 60: 76 },
  course: { 5: 92, 20: 106, 60: 126 },
};

let items = [];
let openId = null;
let renderToken = 0;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  wireCard();
  mountWormy();
  await render();
  window.addEventListener("resize", debounce(render, 150));
  // keep the shelf live if the popup adds/removes something
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[CHELFE_KEY]) render();
  });
  // dust grows slowly: refresh the overlays without rebuilding the DOM
  setInterval(refreshDust, 60000);
}

/* ---- rendering ------------------------------------------------------- */

async function render() {
  const shelf = document.getElementById("shelf");
  const empty = document.getElementById("empty");
  const count = document.getElementById("count");

  // Renders can overlap (resize + storage change); only the newest wins.
  const token = ++renderToken;

  items = (await getItems())
    .filter((i) => !i.done)
    .sort((a, b) => b.savedAt - a.savedAt);

  if (token !== renderToken) return;

  count.textContent = items.length
    ? `${items.length} item${items.length === 1 ? "" : "s"} on the shelf`
    : "";

  if (!items.length) {
    shelf.replaceChildren();
    empty.hidden = false;
  } else {
    empty.hidden = true;
    const avail = Math.max(220, shelf.clientWidth - (SHELF_PAD + ROW_PAD) * 2);
    shelf.replaceChildren(...packPlanks(items, avail).map(buildPlank));
  }

  syncCard();
  updateWormy();
}

/* Keep the detail card honest: close it if its item vanished (removed
 * elsewhere), otherwise re-pull the freshly built element. */
function syncCard() {
  if (!openId) return;
  if (!items.some((i) => i.id === openId)) hideCard();
  else itemEl(openId)?.classList.add("is-pulled");
}

/* Greedy pack: fill a plank until the next item would overflow. */
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
  label.textContent = truncate(it.title, 160);

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

/* ---- dust (Phase 3) -------------------------------------------------- */

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
  const tpl = document.getElementById("tpl-cobweb");
  return tpl.content.firstElementChild.cloneNode(true);
}

/* Re-read the clock and update overlays in place (no DOM rebuild).
 * One DOM pass + a Map, instead of a selector query per item. */
function refreshDust() {
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const el of document.querySelectorAll(".item")) {
    const it = byId.get(el.dataset.id);
    if (it) applyDust(el, it);
  }
}

/* Little cloud of dust when something leaves the shelf. */
function dustPuff(el, level) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const puff = document.createElement("div");
  puff.className = "puff";
  puff.style.left = r.left + r.width / 2 + "px";
  puff.style.top = r.bottom - 4 + "px";

  const count = 4 + Math.round((level || 0) * 6);
  for (let i = 0; i < count; i++) {
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

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function reel() {
  const r = document.createElement("span");
  r.className = "reel";
  return r;
}

/* ---- geometry / hashing --------------------------------------------- */

function widthOf(it) {
  if (it.type === "video") return 122;
  return WIDTHS[it.type]?.[it.minutes] ?? 52;
}

/* Stable per item (derived from the id), so it never changes between renders. */
function heightOf(it) {
  const base = it.type === "course" ? 176 : 140;
  const span = it.type === "course" ? 36 : 40;
  if (it.type === "video") return 84;
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
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideCard();
  });

  // A saved favicon can 404 later; swap in our own icon once.
  const cardFav = document.getElementById("cardFavicon");
  cardFav.addEventListener("error", () => {
    if (cardFav.src !== DEFAULT_FAVICON) cardFav.src = DEFAULT_FAVICON;
  });

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

async function doneItem() {
  const it = current();
  if (!it) return;
  const el = itemEl(it.id);
  hideCard();

  // item tumbles off the shelf, with a puff of dust, then is removed
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

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ---- Wormy (Phase 5) ------------------------------------------------- */

let wormyMood = "happy";
let bubbleState = "message"; // "message" | "question" | "answer"
let cheerTimer = null;

function mountWormy() {
  const fig = document.getElementById("wormyFigure");
  fig.innerHTML = WORMY_SVG; // static markup from our own lib

  const conf = document.getElementById("wormyConfetti");
  for (let i = 0; i < 12; i++) conf.appendChild(document.createElement("i"));

  fig.addEventListener("click", askWormy);
}

/* Recompute Wormy's mood from the shelf (unless he's mid-celebration). */
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

/* Clicking Wormy asks how much time you have. */
function askWormy() {
  bubbleState = "question";
  const row = document.createElement("div");
  row.className = "bubble-actions";
  for (const m of [5, 20, 60]) {
    row.appendChild(bubbleButton(m === 60 ? "1h+" : m + " min", () => answerWormy(m)));
  }
  setBubble([el("p", "How much time do you have?"), row]);
}

function answerWormy(minutes) {
  bubbleState = "answer";

  if (!items.length) {
    setBubble([el("p", "Shelf's empty. Save something first, yallah.")]);
    return;
  }

  const pick = recommendWormyItem(items, minutes);
  if (!pick) {
    setBubble([el("p", "Nothing that small fits, khoya. Everything here is a bigger bite.")]);
    return;
  }

  const when = minutes === 60 ? "An hour" : minutes + " minutes";
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
