/* lib/sound.js
 * Wormy's voice + his little sound effects, plus the mute switch.
 * Built-in browser APIs only: Web Audio generates every blip (no audio
 * files) and speechSynthesis does the talking. Nothing is fetched.
 * The mute state lives in chrome.storage.local so both pages agree.
 */

const CHELFE_SETTINGS_KEY = "chelfe_settings";
const CHELFE_SETTINGS_DEFAULTS = { muted: false };

let chelfeSettings = { ...CHELFE_SETTINGS_DEFAULTS };
let chelfeAudio = null;          // lazily created on the first sound
let wormyTalkTimer = null;
const chelfeSettingsWatchers = new Set();

/* ---- the mute switch ------------------------------------------------- */

function getChelfeSettings() { return { ...chelfeSettings }; }
function isWormyMuted() { return !!chelfeSettings.muted; }

async function loadChelfeSettings() {
  try {
    const o = await chrome.storage.local.get(CHELFE_SETTINGS_KEY);
    chelfeSettings = { ...CHELFE_SETTINGS_DEFAULTS, ...(o[CHELFE_SETTINGS_KEY] || {}) };
  } catch (e) { /* keep the defaults */ }
  notifyChelfeSettings();
  return chelfeSettings;
}

async function setWormyMuted(muted) {
  chelfeSettings.muted = !!muted;
  if (chelfeSettings.muted) stopWormyVoice();
  notifyChelfeSettings();
  try { await chrome.storage.local.set({ [CHELFE_SETTINGS_KEY]: chelfeSettings }); } catch (e) {}
  return chelfeSettings;
}

function toggleWormyMuted() { return setWormyMuted(!chelfeSettings.muted); }

/* Run fn(settings) now and whenever the switch flips (any page, any tab). */
function onChelfeSettings(fn) {
  chelfeSettingsWatchers.add(fn);
  try { fn(chelfeSettings); } catch (e) {}
  return () => chelfeSettingsWatchers.delete(fn);
}

function notifyChelfeSettings() {
  for (const fn of chelfeSettingsWatchers) { try { fn(chelfeSettings); } catch (e) {} }
}

/* another Chelfe page flipped the switch */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[CHELFE_SETTINGS_KEY]) return;
  chelfeSettings = { ...CHELFE_SETTINGS_DEFAULTS, ...(changes[CHELFE_SETTINGS_KEY].newValue || {}) };
  notifyChelfeSettings();
});

/* ---- little sound effects (Web Audio, synthesised) ------------------- */

function audio() {
  if (isWormyMuted()) return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!chelfeAudio) chelfeAudio = new AC();
  if (chelfeAudio.state === "suspended") chelfeAudio.resume().catch(() => {});
  return chelfeAudio;
}

/* One short note with a soft attack/release. */
function chelfeNote(c, { at, freq, to, dur, type = "sine", gain = .12 }) {
  const osc = c.createOscillator();
  const vol = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, at + dur);
  vol.gain.setValueAtTime(0.0001, at);
  vol.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  vol.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(vol).connect(c.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/* A decaying burst of filtered noise (for puffs and poofs). */
function chelfeNoise(c, { at, dur, gain = .10, freq = 1400, q = .8 }) {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);

  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = q;
  const vol = c.createGain();
  vol.gain.value = gain;
  src.connect(bp).connect(vol).connect(c.destination);
  src.start(at);
}

const CHELFE_SFX = {
  /* a friendly two-tone hello when he starts talking */
  blip(c, t) {
    chelfeNote(c, { at: t, freq: 660, dur: .09, type: "triangle", gain: .10 });
    chelfeNote(c, { at: t + .07, freq: 990, dur: .10, type: "triangle", gain: .09 });
  },
  /* a soft wooden "tok" as an item lands on the shelf */
  plonk(c, t) {
    chelfeNote(c, { at: t, freq: 320, to: 150, dur: .18, gain: .16 });
    chelfeNote(c, { at: t, freq: 150, to: 90, dur: .22, type: "triangle", gain: .10 });
  },
  /* a dusty little poof when something leaves the shelf */
  poof(c, t) {
    chelfeNoise(c, { at: t, dur: .26, gain: .12, freq: 900, q: .7 });
    chelfeNote(c, { at: t, freq: 520, to: 180, dur: .22, gain: .08 });
  },
  /* a tiny arpeggio for the confetti moment */
  cheer(c, t) {
    [523, 659, 784, 1046].forEach((f, i) =>
      chelfeNote(c, { at: t + i * .09, freq: f, dur: .16, type: "triangle", gain: .10 })
    );
    chelfeNoise(c, { at: t + .30, dur: .30, gain: .07, freq: 2200, q: .6 });
  },
};

