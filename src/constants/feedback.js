export const VOTE_UP = 'UP';
export const VOTE_KEEP = 'KEEP';
export const VOTE_DOWN = 'DOWN';

// Display order: hardest-first, matching how a tier table reads top to bottom.
export const VOTE_ORDER = [VOTE_UP, VOTE_KEEP, VOTE_DOWN];

export const VOTE_LABELS = {
  [VOTE_UP]: '상향',
  [VOTE_KEEP]: '적정',
  [VOTE_DOWN]: '하향',
};

// "상향" means the chart belongs in a HIGHER tier, i.e. it plays harder than
// its current placement suggests.
export const VOTE_HINTS = {
  [VOTE_UP]: '지금 티어보다 어렵다',
  [VOTE_KEEP]: '지금 티어가 적정하다',
  [VOTE_DOWN]: '지금 티어보다 쉽다',
};

// Selected state is carried by background + ring + aria-pressed, never by
// colour alone.
export const VOTE_STYLES = {
  [VOTE_UP]: {
    selected: 'border-primary-500 bg-primary-500/15 text-primary-300 ring-1 ring-primary-500/60',
    bar: 'bg-primary-500',
  },
  [VOTE_KEEP]: {
    selected: 'border-slate-400 bg-slate-400/15 text-slate-100 ring-1 ring-slate-400/60',
    bar: 'bg-slate-400',
  },
  [VOTE_DOWN]: {
    selected: 'border-accent-500 bg-accent-500/15 text-accent-500 ring-1 ring-accent-500/60',
    bar: 'bg-accent-500',
  },
};

export const VOTE_IDLE_STYLE = 'border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200';

export const EMPTY_VOTE_COUNTS = Object.freeze({ [VOTE_UP]: 0, [VOTE_KEEP]: 0, [VOTE_DOWN]: 0 });

export const COMMENT_MAX_LENGTH = 500;
export const COMMENT_PAGE_SIZE = 20;
