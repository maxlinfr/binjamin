// Binjamin's brain: a hand-written state machine. No learning, just vibes + timers.
//
//   idle ──stare/hand──▶ noticed ──hand held still──▶ examining ──vote ~1.3s──▶ recycle | landfill | confused | nottrash
//                                                                                   │
//                       happy ◀── item left on the correct side ──┤ (OpenCV + hand tracking)
//                       sad   ◀── item left on the wrong side   ──┘
//
// Low confidence is a feature: "confused" points at landfill.

import { CONFIG, settings, sideOfBin, clamp } from './config.js';
import { Ballot } from './bins.js';

export const STATES = ['idle', 'noticed', 'examining', 'recycle', 'landfill', 'confused', 'happy', 'sad', 'nottrash', 'loading'];

export class Brain {
  constructor(ui, classify) {
    this.ui = ui;
    this.classify = classify; // (sampleIndex) => categories | null
    this.auto = true;
    this.state = null;
    this.enteredAt = 0;
    this.info = {};
    this.handSince = 0;
    this.handLast = -1e9;
    this.hand = { present: false };
    this.handTrack = []; // {t, x, y} in user coords
    this.motionTrack = []; // {t, x, area}
    this.needClear = false;
    this.clearSince = 0;
    this.face = { present: false };
    this.stareSince = 0;
    this.lastStare = -1e9;
    this.faceNeedsReset = false; // after a reaction, the person must look away before a stare re-wakes him
    this.notStareSince = 0;
    this.nudged = false;
    this.ballot = new Ballot();
    this.lastDecision = null;
    this.lastExit = null;
  }

  go(state, info = {}, now = performance.now()) {
    this.state = state;
    this.enteredAt = now;
    this.info = info;
    if (state === 'noticed') this.nudged = false;
    if (state === 'happy' || state === 'sad' || state === 'nottrash' || info.line === 'bye') this.faceNeedsReset = true;
    this.ui.show(state, info);
  }

  // Is someone staring right now, and for how long? (blinks shorter than graceMs don't count)
  staring(now) {
    const on = now - this.lastStare <= CONFIG.face.graceMs;
    return { on, ms: on ? now - this.stareSince : 0 };
  }

  // Manual override (keyboard / dev buttons). Pauses the automatic brain.
  force(state) {
    this.auto = false;
    const demo = {
      recycle: { item: 'plastic bottle', targetBin: 'recycle', targetSide: sideOfBin('recycle') },
      landfill: { item: 'coffee cup', targetBin: 'landfill', targetSide: sideOfBin('landfill') },
      confused: { guess: 'mystery blob', targetBin: 'landfill', targetSide: sideOfBin('landfill') },
      happy: { targetBin: 'recycle', targetSide: sideOfBin('recycle') },
      sad: { targetBin: 'recycle', targetSide: sideOfBin('recycle') },
      nottrash: { item: 'phone' },
    }[state] || {};
    this.go(state, demo);
  }

  setAuto(on) {
    this.auto = on;
    if (on) this.go('idle');
  }

