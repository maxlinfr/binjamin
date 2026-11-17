// MobileCLIP trash classifier (zero-shot), running in the browser via Transformers.js.
//
// Only the IMAGE half of MobileCLIP runs here. The text half was run ahead of time by
// `npm run labels`, which turned js/trash-labels.js into models/trash-text-embeddings.json.
// So: crop -> image embedding -> compare against every trash description -> probabilities.

import { CONFIG, URLS, firstAvailable } from './config.js';

let T = null;
let processor = null;
let model = null;
let labels = [];
let flat = []; // one row per description: { li (label index), e (Float32Array) }

export const clipStatus = { ready: false, error: null, device: '-', ms: 0 };

export async function initClip(progress = () => {}) {
  const C = CONFIG.clip;
  progress('loading the trash brain...');
  T = await import(await firstAvailable(URLS.transformers));

  const data = await (await fetch(URLS.trashEmbeddings, { cache: 'no-cache' })).json();
  if (data.model !== C.model) console.warn(`[clip] embeddings were built for ${data.model}, config uses ${C.model}. Run: npm run labels`);
  labels = data.labels;
  flat = labels.flatMap((l, li) => l.phrases.map((ph) => ({ li, e: Float32Array.from(ph.embedding) })));

  processor = await T.AutoProcessor.from_pretrained(C.model);
  const devices = [...new Set([C.device, 'wasm'])];
  let err;
  for (const device of devices) {
    try {
      model = await T.CLIPVisionModelWithProjection.from_pretrained(C.model, { device, dtype: C.dtype });
      clipStatus.device = device;
      break;
    } catch (e) { err = e; console.warn(`[clip] ${device} failed`, e); }
  }
  if (!model) { clipStatus.error = err; throw err; }
  clipStatus.ready = true;
}

// canvas -> [{ id, bin, item, p }] for every label (p sums to 1)
export async function classifyClip(canvas) {
  if (!model) return null;
  const t0 = performance.now();
  const image = T.RawImage.fromCanvas(canvas);
  const { image_embeds } = await model(await processor(image));
  const v = image_embeds.normalize().data;

  const scale = CONFIG.clip.logitScale;
  const logits = new Float32Array(flat.length);
  let max = -Infinity;
  for (let k = 0; k < flat.length; k++) {
    const e = flat[k].e;
    let dot = 0;
    for (let i = 0; i < e.length; i++) dot += e[i] * v[i];
    logits[k] = scale * dot;
    if (logits[k] > max) max = logits[k];
  }
  let Z = 0;
  for (let k = 0; k < logits.length; k++) { logits[k] = Math.exp(logits[k] - max); Z += logits[k]; }
  // a label's probability = sum of its descriptions' probabilities
  const p = new Float32Array(labels.length);
  for (let k = 0; k < flat.length; k++) p[flat[k].li] += logits[k] / Z;

  const ms = performance.now() - t0;
  clipStatus.ms = clipStatus.ms ? clipStatus.ms * 0.8 + ms * 0.2 : ms;
  return labels.map((l, i) => ({ id: l.id, bin: l.bin, item: l.item, p: p[i] }));
}
