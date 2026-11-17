// Debug overlay: what the camera sees, face/hand/object boxes, midline, trash model votes,
// plus tap buttons to force any state (the week-1 "step through by hand" panel).
// Toggle: press D, or triple-tap the top-left corner.

import { CONFIG, settings, saveSettings, toUserX } from './config.js';
import { STATES } from './brain.js';
import { lastCrop, status, cropInfo } from './vision.js';
import { clipStatus } from './clip.js';

const $ = (id) => document.getElementById(id);

// "hand: HELD 0.8s  size .21 still .02 zone ok"  ('!' marks the check that's failing)
function handLine(brain) {
  const q = brain.handQ;
  if (!q || q.size === undefined) return 'hand: -';
  const H = CONFIG.hand;
  return `hand: ${q.ok ? `HELD ${(brain.heldMs / 1000).toFixed(1)}s` : 'ignored'}`
    + `  size ${q.size.toFixed(2)}${q.big ? '' : `! (<${q.minSize.toFixed(2)})`}`
    + `  moved ${q.range.toFixed(2)}${q.still ? '' : `! (>${H.stillRange})`}`
    + `  zone ${q.inZone ? 'ok' : 'edge!'}${q.relax ? '  (stare bonus)' : ''}`;
}

// "face: STARING 1.2s  size .21  yaw .05  eyes side .12 up .03 down .40  blink .02"
// Each number is checked against CONFIG.face limits; '!' marks the one breaking the stare.
function faceLine(brain) {
  const f = brain.face;
  if (!f?.present) return `face: -${brain.faceNeedsReset ? '  (needs look-away)' : ''}`;
  const F = CONFIG.face;
  const chk = (v, ok) => `${v.toFixed(2)}${ok ? '' : '!'}`;
  const s = brain.staring(performance.now());
  return `face: ${f.staring ? `STARING ${(s.ms / 1000).toFixed(1)}s` : 'looking away'}`
    + `  size ${chk(f.size, f.size >= F.minSize)} yaw ${chk(f.yaw, f.yaw <= F.maxYaw)}`
    + `\n      eyes side ${chk(f.gazeSide, f.gazeSide <= F.maxGazeSide)} up ${chk(f.gazeUp, f.gazeUp <= F.maxGazeUp)}`
    + ` down ${chk(f.gazeDown, f.gazeDown <= F.maxGazeDown)} blink ${chk(f.blink, f.blink <= F.maxBlink)}`
    + `${brain.faceNeedsReset ? '  (needs look-away)' : ''}`;
}

export class Debug {
  constructor({ video, brain, onCommand }) {
    this.video = video;
    this.brain = brain;
    this.el = $('debug');
    this.canvas = $('debug-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.text = $('debug-text');
    this.lastDraw = 0;
    this.fps = 0;
    this.frames = 0;
    this.fpsT = performance.now();

    const box = $('dev-buttons');
    const cmds = [...STATES.map((s, i) => [`${(i + 1) % 10} ${s}`, () => brain.force(s)]),
      ['A auto', () => onCommand('auto')], ['S setup', () => onCommand('setup')],
      ['F flip sides', () => onCommand('flip')], ['reset all', () => onCommand('reset')]];
    for (const [label, fn] of cmds) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      box.appendChild(b);
    }
    this.setVisible(settings.debug);
  }

  setVisible(v) { this.visible = v; this.el.hidden = !v; }
  toggle() { settings.debug = !this.visible; saveSettings(); this.setVisible(settings.debug); }

  countFrame(now) {
    this.frames++;
    if (now - this.fpsT > 1000) { this.fps = this.frames; this.frames = 0; this.fpsT = now; }
  }

