// ImageNet label -> bin lookup (v0 "classifier" = pretrained EfficientNet-Lite0 + this table).
// Keys are the exact label strings the MediaPipe EfficientNet-Lite0 model outputs.
// Rules follow Philadelphia / Penn single-stream norms: bottles, cans, cartons, paper -> recycle;
// food, coffee cups, napkins, bags, wrappers -> landfill. Edit to match your actual bins.

const R = 'recycle', L = 'landfill', N = 'nottrash';

export const LABEL_BINS = {
  // ---- recycle ----
  'water bottle': [R, 'plastic bottle'],
  'pop bottle': [R, 'soda bottle'],
  'beer bottle': [R, 'glass bottle'],
  'wine bottle': [R, 'glass bottle'],
  'whiskey jug': [R, 'bottle'],
  'water jug': [R, 'jug'],
  'pill bottle': [R, 'plastic bottle'],
  'lotion': [R, 'plastic bottle'],
  'sunscreen': [R, 'plastic bottle'],
  'soap dispenser': [R, 'plastic bottle'],
  'hair spray': [R, 'can'],
  'milk can': [R, 'can'],
  'can opener': [R, 'can'],          // soda cans often come out as this
  'beer glass': [R, 'plastic cup'],  // clear plastic cups
  'carton': [R, 'carton'],
  'envelope': [R, 'paper'],
  'menu': [R, 'paper'],
  'comic book': [R, 'paper'],
  'book jacket': [R, 'paper'],
  'crossword puzzle': [R, 'newspaper'],
  'binder': [R, 'paper'],

  // ---- landfill ----
  'packet': [L, 'wrapper'],
  'plastic bag': [L, 'plastic bag'],
  'paper towel': [L, 'paper towel'],
  'toilet tissue': [L, 'tissue'],
  'handkerchief': [L, 'napkin'],
  'cup': [L, 'coffee cup'],
  'coffee mug': [L, 'coffee cup'],
  'espresso': [L, 'coffee cup'],
  'eggnog': [L, 'drink cup'],
  'plate': [L, 'plate'],
  'tray': [L, 'food tray'],
  'soup bowl': [L, 'bowl'],
  'mixing bowl': [L, 'bowl'],
  'wooden spoon': [L, 'utensil'],
  'spatula': [L, 'utensil'],
  'ladle': [L, 'utensil'],
  'ballpoint': [L, 'pen'],
  'fountain pen': [L, 'pen'],
  'matchstick': [L, 'match'],
  'Band Aid': [L, 'band-aid'],
  'diaper': [L, 'diaper'],
  'mask': [L, 'mask'],
  'lipstick': [L, 'lipstick'],
  // food
  'pizza': [L, 'pizza'], 'hotdog': [L, 'hot dog'], 'cheeseburger': [L, 'burger'],
  'burrito': [L, 'burrito'], 'bagel': [L, 'bagel'], 'pretzel': [L, 'pretzel'],
  'French loaf': [L, 'bread'], 'banana': [L, 'banana peel'], 'orange': [L, 'orange'],
  'lemon': [L, 'lemon'], 'Granny Smith': [L, 'apple'], 'strawberry': [L, 'food'],
  'pineapple': [L, 'food'], 'ice cream': [L, 'ice cream'], 'ice lolly': [L, 'popsicle'],
  'guacamole': [L, 'food'], 'carbonara': [L, 'food'], 'trifle': [L, 'food'],
  'dough': [L, 'food'], 'mashed potato': [L, 'food'], 'potpie': [L, 'food'],
  'meat loaf': [L, 'food'], 'chocolate sauce': [L, 'food'],

  // ---- not trash (Binjamin begs you not to throw it out) ----
  'cellular telephone': [N, 'phone'],
  'iPod': [N, 'phone'],
  'hand-held computer': [N, 'phone'],
  'remote control': [N, 'remote'],
  'wallet': [N, 'wallet'],
  'purse': [N, 'bag'],
  'sunglasses': [N, 'sunglasses'],
  'sunglass': [N, 'sunglasses'],
  'digital watch': [N, 'watch'],
  'stopwatch': [N, 'watch'],
  'notebook': [N, 'laptop'],
  'laptop': [N, 'laptop'],
  'mouse': [N, 'mouse'],
  'computer keyboard': [N, 'keyboard'],
};

export function lookup(name) {
  const v = LABEL_BINS[name];
  return v ? { bin: v[0], item: v[1] } : null;
}

