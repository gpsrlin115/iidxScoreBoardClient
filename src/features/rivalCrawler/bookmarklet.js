/**
 * IIDX ID link bookmarklet and the message contract it shares with the
 * /crawler/iidx-link popup. Contract: docs/retro-2026-10-06-iidx-bookmarklet-contract.md
 * ("화면·북마클릿 통신", "브라우저·비밀값 경계") in the backend repository.
 *
 * The bookmarklet body is a plain ES5 string, not a function's toString():
 * the production minifier rewrites functions, and a bookmarklet must stay
 * self-contained no matter what the bundler does. Tests run this exact string.
 */
export const EAGATE_ORIGIN = 'https://p.eagate.573.jp';
export const PROFILE_URL = `${EAGATE_ORIGIN}/game/2dx/34/djdata/status.html`;
export const LINK_PATH = '/crawler/iidx-link';
export const READY_MESSAGE = Object.freeze({ type: 'IIDX_LINK_READY', version: 1 });
export const PROFILE_TYPE = 'IIDX_LINK_PROFILE';
export const READY_TIMEOUT_MS = 10000;
const RUN_ID_FORMAT = /^[0-9a-f]{32}$/;

/** https origins only, plus http on loopback for local development. */
export function frontendOriginOf(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.origin !== value) return null;
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  return url.protocol === 'https:' || (url.protocol === 'http:' && loopback) ? url.origin : null;
}

/**
 * Exact schema check for the bookmarklet's reply. Anything else is ignored, not
 * reported: a stray message from another script must not end the attempt.
 */
export function readProfileMessage(data) {
  if (!data || typeof data !== 'object' || Object.getPrototypeOf(data) !== Object.prototype) return null;
  const keys = Object.keys(data);
  if (keys.length !== 4 || !['type', 'version', 'runId', 'iidxId'].every((key) => keys.includes(key))) return null;
  if (data.type !== PROFILE_TYPE || data.version !== 1) return null;
  if (typeof data.runId !== 'string' || !RUN_ID_FORMAT.test(data.runId)) return null;
  if (typeof data.iidxId !== 'string' || !/^\d{4}-\d{4}$/.test(data.iidxId)) return null;
  return { runId: data.runId, iidxId: data.iidxId };
}

// W = window, F = frontend origin. Steps, in order:
// 1. Run only on the exact profile URL (no query, no hash): the rival pages and
//    any other eagate page are refused before reading the DOM.
// 2. Read IIDX ID rows from div.dj-profile table, the same rule the backend
//    parser uses: two td/th cells, label "IIDX ID" ignoring spaces. Every ID row
//    must be well formed and all of them must name one ID, or nothing is sent.
//    DJ NAME, HTML and cookies are never read into the message.
// 3. window.open runs synchronously inside the click, so the popup blocker sees
//    a user gesture. A null handle means blocked: stop.
// 4. Wait for READY from exactly that window at exactly F. Reply PROFILE once,
//    to F only. Stop on 10 s without READY or when the window is closed (a COOP
//    split also reports closed).
const BODY = `(function (W, F) {
  'use strict';
  var P = ${JSON.stringify(PROFILE_URL)};
  function stop(m) { W.alert('[IIDX 코드 연결] ' + m); }
  if (W.location.href !== P) {
    stop('e-amusement 본인 프로필(DJ DATA) 페이지에서만 실행할 수 있습니다. 주소 끝에 ? 나 # 가 없는 ' + P + ' 에서 다시 실행해 주세요.');
    return;
  }
  var rows = W.document.querySelectorAll('div.dj-profile table tr');
  var ids = [];
  var bad = false;
  for (var i = 0; i < rows.length; i++) {
    var cells = [];
    for (var j = 0; j < rows[i].children.length; j++) {
      var tag = rows[i].children[j].tagName;
      if (tag === 'TD' || tag === 'TH') cells.push(rows[i].children[j]);
    }
    if (cells.length !== 2) continue;
    if (cells[0].textContent.replace(/[\\s\\u00a0]+/g, '').toUpperCase() !== 'IIDXID') continue;
    var v = cells[1].textContent.replace(/^[\\s\\u00a0]+|[\\s\\u00a0]+$/g, '');
    if (!/^(?:[0-9]{8}|[0-9]{4}-[0-9]{4})$/.test(v)) { bad = true; break; }
    v = v.replace('-', '');
    v = v.slice(0, 4) + '-' + v.slice(4);
    if (ids.indexOf(v) < 0) ids.push(v);
  }
  if (bad || ids.length !== 1) {
    stop('프로필에서 IIDX 코드를 하나로 확정하지 못해 아무것도 보내지 않았습니다.');
    return;
  }
  var id = ids[0];
  var w = W.open(F + ${JSON.stringify(LINK_PATH)}, '_blank', 'popup,width=480,height=640');
  if (!w) {
    stop('연결 창이 차단됐습니다. 이 페이지의 팝업을 허용한 뒤 북마클릿을 다시 실행해 주세요.');
    return;
  }
  var bytes = new Uint8Array(16);
  W.crypto.getRandomValues(bytes);
  var runId = '';
  for (var k = 0; k < bytes.length; k++) runId += (bytes[k] + 256).toString(16).slice(1);
  var done = false;
  var timer;
  var poll;
  function finish(m) {
    if (done) return;
    done = true;
    W.clearTimeout(timer);
    W.clearInterval(poll);
    W.removeEventListener('message', onMessage);
    if (m) stop(m);
  }
  function onMessage(e) {
    if (done || e.origin !== F || e.source !== w) return;
    var d = e.data;
    if (!d || typeof d !== 'object' || Object.keys(d).length !== 2 || d.type !== 'IIDX_LINK_READY' || d.version !== 1) return;
    finish();
    w.postMessage({ type: ${JSON.stringify(PROFILE_TYPE)}, version: 1, runId: runId, iidxId: id }, F);
  }
  W.addEventListener('message', onMessage);
  timer = W.setTimeout(function () {
    finish('연결 창이 ${READY_TIMEOUT_MS / 1000}초 안에 응답하지 않아 멈췄습니다. 연결 창의 안내를 확인하고 원래 화면에서 다시 시작해 주세요.');
  }, ${READY_TIMEOUT_MS});
  poll = W.setInterval(function () {
    if (w.closed) finish('연결 창이 닫혔거나 이 페이지와의 연결이 끊겨 멈췄습니다. 원래 화면에서 연결 상태를 확인해 주세요.');
  }, 500);
})`;

/** Source with the frontend origin baked in; null when the origin is not acceptable. */
export function bookmarkletSource(frontendOrigin) {
  const origin = frontendOriginOf(frontendOrigin);
  return origin ? `${BODY}(window, ${JSON.stringify(origin)});` : null;
}

export function bookmarkletHref(frontendOrigin) {
  const source = bookmarkletSource(frontendOrigin);
  return source ? `javascript:${encodeURIComponent(source)}` : null;
}