  draw(now, p) {
    if (!this.visible || now - this.lastDraw < 66) return;
    this.lastDraw = now;
    const { ctx, canvas, brain } = this;
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#222'; ctx.fillRect(0, 0, w, h);
    if (this.video.readyState >= 2) {
      ctx.save();
      if (settings.mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
      ctx.drawImage(this.video, 0, 0, w, h);
      ctx.restore();
    }
    // midline + recycle side
    const mx = settings.midline * w;
    ctx.fillStyle = 'rgba(43,108,223,0.18)';
    if (settings.recycleSide === 'left') ctx.fillRect(0, 0, mx, h); else ctx.fillRect(mx, 0, w - mx, h);
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(mx, 0); ctx.lineTo(mx, h); ctx.stroke(); ctx.setLineDash([]);

    // hand box
    const raw = p?.hand?.raw;
    if (raw?.box) {
      const xa = toUserX(raw.box.x0), xb = toUserX(raw.box.x1);
      // green = counts as "showing me something", pink = ignored (passerby / moving / too far)
      ctx.strokeStyle = brain.handQ?.ok ? '#3cff8f' : '#ff5c8a'; ctx.lineWidth = 3;
      ctx.strokeRect(Math.min(xa, xb) * w, raw.box.y0 * h, Math.abs(xb - xa) * w, (raw.box.y1 - raw.box.y0) * h);
    }
    // face box: cyan = staring, grey = face but not staring
    const f = brain.face;
    if (f?.present && f.box) {
      const xa = toUserX(f.box.x0), xb = toUserX(f.box.x1);
      ctx.strokeStyle = f.staring ? '#39e6ff' : '#999'; ctx.lineWidth = f.staring ? 4 : 2;
      ctx.strokeRect(Math.min(xa, xb) * w, f.box.y0 * h, Math.abs(xb - xa) * w, (f.box.y1 - f.box.y0) * h);
      if (f.staring) { ctx.fillStyle = '#39e6ff'; ctx.font = 'bold 13px monospace'; ctx.fillText('STARING', Math.min(xa, xb) * w + 4, f.box.y0 * h - 4); }
    }
    // the object found in the hand (orange) = what got cropped. Shown for 1.5s after the last sample.
    if (cropInfo.box && performance.now() - cropInfo.at < 1500) {
      const b = cropInfo.box, xa = toUserX(b.x0), xb = toUserX(b.x1);
      ctx.strokeStyle = '#ff9f1c'; ctx.lineWidth = 3;
      if (cropInfo.source !== 'object') ctx.setLineDash([5, 4]);
      ctx.strokeRect(Math.min(xa, xb) * w, b.y0 * h, Math.abs(xb - xa) * w, (b.y1 - b.y0) * h);
      ctx.setLineDash([]);
      ctx.fillStyle = '#ff9f1c'; ctx.font = 'bold 12px monospace';
      ctx.fillText(cropInfo.label, Math.min(xa, xb) * w + 3, b.y1 * h - 4);
    }
    // hand trail
    ctx.fillStyle = '#ff5c8a';
    for (const t of brain.handTrack) ctx.fillRect(t.x * w - 2, t.y * h - 2, 4, 4);
    // last exit estimate
    if (brain.lastExit) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(brain.lastExit.x * w, h - 20); ctx.lineTo(brain.lastExit.x * w, h); ctx.stroke();
    }
    // what the trash model saw
    ctx.drawImage(lastCrop, w - 72, 4, 68, 68);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(w - 72, 4, 68, 68);

    const d = brain.lastDecision;
    const ok = (v) => (v === true ? 'ok' : v || '…');
    this.text.textContent = [
      `state: ${brain.state}  ${brain.auto ? 'AUTO' : 'MANUAL (press A)'}${brain.needClear ? '  (waiting for hand to leave)' : ''}`,
      `fps: ${this.fps}  hands: ${status.hands ? status.delegate : '…'}  face: ${ok(status.face)}  objects: ${CONFIG.object.enabled ? ok(status.detector) : 'off'}`
        + `  trash model: ${clipStatus.ready ? `ok (${clipStatus.device}, ${clipStatus.ms.toFixed(0)}ms/frame)` : clipStatus.error ? 'FAILED' : 'loading…'}`,
      faceLine(brain),
      `recycle: ${settings.recycleSide}  midline: ${settings.midline.toFixed(2)}`,
      handLine(brain),
      `crop: ${cropInfo.source === 'hand' ? 'around the hand (no object found)' : `on ${cropInfo.label} ${cropInfo.conf.toFixed(2)}${cropInfo.source === 'object' ? '' : ' (remembered)'}`}`,
      d ? `last: ${d.bin}${d.item ? ` (${d.item})` : d.guess ? ` (${d.guess}?)` : ''}  conf ${d.conf.toFixed(2)}  frames ${d.frames}` : 'last: -',
      `trash model saw: ${brain.ballot.clipTop(4).map((c) => `${c.item} ${c.p.toFixed(2)}`).join(' | ') || '-'}`,
      brain.lastExit ? `exit: ${brain.lastExit.side} x=${brain.lastExit.x.toFixed(2)}` : 'exit: -',
    ].join('\n');
  }
}
