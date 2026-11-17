// Startup setup: start the camera, set the bin split line, then tap which side
// recycling is on. Saved to localStorage.

import { settings, saveSettings, otherSide } from './config.js';
import { pickArt } from './art.js';
import { UI } from './ui.js';

const $ = (id) => document.getElementById(id);

export class Setup {
  constructor({ video, startCamera, onDone }) {
    this.video = video;
    this.startCamera = startCamera;
    this.onDone = onDone;
    this.el = $('setup');
    this.canvas = $('setup-preview');
    this.ctx = this.canvas.getContext('2d');
    this.active = false;

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

  ui(art, title, text, buttons, { preview = false } = {}) {
    const pic = pickArt(art, settings.recycleSide);
    $('setup-hamster').src = pic.frames[0];
    $('setup-hamster').classList.toggle('blend', !!pic.blend);
    $('setup-hamster').classList.toggle('clean', !!pic.clean);
    $('setup-title').textContent = title;
    $('setup-text').textContent = text;
    $('setup-preview-wrap').hidden = !preview;
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
          ['looks good', () => this.go('sides'), 'big'],
          ['reset to middle', () => { settings.midline = 0.5; }],
        ], { preview: true });
        break;
      case 'sides':
        this.ui('noticed', 'which side is RECYCLING?', 'stand where people will stand, facing me. is the recycling bin on your left or your right?', [
          ['recycling is on my LEFT', () => this.choose('left'), 'big'],
          ['recycling is on my RIGHT', () => this.choose('right'), 'big'],
        ], { preview: true });
        break;
      case 'confirm':
        this.ui('happy', `so recycling is on your ${settings.recycleSide.toUpperCase()}?`, UI.layoutPreview(), [
          ['yep!', () => this.close(), 'big'],
          ['no, flip it', () => { settings.recycleSide = otherSide(settings.recycleSide); this.go('confirm'); }],
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

  // called every camera frame while setup is open
  onFrame(now, p) {
    if (!this.active) return;
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
  }
}
