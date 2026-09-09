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
    selected: 'border-accent bg-accent/15 text-accent ring-1 ring-accent/60',
    bar: 'bg-accent',
  },
  [VOTE_KEEP]: {
    selected: 'border-muted bg-muted/15 text-text2 ring-1 ring-muted/60',
    bar: 'bg-muted',
  },
  [VOTE_DOWN]: {
    selected: 'border-info bg-info/15 text-info ring-1 ring-info/60',
    bar: 'bg-info',
  },
};

export const VOTE_IDLE_STYLE = 'border-line text-muted hover:bg-ink/5 hover:text-text2';

export const EMPTY_VOTE_COUNTS = Object.freeze({ [VOTE_UP]: 0, [VOTE_KEEP]: 0, [VOTE_DOWN]: 0 });

export const COMMENT_MAX_LENGTH = 500;
export const COMMENT_PAGE_SIZE = 20;
export const COMMENT_RATE_LIMIT_FALLBACK_SECONDS = 15;
