// Camera + MediaPipe: face (wake-up), hand (waypoint), object detector (what to crop).
// Everything runs in the browser, on the iPad. No server. The trash model itself is in clip.js.

import { CONFIG, URLS, firstAvailable, clamp } from './config.js';

let hands = null;
let face = null;
let detector = null;
let lastTs = -1;
let lastFaceTs = -1;
export const status = { hands: false, face: false, detector: false, delegate: '-' };

const crop = document.createElement('canvas');
crop.width = crop.height = 256;
const cropCtx = crop.getContext('2d', { willReadFrequently: true });
export const lastCrop = crop; // what the trash model sees (also shown in the debug panel)

// the window around the hand that the object detector searches (EfficientDet-Lite0 eats 320x320)
const search = document.createElement('canvas');
search.width = search.height = 320;
const searchCtx = search.getContext('2d', { willReadFrequently: true });

// what the last crop was centered on, for the debug panel.
// box = raw camera coords (0-1), source = 'object' | 'object (remembered)' | 'hand'
export const cropInfo = { source: 'hand', label: '', conf: 0, box: null, at: 0 };
let lastObj = null; // last detected object, stored relative to the hand so it moves with it
// every detection from the last search + why it was (not) picked, for the debug panel
export const lastDetections = [];

async function create(Task, fileset, options, preferGPU) {
  const order = preferGPU ? ['GPU', 'CPU'] : ['CPU'];
  let err;
  for (const delegate of order) {
    try {
      const t = await Task.createFromOptions(fileset, { ...options, baseOptions: { ...options.baseOptions, delegate } });
      return { task: t, delegate };
    } catch (e) { err = e; console.warn(`[vision] ${delegate} failed`, e); }
  }
  throw err;
}

export async function initVision(progress = () => {}) {
  progress('loading eyeballs...');
  const tv = await import(await firstAvailable(URLS.tasksVision));
  const fileset = await tv.FilesetResolver.forVisionTasks(await firstAvailable(URLS.wasmBase));

  progress('learning what hands look like...');
  const h = await create(tv.HandLandmarker, fileset, {
    baseOptions: { modelAssetPath: await firstAvailable(URLS.handModel) },
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: CONFIG.hand.minConfidence,
    minHandPresenceConfidence: Math.max(0.5, CONFIG.hand.minConfidence - 0.1),
    minTrackingConfidence: 0.5,
  }, true);
  hands = h.task; status.hands = true; status.delegate = h.delegate;

  if (CONFIG.face.enabled) {
    progress('learning what faces look like...');
    try {
      const fc = await create(tv.FaceLandmarker, fileset, {
        baseOptions: { modelAssetPath: await firstAvailable(URLS.faceModel) },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true, // eye-look scores = gaze
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      }, true);
      face = fc.task; status.face = true;
    } catch (e) {
      console.warn('[vision] face landmarker unavailable: only a held-up hand wakes him now', e);
      status.face = 'failed';
    }
  }

  if (CONFIG.object.enabled) {
    progress('learning what stuff looks like...');
    try {
      const d = await create(tv.ObjectDetector, fileset, {
        baseOptions: { modelAssetPath: await firstAvailable(URLS.objectModel) },
        runningMode: 'IMAGE',
        maxResults: 8,
        scoreThreshold: CONFIG.object.minScore,
        categoryDenylist: CONFIG.object.ignore,
      }, false); // CPU only: the GPU delegate returns junk boxes for this model (tested in Chrome)
      detector = d.task; status.detector = true;
    } catch (e) {
      console.warn('[vision] object detector unavailable, cropping around the hand', e);
      status.detector = 'failed';
    }
  }
}

export async function startCamera(video) {
  if (video.srcObject) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('no camera access. the page needs https (or localhost).');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: 'user', width: { ideal: CONFIG.camera.width }, height: { ideal: CONFIG.camera.height } },
  });
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play().catch(() => {});
  if (video.readyState < 2) await new Promise((r) => video.addEventListener('loadeddata', r, { once: true }));
}

