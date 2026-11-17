// Collects the trash model's opinions across frames during the "examining" beat, then makes the call.
// Each frame: [{ id, bin, item, p }] for every label in js/trash-labels.js (p sums to 1).

export class Ballot {
  constructor() {
    this.frames = 0;
    this.clip = {}; // label id -> { bin, item, p } summed over frames
  }

  add(res) {
    if (!res?.length) return;
    this.frames++;
    for (const c of res) {
      const slot = this.clip[c.id] || (this.clip[c.id] = { bin: c.bin, item: c.item, p: 0 });
      slot.p += c.p;
    }
  }

  // [{ item, bin, p }] averaged over frames, best first
  clipTop(n = 5) {
    const f = Math.max(1, this.frames);
    return Object.values(this.clip).map((c) => ({ item: c.item, bin: c.bin, p: c.p / f }))
      .sort((a, b) => b.p - a.p).slice(0, n);
  }

  // The final call: add up each bin's labels, the biggest bin wins if it's sure enough.
  //   recycle / landfill need clip.minConfidence
  //   nottrash needs only clip.nottrashMin (a wrong "that's yours, bro" is harmless;
  //            telling someone to toss their Hydro Flask is not)
  //   otherwise -> confused (-> landfill)
  decide(cfg) {
    const C = cfg.clip;
    const all = this.clipTop(999);
    const bins = {};
    for (const c of all) bins[c.bin] = (bins[c.bin] || 0) + c.p;
    const [bin, p] = Object.entries(bins).sort((a, b) => b[1] - a[1])[0] || ['nothing', 0];
    const need = bin === 'nottrash' ? C.nottrashMin : C.minConfidence;
    const guess = all.find((c) => c.bin !== 'nothing')?.item || null;
    if (bin !== 'nothing' && p >= need) {
      return { bin, item: all.find((c) => c.bin === bin).item, conf: p, frames: this.frames };
    }
    return { bin: 'confused', item: null, guess, conf: p, frames: this.frames };
  }
}
