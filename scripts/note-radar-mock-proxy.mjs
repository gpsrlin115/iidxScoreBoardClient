import { NOTE_RADAR_MOCK_API_CONTEXT, NOTE_RADAR_MOCK_HEADER, NOTE_RADAR_MOCK_IDENTITY, NOTE_RADAR_MOCK_ORIGIN } from './note-radar-mock-contract.mjs';

const apiPath = new RegExp(NOTE_RADAR_MOCK_API_CONTEXT);

const unavailable = Object.freeze({
  code: 'NOTE_RADAR_MOCK_UNAVAILABLE',
  message: '모의 서버를 확인할 수 없어 요청을 보내지 않았습니다. 모의 서버 실행 상태를 확인해 주세요.',
});

async function readIdentity(target, signal) {
  // Never forward user cookies or trust a previous successful check.
  const response = await fetch(new URL('/__mock/identity', target), {
    method: 'GET', redirect: 'error', cache: 'no-store', signal,
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

async function verifyIdentity(target, timeoutMs) {
  // The deadline covers the whole check, body included, without relying on the
  // fetch signal alone. Once the headers arrive, fetch keeps the link from the
  // signal to the pending body read only weakly; if garbage collection drops
  // it, aborting no longer reaches the read and a stalled body waits for
  // fetch's 300 s default. The abort below is cleanup on a best-effort basis.
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('MOCK_IDENTITY_TIMEOUT'));
    }, timeoutMs);
  });
  const check = readIdentity(target, controller.signal);
  check.catch(() => {}); // a late failure after the deadline must not go unhandled
  try {
    await Promise.race([check, deadline]);
  } finally {
    clearTimeout(timer);
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
