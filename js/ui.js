// Rendering: hamster frames, scribbled speech, arrows, title, instructions.

import { CONFIG, settings, sideOfBin, arrowFor } from './config.js';
import { LINES, INSTRUCTIONS, BIN_NAMES } from './copy.js';
import { pickArt, arrowSVG, userArt, pageBackground, whiteCurve } from './art.js';

const $ = (id) => document.getElementById(id);
const lastLine = {};

function pickLine(key) {
  const list = LINES[key] || LINES.idle;
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === lastLine[key]) i = (i + 1) % list.length;
  lastLine[key] = i;
  return list[i];
}

export class UI {
  init() {
    document.body.dataset.bg = pageBackground; // 'white' | 'notebook' (set in art/manifest.js)
    this.stage = $('stage');
    this.hamster = $('hamster');
    this.speech = $('speech');
    this.speechText = $('speech-text');
    this.sub = $('subline');
    this.arrows = { left: $('arrow-left'), right: $('arrow-right') };

    if (userArt.title) $('title').innerHTML = `<img src="${userArt.title}" alt="binjamin">`;
    const ins = $('instructions');
    if (userArt.instructions) ins.innerHTML = `<img src="${userArt.instructions}" alt="${INSTRUCTIONS}">`;
    else ins.textContent = INSTRUCTIONS;

    for (const side of ['left', 'right']) {
      const el = this.arrows[side].querySelector('.arrow-art');
      el.innerHTML = userArt.arrow ? `<img src="${userArt.arrow}" alt="">` : arrowSVG(side === 'left' ? 7 : 11);
    }

    // "clean whites" curve from art/manifest.js
    const curve = whiteCurve();
    if (curve) document.querySelectorAll('.white-fn').forEach((fn) => fn.setAttribute('tableValues', curve));

    // "line boil": re-roll the wobble filters a few times a second so things look hand-animated
    const noises = document.querySelectorAll('.boil-noise');
    let seed = 0;
    setInterval(() => {
      seed = (seed + 1) % 3;
      noises.forEach((n) => n.setAttribute('seed', String(seed + 1)));
    }, 160);
  }

  show(state, info = {}) {
    const dir = info.targetSide || (state === 'recycle' ? sideOfBin('recycle') : sideOfBin('landfill'));
    this.stage.dataset.state = state;

    // drawing
    const art = pickArt(state, dir);
    this.playFrames(art.frames);
    this.hamster.classList.toggle('flip', art.flip);
    this.hamster.classList.toggle('blend', !!art.blend);
    // single still image? wobble it with the line-boil filter so it still feels hand-animated
    this.hamster.classList.toggle('boil', !!art.user && art.frames.length === 1);
    this.hamster.classList.toggle('clean', !!art.clean);

    // looking around: flip back and forth at random, human-ish intervals
    clearTimeout(this.lookTimer);
    this.hamster.classList.remove('look');
    if (art.lookAround) {
      const glance = () => {
        this.hamster.classList.toggle('look');
        this.lookTimer = setTimeout(glance, 1200 + Math.random() * 2000);
      };
      this.lookTimer = setTimeout(glance, 800 + Math.random() * 1200);
    }
    this.hamster.classList.remove('boing');
    void this.hamster.offsetWidth; // restart the squash-and-stretch animation
    this.hamster.classList.add('boing');

    // speech
    const line = pickLine(info.line || state)
      .replaceAll('{arrow}', arrowFor(dir))
      .replaceAll('{item}', info.item || 'that');
    this.say(line);

    // small line under him
    let sub = '';
    if ((state === 'recycle' || state === 'landfill') && info.item) sub = `(${info.item})`;
    else if (state === 'confused' && info.guess) sub = `(is that a... ${info.guess}??)`;
    else if (state === 'nottrash' && info.item) sub = `(that's ur ${info.item})`;
    else if (state === 'sad' && info.targetBin) sub = `(${info.targetBin === 'recycle' ? 'recycling' : 'landfill'} was ${arrowFor(info.targetSide)})`;
    else if (state === 'happy' && info.item) sub = `+1 ${info.item} saved`;
    this.sub.textContent = sub;

    // arrows
    this.hideArrows();
    if (state === 'recycle' || state === 'landfill' || state === 'confused') {
      this.showArrow(dir, info.targetBin || (state === 'recycle' ? 'recycle' : 'landfill'), state === 'confused');
    } else if (state === 'sad' && info.targetSide) {
      this.showArrow(info.targetSide, info.targetBin, true);
    }
  }

  playFrames(frames) {
    clearInterval(this.frameTimer);
    let i = 0;
    this.hamster.src = frames[0];
    if (frames.length > 1) {
      this.frameTimer = setInterval(() => { i = (i + 1) % frames.length; this.hamster.src = frames[i]; }, CONFIG.art.frameMs);
    }
  }

  sayLine(key) { this.say(pickLine(key)); }

  say(text) {
    this.speechText.textContent = text;
    this.speech.style.setProperty('--rot', `${(Math.random() * 6 - 3).toFixed(1)}deg`);
    this.speech.classList.remove('pop');
    void this.speech.offsetWidth;
    this.speech.classList.add('pop');
  }

  status(text) {
    if (this.stage.dataset.state === 'loading') this.sub.textContent = text;
  }

  hideArrows() {
    for (const el of Object.values(this.arrows)) el.classList.remove('show', 'faint', 'bin-recycle', 'bin-landfill');
  }

  showArrow(side, bin, faint = false) {
    const el = this.arrows[side];
    const label = el.querySelector('.label');
    const img = userArt.labels[bin];
    label.innerHTML = img ? `<img src="${img}" alt="${BIN_NAMES[bin]}">` : BIN_NAMES[bin];
    el.classList.add('show', `bin-${bin}`);
    if (faint) el.classList.add('faint');
  }

  // little preview for the setup screen
  static layoutPreview() {
    return settings.recycleSide === 'left' ? '← recycle  ·  landfill →' : '← landfill  ·  recycle →';
  }
}

export function toast(msg, ms = 4000) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), ms);
}