/* Play one named effect. No-op while muted. */
function wormySfx(name) {
  const c = audio();
  const make = CHELFE_SFX[name];
  if (!c || !make) return;
  try { make(c, c.currentTime + 0.01); } catch (e) {}
}

/* ---- talking (speechSynthesis, with a small voice effect) ------------ */

function pickWormyVoice(synth) {
  const voices = synth.getVoices() || [];
  if (!voices.length) return null;
  // a bright voice; the pitch shift does the rest of the "little voice"
  return (
    voices.find((v) => /^en/i.test(v.lang) && /female|samantha|zira|google/i.test(v.name)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    voices[0]
  );
}

/* Strip the stage directions and emoji so the voice only reads words. */
function cleanForSpeech(text) {
  return String(text || "")
    .replace(/\*[^*]*\*/g, " ")
    .replace(/[\u201C\u201D]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stopWormyVoice() {
  clearTimeout(wormyTalkTimer);
  removeTalkingClass();
  try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
}

function removeTalkingClass() {
  const el = document.getElementById("wormy");
  if (el) el.classList.remove("is-talking");
}

/* Speak text; returns how long the mouth should move (ms, 0 = silent). */
function speakWormy(text, { pitch = 1.45, rate = 1.0 } = {}) {
  if (isWormyMuted()) return 0;
  const synth = window.speechSynthesis;
  const say = cleanForSpeech(text);
  if (!synth || !say) return 0;

  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(say);
    const v = pickWormyVoice(synth);
    if (v) u.voice = v;
    u.pitch = pitch;   // squeaky: Wormy's "little voice"
    u.rate = rate;
    synth.speak(u);
    return Math.min(7000, 700 + say.length * 58);
  } catch (e) {
    return 0;
  }
}

/* Speak a line and give Wormy a moving mouth for the whole of it.
 * Silent (and still) when muted. Returns the talking time in ms. */
function wormySay(wormyEl, text) {
  const ms = speakWormy(text);
  if (!ms) return 0;

  wormySfx("blip");
  if (wormyEl) {
    wormyEl.classList.add("is-talking");
    clearTimeout(wormyTalkTimer);
    wormyTalkTimer = setTimeout(() => wormyEl.classList.remove("is-talking"), ms);
  }
  return ms;
}

/* Some browsers only reveal their voices after the first call. */
if (window.speechSynthesis) {
  try { window.speechSynthesis.getVoices(); } catch (e) {}
}

/* ---- wiring both pages share (they use the same #sound / #wormy ids) -- */

/* Sync the mute button to storage, load the saved state, flip on click. */
function wireWormySound() {
  const btn = document.getElementById("sound");
  if (!btn) return;

  onChelfeSettings((s) => {
    btn.classList.toggle("is-muted", !!s.muted);
    btn.setAttribute("aria-pressed", String(!s.muted));
    btn.title = s.muted
      ? "Wormy is quiet — click to let him talk"
      : "Wormy is talking — click to hush him";
    if (s.muted) stopWormyVoice();
  });

  btn.addEventListener("click", () => { toggleWormyMuted(); });
  loadChelfeSettings();
}

/* Speak a line as Wormy (and move his mouth for the whole of it). */
function sayAsWormy(text) {
  return wormySay(document.getElementById("wormy"), text);
}

/* Repeat whatever the bubble is currently saying. */
function repeatBubble() {
  const bubble = document.getElementById("wormyBubble");
  if (!bubble) return;
  const text = [...bubble.querySelectorAll("p")].map((p) => p.textContent).join(" ");
  if (text) sayAsWormy(text);
}
