// Debug overlay: what the camera sees, hand box, motion blob, midline, votes,
// plus tap buttons to force any state (the week-1 "step through by hand" panel).
// Toggle: press D, or triple-tap the top-left corner.

import { settings, saveSettings, toUserX } from './config.js';
import { STATES } from './brain.js';
import { lastCrop, status } from './vision.js';

const $ = (id) => document.getElementById(id);

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

  draw(now, p, extra) {
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
      ctx.strokeStyle = '#ff5c8a'; ctx.lineWidth = 3;
      ctx.strokeRect(Math.min(xa, xb) * w, raw.box.y0 * h, Math.abs(xb - xa) * w, (raw.box.y1 - raw.box.y0) * h);
    }
    // hand trail
    ctx.fillStyle = '#ff5c8a';
    for (const t of brain.handTrack) ctx.fillRect(t.x * w - 2, t.y * h - 2, 4, 4);
    // motion blob + trail
    ctx.fillStyle = '#3cff8f';
    for (const m of brain.motionTrack) ctx.fillRect(m.x * w - 2, m.y * h - 2, 4, 4);
    if (p?.motion?.blob) {
      ctx.strokeStyle = '#3cff8f'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.motion.blob.x * w, p.motion.blob.y * h, 6 + Math.sqrt(p.motion.blob.area) * 90, 0, 7); ctx.stroke();
    }
    // last exit estimate
    if (brain.lastExit) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(brain.lastExit.x * w, h - 20); ctx.lineTo(brain.lastExit.x * w, h); ctx.stroke();
    }
    // what the classifier saw
    ctx.drawImage(lastCrop, w - 72, 4, 68, 68);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(w - 72, 4, 68, 68);

    const d = brain.lastDecision;
    const top = brain.ballot.topRaw(4).map(([k, v]) => `  ${k} ${v.toFixed(2)}`).join('\n');
    this.text.textContent = [
      `state: ${brain.state}  ${brain.auto ? 'AUTO' : 'MANUAL (press A)'}`,
      `fps: ${this.fps}  hands: ${status.hands ? status.delegate : '…'}  clf: ${status.classifier ? 'ok' : '…'}  opencv: ${extra.motionReady ? 'ok' : extra.motionError ? 'failed' : '…'}`,
      `recycle: ${settings.recycleSide}  midline: ${settings.midline.toFixed(2)}`,
      `hand: ${p?.hand?.present ? `x=${p.hand.x.toFixed(2)}` : '-'}  motion: ${p?.motion ? p.motion.total.toFixed(3) : '-'}${brain.needClear ? '  (waiting for clear)' : ''}`,
      d ? `last: ${d.bin}${d.item ? ` (${d.item})` : ''} ev=${d.evidence.toFixed(2)} share=${d.share.toFixed(2)} n=${d.frames}` : 'last: -',
      `votes: R ${brain.ballot.votes.recycle.toFixed(2)}  L ${brain.ballot.votes.landfill.toFixed(2)}  N ${brain.ballot.votes.nottrash.toFixed(2)}`,
      brain.lastExit ? `exit: ${brain.lastExit.side} x=${brain.lastExit.x.toFixed(2)} via ${brain.lastExit.source}` : 'exit: -',
      'labels seen:', top || '  -',
    ].join('\n');
  }
}
