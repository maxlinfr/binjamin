// ============================================================
//  BINJAMIN ART SLOTS — drop your hand-drawn PNGs in here.
// ============================================================
// Anything left empty / null uses the built-in placeholder hamster
// (drawn in code, wobbly lines). Missing files fall back too, so you
// can fill these in one at a time.
//
// Each state is a list of VARIANTS (one is picked at random each time,
// to fight habituation). Each variant is a list of FRAMES that loop
// as a cheap wobble (1-3 frames is plenty). A plain string = 1 frame.
//
// Example:
//   idle: [
//     ['art/idle/a-1.png', 'art/idle/a-2.png'],   // variant a, 2-frame wobble
//     ['art/idle/b-1.png', 'art/idle/b-2.png'],   // variant b
//     'art/idle/c.png',                           // variant c, still
//   ],
//
// Tips: transparent background, roughly square, ~800px is plenty.

const H = 'hamster images/';

export default {
  states: {
    loading: [H + 'sleepy hamster.gif'],       // sleepy / waking up
    idle: [H + 'plotting hamster.gif'],         // bored, eyes darting
    noticed: [H + 'staring hamster.jpg'],     // perks up, leans in
    examining: [H + 'examining hamster.gif'],  // squinting, magnifying glass, sweating
    recycle: [H + 'recycling hamster.jpg'],    // pointing HARD at the recycle side
    landfill: [H + 'landfill hamster.jpg'],    // pointing at the landfill side
    confused: [H + 'confused hamster.gif'],    // spiral eyes, question marks (also points at landfill)
    happy: [H + 'happy hamster.gif'],      // ecstatic, sparkles  ("W")  <- TODO: needs its own image
    sad: [H + 'sad hamster.jpg'],              // devastated, one tear ("bro.")
    nottrash: [H + 'serious hamster.jpg'],     // "bro that's your phone" (falls back to confused)
  },

  // Mirror the recycle / landfill / confused art so he faces the right bin?
  // Only makes sense if those drawings actually point somewhere.
  mirrorPointing: false,
  // If mirroring: draw your pointing poses pointing this way.
  pointingDrawnFacing: 'left',

  // Page look:
  //   'white'    = plain white page. White-background JPGs/memes blend right in.
  //   'notebook' = cream lined notebook paper. White-background images get their
  //                edges faded in a soft oval so there's no white box (see fadeEdges).
  background: 'white',
  // Only used with 'notebook'. Set false if your art has transparent backgrounds.
  fadeEdges: true,

  // Snap almost-white pixels to pure white, so slightly grey/cream image backgrounds
  // disappear into the page. Number = how "white" a pixel must be (0-1) to get snapped:
  //   0.92 = gentle, 0.85 = aggressive (may start eating light pinks). false = off.
  cleanWhites: 0.9,

  // States where Binjamin flips back and forth like he's looking around.
  lookAround: ['idle'],

  // Hand-drawn lettering. null = rendered in a scribbly font instead.
  title: null,          // e.g. 'art/title.png'          -> "binjamin"
  instructions: null,   // e.g. 'art/instructions.png'   -> "show me some trash, one at a time"
  arrow: null,          // e.g. 'art/arrow.png'          -> a big arrow drawn POINTING LEFT
  labels: {
    recycle: null,      // e.g. 'art/label-recycle.png'  -> "RECYCLE!!"
    landfill: null,     // e.g. 'art/label-landfill.png' -> "LANDFILL"
  },
};
