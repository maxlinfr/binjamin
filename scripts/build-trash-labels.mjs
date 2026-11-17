// Turns js/trash-labels.js into models/trash-text-embeddings.json.
//
// MobileCLIP has two halves: a text model and an image model. The text half only
// needs to run once per label list, so we run it here on the laptop and ship the
// results (~100 KB). The iPad then only downloads the small image half (~12 MB).
//
// Run after editing js/trash-labels.js:   npm install   (once)   then   npm run labels

import { writeFileSync, mkdirSync } from 'node:fs';
import { AutoTokenizer, CLIPTextModelWithProjection } from '@huggingface/transformers';
import { labelEntries, TEMPLATES } from '../js/trash-labels.js';

const MODEL = 'Xenova/mobileclip_s0';
const OUT = new URL('../models/trash-text-embeddings.json', import.meta.url);

console.log(`loading ${MODEL} text model (first run downloads ~43 MB)...`);
const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
const textModel = await CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: 'fp32' });

const normalize = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };

// One embedding per DESCRIPTION (averaged over the photo templates). At runtime each
// description competes on its own and a label's score = the sum of its descriptions'
// scores. (Averaging all of a label's descriptions into one blurs varied labels like
// "paper" = flyer / envelope / magazine into a weak middle and loses.)
const entries = labelEntries();
const out = [];
for (const e of entries) {
  const phrases = [];
  for (const ph of e.phrases) {
    const prompts = TEMPLATES.map((t) => t.replace('{}', ph));
    const { text_embeds } = await textModel(tokenizer(prompts, { padding: 'max_length', truncation: true }));
    const rows = text_embeds.normalize().tolist();
    const mean = rows[0].map((_, i) => rows.reduce((s, r) => s + r[i], 0) / rows.length);
    phrases.push({ text: ph, embedding: normalize(mean).map((x) => +x.toFixed(5)) });
  }
  out.push({ id: e.id, bin: e.bin, item: e.item, phrases });
  console.log(`  ${e.bin.padEnd(9)} ${e.item.padEnd(20)} ${phrases.length} descriptions`);
}

mkdirSync(new URL('../models/', import.meta.url), { recursive: true });
writeFileSync(OUT, JSON.stringify({ model: MODEL, templates: TEMPLATES, built: new Date().toISOString(), labels: out }));
console.log(`\nwrote ${out.length} labels -> models/trash-text-embeddings.json`);
