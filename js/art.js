// Art loading + the placeholder hamster.
// Real art comes from art/manifest.js. Until you draw it, every state gets a
// crude, wobbly, code-drawn hamster (2 frames of "line boil" each).

import manifest from '../art/manifest.js';

const POINTING = new Set(['recycle', 'landfill', 'confused']);
const FALLBACK = { nottrash: 'confused' };
const PLACEHOLDER_VARIANTS = { idle: 2, sad: 2, happy: 2 };

export const pageBackground = manifest.background === 'white' ? 'white' : 'notebook';
const user = {};         // state -> [[frame urls]]
export const userArt = { title: null, instructions: null, arrow: null, labels: {} };
const cache = new Map(); // placeholder data URLs
const lastPick = {};

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(src);
    img.onerror = () => reject(new Error(`missing art: ${src}`));
    img.src = src;
  });
}
const optional = (src) => (src ? loadImg(src).catch((e) => { console.warn('[art]', e.message); return null; }) : Promise.resolve(null));

export async function preloadArt() {
  const jobs = Object.entries(manifest.states || {}).map(async ([state, variants]) => {
    const list = (variants || []).map((v) => (Array.isArray(v) ? v : [v])).filter((v) => v.length);
    const ok = await Promise.all(list.map((frames) => Promise.all(frames.map(loadImg))
      .then(() => frames, (e) => { console.warn('[art]', e.message); return null; })));
    const good = ok.filter(Boolean);
    if (good.length) user[state] = good;
  });
  jobs.push(optional(manifest.title).then((v) => { userArt.title = v; }));
  jobs.push(optional(manifest.instructions).then((v) => { userArt.instructions = v; }));
  jobs.push(optional(manifest.arrow).then((v) => { userArt.arrow = v; }));
  jobs.push(optional(manifest.labels?.recycle).then((v) => { userArt.labels.recycle = v; }));
  jobs.push(optional(manifest.labels?.landfill).then((v) => { userArt.labels.landfill = v; }));
  await Promise.all(jobs);
}

// Random pick that avoids repeating the last one.
function pickIndex(n, key) {
  if (n <= 1) return 0;
  let i = Math.floor(Math.random() * n);
  if (i === lastPick[key]) i = (i + 1) % n;
  lastPick[key] = i;
  return i;
}

// -> { frames: [url, ...], flip: bool, user: bool, blend: bool }
export function pickArt(state, dir = 'left') {
  let key = state;
  if (!user[key] && FALLBACK[key] && user[FALLBACK[key]]) key = FALLBACK[key];
  if (user[key]) {
    const variants = user[key];
    const frames = variants[pickIndex(variants.length, `u:${key}`)];
    const flip = manifest.mirrorPointing !== false && POINTING.has(state)
      && dir !== (manifest.pointingDrawnFacing || 'left');
    return {
      frames, flip, user: true,
      blend: pageBackground === 'notebook' && manifest.fadeEdges !== false,
      clean: !!manifest.cleanWhites,
      lookAround: (manifest.lookAround || []).includes(state),
    };
  }
  const v = pickIndex(PLACEHOLDER_VARIANTS[state] || 1, `p:${state}`);
  const ck = `${state}|${v}|${dir}`;
  if (!cache.has(ck)) {
    cache.set(ck, [0, 1].map((frame) => svgUrl(hamsterSVG(state, { frame, variant: v, dir }))));
  }
  return { frames: cache.get(ck), flip: false, lookAround: (manifest.lookAround || []).includes(state) };
}

// Transfer curve for the "clean whites" filter: identity below the threshold,
// ramps up to pure white at it. -> "0 0.025 0.05 ... 1 1"
export function whiteCurve() {
  const t = Number(manifest.cleanWhites);
  if (!t) return null;
  const n = 80, ramp = 0.05;
  const vals = [];
  for (let i = 0; i <= n; i++) {
    const x = i / n;
    if (x >= t) vals.push(1);
    else if (x > t - ramp) vals.push(x + (1 - x) * ((x - (t - ramp)) / ramp));
    else vals.push(x);
  }
  return vals.map((v) => v.toFixed(4)).join(' ');
}

