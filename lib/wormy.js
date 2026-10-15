/* lib/wormy.js — Wormy, the Chelfe librarian.
 * Pure data + string markup (no DOM side effects), so shelf.js decides
 * where it goes. Mood parts are toggled by CSS via [data-mood].
 */

/* One SVG, every mood's props included; CSS shows the right ones. */
const WORMY_SVG = `
<svg class="wormy-svg" viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <!-- body -->
  <circle cx="60" cy="122" r="17" fill="#86cf6f" stroke="#3f7d34" stroke-width="3"/>
  <circle cx="60" cy="98"  r="19" fill="#86cf6f" stroke="#3f7d34" stroke-width="3"/>
  <circle cx="60" cy="72"  r="21" fill="#86cf6f" stroke="#3f7d34" stroke-width="3"/>
  <circle cx="60" cy="40"  r="25" fill="#86cf6f" stroke="#3f7d34" stroke-width="3"/>
  <ellipse cx="50" cy="98" rx="6" ry="9" fill="#b6e8a3" opacity=".7"/>
  <ellipse cx="50" cy="72" rx="7" ry="11" fill="#b6e8a3" opacity=".75"/>
  <ellipse cx="52" cy="40" rx="9" ry="13" fill="#b6e8a3" opacity=".55"/>

  <!-- glasses (always on) -->
  <circle cx="49" cy="38" r="9.5" fill="#eafaf3" opacity=".5" stroke="#2f2a25" stroke-width="3"/>
  <circle cx="71" cy="38" r="9.5" fill="#eafaf3" opacity=".5" stroke="#2f2a25" stroke-width="3"/>
  <path d="M58.5 38 h3" stroke="#2f2a25" stroke-width="3" stroke-linecap="round"/>
  <path d="M30 33 q-9 -3 -13 -10" fill="none" stroke="#2f2a25" stroke-width="3" stroke-linecap="round"/>
  <path d="M90 33 q9 -3 13 -10" fill="none" stroke="#2f2a25" stroke-width="3" stroke-linecap="round"/>

  <!-- eyes -->
  <g class="w-eyes-open">
    <circle cx="49" cy="39" r="3.4" fill="#2f2a25"/>
    <circle cx="71" cy="39" r="3.4" fill="#2f2a25"/>
    <circle cx="50.3" cy="37.6" r="1.1" fill="#fff"/>
    <circle cx="72.3" cy="37.6" r="1.1" fill="#fff"/>
  </g>
  <g class="w-eyes-squint">
    <path d="M44 39 q5 -6 10 0" fill="none" stroke="#2f2a25" stroke-width="3" stroke-linecap="round"/>
    <path d="M66 39 q5 -6 10 0" fill="none" stroke="#2f2a25" stroke-width="3" stroke-linecap="round"/>
  </g>

  <!-- cheeks + mouth -->
  <circle cx="38" cy="50" r="5" fill="#f4a3a3" opacity=".6"/>
  <circle cx="82" cy="50" r="5" fill="#f4a3a3" opacity=".6"/>
  <path class="w-mouth" d="M52 54 q8 7 16 0" fill="none" stroke="#2f2a25" stroke-width="3" stroke-linecap="round"/>
  <ellipse class="w-mouth-open" cx="60" cy="58" rx="5" ry="7" fill="#8a3b34" stroke="#2f2a25" stroke-width="2.5"/>

  <!-- happy: reading a tiny book -->
  <g class="w-book">
    <path d="M60 84 q14 -6 26 0" fill="none" stroke="#3f7d34" stroke-width="5" stroke-linecap="round"/>
    <rect x="76" y="84" width="28" height="22" rx="3" fill="#c0553f" stroke="#7d2f1f" stroke-width="2"/>
    <path d="M90 85 v20" stroke="#f6ead6" stroke-width="2"/>
    <path d="M80 91 h6 M80 97 h6 M94 91 h6 M94 97 h6" stroke="#f6ead6" stroke-width="1.6" stroke-linecap="round"/>
  </g>

  <!-- coughing: little cloud -->
  <g class="w-cough">
    <circle cx="98" cy="42" r="7" fill="#dfe6ea" opacity=".9"/>
    <circle cx="108" cy="34" r="5" fill="#dfe6ea" opacity=".75"/>
    <circle cx="106" cy="50" r="6" fill="#dfe6ea" opacity=".8"/>
  </g>

  <!-- masked: face mask + feather duster -->
  <g class="w-mask">
    <path d="M42 52 l-10 -5 M78 52 l10 -5" stroke="#b9c6cc" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="42" y="48" width="36" height="18" rx="6" fill="#eef4f6" stroke="#b9c6cc" stroke-width="2"/>
    <path d="M42 55 h36 M42 61 h36" stroke="#cdd8dd" stroke-width="1.5"/>
  </g>
  <g class="w-duster">
    <rect x="88" y="72" width="6" height="28" rx="3" fill="#a9772f"/>
    <ellipse cx="91" cy="68" rx="14" ry="12" fill="#e9c46a"/>
    <ellipse cx="82" cy="63" rx="7" ry="9" fill="#f0d68a" opacity=".9"/>
    <ellipse cx="100" cy="63" rx="7" ry="9" fill="#f0d68a" opacity=".9"/>
  </g>

  <!-- cheering: arms up -->
  <g class="w-arms-up">
    <path d="M40 72 q-18 -12 -22 -28" fill="none" stroke="#3f7d34" stroke-width="6" stroke-linecap="round"/>
    <path d="M80 72 q18 -12 22 -28" fill="none" stroke="#3f7d34" stroke-width="6" stroke-linecap="round"/>
  </g>
</svg>`;

