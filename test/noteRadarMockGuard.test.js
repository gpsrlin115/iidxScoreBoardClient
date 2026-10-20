import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { guardNoteRadarMockRequest, isNoteRadarMockError, noteRadarApiBaseURL, noteRadarMockEnabled,
  noteRadarMockError, requireNoteRadarMockResponse } from '../src/api/noteRadarMockGuard.js';

const ORIGIN = 'http://localhost:5173';
const SECRET = 'fixture-private-cookie';
let vite, client, auth, setNavigator, previousDocument, previousWindow, dom;

before(async () => {
  previousDocument = globalThis.document;
  previousWindow = globalThis.window;
  dom = new JSDOM('<body></body>', { url: `${ORIGIN}/note-radar/import` });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  document.cookie = `XSRF-TOKEN=${SECRET}`;
  vite = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true },
    define: {
      'import.meta.env.DEV': 'true',
      'import.meta.env.VITE_NOTE_RADAR_MOCK': '"1"',
      'import.meta.env.VITE_API_BASE_URL': '"https://untrusted.example/api"',
    },
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  ({ default: client } = await vite.ssrLoadModule('/src/api/client.js'));
  ({ useAuthStore: auth } = await vite.ssrLoadModule('/src/store/authStore.js'));
  ({ setNavigator } = await vite.ssrLoadModule('/src/utils/navigation.js'));
});

after(async () => {
  globalThis.document = previousDocument;
  globalThis.window = previousWindow;
  dom?.window.close();
  await vite?.close();
});

test('the explicit mock flag forces the API base URL even when DEV is false', () => {
  for (const DEV of [true, false, undefined]) {
    const env = { DEV, VITE_NOTE_RADAR_MOCK: '1', VITE_API_BASE_URL: 'https://example.test/api' };
    assert.equal(noteRadarMockEnabled(env), true);
    assert.equal(noteRadarApiBaseURL(env), '/api');
  }
  for (const env of [{ DEV: false, VITE_NOTE_RADAR_MOCK: '0' }, { DEV: true, VITE_NOTE_RADAR_MOCK: '0' }, {}]) {
    assert.equal(noteRadarMockEnabled(env), false);
    assert.equal(noteRadarApiBaseURL({ ...env, VITE_API_BASE_URL: 'https://example.test/api' }), 'https://example.test/api');
  }
  assert.equal(noteRadarApiBaseURL({ DEV: true, VITE_NOTE_RADAR_MOCK: '1', VITE_API_BASE_URL: 'https://example.test/api' }), '/api');
  assert.equal(noteRadarApiBaseURL({}), 'http://localhost:8080/api');
});

test('Vite DEV=false with the mock flag still forces the proxy and blocks external writes', async () => {
  const productionEnvVite = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true },
    define: {
      'import.meta.env.DEV': 'false',
      'import.meta.env.VITE_NOTE_RADAR_MOCK': '"1"',
      'import.meta.env.VITE_API_BASE_URL': '"https://untrusted.example/api"',
    },
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  try {
    const { default: guarded } = await productionEnvVite.ssrLoadModule('/src/api/client.js');
    let transmissions = 0;
    guarded.defaults.adapter = async (config) => {
      transmissions++;
      return { status: 200, data: {}, headers: { 'x-note-radar-mock': '1' }, config };
    };
    assert.equal(guarded.defaults.baseURL, '/api');
    await assert.rejects(guarded.post('https://untrusted.example/api/note-radar/goals', { secret: SECRET }), (error) => {
      assert.equal(error.code, 'NOTE_RADAR_MOCK_UNAVAILABLE');
      assert.equal(error.appError.raw, null);
      assert.equal(error.config, undefined);
      assert.equal(error.request, undefined);
      assert.ok(!JSON.stringify(error).includes(SECRET));
      return true;
    });
    assert.equal(transmissions, 0);
  } finally {
    await productionEnvVite.close();
  }
});

