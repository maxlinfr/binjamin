// OpenCV.js motion tracking.
// Frame differencing on a tiny downscaled frame gives us:
//   - "is anyone moving in front of me" (wakes Binjamin up)
//   - how much motion is on the user's LEFT vs RIGHT of the bin midline (setup wave test)
//   - the biggest moving blob (where the item went after a toss; hand tracking blurs out
//     exactly when people throw, so motion picks up the slack)

import { CONFIG, URLS, settings, toUserX, firstAvailable, clamp } from './config.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = resolve;
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

// NOTE: resolves to { cv }, never the bare module. The OpenCV/Emscripten module
// object has a `.then` method, so returning or awaiting it directly makes the
// promise machinery unwrap it forever and freezes the page.
export async function loadOpenCV(timeoutMs = 60000) {
  if (!window.cv?.Mat) await loadScript(await firstAvailable(URLS.opencv));
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    let c = window.cv;
    if (c instanceof Promise) { c = (await c.then((m) => ({ m }))).m; window.cv = c; }
    if (c?.Mat) return { cv: c };
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('OpenCV.js took too long to start');
}

export class MotionTracker {
  constructor(cv) {
    const { width: w, height: h } = CONFIG.motion;
    this.cv = cv; this.w = w; this.h = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.src = new cv.Mat(h, w, cv.CV_8UC4);
    this.gray = new cv.Mat();
    this.prev = new cv.Mat();
    this.mask = new cv.Mat();
    this.kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    this.blurSize = new cv.Size(5, 5);
    this.anchor = new cv.Point(-1, -1);
    this.hasPrev = false;
  }

  // -> null on the first frame, else { total, userLeft, userRight, blob: {x, y, area} | null }
  // x is in USER coords (mirrored), y in 0-1, areas are fractions of the frame.
  update(video) {
    const { cv, w, h } = this;
    this.ctx.drawImage(video, 0, 0, w, h);
    this.src.data.set(this.ctx.getImageData(0, 0, w, h).data);
    cv.cvtColor(this.src, this.gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(this.gray, this.gray, this.blurSize, 0);
    if (!this.hasPrev) { this.gray.copyTo(this.prev); this.hasPrev = true; return null; }

    cv.absdiff(this.gray, this.prev, this.mask);
    this.gray.copyTo(this.prev);
    cv.threshold(this.mask, this.mask, CONFIG.motion.threshold, 255, cv.THRESH_BINARY);
    cv.dilate(this.mask, this.mask, this.kernel, this.anchor, 2);

    // left/right split at the bin midline (converted back to raw camera space)
    const rawMid = settings.mirror ? 1 - settings.midline : settings.midline;
    const split = Math.round(clamp(rawMid, 0.05, 0.95) * w);
    const a = this.countIn(0, split), b = this.countIn(split, w - split);
    const area = w * h;
    const total = (a + b) / area;
    const rawLeft = a / area, rawRight = b / area;
    const out = {
      total,
      userLeft: settings.mirror ? rawRight : rawLeft,
      userRight: settings.mirror ? rawLeft : rawRight,
      blob: null,
    };
    if (total > CONFIG.motion.lightingJump) { out.lightingJump = true; return out; }

    // biggest moving blob
    const contours = new cv.MatVector();
    const hier = new cv.Mat();
    cv.findContours(this.mask, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    let best = null, bestArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const ar = cv.contourArea(cnt);
      if (ar > bestArea) {
        const m = cv.moments(cnt);
        if (m.m00 > 0) { bestArea = ar; best = { x: m.m10 / m.m00 / w, y: m.m01 / m.m00 / h }; }
      }
      cnt.delete();
    }
    contours.delete(); hier.delete();
    if (best && bestArea / area >= CONFIG.motion.blobMin) {
      out.blob = { x: toUserX(best.x), y: best.y, area: bestArea / area };
    }
    return out;
  }

  countIn(x, width) {
    if (width <= 0) return 0;
    const roi = this.mask.roi(new this.cv.Rect(x, 0, width, this.h));
    const n = this.cv.countNonZero(roi);
    roi.delete();
    return n;
  }
}