export const svgUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

// =====================================================================
//  Placeholder drawing kit: seeded wobbly lines, so it looks hand-drawn
// =====================================================================

const INK = '#1d1b19', FUR = '#e9b57c', BELLY = '#fcebd2', PINK = '#f6a5b8',
  MOUTH = '#5b1e22', TONGUE = '#ee7584', BLUE = '#8fd0ff', GOLD = '#ffd23f';
const FONT = 'Chalkboard SE, Comic Sans MS, Marker Felt, cursive';

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const f = (n) => Math.round(n * 10) / 10;

// Catmull-Rom spline through points -> smooth cubic bezier path.
function curve(pts, closed) {
  const n = pts.length;
  const P = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)}`
      + ` ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)}`
      + ` ${f(p2[0])},${f(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}
function blob(r, cx, cy, rx, ry, j = 0.045, n = 14) {
  const off = r() * 6.283, pts = [];
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * 6.283, k = 1 + (r() * 2 - 1) * j;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return curve(pts, true);
}
const line = (r, pts, j = 2.2) => curve(pts.map(([x, y]) => [x + (r() * 2 - 1) * j, y + (r() * 2 - 1) * j]), false);
const star = (x, y, s) => `M${x},${y - s} Q${x},${y} ${x + s},${y} Q${x},${y} ${x},${y + s} Q${x},${y} ${x - s},${y} Q${x},${y} ${x},${y - s}Z`;
const drop = (x, y, s = 1) => `M${x},${y - 18 * s} C${x + 13 * s},${y - 2 * s} ${x + 13 * s},${y + 12 * s} ${x},${y + 12 * s} C${x - 13 * s},${y + 12 * s} ${x - 13 * s},${y - 2 * s} ${x},${y - 18 * s}Z`;
function spiral(x, y, R, turns = 2.6, flip = 1) {
  const pts = [];
  for (let t = 0; t <= 1.0001; t += 0.03) {
    const a = t * turns * 6.283 * flip;
    pts.push([x + Math.cos(a) * R * t, y + Math.sin(a) * R * t]);
  }
  return curve(pts, false);
}

function pen() {
  const out = [];
  return {
    out,
    path(d, { fill = 'none', stroke = INK, w = 6, op = 1 } = {}) {
      out.push(`<path d="${d}" fill="${fill}" stroke="${w ? stroke : 'none'}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${op < 1 ? ` opacity="${op}"` : ''}/>`);
    },
    text(x, y, s, size, rot = 0, fill = INK) {
      out.push(`<text x="${x}" y="${y}" font-family="${FONT}" font-weight="700" font-size="${size}" fill="${fill}" text-anchor="middle" transform="rotate(${rot} ${x} ${y})">${s}</text>`);
    },
    raw(s) { out.push(s); },
  };
}

// ---- face parts ----
const EYE_L = [158, 212], EYE_R = [242, 212];

function dotEye(c, r, [x, y], R = 22, gx = 0, gy = 0) {
  c.path(blob(r, x + gx, y + gy, R, R * 1.08, 0.05), { fill: INK, w: 3 });
  c.path(blob(r, x + gx - R * 0.33, y + gy - R * 0.36, R * 0.34, R * 0.34, 0.1, 8), { fill: '#fff', w: 0 });
  c.path(blob(r, x + gx + R * 0.32, y + gy + R * 0.3, R * 0.14, R * 0.14, 0.1, 6), { fill: '#fff', w: 0 });
}
function shockedEye(c, r, [x, y], R = 25, gx = 0, gy = 0) {
  c.path(blob(r, x, y, R, R * 1.1, 0.06), { fill: '#fff', w: 5 });
  c.path(blob(r, x + gx, y + gy, R * 0.32, R * 0.32, 0.08, 8), { fill: INK, w: 0 });
}
function lidEye(c, r, [x, y], R = 22, gx = 0) {
  dotEye(c, r, [x, y], R, gx, 2);
  c.path(`M${x - R - 4},${y + 1} Q${x},${y + 5} ${x + R + 4},${y + 1} L${x + R + 4},${y - R - 8} L${x - R - 4},${y - R - 8}Z`, { fill: FUR, w: 0 });
  c.path(line(r, [[x - R - 3, y + 1], [x, y + 4], [x + R + 3, y + 1]]), { w: 5 });
}
const archEye = (c, r, [x, y], up = true) => c.path(line(r, up
  ? [[x - 18, y + 8], [x, y - 10], [x + 18, y + 8]]
  : [[x - 17, y - 2], [x, y + 7], [x + 17, y - 2]]), { w: 7 });
const squintEye = (c, r, [x, y]) => c.path(line(r, [[x - 16, y - 11], [x + 12, y], [x - 16, y + 11]]), { w: 7 });

const MOUTHS = {
  w: (c, r) => {
    c.path(line(r, [[193, 270], [193, 283], [207, 283], [207, 270]], 1), { fill: '#fff', w: 3 });
    c.path(line(r, [[200, 271], [200, 282]], 0.5), { w: 2 });
    c.path(line(r, [[182, 263], [191, 271], [200, 264], [209, 271], [218, 263]], 1.5), { w: 5 });
  },
  flat: (c, r) => c.path(line(r, [[184, 272], [200, 275], [216, 271]]), { w: 5 }),
  o: (c, r) => c.path(blob(r, 200, 280, 10, 12, 0.08, 10), { fill: MOUTH, w: 4 }),
  shout: (c, r, fr) => {
    c.path(blob(r, 200, 284, 22, 17 + fr * 3, 0.06), { fill: MOUTH, w: 5 });
    c.path(blob(r, 200, 293 + fr * 2, 11, 6, 0.1, 8), { fill: TONGUE, w: 0 });
  },
  smile: (c, r) => {
    c.path(`M176,266 Q200,${306 + r() * 4} 224,266 Q200,274 176,266Z`, { fill: MOUTH, w: 5 });
    c.path(blob(r, 200, 288, 9, 5, 0.1, 8), { fill: TONGUE, w: 0 });
  },
  frown: (c, r) => c.path(line(r, [[182, 288], [200, 276], [218, 288]]), { w: 6 }),
  wavy: (c, r) => c.path(line(r, [[180, 282], [190, 275], [200, 283], [210, 275], [220, 281]], 1.5), { w: 5 }),
};

function whiskers(c, r) {
  for (const s of [-1, 1]) {
    c.path(line(r, [[200 + s * 52, 262], [200 + s * 100, 252]], 1.5), { w: 2.5 });
    c.path(line(r, [[200 + s * 54, 270], [200 + s * 104, 272]], 1.5), { w: 2.5 });
  }
}
function chestPaws(c, r, dy = 0, only = null) {
  if (only !== 'right') c.path(blob(r, 176, 312 + dy, 16, 13, 0.08, 10), { fill: FUR, w: 5 });
  if (only !== 'left') c.path(blob(r, 224, 312 + dy, 16, 13, 0.08, 10), { fill: FUR, w: 5 });
}
function arm(c, r, from, mid, to) {
  const d = line(r, [from, mid, to], 1.5);
  c.path(d, { w: 30 });
  c.path(d, { stroke: FUR, w: 19 });
  c.path(blob(r, to[0], to[1], 17, 15, 0.08, 10), { fill: FUR, w: 5 });
}

export function hamsterSVG(state, { frame = 0, variant = 0, dir = 'left' } = {}) {
  const r = rng(hash(state) + variant * 101 + frame * 7919 + (dir === 'left' ? 0 : 13));
  const D = dir === 'left' ? -1 : 1;
  const c = pen();

  let tilt = 0, dy = 0;
  switch (state) {
    case 'noticed': tilt = frame ? -5 : -8; dy = -8; break;
    case 'examining': tilt = frame ? 3 : 5; dy = -2; break;
    case 'recycle': case 'landfill': tilt = D * (frame ? 4 : 6); break;
    case 'confused': tilt = frame ? -4 : 4; break;
    case 'happy': dy = frame ? -18 : -4; break;
    case 'sad': dy = 12; tilt = frame ? 1 : -1; break;
    case 'loading': dy = 6; break;
    default: tilt = frame ? 1 : -1;
  }

  c.raw(`<g transform="translate(0 ${dy}) rotate(${tilt} 200 340)">`);
  // ears
  for (const x of [124, 276]) {
    c.path(blob(r, x, 138, 34, 32), { fill: FUR, w: 6 });
    c.path(blob(r, x, 141, 16, 15, 0.1, 10), { fill: PINK, w: 0 });
  }
  // feet, body, belly, blush
  c.path(blob(r, 158, 356, 27, 14, 0.08, 10), { fill: FUR, w: 5 });
  c.path(blob(r, 242, 356, 27, 14, 0.08, 10), { fill: FUR, w: 5 });
  c.path(blob(r, 200, 242, 126, 118, 0.035, 16), { fill: FUR, w: 7 });
  c.path(blob(r, 200, 295, 72, 54, 0.06), { fill: BELLY, w: 0 });
  for (const x of [124, 276]) c.path(blob(r, x, 258, 19, 10, 0.1, 8), { fill: PINK, w: 0, op: 0.6 });
  whiskers(c, r);
  c.path(blob(r, 200, 250, 8, 6, 0.1, 8), { fill: PINK, w: 3 });

  const g = frame ? 9 : -9;
  switch (state) {
    case 'idle':
      if (variant === 0) { dotEye(c, r, EYE_L, 22, g, 0); dotEye(c, r, EYE_R, 22, g, 0); MOUTHS.w(c, r); }
      else { lidEye(c, r, EYE_L, 22, g / 2); lidEye(c, r, EYE_R, 22, g / 2); MOUTHS.flat(c, r); }
      chestPaws(c, r);
      break;
    case 'loading':
      archEye(c, r, EYE_L, false); archEye(c, r, EYE_R, false); MOUTHS.o(c, r); chestPaws(c, r, 4);
      break;
    case 'noticed':
      dotEye(c, r, EYE_L, 28, 0, -3); dotEye(c, r, EYE_R, 28, 0, -3); MOUTHS.o(c, r); chestPaws(c, r, -6);
      break;
    case 'examining':
      squintEye(c, r, EYE_L);
      dotEye(c, r, EYE_R, 30, frame ? 3 : -3, 0);
      MOUTHS.wavy(c, r);
      chestPaws(c, r, 0, 'left');
      c.path(blob(r, 242, 212, 46, 46, 0.03, 16), { fill: BLUE, w: 0, op: 0.3 });
      c.path(blob(r, 242, 212, 46, 46, 0.03, 16), { w: 9 });
      c.path(line(r, [[276, 246], [300, 275], [322, 302]], 1), { w: 13 });
      c.path(blob(r, 322, 306, 17, 15, 0.08, 10), { fill: FUR, w: 5 });
      break;
    case 'recycle': case 'landfill': {
      const gaze = D * 9;
      shockedEye(c, r, EYE_L, 25, gaze, -2); shockedEye(c, r, EYE_R, 25, gaze, -2);
      MOUTHS.shout(c, r, frame);
      chestPaws(c, r, 0, D < 0 ? 'right' : 'left');
      const reach = frame ? 14 : 0;
      arm(c, r, [200 + D * 92, 282], [200 + D * 150, 252], [200 + D * (184 + reach), 214 - reach / 2]);
      break;
    }
    case 'confused':
      c.path(spiral(EYE_L[0], EYE_L[1], 22, 2.6, 1), { w: 5 });
      c.path(spiral(EYE_R[0], EYE_R[1], 22, 2.6, -1), { w: 5 });
      MOUTHS.wavy(c, r);
      chestPaws(c, r, 0, D < 0 ? 'right' : 'left');
      arm(c, r, [200 + D * 90, 292], [200 + D * 140, 302], [200 + D * 170, 290 + (frame ? 6 : 0)]);
      break;
    case 'nottrash':
      shockedEye(c, r, EYE_L, 27, 0, frame ? 4 : 0); shockedEye(c, r, EYE_R, 27, 0, frame ? 4 : 0);
      MOUTHS.wavy(c, r); chestPaws(c, r);
      break;
    case 'happy':
      archEye(c, r, EYE_L, true); archEye(c, r, EYE_R, true); MOUTHS.smile(c, r);
      for (const s of [-1, 1]) arm(c, r, [200 + s * 92, 262], [200 + s * 140, 220], [200 + s * 152, 168 - (frame ? 10 : 0)]);
      break;
    case 'sad':
      dotEye(c, r, EYE_L, 27, 0, 5); dotEye(c, r, EYE_R, 27, 0, 5);
      c.path(line(r, [[130, 186], [180, 170]]), { w: 6 });
      c.path(line(r, [[270, 186], [220, 170]]), { w: 6 });
      MOUTHS.frown(c, r); chestPaws(c, r, 8);
      if (variant === 0) c.path(drop(150, 252 + frame * 16, 0.9), { fill: BLUE, w: 4 });
      else { c.path(drop(146, 250 + frame * 12, 0.8), { fill: BLUE, w: 4 }); c.path(drop(254, 262 - frame * 4, 0.8), { fill: BLUE, w: 4 }); }
      break;
    default:
      dotEye(c, r, EYE_L); dotEye(c, r, EYE_R); MOUTHS.w(c, r); chestPaws(c, r);
  }
  c.raw('</g>');

  // things floating around him (not tilted with the body)
  switch (state) {
    case 'loading': c.text(310 + frame * 6, 120 - frame * 10, 'z', 44, 10); c.text(345, 80 - frame * 6, 'z', 30, -8); break;
    case 'noticed': c.text(320, 112, '!', 80, frame ? 8 : 14); break;
    case 'examining': c.path(drop(330, 128 + frame * 6, 1.1), { fill: BLUE, w: 4 }); break;
    case 'recycle': case 'landfill':
      for (const [k, yy] of [[0, -28], [1, 0], [2, 28]]) {
        const x0 = 200 + D * (220 + (frame ? 12 : 0) + k * 3);
        c.path(line(r, [[x0, 204 + yy], [x0 + D * 18, 200 + yy * 1.2]], 1), { w: 5 });
      }
      break;
    case 'confused':
      c.text(frame ? 82 : 90, 96, '?', 70, -14); c.text(318, frame ? 78 : 70, '?', 56, 12); c.text(345, 150, '?', 34, 20);
      break;
    case 'nottrash': c.text(322, 100, '!?', 64, 10); break;
    case 'happy':
      for (const [x, y, s] of frame ? [[70, 120, 20], [340, 90, 26], [345, 250, 16], [60, 260, 14]]
        : [[80, 90, 26], [330, 120, 18], [350, 230, 22], [55, 230, 18]]) {
        c.path(star(x, y, s), { fill: GOLD, w: 3 });
      }
      break;
    case 'sad': c.path(line(r, [[60, 70], [70, 80], [62, 92], [72, 104]], 1), { w: 4, op: 0.5 }); break;
    default: break;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -10 500 420" width="500" height="420">${c.out.join('')}</svg>`;
}

// Big wobbly arrow, pointing LEFT (flipped with CSS for right).
export function arrowSVG(seed = 7) {
  const r = rng(seed);
  const shaft = line(r, [[208, 74], [150, 64], [92, 76], [24, 70]], 3);
  const head = line(r, [[74, 20], [24, 70], [76, 122]], 3);
  return `<svg viewBox="0 0 230 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="${shaft}" fill="none" stroke="currentColor" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${head}" fill="none" stroke="currentColor" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}
