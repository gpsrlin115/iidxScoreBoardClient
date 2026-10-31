// The explicit development proxy must identify the mock before forwarding each API request.
export const SCORE_BROWSER_MOCK_ORIGIN = 'http://127.0.0.1:18086';
export const SCORE_BROWSER_MOCK_API_CONTEXT = '^/api(?:/|\\?|$)';
const IDENTITY = Object.freeze({ service: 'iidx-score-browser-mock', version: 1 });
const apiPath = new RegExp(SCORE_BROWSER_MOCK_API_CONTEXT);
const unavailable = Object.freeze({ code: 'SCORE_BROWSER_MOCK_UNAVAILABLE',
  message: '모의 서버를 확인할 수 없어 요청을 보내지 않았습니다. 로컬 모의 서버 실행 상태를 확인해 주세요.' });

async function verifyIdentity(target, timeoutMs) {
  // Never forward user cookies or cache an earlier successful identity check.
  const response = await fetch(new URL('/__mock/identity', target), {
    method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status !== 200 || response.headers.get('x-score-browser-mock') !== '1') {
    await response.body?.cancel(); throw new Error('MOCK_IDENTITY_MISMATCH');
  }
  const body = await response.json();
  if (!body || Array.isArray(body) || Object.keys(body).length !== 2
    || body.service !== IDENTITY.service || body.version !== IDENTITY.version) throw new Error('MOCK_IDENTITY_MISMATCH');
}
export function createScoreBrowserMockProxyGuard({ target = SCORE_BROWSER_MOCK_ORIGIN, timeoutMs = 2000 } = {}) {
  return {
    name: 'score-browser-mock-proxy-guard',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!apiPath.test(req.url ?? '')) return next();
        void verifyIdentity(target, timeoutMs).then(() => {
          if (!res.destroyed && !res.writableEnded) next();
        }).catch(() => {
          if (res.destroyed || res.writableEnded) return;
          res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(unavailable));
        });
      });
    },
  };
}
