import { useEffect, useState } from 'react';
import DdrArrow from './DdrArrow';
import { TEAPOT_PATH } from '../../constants/teapot';
import { navigateTo } from '../../utils/navigation';
import {
  KONAMI_IDLE_MS,
  KONAMI_SEQUENCE,
  advanceKonami,
  isPageTarget,
  toKonamiInput,
} from '../../utils/konamiCode';

// Left to right, the same order as a DDR step zone.
const LANES = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'];

// Progress once the first ↑ has landed. The arrow row shows from here on.
const ROW_VISIBLE_FROM = 2;

// Cap on arrows in flight, in case an animationend never arrives.
const MAX_RISING = 16;

// Sounds are loaded by URL rather than imported: they are copyrighted audio
// and the repository is public, so the files live outside git. Development
// serves them from the git-ignored public/media/, production from a folder
// outside dist/ (deploy/oci-cloudflare/Caddyfile.example).
const COIN_SOUND = '/media/gradiusCoin.mp3';
const LOGO_SOUNDS = ['/media/KonamiLogo1.mp3', '/media/KonamiLogo2.mp3'];

const hideRow = (row) => (row === 'hidden' ? row : 'leaving');

/**
 * Konami-code easter egg: Enter, then ↑ ↑ ↓ ↓ ← → ← → B A, on any screen.
 *
 * Enter plays the Gradius coin sound. From the first ↑ a row of DDR arrows
 * fades in at the bottom-right, and every correct arrow sends a copy of
 * itself up out of its lane. On the final A the egg requests TEAPOT_PATH,
 * which the servers answer with a real `418 I'm a teapot` (`teapotStatus` in
 * vite.config.js, the Caddy rule in production), then plays one of the two
 * Konami logo sounds at random and switches to the teapot screen.
 *
 * That switch is a client-side route change on purpose. A full page load
 * would cut the logo sound off, and a freshly loaded page has not seen a
 * keypress yet, so browsers (Firefox by default) refuse to start audio on it.
 * Opening TEAPOT_PATH directly still gets the 418 as the document status.
 *
 * Mounted once in App.jsx, outside the routes, so it works on public screens
 * as well as inside the app shell.
 */
const KonamiEasterEgg = () => {
  // 'hidden' renders nothing, 'shown' fades the row in, 'leaving' fades it
  // out and drops back to 'hidden' once that fade ends.
  const [row, setRow] = useState('hidden');
  const [rising, setRising] = useState([]);

  useEffect(() => {
    // Plain closure state rather than React state: none of it is drawn, and
    // a keypress that only moves progress along should not re-render.
    let progress = 0;
    let idleTimer;
    let nextId = 0;
    // One Audio per URL, created the first time it is needed, so ordinary
    // visits never download any of the files.
    const sounds = new Map();

    const soundFor = (url) => {
      if (!sounds.has(url)) sounds.set(url, new Audio(url));
      return sounds.get(url);
    };

    const play = (url) => {
      const sound = soundFor(url);
      // Rewinding restarts the sound instead of stacking a second copy.
      sound.currentTime = 0;
      // A missing file or a refused autoplay only costs the sound. The rest
      // of the easter egg carries on.
      sound.play().catch(() => {});
    };

    const reset = () => {
      progress = 0;
      clearTimeout(idleTimer);
      setRow(hideRow);
    };

    const showTeapot = () => {
      const logo = LOGO_SOUNDS[Math.floor(Math.random() * LOGO_SOUNDS.length)];
      const land = () => {
        play(logo);
        navigateTo(TEAPOT_PATH);
      };
      // The request is made for its status, so the network log shows a real
      // 418 before the screen changes. If it fails, the screen still changes.
      fetch(TEAPOT_PATH, { cache: 'no-store' }).then(land, land);
    };

    const handleKeyDown = (event) => {
      if (
        event.defaultPrevented
        || event.repeat
        || event.isComposing
        || event.ctrlKey
        || event.altKey
        || event.metaKey
        || !isPageTarget(event.target)
      ) {
        return;
      }

      const input = toKonamiInput(event);
      if (!input) return;

      progress = advanceKonami(progress, input);

      if (progress === 0) {
        reset();
        return;
      }

      if (progress === KONAMI_SEQUENCE.length) {
        reset();
        showTeapot();
        return;
      }

      clearTimeout(idleTimer);
      idleTimer = setTimeout(reset, KONAMI_IDLE_MS);

      if (progress < ROW_VISIBLE_FROM) {
        // Step one. When Enter restarts a sequence already under way, the
        // row goes away until the next ↑.
        play(COIN_SOUND);
        setRow(hideRow);
        return;
      }

      // Someone is really entering the code, so start loading the logo sounds
      // now. Whichever one gets picked at the end then plays without a delay.
      LOGO_SOUNDS.forEach(soundFor);

      setRow('shown');
      if (LANES.includes(input)) {
        const arrow = { id: nextId, direction: input };
        nextId += 1;
        setRising((current) => [...current.slice(1 - MAX_RISING), arrow]);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(idleTimer);
      sounds.forEach((sound) => sound.pause());
    };
  }, []);

  if (row === 'hidden' && rising.length === 0) return null;

  const finishRowFade = () => setRow((current) => (current === 'leaving' ? 'hidden' : current));
  const landArrow = (id) => setRising((current) => current.filter((arrow) => arrow.id !== id));

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed right-6 bottom-6 z-[120] flex gap-1.5"
    >
      {LANES.map((direction) => (
        <div key={direction} className="relative size-11">
          {row !== 'hidden' && (
            <div
              className={row === 'leaving' ? 'animate-ddr-row-out' : 'animate-ddr-row-in'}
              onAnimationEnd={finishRowFade}
            >
              <DdrArrow direction={direction} className="size-11 opacity-70" />
            </div>
          )}

          {rising
            .filter((arrow) => arrow.direction === direction)
            .map((arrow) => (
              <div
                key={arrow.id}
                className="absolute inset-0 animate-ddr-rise motion-reduce:animate-ddr-rise-still"
                onAnimationEnd={() => landArrow(arrow.id)}
              >
                <DdrArrow direction={direction} className="size-11" />
              </div>
            ))}
        </div>
      ))}
    </div>
  );
};

export default KonamiEasterEgg;