// -> null (not ready) | { present:false } | { present:true, box:{x0,y0,x1,y1}, cx, cy, landmarks }
// All coords normalized 0-1 in RAW camera space (not mirrored).
export function detectHands(video, now) {
  if (!hands || video.readyState < 2) return null;
  const ts = Math.max(Math.round(now), lastTs + 1);
  lastTs = ts;
  const res = hands.detectForVideo(video, ts);
  const lm = res.landmarks?.[0];
  if (!lm) return { present: false };
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const p of lm) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return { present: true, box: { x0, y0, x1, y1 }, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, landmarks: lm };
}

// Is someone staring at Binjamin? Face detection + head turn + eye direction.
// No identity, nothing stored: just geometry for this frame.
// -> null (not ready) | { present:false } | { present:true, staring, box, size, yaw, gazeSide, gazeUp, gazeDown, blink }
export function detectFace(video, now) {
  if (!face || video.readyState < 2) return null;
  const ts = Math.max(Math.round(now), lastFaceTs + 1);
  lastFaceTs = ts;
  const res = face.detectForVideo(video, ts);
  const lm = res.faceLandmarks?.[0];
  if (!lm) return { present: false };

  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const p of lm) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  // head turn: where the nose tip sits between the two cheek edges (0 = facing the camera)
  const cheekL = lm[234], cheekR = lm[454], nose = lm[1];
  const span = Math.abs(cheekR.x - cheekL.x) || 1e-6;
  const yaw = Math.abs((nose.x - (cheekL.x + cheekR.x) / 2) / span);

  // eye direction from ARKit-style blendshapes
  const bs = {};
  for (const c of res.faceBlendshapes?.[0]?.categories || []) bs[c.categoryName] = c.score;
  const avg = (a, b) => ((bs[a] || 0) + (bs[b] || 0)) / 2;
  const gazeSide = Math.max(avg('eyeLookOutLeft', 'eyeLookInRight'), avg('eyeLookInLeft', 'eyeLookOutRight'));
  const gazeUp = avg('eyeLookUpLeft', 'eyeLookUpRight');
  const gazeDown = avg('eyeLookDownLeft', 'eyeLookDownRight');
  const blink = avg('eyeBlinkLeft', 'eyeBlinkRight');

  const F = CONFIG.face;
  const size = x1 - x0;
  const staring = size >= F.minSize && yaw <= F.maxYaw && gazeSide <= F.maxGazeSide
    && gazeUp <= F.maxGazeUp && gazeDown <= F.maxGazeDown && blink <= F.maxBlink;

  return {
    present: true, staring, box: { x0, y0, x1, y1 }, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2,
    size, yaw, gazeSide, gazeUp, gazeDown, blink,
  };
}

// The hand is the waypoint: search a window around it for an object the fingers are touching.
// -> null | { box:{x0,y0,x1,y1} (raw camera 0-1), label, conf }
export function findHeldObject(video, hbox) {
  if (!detector || !hbox || video.readyState < 2) return null;
  const O = CONFIG.object;
  const vw = video.videoWidth, vh = video.videoHeight, short = Math.min(vw, vh);
  const hand = { x0: hbox.x0 * vw, y0: hbox.y0 * vh, x1: hbox.x1 * vw, y1: hbox.y1 * vh };
  const hw = hand.x1 - hand.x0, hh = hand.y1 - hand.y0;
  const size = clamp(Math.max(hw, hh) * O.searchScale, short * 0.4, short);
  const sx = clamp((hand.x0 + hand.x1) / 2 - size / 2, 0, vw - size);
  const sy = clamp((hand.y0 + hand.y1) / 2 - size / 2, 0, vh - size);
  searchCtx.drawImage(video, sx, sy, size, size, 0, 0, search.width, search.height);
  const k = size / search.width;

  // landmarks hug the skin; whatever's held pokes out a bit, so pad the hand box
  const p = 0.15;
  const H = { x0: hand.x0 - hw * p, y0: hand.y0 - hh * p, x1: hand.x1 + hw * p, y1: hand.y1 + hh * p };
  const hArea = (H.x1 - H.x0) * (H.y1 - H.y0);

  let best = null;
  lastDetections.length = 0;
  for (const d of detector.detect(search).detections || []) {
    const c = d.categories?.[0];
    const bb = d.boundingBox;
    if (!c || !bb) continue;
    const b = { x0: sx + bb.originX * k, y0: sy + bb.originY * k };
    b.x1 = b.x0 + bb.width * k; b.y1 = b.y0 + bb.height * k;
    const area = (b.x1 - b.x0) * (b.y1 - b.y0);
    // overlap with the hand, relative to the smaller of the two: 1 = one fully covers the other
    const ix = Math.max(0, Math.min(b.x1, H.x1) - Math.max(b.x0, H.x0));
    const iy = Math.max(0, Math.min(b.y1, H.y1) - Math.max(b.y0, H.y0));
    const touch = (ix * iy) / Math.min(area, hArea);
    const why = area > hArea * O.maxSizeVsHand ? 'too big' : area < hArea * O.minSizeVsHand ? 'too small'
      : touch < O.minTouch ? 'not touching hand' : '';
    const cand = { label: c.categoryName, conf: c.score, touch, why,
      box: { x0: b.x0 / vw, y0: b.y0 / vh, x1: b.x1 / vw, y1: b.y1 / vh } };
    lastDetections.push(cand);
    if (why) continue;
    cand.score = c.score * (0.5 + touch);
    if (!best || cand.score > best.score) best = cand;
  }
  return best;
}

