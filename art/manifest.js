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

export default {
  states: {
    loading: [],   // sleepy / waking up
    idle: [],      // bored, eyes darting
    noticed: [],   // perks up, leans in
    examining: [], // squinting, magnifying glass, sweating
    recycle: [],   // pointing HARD at the recycle side
    landfill: [],  // pointing at the landfill side
    confused: [],  // spiral eyes, question marks (also points at landfill)
    happy: [],     // ecstatic, sparkles  ("W")
    sad: [],       // devastated, one tear ("bro.")
    nottrash: [],  // "bro that's your phone" (falls back to confused)
  },

  // Draw your recycle / landfill / confused pointing poses pointing this way.
  // Binjamin gets mirrored automatically when he needs to point the other way.
  pointingDrawnFacing: 'left',

  // Hand-drawn lettering. null = rendered in a scribbly font instead.
  title: null,          // e.g. 'art/title.png'          -> "binjamin"
  instructions: null,   // e.g. 'art/instructions.png'   -> "show me some trash, one at a time"
  arrow: null,          // e.g. 'art/arrow.png'          -> a big arrow drawn POINTING LEFT
  labels: {
    recycle: null,      // e.g. 'art/label-recycle.png'  -> "RECYCLE!!"
    landfill: null,     // e.g. 'art/label-landfill.png' -> "LANDFILL"
  },
};
