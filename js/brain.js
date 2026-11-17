// Binjamin's brain: a hand-written state machine. No learning, just vibes + timers.
//
//   idle ──stare/hand──▶ noticed ──hand held still──▶ examining ──vote ~1.3s──▶ recycle | landfill | confused | nottrash
//                                                                                   │
//                       happy ◀── item left on the correct side ──┤ (where the hand was last seen)
//                       sad   ◀── item left on the wrong side   ──┘
//
// Low confidence is a feature: "confused" points at landfill.

import { CONFIG, settings, sideOfBin, clamp } from './config.js';
import { Ballot } from './bins.js';

export const STATES = ['idle', 'noticed', 'examining', 'recycle', 'landfill', 'confused', 'happy', 'sad', 'nottrash', 'loading'];

export class Brain {
  constructor(ui, classify) {
    this.ui = ui;
    this.classify = classify; // (sampleIndex) => Promise<trash model result> | null
    this.auto = true;
    this.state = null;
    this.enteredAt = 0;
    this.info = {};
    this.handSince = 0;
    this.handLast = -1e9;
    this.hand = { present: false };
    this.handTrack = []; // {t, x, y} in user coords
    this.needClear = false;
    this.clearSince = 0;
    this.face = { present: false };
    this.stareSince = 0;
    this.lastStare = -1e9;
    this.faceNeedsReset = false; // after a reaction, the person must look away before a stare re-wakes him
    this.notStareSince = 0;
    this.nudged = false;
    this.presentedSince = 0;
    this.lastPresented = -1e9;
    this.heldMs = 0;
    this.handQ = { ok: false };
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

  // p = { hand: {present, x, y, size}, face: {...} | null }, or null if no new camera frame.
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
      while (this.handTrack.length && now - this.handTrack[0].t > 2500) this.handTrack.shift();
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

    // Is a hand being *presented* (close, still, in the middle), not just passing by?
    const H = CONFIG.hand;
    const q = this.handQuality(now);
    this.handQ = q;
    if (q.ok) {
      if (now - this.lastPresented > H.graceMs) this.presentedSince = now; // a new hold begins
      this.lastPresented = now;
    }
    const presented = now - this.lastPresented <= H.graceMs;
    this.heldMs = presented ? now - this.presentedSince : 0;

    if (!this.auto || !this.state) return;
    const held = this.heldMs;
    const holdMs = H.holdMs * (q.relax ? 0.6 : 1);
    const age = now - this.enteredAt;

    switch (this.state) {
      case 'loading':
        break;

      case 'idle': {
        if (this.needClear) break;
        if (held > H.noticeMs) this.go('noticed', {}, now);
        else if (F.enabled && !this.faceNeedsReset && stare.ms > F.stareMs) this.go('noticed', { line: 'stared', byFace: true }, now);
        else if (age > T.idleLineMs) this.go('idle', {}, now); // fidget: new line + drawing
        break;
      }

      case 'noticed': {
        if (held > holdMs) { this.startExam(now); break; }
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
        // only still frames vote: no motion blur, and a passing hand can't sneak in
        if (!this.sampling && hand.present && q.still && p && now - this.lastSample >= T.examineIntervalMs) {
          this.lastSample = now;
          const res = this.classify(this.sampleN++);
          if (res) {
            // one sample in flight at a time; drop results from an older exam
            const exam = this.examId;
            this.sampling = true;
            Promise.resolve(res).then((r) => { if (r && exam === this.examId) this.ballot.add(r); })
              .catch((e) => console.warn('[classify]', e))
              .finally(() => { if (exam === this.examId) this.sampling = false; });
          }
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

  // Close enough + still enough + not at the edges = someone is showing me something.
  handQuality(now) {
    const H = CONFIG.hand, h = this.hand;
    if (!h.present) return { ok: false };
    const relax = H.stareRelax && CONFIG.face.enabled && this.staring(now).on;
    const minSize = H.minSize * (relax ? 0.7 : 1);
    let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
    for (const t of this.handTrack) {
      if (now - t.t > H.stillWindowMs) continue;
      x0 = Math.min(x0, t.x); x1 = Math.max(x1, t.x); y0 = Math.min(y0, t.y); y1 = Math.max(y1, t.y);
    }
    const range = x1 >= x0 ? Math.max(x1 - x0, y1 - y0) : 0;
    const size = h.size || 0;
    const big = size >= minSize;
    const still = range <= H.stillRange;
    const inZone = h.x >= H.edgeMargin && h.x <= 1 - H.edgeMargin && h.y <= H.maxY;
    return { ok: big && still && inZone, size, minSize, range, big, still, inZone, relax };
  }

  startExam(now) {
    this.examId = (this.examId || 0) + 1;
    this.sampling = false;
    this.examStartedAt = now;
    this.ballot = new Ballot();
    this.lastSample = 0;
    this.sampleN = 0;
    this.go('examining', {}, now);
  }

  decide(now) {
    const d = this.ballot.decide(CONFIG);
    this.lastDecision = d;
    if (d.bin === 'nottrash') { this.go('nottrash', d, now); return; }
    const state = d.bin === 'confused' ? 'confused' : d.bin;
    const targetBin = state === 'recycle' ? 'recycle' : 'landfill';
    this.go(state, { ...d, targetBin, targetSide: sideOfBin(targetBin) }, now);
  }

  // Where did the item go? Last hand position, nudged by which way it was moving as it left the frame.
  exitSide() {
    const hl = this.handLast;
    const pts = this.handTrack.filter((p) => p.t > hl - 400 && p.t >= this.enteredAt - 1500);
    if (!pts.length) return null;
    const a = pts[0], b = pts[pts.length - 1];
    const vx = (b.x - a.x) / Math.max(1, b.t - a.t);
    const x = b.x + clamp(vx * 250, -0.25, 0.25);
    return { side: x < settings.midline ? 'left' : 'right', x };
  }
}
