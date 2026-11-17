// Startup setup: start the camera, set the bin split line, then figure out
// which side recycling is on by having someone wave at the recycling bin
// (OpenCV motion left-vs-right + hand position). Saved to localStorage.

import { settings, saveSettings, otherSide } from './config.js';
import { pickArt } from './art.js';
import { UI } from './ui.js';

const $ = (id) => document.getElementById(id);
const WAVE_MS = 3000;

export class Setup {
  constructor({ video, startCamera, onDone, motionReady }) {
    this.video = video;
    this.startCamera = startCamera;
    this.onDone = onDone;
    this.motionReady = motionReady; // () => bool
    this.el = $('setup');
    this.canvas = $('setup-preview');
    this.ctx = this.canvas.getContext('2d');
    this.active = false;
    this.lastHand = null;

    // drag the midline
    const setMid = (e) => {
      if (this.step !== 'midline') return;
      const r = this.canvas.getBoundingClientRect();
      settings.midline = Math.min(0.9, Math.max(0.1, (e.clientX - r.left) / r.width));
    };
    this.canvas.addEventListener('pointerdown', (e) => { this.dragging = true; this.canvas.setPointerCapture(e.pointerId); setMid(e); });
    this.canvas.addEventListener('pointermove', (e) => { if (this.dragging) setMid(e); });
    this.canvas.addEventListener('pointerup', () => { this.dragging = false; });
  }

  open() {
    this.active = true;
    this.el.hidden = false;
    this.go('welcome');
  }

  close() {
    this.active = false;
    this.el.hidden = true;
    settings.setupDone = true;
    saveSettings();
    this.onDone();
  }

  ui(art, title, text, buttons, { preview = false, meter = false } = {}) {
    $('setup-hamster').src = pickArt(art, settings.recycleSide).frames[0];
    $('setup-title').textContent = title;
    $('setup-text').textContent = text;
    $('setup-preview-wrap').hidden = !preview;
    $('wave-meter').hidden = !meter;
    const box = $('setup-buttons');
    box.innerHTML = '';
    for (const [label, fn, cls] of buttons) {
      const b = document.createElement('button');
      b.className = `scribble-btn ${cls || ''}`;
      b.textContent = label;
      b.addEventListener('click', fn);
      box.appendChild(b);
    }
  }

  go(step) {
    this.step = step;
    clearInterval(this.countdown);
    switch (step) {
      case 'welcome':
        this.ui('noticed', "hi. i'm binjamin.", 'i live between the recycling + landfill bins. help me get set up real quick?', [
          ["let's go", () => this.begin(), 'big'],
        ]);
        break;
      case 'camera-failed':
        this.ui('sad', 'i can\'t see :(', `${this.error || 'camera blocked.'} allow camera for this site, then try again. (needs https or localhost)`, [
          ['try again', () => this.begin(), 'big'],
          ['demo without camera', () => this.close()],
        ]);
        break;
      case 'midline':
        this.ui('examining', 'where do the bins split?', 'drag the dashed line to the gap between the two bins. the middle is usually fine.', [
          ['looks good', () => this.go('wave'), 'big'],
          ['reset to middle', () => { settings.midline = 0.5; }],
        ], { preview: true });
        break;
      case 'wave':
        this.ui('noticed', 'wave at the RECYCLING bin', `stand in front of me and wave your hand over the recycling side for 3 seconds.${this.motionReady() ? '' : ' (motion tracker still loading, i\'ll use your hand)'}`, [
          ['ready, go!', () => this.startWave(), 'big'],
          ['recycling is on my LEFT', () => this.choose('left')],
          ['recycling is on my RIGHT', () => this.choose('right')],
        ], { preview: true, meter: true });
        break;
      case 'confirm':
        this.ui('happy', `so recycling is on your ${settings.recycleSide.toUpperCase()}?`, UI.layoutPreview(), [
          ['yep!', () => this.close(), 'big'],
          ['no, flip it', () => { settings.recycleSide = otherSide(settings.recycleSide); this.go('confirm'); }],
          ['redo the wave', () => this.go('wave')],
        ], { preview: true });
        break;
      default: break;
    }
  }

  async begin() {
    // tapping is a user gesture: good moment for fullscreen + camera
    const de = document.documentElement;
    try { await (de.requestFullscreen?.() || de.webkitRequestFullscreen?.()); } catch { /* ok */ }
    try {
      await this.startCamera();
      this.go('midline');
    } catch (e) {
      this.error = e.message;
      this.go('camera-failed');
    }
  }

