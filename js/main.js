// Binjamin boot + main loop.
import { CONFIG, settings, saveSettings, resetSettings, otherSide, toUserX } from './config.js';
import * as V from './vision.js';
import { loadOpenCV, MotionTracker } from './motion.js';
import { UI, toast } from './ui.js';
import { Brain, STATES } from './brain.js';
import { Setup } from './setup.js';
import { Debug } from './debug.js';
import { preloadArt } from './art.js';
import { initClip, classifyClip } from './clip.js';

const video = document.getElementById('cam');
const ui = new UI();
let motion = null;
let motionError = null;
let visionReady = false;
let mode = 'boot'; // 'setup' | 'run'
let lastRawHand = null;
let lastVideoTime = -1;
let frameN = 0;

let clipReady = false;
const useClip = CONFIG.classifier !== 'imagenet';

// One examining sample: crop around the hand, ask the general model (fast, sync),
// then MobileCLIP on the same crop (slower, async) if it's loaded.
const brain = new Brain(ui, (n) => {
  const scales = CONFIG.classify.cropScales;
  const imagenet = V.classifyAround(video, lastRawHand?.box, scales[n % scales.length]);
  if (!useClip || !clipReady) return imagenet ? { imagenet } : null;
  return classifyClip(V.lastCrop)
    .then((clip) => ({ imagenet, clip }))
    .catch((e) => { console.warn('[clip]', e); return imagenet ? { imagenet } : null; });
});

const startCamera = async () => {
  await V.startCamera(video);
  keepAwake();
};

const setup = new Setup({
  video,
  startCamera,
  motionReady: () => !!motion,
  onDone: () => {
    mode = 'run';
    brain.go(visionReady ? 'idle' : 'loading');
  },
});

function command(cmd) {
  if (cmd === 'auto') { brain.setAuto(true); toast('auto mode'); }
  if (cmd === 'setup') openSetup();
  if (cmd === 'flip') {
    settings.recycleSide = otherSide(settings.recycleSide);
    saveSettings();
    toast(`recycling is now on the ${settings.recycleSide.toUpperCase()}`);
    if (brain.state && mode === 'run') brain.force(brain.state);
  }
  if (cmd === 'reset') { resetSettings(); location.reload(); }
}

const debug = new Debug({ video, brain, onCommand: command });

function openSetup() {
  mode = 'setup';
  setup.open();
}

async function keepAwake() {
  try { await navigator.wakeLock?.request('screen'); } catch { /* not supported */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) keepAwake(); });

// ---------------- main loop ----------------
function loop(now) {
  requestAnimationFrame(loop);
  const fresh = video.readyState >= 2 && video.currentTime !== lastVideoTime;
  if (!fresh) {
    if (mode === 'run') brain.tick(now, null); // timers still run
    return;
  }
  lastVideoTime = video.currentTime;
  frameN++;
  debug.countFrame(now);

  let h = null;
  try { h = visionReady ? V.detectHands(video, now) : null; } catch (e) { console.warn(e); }
  if (h?.present) lastRawHand = h;
  const hand = h?.present
    ? { present: true, x: toUserX(h.cx), y: h.cy, size: Math.max(h.box.x1 - h.box.x0, h.box.y1 - h.box.y0), raw: h }
    : { present: false };

  // face/stare: ~10x a second, skipped while examining so the classifier gets the CPU/GPU
  let face = null;
  if (visionReady && mode === 'run' && brain.state !== 'examining' && frameN % CONFIG.face.every === 0) {
    try { face = V.detectFace(video, now); } catch (e) { console.warn(e); }
  }

  let m = null;
  if (motion && frameN % CONFIG.motion.every === 0) {
    try { m = motion.update(video); } catch (e) { console.warn('[motion] disabled', e); motion = null; motionError = e; }
  }

  const p = { hand, motion: m, face };
  if (mode === 'setup') setup.onFrame(now, p);
  else if (mode === 'run') brain.tick(now, p);
  debug.draw(now, p, { motionReady: !!motion, motionError });
}

// ---------------- input ----------------
const KEYS = Object.fromEntries(STATES.map((s, i) => [String((i + 1) % 10), s]));
let cycleIdx = 0;
window.addEventListener('keydown', (e) => {
  if (mode === 'setup') return;
  if (KEYS[e.key]) brain.force(KEYS[e.key]);
  else if (e.key === ' ') { cycleIdx = (cycleIdx + 1) % STATES.length; brain.force(STATES[cycleIdx]); }
  else if (e.key === 'a') command('auto');
  else if (e.key === 'd') debug.toggle();
  else if (e.key === 's') command('setup');
  else if (e.key === 'f') command('flip');
  else return;
  e.preventDefault();
});

// hidden touch controls for the iPad (no keyboard at the bin)
function multiTap(el, count, fn) {
  let taps = [];
  el.addEventListener('pointerdown', () => {
    const t = performance.now();
    taps = taps.filter((x) => t - x < 700).concat(t);
    if (taps.length >= count) { taps = []; fn(); }
  });
}
multiTap(document.getElementById('corner-tl'), 3, () => debug.toggle());
multiTap(document.getElementById('corner-tr'), 3, () => openSetup());

// wake button if the camera couldn't auto-start
const wake = document.getElementById('wake');
wake.addEventListener('click', async () => {
  try { await startCamera(); wake.hidden = true; } catch (e) { toast(e.message); }
});

// ---------------- boot ----------------
async function boot() {
  await preloadArt();
  ui.init();
  ui.show('loading');
  brain.state = 'loading';

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('[sw]', e));
  }

  // debug switches: ?nocv (skip OpenCV) / ?novision (skip MediaPipe)
  const params = new URLSearchParams(location.search);
  if (!params.has('nocv')) {
    loadOpenCV()
      .then(({ cv }) => { motion = new MotionTracker(cv); console.log('[opencv] ready'); })
      .catch((e) => { motionError = e; console.warn('[opencv] unavailable, hand-only tracking', e); });
  }

  const visionP = (params.has('novision') ? Promise.reject(new Error('disabled by ?novision')) : V.initVision((msg) => ui.status(msg)))
    .then(() => { visionReady = true; })
    .catch((e) => { console.error(e); toast(`vision failed: ${e.message}`, 10000); });

  requestAnimationFrame(loop);

  if (!settings.setupDone) {
    openSetup();
  } else {
    mode = 'run';
    try { await startCamera(); } catch (e) { console.warn(e); wake.hidden = false; }
  }

  await visionP;
  // MobileCLIP loads in the background; until it's ready, the general model handles everything
  if (useClip && !params.has('novision')) {
    initClip()
      .then(() => { clipReady = true; console.log('[clip] ready'); })
      .catch((e) => { console.warn('[clip] unavailable, using the general model only', e); toast('trash model failed to load, using the general one'); });
  }
  // no face model? fall back to waking up on motion
  if (CONFIG.face.enabled && V.status.face !== true) CONFIG.motion.noticeByMotion = true;
  if (mode === 'run' && brain.state === 'loading') brain.go('idle');
}

boot();