test('pure request guard accepts ordinary service URLs and same-origin API URLs', () => {
  for (const url of ['/users/me', 'note-radar/me', '/note-radar/recommendations?category=NOTES', `${ORIGIN}/api/users/me`]) {
    const config = { baseURL: '/api', url };
    assert.equal(guardNoteRadarMockRequest(config, ORIGIN), config);
  }
  assert.throws(() => guardNoteRadarMockRequest({ baseURL: '/api', url: '/users/me' }, undefined), { code: 'NOTE_RADAR_MOCK_UNAVAILABLE' });
});

test('forced Axios configuration ignores a conflicting environment host', async () => {
  const sent = [];
  client.defaults.adapter = async (config) => {
    sent.push(config);
    return { status: 200, data: { mock: true }, headers: { 'x-note-radar-mock': '1' }, config };
  };
  assert.equal(client.defaults.baseURL, '/api');
  const response = await client.post('/note-radar/simulate', { targets: [] });
  assert.equal(sent.length, 1);
  assert.equal(axios.getUri(sent[0]), '/api/note-radar/simulate');
  assert.equal(sent[0].withCredentials, true);
  assert.equal(sent[0].headers.get('X-XSRF-TOKEN'), SECRET);
  assert.deepEqual(response.data, { mock: true });
});

test('invalid per-request hosts and paths invoke no transport adapter', async () => {
  let transmissions = 0;
  client.defaults.adapter = async (config) => {
    transmissions++;
    return { status: 200, data: {}, headers: { 'x-note-radar-mock': '1' }, config };
  };
  const forbidden = [
    ['/users/me', { baseURL: 'https://untrusted.example/api' }],
    ['/users/me', { baseURL: `${ORIGIN}/api` }],
    ['https://untrusted.example/api/users/me'],
    ['//untrusted.example/api/users/me'],
    [`${ORIGIN}/users/me`],
    ['../users/me'],
    ['/../users/me'],
    ['/%2e%2e/users/me'],
    ['/%2f../users/me'],
    ['/%255c../users/me'],
    ['\\untrusted.example/api/users/me'],
  ];
  for (const [url, options] of forbidden) {
    await assert.rejects(client.post(url, { secret: SECRET }, options), (error) => {
      assert.equal(error.code, 'NOTE_RADAR_MOCK_UNAVAILABLE', url);
      assert.equal(error.config, undefined, url);
      assert.equal(error.request, undefined, url);
      assert.equal(error.response, undefined, url);
      assert.equal(error.appError.raw, null, url);
      assert.ok(!JSON.stringify(error).includes(SECRET), url);
      return true;
    });
  }
  assert.equal(transmissions, 0);
});

test('response marker accepts Axios and plain case-insensitive headers only with exact value', () => {
  for (const headers of [new axios.AxiosHeaders({ 'X-Note-Radar-Mock': '1' }), { 'X-Note-Radar-Mock': '1' }]) {
    const response = { headers };
    assert.equal(requireNoteRadarMockResponse(response), response);
  }
  for (const headers of [undefined, {}, { 'x-note-radar-mock': 'true' }, { 'x-note-radar-mock': '0' }, { 'x-note-radar-mock': ['1'] }]) {
    assert.throws(() => requireNoteRadarMockResponse({ headers }), { code: 'NOTE_RADAR_MOCK_INVALID_RESPONSE' });
  }
});

test('safe local error identity cannot be supplied through a marked server failure name', async () => {
  const pretender = new Error('fixture failure');
  pretender.name = 'NoteRadarMockError';
  pretender.response = { status: 409, data: { message: 'fixture validation' }, headers: { 'x-note-radar-mock': '1' } };
  assert.equal(isNoteRadarMockError(pretender), false);
  client.defaults.adapter = async () => { throw pretender; };
  await assert.rejects(client.get('/note-radar/me'), (error) => {
    assert.equal(error.appError.status, 409);
    assert.equal(error.appError.message, 'fixture validation');
    return true;
  });
});

test('unmarked successful responses reject with fixed copy and no response data', async () => {
  client.defaults.adapter = async (config) => ({ status: 200, data: { cookie: SECRET }, headers: {}, config });
  await assert.rejects(client.get('/users/me'), (error) => {
    assert.equal(error.code, 'NOTE_RADAR_MOCK_INVALID_RESPONSE');
    assert.match(error.appError.message, /모의 서버로 확인되지 않은 응답/);
    assert.equal(error.response, undefined);
    assert.equal(error.config, undefined);
    assert.equal(error.appError.raw, null);
    assert.ok(!JSON.stringify(error).includes(SECRET));
    return true;
  });
});

