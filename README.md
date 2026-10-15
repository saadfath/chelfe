# 🪱 Chelfe

A literal wooden shelf for the things you meant to read and watch later.

Chelfe is a tiny Manifest V3 Chrome/Brave extension. Save a tab and it becomes a
physical object standing on a wooden plank: articles are book spines, videos are
VHS tapes, courses are boxed sets. Leave things too long and they gather dust,
grow cobwebs, and a bookworm named **Wormy** starts coughing at you.

No accounts, no servers, no tracking. Everything lives in `chrome.storage.local`.

## Install (unpacked, for testing)

You can load Chelfe directly from this folder in any Chromium-based browser.

1. Go to your browser's extensions page:
   - **Brave**: `brave://extensions/`
   - **Chrome**: `chrome://extensions/`
   - **Microsoft Edge**: `edge://extensions/`
   - **Opera/Vivaldi/Arc**: open Extensions from Settings
2. Turn on **Developer mode** (top-right in Chrome/Brave/Edge).
3. Click **Load unpacked** (or "Load unpacked extension").
4. Select this folder (the one containing `manifest.json`).
5. Pin **Chelfe** to the toolbar.

To update after pulling changes, go back to the extensions page and hit **Reload** on Chelfe.

## Install from a ZIP (share with a friend)

1. Download `chelfe-v1.2.0.zip` from the Releases section of this repo.
2. Unzip it somewhere (or just keep it).
3. Follow the "Load unpacked" steps above, selecting the unzipped folder.
4. Done — no build step required.

## Use

- **Toolbar icon** — opens **the box**: your whole shelf in a compact popup,
  like a normal extension. Hit **Save this page** at the top to add the current
  tab (pick 5 min / 20 min / 1 h and an optional reminder), then **Put on the shelf**.
- **Alt+Shift+S** — quick-save the current tab (20 min, no reminder).
- Click an item **in the box** for **Open / Done / Remove**. **Done** leaves a puff
  of dust. The **⤢** button opens the same shelf as a full page in a tab.
- Click **Wormy** and tell him how much time you have; he points at the dustiest
  thing that fits.
- **Wormy has a voice.** Tap him (or tap his speech bubble) and he reads the line
  out loud, in a small squeaky voice, with his mouth moving while he talks.
- Tap the **speaker** in the header (or on the shelf page) to **hush him**. The
  switch is remembered, and both pages stay in sync.

## What it does over time

- Dust builds up over ~2 weeks; overdue items gather it twice as fast.
- Past ~10 days an item grows a cobweb.
- Wormy changes mood: happy, squinting, coughing, masked, cheering.
- Reminders land at **9:00** local on the chosen day, with a desktop notification.
- A daily nudge at **10:00** mentions your dustiest item.
- The toolbar badge counts overdue items.

## Wormy's voice and sounds

Wormy can talk, and he has a few little sound effects. All of it is synthesised
in the browser — there are no audio files and nothing is downloaded:

- **Speaking** uses the built-in `speechSynthesis` API, pitched up a little so he
  sounds squeaky.
- **Sound effects** (`blip`, `plonk`, `poof`, `cheer`) are generated with the Web
  Audio API: oscillators and a burst of filtered noise.
- He speaks on your interaction (tapping him, tapping the bubble, marking
  something **Done**), never on his own, so nothing ever talks over you.
- The **speaker** button mutes everything, and the choice is stored in
  `chrome.storage.local` under `chelfe_settings`, shared by both pages.
- Motion keeps him alive: he idles with a bob and a sway, blinks every few
  seconds, and flaps his mouth while he speaks. All of it stops when your system
  asks for reduced motion.

## Permissions

| Permission | Why |
|---|---|
| `storage` | keep your shelf locally |
| `tabs` | read the current tab's title/URL to save it |
| `alarms` | schedule reminders |
| `notifications` | show reminder + dust nudges |

No host permissions, no remote code, no libraries, no build step.

## Development notes

- MV3, vanilla JS/HTML/CSS only. No frameworks, build tools, external libraries, or remote code.
- All data lives in `chrome.storage.local`. The service worker reads from storage on every event (no in-memory global state).
- CSP is strict: no inline scripts or event handlers in HTML; no inline `style="..."` attributes (inline SVG markup is fine).
- Animations are pure CSS. Motion respects `prefers-reduced-motion`.
- Wormy's voice is synthesised with `speechSynthesis` (pitched up) and sound effects are generated with the Web Audio API. No audio files are shipped.
- Small, readable files with short comments. Designed to be easy to hack on.

## Repository

This is a single-folder unpacked extension. There's no build process. Just clone the repo and "Load unpacked" the folder in your Chromium browser.

## Files

```
manifest.json        MV3 manifest
background.js        service worker: alarms, notifications, badge, shortcut
lib/storage.js       all persistence (shared by popup + worker)
lib/dust.js          dust/overdue maths (shared)
lib/wormy.js         Wormy's SVG, moods and lines
lib/sound.js         Wormy's voice, sound effects + the mute switch (shared)
popup/               the click-box: a compact shelf + "save this page" bar
shelf/               the same shelf as a full page (the ⤢ fallback)
icons/               toolbar icons (the dusty file)
```
