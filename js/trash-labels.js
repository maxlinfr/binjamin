// The trash-specific vocabulary for the MobileCLIP classifier.
//
// MobileCLIP can ONLY answer with something from this list, so no more "barbershop".
// Each entry: [bin, what Binjamin calls it, ...ways to describe it]. More descriptions
// = more robust. Bins: 'recycle' | 'landfill' | 'nottrash' | 'nothing'.
//
// !! After editing this file, rebuild the embeddings:   npm run labels
//    (writes models/trash-text-embeddings.json, which the iPad loads)
//
// Rules follow Philadelphia / Penn single-stream norms. Edit to match your actual bins.

export const TEMPLATES = [
  'a photo of {}',
  'a hand holding {}',
  'a close-up photo of {}',
];

export const TRASH_LABELS = [
  // ---------------- recycle ----------------
  ['recycle', 'plastic bottle', 'a plastic water bottle', 'an empty plastic bottle', 'a crushed plastic bottle'],
  ['recycle', 'soda bottle', 'a plastic soda bottle', 'a Gatorade bottle', 'a plastic juice bottle'],
  ['recycle', 'can', 'an aluminum soda can', 'a crushed soda can', 'an energy drink can', 'a seltzer can', 'a tin food can', 'a metal can'],
  ['recycle', 'glass bottle', 'a glass bottle', 'a glass beer bottle', 'a glass kombucha bottle'],
  ['recycle', 'carton', 'a milk carton', 'a juice carton', 'a small juice box'],
  ['recycle', 'plastic cup', 'a clear plastic cup', 'a plastic iced coffee cup', 'a plastic smoothie cup'],
  ['recycle', 'plastic container', 'a clear plastic clamshell food container', 'a plastic takeout container', 'a plastic salad container'],
  ['recycle', 'paper', 'a sheet of paper', 'a paper flyer', 'a folded piece of paper', 'a newspaper',
    'an envelope', 'a magazine', 'a crumpled piece of paper', 'a brown paper bag', 'a notebook page', 'junk mail'],
  ['recycle', 'cardboard', 'a piece of cardboard', 'a small cardboard box', 'a cardboard coffee sleeve'],

  // ---------------- landfill ----------------
  ['landfill', 'coffee cup', 'a paper coffee cup', 'a disposable hot coffee cup with a lid', 'a paper cup'],
  ['landfill', 'napkin', 'a used paper napkin', 'a crumpled paper towel', 'a tissue'],
  ['landfill', 'wrapper', 'a chip bag', 'a candy wrapper', 'a snack wrapper', 'a granola bar wrapper'],
  ['landfill', 'plastic bag', 'a plastic bag', 'a plastic grocery bag', 'a ziploc bag'],
  ['landfill', 'utensils', 'a plastic fork', 'a plastic spoon', 'plastic cutlery', 'a plastic straw', 'wooden chopsticks'],
  ['landfill', 'food', 'food scraps', 'a banana peel', 'an apple core', 'leftover food', 'a half eaten sandwich'],
  ['landfill', 'styrofoam', 'a styrofoam container', 'a foam cup', 'a styrofoam takeout box'],
  ['landfill', 'paper plate', 'a dirty paper plate', 'a greasy paper food tray', 'a paper bowl'],
  ['landfill', 'sauce packet', 'a ketchup packet', 'a soy sauce packet', 'a sugar packet'],
  ['landfill', 'receipt', 'a paper receipt', 'a crumpled receipt'],

  // ---------------- not trash (the troll check) ----------------
  ['nottrash', 'phone', 'a smartphone', 'an iPhone', 'a phone in a case'],
  ['nottrash', 'wallet', 'a wallet', 'a credit card', 'a student ID card'],
  ['nottrash', 'keys', 'a set of keys', 'car keys on a keychain'],
  ['nottrash', 'earbuds', 'an AirPods case', 'wireless earbuds'],
  ['nottrash', 'glasses', 'eyeglasses', 'sunglasses'],
  ['nottrash', 'laptop', 'a laptop', 'a tablet'],
  ['nottrash', 'reusable bottle', 'a reusable metal water bottle', 'a Hydro Flask', 'a Stanley tumbler'],
  ['nottrash', 'watch', 'a wristwatch', 'an Apple Watch'],

  // ---------------- nothing (empty hand -> confused) ----------------
  ['nothing', 'nothing', 'an empty hand', 'an open palm', 'a hand with nothing in it', 'a person\'s face', 'a blurry photo of a room'],
];

// [{ id, bin, item, phrases: [...] }]
export function labelEntries() {
  return TRASH_LABELS.map(([bin, item, ...phrases], id) => ({ id, bin, item, phrases }));
}