  choose(side) {
    settings.recycleSide = side;
    this.go('confirm');
  }

  startWave() {
    let n = 3;
    $('setup-title').textContent = `wave at RECYCLING in ${n}...`;
    $('setup-buttons').innerHTML = '';
    this.countdown = setInterval(() => {
      n--;
      if (n > 0) { $('setup-title').textContent = `wave at RECYCLING in ${n}...`; return; }
      clearInterval(this.countdown);
      $('setup-title').textContent = 'WAVE WAVE WAVE';
      this.acc = { mL: 0, mR: 0, hL: 0, hR: 0, until: performance.now() + WAVE_MS };
      this.step = 'waving';
    }, 800);
  }

  finishWave() {
    const { mL, mR, hL, hR } = this.acc;
    const parts = [];
    if (mL + mR > 0.05) parts.push(mL / (mL + mR));
    if (hL + hR >= 5) parts.push(hL / (hL + hR));
    if (!parts.length) {
      this.go('wave');
      $('setup-title').textContent = "i didn't see any waving. again?";
      return;
    }
    const leftShare = parts.reduce((a, b) => a + b, 0) / parts.length;
    settings.recycleSide = leftShare >= 0.5 ? 'left' : 'right';
    this.go('confirm');
  }

  // called every camera frame while setup is open
  onFrame(now, p) {
    if (!this.active) return;
    if (p.hand?.present) this.lastHand = p.hand;

    if (this.step === 'waving') {
      const m = p.motion;
      if (m && !m.lightingJump) { this.acc.mL += m.userLeft; this.acc.mR += m.userRight; }
      if (p.hand?.present) this.acc[p.hand.x < settings.midline ? 'hL' : 'hR']++;
      const { mL, mR, hL, hR } = this.acc;
      const tot = mL + mR + (hL + hR) * 0.01;
      const left = tot ? (mL + hL * 0.01) / tot : 0.5;
      $('wave-meter').style.setProperty('--left', left.toFixed(2));
      if (now > this.acc.until) this.finishWave();
    }
    if (this.step === 'wave' && p.motion) {
      const t = p.motion.userLeft + p.motion.userRight;
      if (t > 0.002) $('wave-meter').style.setProperty('--left', (p.motion.userLeft / t).toFixed(2));
    }
    this.drawPreview(p);
  }

  drawPreview(p) {
    if ($('setup-preview-wrap').hidden || this.video.readyState < 2) return;
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    ctx.save();
    if (settings.mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(this.video, 0, 0, w, h);
    ctx.restore();

    // tint the two halves
    const mx = settings.midline * w;
    const rSide = settings.recycleSide;
    const showSides = this.step === 'confirm';
    if (showSides) {
      ctx.fillStyle = 'rgba(43,108,223,0.22)';
      if (rSide === 'left') ctx.fillRect(0, 0, mx, h); else ctx.fillRect(mx, 0, w - mx, h);
      ctx.fillStyle = 'rgba(60,60,60,0.22)';
      if (rSide === 'left') ctx.fillRect(mx, 0, w - mx, h); else ctx.fillRect(0, 0, mx, h);
      ctx.font = 'bold 34px "Permanent Marker", "Chalkboard SE", cursive';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText('RECYCLE', rSide === 'left' ? mx / 2 : (mx + w) / 2, 50);
      ctx.fillText('LANDFILL', rSide === 'left' ? (mx + w) / 2 : mx / 2, 50);
    }

    // midline
    ctx.setLineDash([18, 14]);
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#ffd23f';
    ctx.beginPath(); ctx.moveTo(mx, 0); ctx.lineTo(mx, h); ctx.stroke();
    ctx.setLineDash([]);

    // hand dot
    if (p.hand?.present) {
      ctx.fillStyle = '#ff5c8a';
      ctx.beginPath(); ctx.arc(p.hand.x * w, p.hand.y * h, 16, 0, Math.PI * 2); ctx.fill();
    }
    // motion blob
    if (p.motion?.blob) {
      ctx.strokeStyle = '#3cff8f'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(p.motion.blob.x * w, p.motion.blob.y * h, 10 + Math.sqrt(p.motion.blob.area) * 200, 0, Math.PI * 2); ctx.stroke();
    }
  }
}
