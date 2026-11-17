// Everything Binjamin says. Add lines freely: more variety = less habituation.
// {arrow} -> ← or → toward the right bin.  {item} -> what he thinks it is.

export const INSTRUCTIONS = 'show me some trash, one at a time 👀';

export const LINES = {
  loading: ['waking up...', 'one sec, finding my glasses', 'booting hamster brain...'],
  idle: [
    'anyone got trash for me...',
    'so bored. feed me trash',
    'i see everything 👀',
    'trash? anyone? pls',
    '*hamster noises*',
    'recycling is my passion',
    'hold ur trash up to me',
    'i was a hamster once. now i am this',
  ],
  noticed: ['ooh whatchu got', 'oh hi!! show me', 'is that trash?? for me??', 'hold it up hold it up', 'ooh ooh lemme see'],
  examining: ['hmmmm....', 'lemme see...', 'investigating...', 'hmm. hmm. hmmmm.', 'zooming in...'],
  recycle: ['RECYCLE!! {arrow}', 'recycle that {arrow}', 'RECYCLING {arrow} GO GO', 'that\'s recycling {arrow}'],
  landfill: ['LANDFILL {arrow}', 'landfill, sorry {arrow}', 'that one\'s landfill {arrow}', 'trash trash {arrow}'],
  confused: ['idk man... landfill to be safe {arrow}', 'no clue. landfill? {arrow}', 'my brain hurts. landfill {arrow}', 'when in doubt... landfill {arrow}'],
  happy: ['W', 'W W W', 'proud of u', 'ur a legend', 'the planet thanks u', 'yippee'],
  sad: ['bro.', 'bro...', 'why would u do that', 'i told u {arrow}', 'i\'m not mad. just disappointed', 'wrong bin :('],
  nottrash: ['bro that\'s not trash 💀', 'pls don\'t throw that away', 'keep that. that\'s yours', 'that is NOT trash'],
  lost: ['hey come back', 'wait where\'d it go', 'aw ok', 'hello??'],
  bye: ['ok bye', 'see u', 'k bye then'],
};

export const BIN_NAMES = { recycle: 'RECYCLE!!', landfill: 'LANDFILL' };