  // p = { hand: {present, x, y}, motion: {...} | null }, or null if no new camera frame.
  tick(now, p) {
    const T = CONFIG.timing;
    if (p) {
      this.hand = p.hand || { present: false };
      if (this.hand.present) {
        if (!this.handSince) this.handSince = now;
        this.handLast = now;
        this.handTrack.push({ t: now, x: this.hand.x, y: this.hand.y });
      } else {
        this.handSince = 0;
      }
      const m = p.motion;
      this.motion = m || this.motion;
      if (m?.blob) this.motionTrack.push({ t: now, x: m.blob.x, y: m.blob.y, area: m.blob.area });
      while (this.handTrack.length && now - this.handTrack[0].t > 2500) this.handTrack.shift();
      while (this.motionTrack.length && now - this.motionTrack[0].t > 2500) this.motionTrack.shift();
      if (p.face) {
        this.face = p.face;
        if (p.face.staring) {
          if (now - this.lastStare > CONFIG.face.graceMs) this.stareSince = now; // a new stare begins
          this.lastStare = now;
        }
      }
    }
    const hand = this.hand;
    const F = CONFIG.face;
    const stare = this.staring(now);

    if (this.faceNeedsReset) {
      if (stare.on) this.notStareSince = 0;
      else {
        if (!this.notStareSince) this.notStareSince = now;
        if (now - this.notStareSince > F.resetMs) this.faceNeedsReset = false;
      }
    }

    if (this.needClear) {
      if (hand.present) this.clearSince = 0;
      else {
        if (!this.clearSince) this.clearSince = now;
        if (now - this.clearSince > T.clearMs) this.needClear = false;
      }
    }

    if (!this.auto || !this.state) return;
    const held = hand.present ? now - this.handSince : 0;
    const age = now - this.enteredAt;

    switch (this.state) {
      case 'loading':
        break;

      case 'idle': {
        if (this.needClear) break;
        const busy = p?.motion && !p.motion.lightingJump && p.motion.total > CONFIG.motion.presence;
        if (held > T.noticeMs) this.go('noticed', {}, now);
        else if (F.enabled && !this.faceNeedsReset && stare.ms > F.stareMs) this.go('noticed', { line: 'stared', byFace: true }, now);
        else if (CONFIG.motion.noticeByMotion && busy && age > 1500) this.go('noticed', { byMotion: true }, now);
        else if (age > T.idleLineMs) this.go('idle', {}, now); // fidget: new line + drawing
        break;
      }

      case 'noticed': {
        if (held > T.settleMs) { this.startExam(now); break; }
        // still being looked at? then keep waiting for the trash
        const watching = stare.on || now - this.lastStare < F.lookAwayMs;
        if (watching && !hand.present && !this.nudged && age > 3500) {
          this.nudged = true;
          this.ui.sayLine('nudge');
        }
        const handGone = !hand.present && now - this.handLast > T.noticedTimeoutMs && age > T.noticedTimeoutMs;
        if (handGone && !watching) this.go('idle', {}, now);
        else if (handGone && age > 15000) { this.faceNeedsReset = true; this.go('idle', { line: 'bye' }, now); }
        break;
      }

      case 'examining': {
        if (!hand.present && now - this.handLast > T.lostHandMs) {
          this.go('idle', { line: 'lost' }, now);
          break;
        }
        if (hand.present && p && now - this.lastSample >= T.examineIntervalMs) {
          this.lastSample = now;
          const cats = this.classify(this.sampleN++);
          if (cats) this.ballot.add(cats);
        }
        const enough = this.ballot.frames >= CONFIG.classify.minFrames;
        if ((age >= T.examineMs && enough) || age >= T.examineMs * 3) this.decide(now);
        break;
      }

      case 'recycle': case 'landfill': case 'confused': {
        if (!CONFIG.compliance.enabled) {
          if (age > T.verdictMaxMs / 2) this.go('idle', { line: 'bye' }, now);
          break;
        }
        if (age > T.verdictMinMs && !hand.present && now - this.handLast > T.exitMs) {
          const exit = this.exitSide();
          this.lastExit = exit;
          if (exit) {
            const correct = exit.side === this.info.targetSide;
            this.needClear = true;
            this.go(correct ? 'happy' : 'sad', { ...this.info, wentSide: exit.side }, now);
          } else {
            this.go('idle', { line: 'bye' }, now);
          }
        } else if (age > T.verdictMaxMs) {
          this.needClear = true;
          this.go('idle', { line: 'bye' }, now);
        }
        break;
      }

      case 'happy': case 'sad': case 'nottrash':
        if (age > T.reactionMs) {
          this.needClear = true;
          this.go('idle', {}, now);
        }
        break;

      default: break;
    }
  }

  startExam(now) {
    this.ballot = new Ballot();
    this.lastSample = 0;
    this.sampleN = 0;
    this.go('examining', {}, now);
  }

  decide(now) {
    const d = this.ballot.decide(CONFIG.classify);
    this.lastDecision = d;
    if (d.bin === 'nottrash') { this.go('nottrash', d, now); return; }
    const state = d.bin === 'confused' ? 'confused' : d.bin;
    const targetBin = state === 'recycle' ? 'recycle' : 'landfill';
    this.go(state, { ...d, targetBin, targetSide: sideOfBin(targetBin) }, now);
  }

  // Where did the item go? Last hand position (+ a bit of its velocity),
  // blended with the OpenCV motion blob right after the hand vanished.
  exitSide() {
    const hl = this.handLast;
    const pts = this.handTrack.filter((p) => p.t > hl - 400 && p.t >= this.enteredAt - 1500);
    if (!pts.length) return null;
    const a = pts[0], b = pts[pts.length - 1];
    const vx = (b.x - a.x) / Math.max(1, b.t - a.t);
    let x = b.x + clamp(vx * 250, -0.25, 0.25);
    let source = 'hand';
    const mv = this.motionTrack.filter((m) => m.t >= hl - 100 && m.t <= hl + CONFIG.timing.exitMs + 50);
    if (mv.length) {
      const wsum = mv.reduce((s, m) => s + m.area, 0);
      const mx = mv.reduce((s, m) => s + m.x * m.area, 0) / wsum;
      const k = CONFIG.compliance.motionWeight;
      x = (1 - k) * x + k * mx;
      source = 'hand+motion';
    }
    return { side: x < settings.midline ? 'left' : 'right', x, source };
  }
}
