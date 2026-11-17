// Camera + MediaPipe (hand landmarker + EfficientNet-Lite0 image classifier).
// Everything runs in the browser, on the iPad. No server.

import { CONFIG, URLS, firstAvailable, clamp } from './config.js';

let hands = null;
let classifier = null;
let lastTs = -1;
export const status = { hands: false, classifier: false, delegate: '-' };

const crop = document.createElement('canvas');
crop.width = crop.height = 256;
const cropCtx = crop.getContext('2d', { willReadFrequently: true });
export const lastCrop = crop; // shown in the debug panel: "what Binjamin is looking at"

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
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  }, true);
  hands = h.task; status.hands = true; status.delegate = h.delegate;

  progress('learning what trash looks like...');
  const c = await create(tv.ImageClassifier, fileset, {
    baseOptions: { modelAssetPath: await firstAvailable(URLS.classifierModel) },
    runningMode: 'IMAGE',
    maxResults: 5,
    scoreThreshold: 0.02,
  }, false);
  classifier = c.task; status.classifier = true;
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

// Classify a square crop around the hand (= the thing being held), not the whole scene.
export function classifyAround(video, box, scale = 2.4) {
  if (!classifier || video.readyState < 2) return null;
  const vw = video.videoWidth, vh = video.videoHeight;
  let cx = vw / 2, cy = vh / 2, size = Math.min(vw, vh) * 0.8;
  if (box) {
    cx = ((box.x0 + box.x1) / 2) * vw;
    cy = ((box.y0 + box.y1) / 2) * vh;
    size = Math.max((box.x1 - box.x0) * vw, (box.y1 - box.y0) * vh) * scale;
  }
  size = clamp(size, Math.min(vw, vh) * 0.3, Math.min(vw, vh));
  const sx = clamp(cx - size / 2, 0, vw - size);
  const sy = clamp(cy - size / 2, 0, vh - size);
  cropCtx.drawImage(video, sx, sy, size, size, 0, 0, crop.width, crop.height);
  const res = classifier.classify(crop);
  return res.classifications?.[0]?.categories ?? [];
}
