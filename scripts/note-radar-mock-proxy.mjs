import { NOTE_RADAR_MOCK_API_CONTEXT, NOTE_RADAR_MOCK_HEADER, NOTE_RADAR_MOCK_IDENTITY, NOTE_RADAR_MOCK_ORIGIN } from './note-radar-mock-contract.mjs';

const apiPath = new RegExp(NOTE_RADAR_MOCK_API_CONTEXT);

const unavailable = Object.freeze({
  code: 'NOTE_RADAR_MOCK_UNAVAILABLE',
  message: '모의 서버를 확인할 수 없어 요청을 보내지 않았습니다. 모의 서버 실행 상태를 확인해 주세요.',
});

async function verifyIdentity(target, timeoutMs) {
  // Never forward user cookies or trust a previous successful check.
  const response = await fetch(new URL('/__mock/identity', target), {
    method: 'GET', redirect: 'error', cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status !== 200 || response.headers.get(NOTE_RADAR_MOCK_HEADER) !== '1') {
    await response.body?.cancel();
    throw new Error('MOCK_IDENTITY_MISMATCH');
  }
  const body = await response.json();
  if (!body || Array.isArray(body) || Object.keys(body).length !== 2
    || body.service !== NOTE_RADAR_MOCK_IDENTITY.service || body.version !== NOTE_RADAR_MOCK_IDENTITY.version) {
    throw new Error('MOCK_IDENTITY_MISMATCH');
  }
}

export function createNoteRadarMockProxyGuard({ target = NOTE_RADAR_MOCK_ORIGIN, timeoutMs = 2000 } = {}) {
  return {
    name: 'note-radar-mock-proxy-guard',
    configureServer(server) {
      // configureServer runs before Vite installs the /api proxy middleware.
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
