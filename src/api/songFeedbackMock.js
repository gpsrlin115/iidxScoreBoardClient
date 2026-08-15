import { COMMENT_PAGE_SIZE, VOTE_DOWN, VOTE_KEEP, VOTE_UP } from '../constants/feedback';

/**
 * In-memory stand-in for the chart feedback endpoints, used only when
 * `VITE_FEEDBACK_MOCK=1` in a dev build. It exists so the voting and comment
 * UI can be built and demoed before the Spring endpoints land; it is loaded
 * through a dynamic import that is unreachable in production bundles.
 *
 * State lives for the lifetime of the page — a reload resets everything back
 * to the deterministic seed.
 */
const LATENCY_MS = 250;

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// The mock cannot know the real placement, so every chart reports the same
// tier. Only its presence matters to the UI.
const MOCK_CURRENT_TIER = { category: '地力', tier: 'S+' };

// Derived from chartId so a reload shows the same numbers rather than
// reshuffling under the reviewer.
const seedCounts = (chartId) => {
  const n = Math.abs(Number(chartId)) || 1;
  return { [VOTE_UP]: (n * 7) % 13, [VOTE_KEEP]: (n * 3) % 17, [VOTE_DOWN]: (n * 11) % 7 };
};

const seedComments = (chartId) => {
  const hoursAgo = (hours) => new Date(Date.now() - hours * 3600_000).toISOString();
  return [
    {
      id: -1 - Number(chartId) * 2,
      userId: 901,
      username: 'MOCK_DJ_A',
      avatarUrl: null,
      body: '후살이 유독 심해서 한 단계 위가 맞다고 봅니다. 게이지 관리가 안 되면 그대로 터져요.',
      createdAt: hoursAgo(26),
      authorVote: VOTE_UP,
      authorVoteStale: false,
      deletable: false,
    },
    {
      id: -2 - Number(chartId) * 2,
      userId: 902,
      username: 'MOCK_DJ_B',
      avatarUrl: null,
      body: '저는 지금 자리가 적당하다고 느꼈습니다.\n난이도 편차가 큰 채보라 개인차 같아요.',
      createdAt: hoursAgo(3),
      authorVote: VOTE_KEEP,
      authorVoteStale: false,
      deletable: false,
    },
  ];
};

const store = new Map();

const entryFor = (chartId) => {
  const key = String(chartId);
  if (!store.has(key)) {
    store.set(key, {
      counts: seedCounts(chartId),
      myVote: null,
      comments: seedComments(chartId),
      nextCommentId: 1,
    });
  }
  return store.get(key);
};

// Counts returned to the client always include the caller's own vote, matching
// what the real aggregate query would produce.
const voteStateOf = (entry) => {
  const counts = { ...entry.counts };
  if (entry.myVote) counts[entry.myVote] += 1;

  return {
    counts,
    total: counts[VOTE_UP] + counts[VOTE_KEEP] + counts[VOTE_DOWN],
    myVote: entry.myVote,
    myVoteStale: false,
  };
};

const songFeedbackMock = {
  getFeedback: async (chartId) => {
    await sleep(LATENCY_MS);
    const entry = entryFor(chartId);
    return {
      chartId: Number(chartId),
      currentTier: MOCK_CURRENT_TIER,
      vote: voteStateOf(entry),
      commentCount: entry.comments.length,
    };
  },

  saveVote: async (chartId, value) => {
    await sleep(LATENCY_MS);
    const entry = entryFor(chartId);
    entry.myVote = value;
    return voteStateOf(entry);
  },

  clearVote: async (chartId) => {
    await sleep(LATENCY_MS);
    const entry = entryFor(chartId);
    entry.myVote = null;
    return voteStateOf(entry);
  },

  getComments: async (chartId, { page = 0, size = COMMENT_PAGE_SIZE } = {}) => {
    await sleep(LATENCY_MS);
    const { comments } = entryFor(chartId);
    const start = page * size;
    return {
      content: comments.slice(start, start + size),
      totalElements: comments.length,
      totalPages: Math.max(1, Math.ceil(comments.length / size)),
      number: page,
      size,
    };
  },

  createComment: async (chartId, body) => {
    await sleep(LATENCY_MS);
    const entry = entryFor(chartId);
    const comment = {
      id: entry.nextCommentId,
      userId: 1,
      username: 'me',
      avatarUrl: null,
      body,
      createdAt: new Date().toISOString(),
      authorVote: entry.myVote,
      authorVoteStale: false,
      deletable: true,
    };
    entry.nextCommentId += 1;
    entry.comments = [comment, ...entry.comments];
    return comment;
  },

  deleteComment: async (chartId, commentId) => {
    await sleep(LATENCY_MS);
    const entry = entryFor(chartId);
    entry.comments = entry.comments.filter((comment) => comment.id !== commentId);
  },
};

export default songFeedbackMock;