// Collects classifier results across frames during the "examining" beat.
// Each frame can carry two opinions:
//   imagenet: [{categoryName, score}]  general model (+ the lookup table above)
//   clip:     [{id, bin, item, p}]     MobileCLIP trash list (js/trash-labels.js)
export class Ballot {
  constructor() {
    this.frames = 0;
    this.inetFrames = 0;
    this.clipFrames = 0;
    this.votes = { recycle: 0, landfill: 0, nottrash: 0 }; // general model
    this.items = {}; // "bin|item" -> score (general model)
    this.raw = {};   // every ImageNet label seen -> score (for debugging)
    this.clip = {};  // label id -> { bin, item, p } summed over frames
  }

  add(res) {
    if (Array.isArray(res)) res = { imagenet: res }; // old shape: just ImageNet categories
    this.frames++;
    if (res.imagenet) {
      this.inetFrames++;
      for (const c of res.imagenet) {
        const name = c.categoryName || c.displayName;
        this.raw[name] = (this.raw[name] || 0) + c.score;
        const hit = lookup(name);
        if (!hit) continue;
        this.votes[hit.bin] += c.score;
        const k = `${hit.bin}|${hit.item}`;
        this.items[k] = (this.items[k] || 0) + c.score;
      }
    }
    if (res.clip) {
      this.clipFrames++;
      for (const c of res.clip) {
        const slot = this.clip[c.id] || (this.clip[c.id] = { bin: c.bin, item: c.item, p: 0 });
        slot.p += c.p;
      }
    }
  }

  topRaw(n = 5) {
    return Object.entries(this.raw).sort((a, b) => b[1] - a[1]).slice(0, n)
      .map(([k, v]) => [k, v / Math.max(1, this.inetFrames)]);
  }

  // [{ item, bin, p }] averaged over frames, best first
  clipTop(n = 5) {
    const f = Math.max(1, this.clipFrames);
    return Object.values(this.clip).map((c) => ({ item: c.item, bin: c.bin, p: c.p / f }))
      .sort((a, b) => b.p - a.p).slice(0, n);
  }

  bestItem(bin) {
    let item = null, best = 0;
    for (const [k, v] of Object.entries(this.items)) {
      const [b, it] = k.split('|');
      if (b === bin && v > best) { best = v; item = it; }
    }
    return item;
  }

  // The general model's verdict (the original v0 logic).
  decideImagenet({ minEvidence, minShare }) {
    const total = this.votes.recycle + this.votes.landfill + this.votes.nottrash;
    const evidence = total / Math.max(1, this.inetFrames);
    const [bin, score] = Object.entries(this.votes).sort((a, b) => b[1] - a[1])[0];
    const share = total > 0 ? score / total : 0;
    const top = this.topRaw(1)[0];
    const confident = this.inetFrames > 0 && evidence >= minEvidence && share >= minShare;
    return {
      bin: confident ? bin : 'confused',
      item: confident ? this.bestItem(bin) : null,
      guess: top ? top[0] : null,
      evidence, share, frames: this.frames, votes: { ...this.votes },
    };
  }

  // The final call. Order:
  //   1. general model clearly sees a phone/wallet/... -> not trash (troll check always wins)
  //   2. MobileCLIP confident about a bin               -> use it
  //   3. otherwise                                     -> general model (lookup table)
  //   4. nobody sure                                   -> confused (-> landfill)
  // `source` says who decided (shown in the debug panel).
  decide(cfg) {
    const inet = this.decideImagenet(cfg.classify);
    const C = cfg.clip;

    const inetNotTrash = this.votes.nottrash / Math.max(1, this.inetFrames);
    if (inetNotTrash >= C.nottrashVeto) {
      return { ...inet, bin: 'nottrash', item: this.bestItem('nottrash'), source: 'imagenet (troll check)' };
    }

    if (this.clipFrames) {
      const bins = {};
      for (const c of this.clipTop(999)) bins[c.bin] = (bins[c.bin] || 0) + c.p;
      const [bin, p] = Object.entries(bins).sort((a, b) => b[1] - a[1])[0];
      if (bin !== 'nothing' && p >= C.minConfidence) {
        const item = this.clipTop(999).find((c) => c.bin === bin).item;
        return { ...inet, bin, item, evidence: p, share: p, source: 'clip' };
      }
    }

    if (inet.bin !== 'confused') return { ...inet, source: 'imagenet' };
    const clipGuess = this.clipTop(999).find((c) => c.bin !== 'nothing');
    return { ...inet, guess: clipGuess?.item || inet.guess, source: 'nobody sure' };
  }
}
