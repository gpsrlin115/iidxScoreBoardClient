/**
 * Deterministic starfield renderer, ported from the design handoff prototype
 * (docs/design_handoff_night_sky_redesign/iidx-data.js -> makeSky).
 *
 * Kept as a plain factory outside React so the component only owns refs and
 * effects. Every star property comes from an FNV-1a hash of its index, never
 * Math.random: changing litRatio must relight the SAME sky rather than reshuffle
 * it, which is the whole point of the design.
 */

/** FNV-1a over a string, folded into [0, 1). Ported verbatim from the prototype. */
export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

// Fixed look, locked to the "IIDX ScoreBoard v2" sky options in the handoff.
const BG = '#050813';
const TWINKLE = 0.2;
const STAR_SIZE = 1.1;
const AMP = 9;
const GLOW = true;
const NEBULAE = [
  { x: 0.74, y: 0.14, r: 0.52, c: '138,110,196', a: 0.13 },
  { x: 0.18, y: 0.8, r: 0.46, c: '86,140,190', a: 0.1 },
];

// Parallax easing, deliberately small and slow.
const LERP = 0.012;
// Stars wrap over 1.5 viewport heights so off-screen ones scroll into view.
const WRAP_SPAN = 1.5;
const MIN_STARS = 30;
const TAU = 6.2832;

export function createStarfield(canvas, initial) {
  const o = { litRatio: 0.5, count: 280, ...(initial || {}) };
  let ctx = null;
  let w = 0;
  let h = 0;
  let stars = [];
  let raf = null;
  // Parallax state: m* is the eased position, t* the pointer target, sy the scroll.
  let mx = 0, my = 0, tx = 0, ty = 0, sy = 0;
  let pulse = 0;
  let destroyed = false;
  const t0 = performance.now();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    // Re-acquire the context and reset the transform: resizing the backing store
    // clears it, so both must happen on every resize, not just at init.
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function build() {
    const n = Math.max(MIN_STARS, Math.round(o.count));
    const next = [];
    for (let i = 0; i < n; i += 1) {
      next.push({
        x: hash('x' + i),
        y: hash('y' + i),
        d: 0.3 + hash('d' + i) * 0.8,
        r: (0.4 + hash('r' + i) * 1.2) * STAR_SIZE,
        p: hash('p' + i) * 6.28,
        sp: 0.4 + hash('v' + i) * 1.1,
        lit: hash('s' + i) < o.litRatio,
        warm: hash('w' + i) > 0.72,
      });
    }
    stars = next;
  }

  function paintNebulae() {
    for (let i = 0; i < NEBULAE.length; i += 1) {
      const nb = NEBULAE[i];
      const alpha = nb.a || 0.15;
      const cx = nb.x * w + mx * AMP * 0.8;
      const cy = nb.y * h + my * AMP * 0.6 - sy * 0.012;
      const rad = nb.r * Math.max(w, h);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, 'rgba(' + nb.c + ',' + alpha + ')');
      g.addColorStop(0.5, 'rgba(' + nb.c + ',' + alpha * 0.3 + ')');
      g.addColorStop(1, 'rgba(' + nb.c + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function paintStars(t) {
    const flareMul = 1 + pulse * 0.7;
    const span = h * WRAP_SPAN;
    for (let i = 0; i < stars.length; i += 1) {
      const s = stars[i];
      const x = (((s.x * w - mx * AMP * s.d) % w) + w) % w;
      const y = (((s.y * span - sy * 0.03 * s.d - my * AMP * 0.7 * s.d) % span) + span) % span;
      if (y > h + 6) continue;
      const tw = 1 + Math.sin(t * s.sp + s.p) * TWINKLE;
      let a = (s.lit ? 0.85 : 0.2) * tw * s.d * flareMul;
      if (a <= 0.012) continue;
      if (a > 1) a = 1;
      const col = s.lit ? (s.warm ? '255,240,218' : '234,239,255') : '182,192,216';
      ctx.beginPath();
      ctx.arc(x, y, s.r * (s.lit ? 1.1 : 0.8), 0, TAU);
      ctx.fillStyle = 'rgba(' + col + ',' + a.toFixed(3) + ')';
      ctx.fill();
      if (s.lit && GLOW && s.r > 1) {
        ctx.beginPath();
        ctx.arc(x, y, s.r * 4, 0, TAU);
        ctx.fillStyle = 'rgba(' + col + ',' + (a * 0.06).toFixed(3) + ')';
        ctx.fill();
      }
    }
  }

  function draw(elapsed) {
    if (!ctx) return;
    const t = elapsed / 1000;
    mx += (tx - mx) * LERP;
    my += (ty - my) * LERP;
    pulse *= 0.96;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    paintNebulae();
    paintStars(t);
  }

  function tick(now) {
    draw(now - t0);
    raf = requestAnimationFrame(tick);
  }

  const onMove = (e) => {
    tx = (e.clientX / window.innerWidth - 0.5) * 2;
    ty = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  const onScroll = () => {
    sy = window.scrollY || 0;
    if (reduced) draw(0);
  };
  const onResize = () => {
    resize();
    draw(0);
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);

  resize();
  build();
  // Reduced motion: no rAF loop at all, only a single frame per state change.
  if (reduced) draw(0);
  else raf = requestAnimationFrame(tick);

  return {
    /**
     * Apply new options. Rebuilds the star set only when litRatio or count really
     * changed -- the prototype rebuilt all 280 stars on every parent render, so
     * typing in a search box re-rolled the whole sky.
     */
    update(next) {
      if (destroyed || !next) return;
      const litRatio = next.litRatio != null ? next.litRatio : o.litRatio;
      const count = next.count != null ? next.count : o.count;
      if (litRatio === o.litRatio && count === o.count) return;
      o.litRatio = litRatio;
      o.count = count;
      build();
      if (reduced) draw(0);
    },
    flare() {
      if (destroyed) return;
      pulse = Math.min(1, pulse + 0.5);
      if (reduced) draw(0);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      // Drops the context so any in-flight draw() from a queued frame bails out.
      ctx = null;
    },
  };
}
