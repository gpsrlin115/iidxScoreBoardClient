import { frontendOriginOf } from '../../rivalCrawler/bookmarklet.js';
import { IMPORT_PATH, PROFILE_URL, RADAR_URL } from './protocol.js';
import { PARSER_SOURCE, PARSER_VERIFIED, PROFILE_PARSER_SOURCE } from './parserSource.js';

export const READY_TIMEOUT_MS = 30000;
export const PROFILE_TIMEOUT_MS = 10000;

// No function serialization: Vite may rename/minify imported functions.
const BODY = `(function (W, F) {
  'use strict';
  function alert(m) { W.alert('[노트레이더 가져오기] ' + m); }
  if (W.location.href !== ${JSON.stringify(RADAR_URL)}) { alert('본인의 공식 노트레이더 페이지에서 실행해 주세요.'); return; }
  if (!${PARSER_VERIFIED}) { alert('공식 페이지 구조 검증이 끝나지 않아 가져오기를 사용할 수 없습니다.'); return; }
  var categories;
  try { categories = (${PARSER_SOURCE})(W.document); } catch (e) { alert(e.message); return; }
  var popup = W.open(F + ${JSON.stringify(IMPORT_PATH)}, '_blank', 'popup,width=520,height=700');
  if (!popup) { alert('팝업을 허용한 뒤 다시 실행해 주세요.'); return; }
  var done = false;
  var attemptId = null;
  var iidxId = null;
  var timer;
  var poll;
  var requestTimer;
  var controller = new W.AbortController();
  function finish(message) {
    if (done) return;
    done = true;
    W.clearTimeout(timer);
    W.clearTimeout(requestTimer);
    W.clearInterval(poll);
    controller.abort();
    W.removeEventListener('message', onMessage);
    if (message) alert(message);
  }
  function send() {
    if (done || !attemptId || !iidxId) return;
    var payload = { release: '34', playStyle: 'SP', iidxId: iidxId, categories: categories };
    finish();
    popup.postMessage({ type: 'IIDX_RADAR_DATA', version: 1, attemptId: attemptId, payload: payload }, F);
  }
  function onMessage(event) {
    if (done || attemptId || event.origin !== F || event.source !== popup) return;
    var data = event.data;
    if (!data || typeof data !== 'object' || Object.keys(data).length !== 3
      || data.type !== 'IIDX_RADAR_READY' || data.version !== 1
      || typeof data.attemptId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.attemptId)) return;
    attemptId = data.attemptId;
    send();
  }
  W.addEventListener('message', onMessage);
  timer = W.setTimeout(function () { finish('가져오기 창의 응답이 없어 멈췄습니다. 원래 사이트에서 새 가져오기를 시작해 주세요.'); }, ${READY_TIMEOUT_MS});
  poll = W.setInterval(function () { if (popup.closed) finish('가져오기 창이 닫혔거나 연결이 끊겼습니다.'); }, 500);
  requestTimer = W.setTimeout(function () { finish('공식 프로필 읽기가 지연되어 멈췄습니다. 잠시 후 다시 실행해 주세요.'); }, ${PROFILE_TIMEOUT_MS});
  W.fetch(${JSON.stringify(PROFILE_URL)}, { method: 'GET', credentials: 'same-origin', redirect: 'error', signal: controller.signal })
    .then(function (response) {
      if (!response.ok || response.url !== ${JSON.stringify(PROFILE_URL)}) throw new Error('공식 프로필에 접근하지 못했습니다. 로그인 상태를 확인해 주세요.');
      return response.text();
    }).then(function (html) {
      if (done) return;
      var document = new W.DOMParser().parseFromString(html, 'text/html');
      iidxId = (${PROFILE_PARSER_SOURCE})(document);
      W.clearTimeout(requestTimer);
      send();
    }).catch(function (error) { if (!done) finish(error.message || '공식 프로필 읽기에 실패했습니다.'); });
})`;

export function radarBookmarkletSource(origin) {
  const safeOrigin = frontendOriginOf(origin);
  return safeOrigin ? `${BODY}(window, ${JSON.stringify(safeOrigin)});` : null;
}

export function radarBookmarkletHref(origin) {
  const source = radarBookmarkletSource(origin);
  return source ? `javascript:${encodeURIComponent(source)}` : null;
}