// Draw a square crop of the thing being held into lastCrop (for the trash model).
// Object detector found it: crop the object. Otherwise: crop around the hand.
// n = sample number; crop sizes alternate so the votes see a tight and a loose view.
export function cropHeld(video, hbox, n = 0) {
  if (video.readyState < 2) return false;
  const vw = video.videoWidth, vh = video.videoHeight, short = Math.min(vw, vh);
  const O = CONFIG.object, now = performance.now();
  let cx = vw / 2, cy = vh / 2, size = short * 0.8;
  Object.assign(cropInfo, { source: 'hand', label: '', conf: 0, box: null, at: now });

  if (hbox) {
    const hcx = ((hbox.x0 + hbox.x1) / 2) * vw, hcy = ((hbox.y0 + hbox.y1) / 2) * vh;
    const hs = Math.max((hbox.x1 - hbox.x0) * vw, (hbox.y1 - hbox.y0) * vh);
    let obj = O.enabled ? findHeldObject(video, hbox) : null;
    let ob = null; // object box in pixels
    if (obj) {
      ob = { x0: obj.box.x0 * vw, y0: obj.box.y0 * vh, x1: obj.box.x1 * vw, y1: obj.box.y1 * vh };
      lastObj = { label: obj.label, conf: obj.conf, at: now,
        rel: { dx: ((ob.x0 + ob.x1) / 2 - hcx) / hs, dy: ((ob.y0 + ob.y1) / 2 - hcy) / hs,
          w: (ob.x1 - ob.x0) / hs, h: (ob.y1 - ob.y0) / hs } };
    } else if (lastObj && now - lastObj.at < O.holdMs) {
      // detector blinked: reuse the last box, carried along with the hand
      const r = lastObj.rel;
      const ocx = hcx + r.dx * hs, ocy = hcy + r.dy * hs;
      ob = { x0: ocx - (r.w * hs) / 2, y0: ocy - (r.h * hs) / 2, x1: ocx + (r.w * hs) / 2, y1: ocy + (r.h * hs) / 2 };
      obj = { label: lastObj.label, conf: lastObj.conf, remembered: true };
    }

    if (ob) {
      const pads = O.cropPads;
      cx = (ob.x0 + ob.x1) / 2; cy = (ob.y0 + ob.y1) / 2;
      size = clamp(Math.max(ob.x1 - ob.x0, ob.y1 - ob.y0) * pads[n % pads.length], short * 0.2, short);
      Object.assign(cropInfo, { source: obj.remembered ? 'object (remembered)' : 'object', label: obj.label, conf: obj.conf,
        box: { x0: ob.x0 / vw, y0: ob.y0 / vh, x1: ob.x1 / vw, y1: ob.y1 / vh } });
    } else {
      const scales = CONFIG.classify.cropScales;
      cx = hcx; cy = hcy;
      size = clamp(hs * scales[n % scales.length], short * 0.3, short);
    }
  }
  const sx = clamp(cx - size / 2, 0, vw - size);
  const sy = clamp(cy - size / 2, 0, vh - size);
  cropCtx.drawImage(video, sx, sy, size, size, 0, 0, crop.width, crop.height);
  return true;
}

// new exam = forget the last exam's object
export function forgetObject() { lastObj = null; }
