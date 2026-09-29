// Injected ahead of the app bundle by server.mjs. Runs one scenario named by
// ?probe=<kind>:<arg> and leaves the result on window.__probe for the driver.
(function probe() {
  const params = new URLSearchParams(location.search);
  const spec = params.get('probe') || '';
  const [kind, arg] = spec.split(':');
  const state = { spec, done: false, report: { spec, url: location.href, ua: navigator.userAgent, errors: [], steps: [] }, pngs: [] };
  window.__probe = state;
  if (params.get('anon') === '1') document.cookie = 'probeAnon=1; path=/';
  else document.cookie = 'probeAnon=0; path=/';

  const R = state.report;
  const errText = (a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'object' ? (() => { try { return JSON.stringify(a); } catch { return String(a); } })() : String(a));
  window.addEventListener('error', (e) => R.errors.push(`onerror: ${e.message || (e.target && (e.target.src || e.target.href)) || 'resource error'}`), true);
  window.addEventListener('unhandledrejection', (e) => R.errors.push(`unhandledrejection: ${errText(e.reason)}`));
  const realError = console.error.bind(console);
  console.error = (...a) => { R.errors.push(`console.error: ${a.map(errText).join(' ')}`.slice(0, 600)); realError(...a); };

  // Keep the PNG the page hands to the download link; don't download it.
  const realCreate = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => { state.blobs = state.blobs || []; state.blobs.push(blob); return realCreate(blob); };
  const realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function click() {
    if (this.download) { state.lastDownloadName = this.download; return undefined; }
    return realClick.call(this);
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, ms = 15000, label = 'condition') => {
    const t0 = Date.now();
    for (;;) {
      let v;
      try { v = fn(); } catch { v = null; }
      if (v) return v;
      if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${label}`);
      await sleep(100);
    }
  };
  const text = (el) => (el ? el.innerText.replace(/\s+\n/g, '\n').trim() : null);
  const finishAnimations = () => document.getAnimations?.().forEach((a) => { try { a.finish(); } catch { /* infinite */ } });

  const pageSummary = () => ({
    path: location.pathname + location.search,
    title: document.title,
    headings: [...document.querySelectorAll('h1,h2')].map((h) => h.innerText.trim()).filter(Boolean).slice(0, 6),
    rootTextLength: (document.getElementById('root')?.innerText || '').length,
    spinner: Boolean(document.querySelector('.animate-spin')),
    errorView: text(document.querySelector('[role=alert]')),
  });

  // react-hot-toast renders each message in a [role=status] element.
  const toasts = () => [...document.querySelectorAll('[role=status]')]
    .filter((el) => el.innerText.trim());

  const describeToast = (el) => {
    const bar = el.parentElement; // toast bar holds icon + message
    const cs = getComputedStyle(bar);
    return {
      text: el.innerText,
      items: [...el.querySelectorAll('li')].map((li) => li.innerText),
      barText: bar.innerText,
      whiteSpace: getComputedStyle(el).whiteSpace,
      innerWhiteSpace: el.firstElementChild ? getComputedStyle(el.firstElementChild).whiteSpace : null,
      maxWidth: cs.maxWidth,
      background: cs.backgroundColor,
      rect: (() => { const r = bar.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
    };
  };

  const pauseToasts = () => {
    const t = document.querySelector('[role=status]');
    if (t) t.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
  };

  // #050813 background check, same rule as the PNG retrospective (±2 per channel).
  const measure = async (blob) => {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let non = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - 5) > 2 || Math.abs(data[i + 1] - 8) > 2 || Math.abs(data[i + 2] - 19) > 2) non += 1;
    }
    return { width: c.width, height: c.height, bytes: blob.size, type: blob.type, nonBackgroundPixels: non, ratio: +(non / (c.width * c.height)).toFixed(4) };
  };
  const toBase64 = (blob) => new Promise((resolve) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });

  const settle = async () => {
    await waitFor(() => document.getElementById('root')?.children.length, 15000, 'root render');
    // wait for spinners to go and text to stop changing
    let last = -1;
    for (let i = 0; i < 60; i += 1) {
      await sleep(250);
      const len = (document.getElementById('root')?.innerText || '').length;
      if (!document.querySelector('.animate-spin') && len === last && len > 0) break;
      last = len;
    }
  };

  const scenarios = {
    async smoke() { await settle(); },

    async admin() {
      await settle();
      const input = await waitFor(() => document.querySelector('input[type=file][accept=".csv"]'), 15000, 'bootstrap input');
      const file = new File([`SCENARIO=${arg}\nversion,title\n`], 'bootstrap.csv', { type: 'text/csv' });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      R.steps.push('file selected');
      const toastEl = await waitFor(() => toasts().find((el) => !/적재하는 중/.test(el.innerText)), 15000, 'result toast');
      await sleep(400);
      pauseToasts();
      finishAnimations();
      R.toast = describeToast(toastEl);
      R.allToasts = toasts().map((el) => el.innerText);
      const icon = toastEl.parentElement.firstElementChild;
      R.toast.icon = icon && icon !== toastEl ? (icon.innerText || icon.className || icon.tagName) : null;
    },

    async scores() {
      await settle();
      await waitFor(() => [...document.querySelectorAll('div')].some((d) => /PC 정확/.test(d.innerText)), 15000, 'score cards');
      const cards = [...document.querySelectorAll('div.rounded-\\[4px\\].border')].filter((d) => /PC /.test(d.innerText));
      R.cards = cards.map((c) => {
        const title = c.querySelector('[title]');
        const lines = c.innerText.split('\n').map((s) => s.trim()).filter(Boolean);
        return { title: lines.find((l) => l.startsWith('PC ')), footer: lines.slice(-3), hint: title ? title.getAttribute('title') : null };
      });
      // Put the play-count cases on screen for the capture.
      cards[0]?.scrollIntoView({ block: 'start' });
    },

    async png() {
      await settle();
      if (arg === 'dense') {
        const denseTag = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '조밀');
        denseTag?.click();
        await sleep(500);
      }
      const btn = await waitFor(() => [...document.querySelectorAll('button')].find((b) => /PNG/.test(b.innerText) && !b.disabled), 15000, 'PNG button');
      const t0 = performance.now();
      btn.click();
      await waitFor(() => state.blobs?.length, 60000, 'PNG blob');
      R.captureMs = Math.round(performance.now() - t0);
      const blob = state.blobs[state.blobs.length - 1];
      R.png = await measure(blob);
      R.downloadName = state.lastDownloadName;
      state.pngBase64 = await toBase64(blob);
      await sleep(300);
      R.toastsAfter = toasts().map((el) => el.innerText);
    },

    async stale() {
      // A tab opened before a deploy: the next lazy chunk is gone.
      await settle();
      await fetch(`/__break?name=${arg}`);
      const link = await waitFor(() => [...document.querySelectorAll('a')].find((a) => a.getAttribute('href') === '/scores'), 10000, 'scores link');
      link.click();
      await sleep(3000);
      R.after = pageSummary();
      R.reloadButton = [...document.querySelectorAll('button')].map((b) => b.innerText.trim()).filter(Boolean);
      await fetch('/__unbreak');
    },
  };

  const run = async () => {
    try {
      if (!scenarios[kind]) throw new Error(`unknown probe ${spec}`);
      await scenarios[kind]();
      R.ok = true;
    } catch (e) {
      R.ok = false;
      R.failure = errText(e);
    }
    R.page = pageSummary();
    finishAnimations();
    window.scrollTo?.(0, R.cards ? window.scrollY : 0);
    state.done = true;
  };
  if (kind) {
    if (document.readyState === 'complete') run();
    else window.addEventListener('load', () => run());
  }
}());