test('unmarked 401 never logs out and rejects without raw credentials or server copy', async () => {
  const navigations = [];
  setNavigator((to) => navigations.push(to));
  auth.getState().setUser({ id: 41 });
  client.defaults.adapter = async (config) => {
    const error = new Error(SECRET);
    error.config = config;
    error.request = { body: SECRET };
    error.response = { status: 401, data: { code: 'SITE_LOGIN_REQUIRED', message: SECRET }, headers: {}, config };
    throw error;
  };
  await assert.rejects(client.get('/users/me'), (error) => {
    assert.equal(error.code, 'NOTE_RADAR_MOCK_INVALID_RESPONSE');
    assert.equal(error.appError.status, null);
    assert.ok(!JSON.stringify(error).includes(SECRET));
    assert.equal(error.response, undefined);
    assert.equal(error.config, undefined);
    return true;
  });
  assert.equal(auth.getState().user.id, 41);
  assert.deepEqual(navigations, []);
  setNavigator(null);
});

test('valid mock 401 keeps session expiry and marked server failures keep existing handling', async () => {
  auth.getState().setUser({ id: 42 });
  let status = 401;
  client.defaults.adapter = async (config) => {
    const error = new Error('mock failure');
    error.config = config;
    error.response = { status, data: { code: 'SITE_LOGIN_REQUIRED', message: 'fixture validation' }, headers: { 'x-note-radar-mock': '1' }, config };
    throw error;
  };
  await assert.rejects(client.get('/note-radar/me'), (error) => error.response.status === 401 && error.appError.status === 401);
  assert.equal(auth.getState().user, null);
  for (const code of [400, 409, 503]) {
    status = code;
    await assert.rejects(client.get('/note-radar/me'), (error) => {
      assert.equal(error.response.status, code);
      assert.equal(error.response.data.message, 'fixture validation');
      assert.equal(error.appError.status, code);
      return true;
    });
  }
});

test('network failure becomes a local unavailable error without retained request details', async () => {
  client.defaults.adapter = async (config) => {
    const error = new Error(SECRET);
    error.code = 'ERR_NETWORK';
    error.config = config;
    error.request = { cookie: SECRET };
    throw error;
  };
  await assert.rejects(client.get('/users/me'), (error) => {
    assert.equal(error.code, 'NOTE_RADAR_MOCK_UNAVAILABLE');
    assert.match(error.appError.message, /모의 서버에 연결할 수 없습니다/);
    assert.ok(!JSON.stringify(error).includes(SECRET));
    assert.equal(error.config, undefined);
    assert.equal(error.request, undefined);
    assert.equal(noteRadarMockError(error).code, 'NOTE_RADAR_MOCK_UNAVAILABLE');
    return true;
  });
});

test('disabled mock mode retains the configured host and accepts normal API responses', async () => {
  const normalVite = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true },
    define: {
      'import.meta.env.DEV': 'true',
      'import.meta.env.VITE_NOTE_RADAR_MOCK': '"0"',
      'import.meta.env.VITE_API_BASE_URL': '"https://configured.example/api"',
    },
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  try {
    const { default: normal } = await normalVite.ssrLoadModule('/src/api/client.js');
    const sent = [];
    normal.defaults.adapter = async (config) => {
      sent.push(config);
      return { status: 200, data: { normal: true }, headers: {}, config };
    };
    assert.equal(normal.defaults.baseURL, 'https://configured.example/api');
    assert.deepEqual((await normal.get('/users/me')).data, { normal: true });
    assert.deepEqual((await normal.get('https://explicit.example/api/users/me')).data, { normal: true });
    assert.equal(sent.length, 2);
    assert.equal(axios.getUri(sent[0]), 'https://configured.example/api/users/me');
    assert.equal(axios.getUri(sent[1]), 'https://explicit.example/api/users/me');
  } finally {
    await normalVite.close();
  }
});
