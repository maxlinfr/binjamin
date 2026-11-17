// Classifier bench: run both models on dropped photos, show the final call + why.
import { CONFIG } from './config.js';
import { initVision, classifyCanvas } from './vision.js';
import { initClip, classifyClip, clipStatus } from './clip.js';
import { Ballot } from './bins.js';

const $ = (id) => document.getElementById(id);
const status = (t) => { $('status').textContent = t; };
// bench.html?model=imagenet compares against the original general-model-only setup
const forced = new URLSearchParams(location.search).get('model');
if (forced) CONFIG.classifier = forced;
const useClip = CONFIG.classifier !== 'imagenet';

// file name prefix -> expected bin (also understands TrashNet-style class names)
const EXPECT = {
  recycle: 'recycle', landfill: 'landfill', nottrash: 'nottrash',
  glass: 'recycle', metal: 'recycle', paper: 'recycle', plastic: 'recycle', cardboard: 'recycle',
  trash: 'landfill', food: 'landfill',
};
const results = [];

const canvas = document.createElement('canvas');
canvas.width = canvas.height = 256;
const ctx = canvas.getContext('2d', { willReadFrequently: true });

async function ready() {
  await initVision(status, { classifierOnly: true });
  if (useClip) await initClip(status);
  status(`ready. general model + ${useClip ? `trash model (${clipStatus.device}, ${CONFIG.clip.dtype})` : 'no trash model (classifier: imagenet)'}`);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function run(file) {
  const img = await loadImage(file);
  // same as the app: a square center crop
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 256, 256);

  const ballot = new Ballot();
  const imagenet = classifyCanvas(canvas);
  const clip = useClip ? await classifyClip(canvas) : null;
  ballot.add({ imagenet, clip });
  const d = ballot.decide(CONFIG);

  const verdict = d.bin === 'confused' ? 'landfill' : d.bin; // confused -> landfill, like the app
  const prefix = file.name.toLowerCase().split(/[_\-\s.]/)[0];
  const expected = EXPECT[prefix];
  const ok = expected ? verdict === expected : null;
  results.push({ ok, ms: clipStatus.ms });

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <img src="${img.src}" alt="">
    <div class="body">
      <div class="verdict ${d.bin}">${d.bin}${d.item ? ` · ${d.item}` : d.guess ? ` · ${d.guess}?` : ''}
        ${ok === null ? '' : ok ? '<span class="ok">✓</span>' : `<span class="bad">✗ (should be ${expected})</span>`}</div>
      <div class="src">decided by: ${d.source}${d.bin === 'confused' ? ' → goes to landfill' : ''}</div>
      ${clip ? `<div class="model"><b>trash model</b>${ballot.clipTop(3).map((c) => `${c.item} <span class="${c.bin}">(${c.bin})</span> ${c.p.toFixed(2)}`).join('<br>')}</div>` : ''}
      <div class="model"><b>general model</b>${ballot.topRaw(3).map(([k, v]) => `${k} ${v.toFixed(2)}`).join('<br>') || '-'}</div>
    </div>`;
  $('grid').prepend(card);
}

function summarize() {
  const scored = results.filter((r) => r.ok !== null);
  const right = scored.filter((r) => r.ok).length;
  $('summary').textContent = scored.length
    ? `accuracy: ${right}/${scored.length} = ${Math.round((100 * right) / scored.length)}%   (of ${results.length} photos; ${scored.length} had a bin in the file name)`
    : `${results.length} photos`;
}

async function handle(files) {
  const list = [...files].filter((f) => f.type.startsWith('image/'));
  for (let i = 0; i < list.length; i++) {
    status(`classifying ${i + 1}/${list.length}…`);
    try { await run(list[i]); } catch (e) { console.warn(list[i].name, e); }
    summarize();
  }
  status(`done. ${useClip ? `trash model: ~${clipStatus.ms.toFixed(0)} ms/photo` : ''}`);
}

const drop = $('drop');
$('file').addEventListener('change', (e) => handle(e.target.files));
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); handle(e.dataTransfer.files); });

ready().catch((e) => { console.error(e); status(`failed to load: ${e.message}`); });