/* 6 lines per mood. {title} is swapped for the relevant item. */
const WORMY_MESSAGES = {
  happy: [
    "Shelf's fresh, khoya. Even the spider is impressed.",
    "Clean wood, clean conscience. I'm reading a little something.",
    "Look at this tidy shelf. Safi, I'm proud of us.",
    "No dust today. I could get used to this, wallah.",
    "Everything's neat. Time for a tiny book break.",
    "Fresh shelf, good vibes. Yallah, let's read one.",
  ],
  squinting: [
    "Hmm. Something over there is aging. Just a chwiya.",
    "One or two have been sitting a while. Don't mind me squinting.",
    "Not dusty yet, but my glasses are fogging up a bit.",
    "A few of these are older than my last haircut.",
    "Chwiya attention — some of these got comfortable.",
    "I'd squint less if one of these took a little walk outside.",
  ],
  coughing: [
    "You said you'd do '{title}' on Saturday. It's Tuesday.",
    "*cough* '{title}' has been waiting so long it knows my name.",
    "*cough cough* '{title}' — wallah, it's staring at me.",
    "Bezzaf dust! '{title}' is basically furniture now.",
    "*hack* '{title}' called. It says it's been a while, khoya.",
    "This coughing is '{title}'s fault. Just saying.",
  ],
  masked: [
    "Eight dusty items. I'm wearing the mask now. Nothing personal.",
    "Mask on, feather duster out. This shelf is bezzaf dusty.",
    "*muffled* I can't smell anything and I'd like to keep it that way.",
    "The mask is for the dust, not for you. Mostly.",
    "Time to dust, yallah. I'll be the one in the mask.",
    "This is a hazmat situation with extra cobwebs.",
  ],
  cheering: [
    "DONE! Yallah, confetti! Proud of you, khoya.",
    "That's one off the shelf. Safi, look at you go!",
    "Mabrouk! Another one bites the dust — the good kind.",
    "Woo! You actually finished something. I'm a little emotional.",
    "There it goes! High-five. I have limited arms.",
    "Cheers! Shelf's lighter and so is your soul.",
  ],
};

/* Pick a mood from the current (unfinished) items.
 * Priority: masked > coughing > squinting > happy. */
function pickWormyMood(items) {
  const list = (items || []).filter((i) => !i.done);
  const dusty = list.filter((i) => dustLevel(i) > 0.7).length;
  const overdue = list.filter(isOverdue).length;
  const older14 = list.filter((i) => daysSince(i.savedAt) > 14).length;
  const older7 = list.filter((i) => daysSince(i.savedAt) > 7).length;

  if (dusty >= 8) return "masked";
  if (overdue >= 1 || older14 >= 4) return "coughing";
  if (older7 >= 1) return "squinting";
  return "happy";
}

/* A random line for the mood, with {title} filled in. */
function pickWormyMessage(mood, item) {
  const lines = WORMY_MESSAGES[mood] || WORMY_MESSAGES.happy;
  const line = lines[Math.floor(Math.random() * lines.length)];
  return line.replace("{title}", item ? shortTitle(item.title) : "that one");
}

/* The item a mood message should talk about: an overdue one if any,
 * otherwise the dustiest. */
function wormyFocusItem(items) {
  const list = (items || []).filter((i) => !i.done);
  if (!list.length) return null;
  const overdue = list.filter(isOverdue);
  const pool = overdue.length ? overdue : list;
  return pool.reduce((a, b) => (dustLevel(b) > dustLevel(a) ? b : a));
}

/* Recommend something that fits the time budget, dustiest first. */
function recommendWormyItem(items, minutes) {
  const fits = (items || []).filter((i) => !i.done && i.minutes <= minutes);
  if (!fits.length) return null;
  return fits.reduce((a, b) => (dustLevel(b) > dustLevel(a) ? b : a));
}

function shortTitle(s, n = 48) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "\u2026" : s;
}
