import { JSDOM } from 'jsdom';

export const ATTEMPT = '12345678-1234-4234-8234-123456789abc';
export const FRONTEND = 'https://scoreboard.example';
export const plain = (value) => JSON.parse(JSON.stringify(value));

export function radarHtml({ empty = false } = {}) {
  const labels = ['NOTES', 'CHORD', 'PEAK', 'CHARGE', 'SCRATCH', 'SOF-LAN'];
  return `<ul class="menu-theme sp">${labels.map((label) => `<li>${label}</li>`).join('')}</ul>`
    + labels.map((_, index) => `<div class="tab-sp${index ? ' no-show' : ''}"><p>${empty ? '0.00' : '14.00'}</p><div class="table"><table>`
      + '<tr><th>順位</th><th>レーダースコア</th><th>楽曲名</th><th>難易度</th></tr>'
      + Array.from({ length: 10 }, (_unused, rank) => !empty && rank === 0
        ? `<tr><td class="no">1</td><td>140.00</td><td><a class="music_info" href="/game/2dx/34/djdata/music/music_info.html?index=0">Synthetic &amp; Test</a></td><td>SP ANOTHER</td></tr>`
        : `<tr><td class="no">${rank + 1}</td><td>-</td><td>-</td><td>-</td></tr>`).join('')
      + '</table></div></div>').join('');
}

export function documentOf(html) { return new JSDOM(html).window.document; }
export function profileHtml(id = '1234-5678') {
  return `<div class="dj-profile"><table><tr><td>IIDX ID</td><td>${id}</td></tr></table></div>`;
}

export function payload() {
  return { release: '34', playStyle: 'SP', iidxId: '1234-5678', categories:
    ['NOTES', 'CHORD', 'PEAK', 'CHARGE', 'SCRATCH', 'SOFLAN'].map((category) => ({ category, value: 14,
      entries: [{ externalId: null, title: 'Synthetic & Test', chartType: 'ANOTHER', value: 140 }] })) };
}
