// Binjamin config: tuning knobs, saved settings, and asset URLs.
// Everything you might want to tweak at the bin lives here.

export const CONFIG = {
  camera: { width: 640, height: 480 },

  timing: {
    noticeMs: 250,          // hand in frame this long -> "noticed you"
    settleMs: 650,          // hand held up this long (while noticed) -> "examining"
    examineMs: 1300,        // length of the "hmmmm" beat (also the voting window)
    examineIntervalMs: 140, // how often to classify a frame while examining
    lostHandMs: 1400,       // hand gone this long during exam -> give up
    noticedTimeoutMs: 4000, // noticed but nothing held up -> back to idle
    verdictMinMs: 700,      // always show a verdict at least this long
    exitMs: 500,            // hand gone this long after a verdict = it was tossed
    verdictMaxMs: 9000,     // nobody tossed anything -> back to idle
    reactionMs: 2800,       // how long happy / sad / not-trash lasts
    idleLineMs: 7000,       // swap idle line + drawing this often
    clearMs: 600,           // after a reaction, hand must be gone this long before re-noticing
  },

  classify: {
    minFrames: 4,           // need at least this many votes before deciding
    minEvidence: 0.12,      // avg matched-label score per frame; below = confused
    minShare: 0.6,          // winning bin's share of votes; below = confused
    cropScales: [2.4, 3.4], // crop size around the hand (x hand size), alternated per frame
  },

  motion: {
    width: 160, height: 120, // OpenCV works on a tiny downscaled frame
    every: 2,               // run motion every N camera frames
    threshold: 28,          // pixel diff threshold (0-255)
    blobMin: 0.004,         // min blob area (fraction of frame) to count as movement
    presence: 0.03,         // total moving area that counts as "someone is here"
    lightingJump: 0.6,      // ignore frames where more than this much changes (auto-exposure)
    noticeByMotion: false,  // let general motion wake Binjamin up (off: faces do it now)
  },

  // Face / stare detection (MediaPipe Face Landmarker). No identity, just "is someone looking at me".
  face: {
    enabled: true,          // a stare wakes Binjamin up ("why u staring")
    every: 3,               // run face detection every N camera frames (~10/sec)
    stareMs: 600,           // must stare this long to count
    graceMs: 350,           // blinks / flickers shorter than this don't break a stare
    lookAwayMs: 2000,       // in "noticed", stop waiting this long after they look away
    resetMs: 800,           // after a reaction, must look away this long before a stare wakes him again
    minSize: 0.12,          // face width as fraction of frame; smaller = too far away (passersby)
    maxYaw: 0.18,           // head turn (0 = facing camera, ~0.5 = full profile)
    maxGazeSide: 0.5,       // eyes looking sideways (0-1 blendshape)
    maxGazeUp: 0.5,
    maxGazeDown: 0.75,      // lenient: people look DOWN at an iPad mounted at bin height
    maxBlink: 0.7,
  },

  compliance: {
    enabled: true,          // track where the item went and react (happy / sad)
    motionWeight: 0.6,      // blend of OpenCV motion vs last hand position for exit side
  },

  art: { frameMs: 260 },    // wobble speed for multi-frame drawings
};

// Local copies (from scripts/fetch-assets.sh) are used if present, else the CDN.
export const URLS = {
  tasksVision: ['vendor/mediapipe/vision_bundle.mjs',
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs'],
  wasmBase: ['vendor/mediapipe/wasm',
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'],
  faceModel: ['models/face_landmarker.task',
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'],
  handModel: ['models/hand_landmarker.task',
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'],
  classifierModel: ['models/efficientnet_lite0.tflite',
    'https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/int8/1/efficientnet_lite0.tflite'],
  opencv: ['vendor/opencv/opencv.js',
    'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js'],
};

// ---------- saved settings (from the setup screen) ----------
const KEY = 'binjamin.settings.v1';
const DEFAULTS = {
  setupDone: false,
  recycleSide: 'left', // which side the recycling bin is on, from the view of someone facing the iPad
  midline: 0.5,        // where the bins split, as a fraction of the camera's width (user's view)
  mirror: true,        // front camera = mirror image. Set false if using a rear camera.
  debug: false,
};

function readSaved() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
export const settings = { ...DEFAULTS, ...readSaved() };
export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private mode etc. */ }
}
export function resetSettings() {
  Object.assign(settings, DEFAULTS);
  saveSettings();
}

// ---------- helpers ----------
export const otherSide = (s) => (s === 'left' ? 'right' : 'left');
export const sideOfBin = (bin) => (bin === 'recycle' ? settings.recycleSide : otherSide(settings.recycleSide));
export const arrowFor = (side) => (side === 'left' ? '←' : '→');
// Camera pixels -> "user view" x (what a person facing the iPad thinks of as left/right).
export const toUserX = (rawX) => (settings.mirror ? 1 - rawX : rawX);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Use the first URL that exists. Remote URLs are assumed to exist.
export async function firstAvailable(list) {
  for (const u of list) {
    const abs = new URL(u, document.baseURI).href;
    if (/^https?:/.test(u)) return abs;
    try {
      const probe = u.endsWith('/wasm') ? `${u}/vision_wasm_internal.wasm` : u;
      const r = await fetch(probe, { method: 'HEAD', cache: 'no-store' });
      if (r.ok) return abs;
    } catch { /* not there */ }
  }
  return new URL(list[list.length - 1], document.baseURI).href;
}
