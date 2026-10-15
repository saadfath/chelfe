# 🪱 Chelfe

A literal wooden shelf for the things you meant to read and watch later.

Chelfe is a tiny Manifest V3 Chrome/Brave extension. Save a tab and it becomes a
physical object standing on a wooden plank: articles are book spines, videos are
VHS tapes, courses are boxed sets. Leave things too long and they gather dust,
grow cobwebs, and a bookworm named **Wormy** starts coughing at you.

No accounts, no servers, no tracking. Everything lives in `chrome.storage.local`.

## Install (load unpacked)

1. Open `brave://extensions` (or `chrome://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
4. Pin **Chelfe** to the toolbar.

## Use

- **Toolbar icon** — pick how long the page will take (5 min / 20 min / 1 h) and
  an optional reminder, then **Put on the shelf**.
- **Alt+Shift+S** — quick-save the current tab (20 min, no reminder).
- **Open my shelf** — the shelf page, where items stand on planks.
- Click an item for **Open / Done / Remove**. **Done** leaves a puff of dust.
- Click **Wormy** and tell him how much time you have; he points at the dustiest
  thing that fits.

## What it does over time

- Dust builds up over ~2 weeks; overdue items gather it twice as fast.
- Past ~10 days an item grows a cobweb.
- Wormy changes mood: happy, squinting, coughing, masked, cheering.
- Reminders land at **9:00** local on the chosen day, with a desktop notification.
- A daily nudge at **10:00** mentions your dustiest item.
- The toolbar badge counts overdue items.

## Permissions

| Permission | Why |
|---|---|
| `storage` | keep your shelf locally |
| `tabs` | read the current tab's title/URL to save it |
| `alarms` | schedule reminders |
| `notifications` | show reminder + dust nudges |

No host permissions, no remote code, no libraries, no build step.

## Files

```
manifest.json        MV3 manifest
background.js        service worker: alarms, notifications, badge, shortcut
lib/storage.js       all persistence (shared by popup + worker)
lib/dust.js          dust/overdue maths (shared)
lib/wormy.js         Wormy's SVG, moods and lines
popup/               the save popup
shelf/               the shelf page
icons/               toolbar icons
```
