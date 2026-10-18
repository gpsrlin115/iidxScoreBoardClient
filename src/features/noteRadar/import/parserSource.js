// These stable strings are embedded unchanged in the production bookmarklet.
// Selectors and empty rows were checked against the logged-in release 34 DOM.
export const PARSER_VERIFIED = true;
export const PARSER_SOURCE = `function (D) {
  'use strict';
  function text(node) { return node.textContent.replace(/^[\\s\\u00a0]+|[\\s\\u00a0]+$/g, ''); }
  function fail() { throw new Error('공식 SP 레이더 목록 구조가 바뀌었거나 일부 기록이 빠졌습니다. 여섯 카테고리가 모두 표시된 본인 페이지에서 다시 실행해 주세요.'); }
  function decimal(node) {
    var raw = text(node);
    if (!/^(?:0|[1-9][0-9]{0,2})\\.[0-9]{2}$/.test(raw) || Number(raw) > 200) fail();
    return Number(raw);
  }
  if (D.querySelector('#error-page .error_login')) throw new Error('e-amusement 로그인이 필요합니다. 로그인한 뒤 다시 실행해 주세요.');
  var names = ['NOTES', 'CHORD', 'PEAK', 'CHARGE', 'SCRATCH', 'SOFLAN'];
  var labels = D.querySelectorAll('ul.menu-theme.sp li');
  var blocks = D.querySelectorAll('div.tab-sp');
  if (labels.length !== 6 || blocks.length !== 6) fail();
  var result = [];
  for (var i = 0; i < 6; i++) {
    if (text(labels[i]).replace(/[\\s-]/g, '').toUpperCase() !== names[i]) fail();
    var tables = blocks[i].querySelectorAll('div.table');
    if (tables.length !== 1) fail();
    var valueNode = tables[0].previousElementSibling;
    if (!valueNode || valueNode.tagName !== 'P') fail();
    var headers = tables[0].querySelectorAll('table th');
    var expected = ['順位', 'レーダースコア', '楽曲名', '難易度'];
    if (headers.length !== 4) fail();
    for (var h = 0; h < 4; h++) if (text(headers[h]) !== expected[h]) fail();
    var rows = tables[0].querySelectorAll('table tr');
    var entries = [];
    var titles = [];
    var rank = 0;
    var empty = false;
    for (var j = 0; j < rows.length; j++) {
      var cells = rows[j].querySelectorAll('td');
      if (!cells.length) continue;
      rank++;
      if (cells.length !== 4 || !cells[0].classList.contains('no') || text(cells[0]) !== String(rank)) fail();
      if (text(cells[1]) === '-' && text(cells[2]) === '-' && text(cells[3]) === '-') { empty = true; continue; }
      if (empty) fail();
      var links = cells[2].querySelectorAll('a.music_info');
      var chart = /^SP (BEGINNER|NORMAL|HYPER|ANOTHER|LEGGENDARIA)$/.exec(text(cells[3]));
      if (links.length !== 1 || !chart) fail();
      var title = text(links[0]);
      if (!title || title.length > 512 || /[\\u0000-\\u001f\\u007f]/.test(title) || titles.indexOf(title) >= 0) fail();
      titles.push(title);
      // The music_info index is temporary page state, never a chart identifier.
      entries.push({ externalId: null, title: title, chartType: chart[1], value: decimal(cells[1]) });
    }
    if (rank !== 10) fail();
    result.push({ category: names[i], value: decimal(valueNode), entries: entries });
  }
  return result;
}`;

export const PROFILE_PARSER_SOURCE = `function (D) {
  'use strict';
  var rows = D.querySelectorAll('div.dj-profile table tr');
  var ids = [];
  for (var i = 0; i < rows.length; i++) {
    var cells = rows[i].querySelectorAll('td, th');
    if (cells.length !== 2 || cells[0].textContent.replace(/[\\s\\u00a0]+/g, '').toUpperCase() !== 'IIDXID') continue;
    var raw = cells[1].textContent.replace(/^[\\s\\u00a0]+|[\\s\\u00a0]+$/g, '');
    if (!/^(?:[0-9]{8}|[0-9]{4}-[0-9]{4})$/.test(raw)) throw new Error('본인 프로필의 IIDX 코드를 확인하지 못했습니다.');
    var id = raw.replace('-', '');
    id = id.slice(0, 4) + '-' + id.slice(4);
    if (ids.indexOf(id) < 0) ids.push(id);
  }
  if (ids.length !== 1) throw new Error('본인 프로필을 읽지 못했습니다. 공식 DJ DATA의 상태 페이지를 확인하고 다시 실행해 주세요.');
  return ids[0];
}`;
