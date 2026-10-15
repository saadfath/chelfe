/* popup.js — Phase 1 UI.
 * No inline JS anywhere (MV3 CSP). All handlers are attached here.
 */

const DEFAULT_FAVICON = chrome.runtime.getURL("icons/icon48.png");

let activeTab = null;
let minutes = 20;      // selected duration
let remind = "none";   // selected reminder kind

document.addEventListener("DOMContentLoaded", init);

async function init() {
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
    const wantsDate = remind === "date";
    date.hidden = !wantsDate;
    if (wantsDate) date.focus();
  });

  document.getElementById("save").addEventListener("click", onSave);
  document.getElementById("shelf").addEventListener("click", onOpenShelf);

  // Favicons can vanish; fall back to our own icon once.
  const fav = document.getElementById("favicon");
  fav.addEventListener("error", () => {
    if (fav.src !== DEFAULT_FAVICON) fav.src = DEFAULT_FAVICON;
  });

  activeTab = await getActiveTab();
  renderTab();
}

function selectChip(selector, btn) {
  document.querySelectorAll(selector + " .chip").forEach((c) => {
    c.classList.toggle("is-on", c === btn);
  });
}

function getActiveTab() {
  return chrome.tabs
    .query({ active: true, currentWindow: true })
    .then((tabs) => tabs[0] || null)
    .catch(() => null);
}

function renderTab() {
  const fav = document.getElementById("favicon");
  const title = document.getElementById("title");
  const host = document.getElementById("host");
  const warn = document.getElementById("warn");
  const save = document.getElementById("save");

  if (!activeTab || !activeTab.url) {
    title.textContent = "No tab found";
    save.disabled = true;
    return;
  }

  title.textContent = activeTab.title || "Untitled";
  title.title = activeTab.title || "";
  try {
    host.textContent = hostOf(activeTab.url);
  } catch (e) {
    host.textContent = "";
  }
  fav.src = activeTab.favIconUrl || DEFAULT_FAVICON;

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

  // "Pick date" with an empty picker would silently save no reminder. Ask first.
  if (remind === "date" && !dateStr) {
    showToast("Pick a date, or choose None.", true);
    return;
  }

  save.disabled = true;
  try {
    const item = buildItem({
      url: activeTab.url,
      title: activeTab.title,
      favicon: activeTab.favIconUrl,
      minutes,
      remindAt: reminderAt(remind, dateStr),
    });

    await saveItem(item);
    showToast("Put on the shelf! 🪱", false);
    setTimeout(() => window.close(), 900);
  } catch (e) {
    // Storage can reject (quota, etc.) — never leave the popup stuck.
    save.disabled = false;
    showToast("Couldn't save that. Try again?", true);
  }
}

function showToast(text, isError) {
  const toast = document.getElementById("toast");
  toast.textContent = text;
  toast.classList.toggle("is-error", !!isError);
  toast.hidden = false;
}

/* Reminder timestamps: day-based options land at 9:00 local. */
function reminderAt(kind, dateStr) {
  const at9 = (d) => {
    const x = new Date(d);
    x.setHours(9, 0, 0, 0);
    return x.getTime();
  };
  const now = new Date();

  switch (kind) {
    case "tomorrow": {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      return at9(d);
    }
    case "weekend": {
      // next Saturday (if today is Saturday, go a week out)
      const d = new Date(now);
      let add = (6 - d.getDay() + 7) % 7;
      if (add === 0) add = 7;
      d.setDate(d.getDate() + add);
      return at9(d);
    }
    case "twoweeks": {
      const d = new Date(now);
      d.setDate(d.getDate() + 14);
      return at9(d);
    }
    case "date": {
      if (!dateStr) return null;
      return at9(new Date(dateStr + "T00:00:00")); // local midnight, avoids UTC shift
    }
    default:
      return null;
  }
}

function onOpenShelf() {
  chrome.tabs.create({ url: chrome.runtime.getURL("shelf/shelf.html") });
  window.close();
}
