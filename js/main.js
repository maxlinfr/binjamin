// Binjamin boot + main loop.
import { CONFIG, settings, saveSettings, resetSettings, otherSide, toUserX } from './config.js';
import * as V from './vision.js';
import { UI, toast } from './ui.js';
import { Brain, STATES } from './brain.js';
import { Setup } from './setup.js';
import { Debug } from './debug.js';
import { preloadArt } from './art.js';
import { initClip, classifyClip } from './clip.js';

const video = document.getElementById('cam');
const ui = new UI();
let visionReady = false;
let modelsDone = false; // all models loaded (or failed): ok to leave the loading screen
let mode = 'boot'; // 'setup' | 'run'
let lastRawHand = null;
let lastVideoTime = -1;
let frameN = 0;

// One examining sample: find the object in the hand (or fall back to the hand itself),
// crop it, ask the trash model. Async: the brain keeps one sample in flight at a time.
const brain = new Brain(ui, (n) => {
  if (n === 0) V.forgetObject();
  if (!V.cropHeld(video, lastRawHand?.box, n)) return null;
  return classifyClip(V.lastCrop);
});

const startCamera = async () => {
  await V.startCamera(video);
  keepAwake();
};

const setup = new Setup({
  video,
  startCamera,
  onDone: () => {
    mode = 'run';
    brain.go(modelsDone ? 'idle' : 'loading');
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

  const p = { hand, face };
  if (mode === 'setup') setup.onFrame(now, p);
  else if (mode === 'run') brain.tick(now, p);
  debug.draw(now, p);
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

  // debug switch: ?novision (skip all the models, for testing art/states by hand)
  const params = new URLSearchParams(location.search);

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
  // the trash model is the slow download (23 MB, cached after the first visit): stay sleepy until it's in
  if (!params.has('novision')) {
    try { await initClip((msg) => ui.status(msg)); console.log('[clip] ready'); }
    catch (e) { console.error('[clip]', e); toast(`trash model failed to load: ${e.message}`, 10000); }
  }
  modelsDone = true;
  if (mode === 'run' && brain.state === 'loading') brain.go('idle');
}

boot();
