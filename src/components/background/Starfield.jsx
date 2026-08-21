import { useEffect, useRef } from 'react';
import { createStarfield } from './starfieldEngine';
import { registerSky, unregisterSky } from './starfieldBus';

/**
 * Full-viewport night sky rendered behind the app.
 *
 * - litRatio: share of stars that are lit (driven by the clear rate).
 * - count: star density.
 * - flareable: register on the starfield bus so flareSky() can pulse this canvas.
 *   Left false for screens outside the app shell (login), which have no flare source.
 *
 * The star set is deterministic: litRatio changes relight the same stars instead
 * of generating a new sky.
 */
export default function Starfield({ litRatio = 0.5, count = 280, flareable = false }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  // Carries the latest options into the mount-only effect below, which must not
  // list them as dependencies: re-creating the engine on every litRatio tick would
  // tear down the canvas and drop the accumulated parallax and pulse state.
  const optionsRef = useRef({ litRatio, count });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const engine = createStarfield(canvas, optionsRef.current);
    engineRef.current = engine;
    // StrictMode runs mount effects twice. This cleanup cancels the rAF and removes
    // every window listener, and the canvas element itself is owned by React, so the
    // second pass reuses the same node instead of stacking a second canvas.
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    optionsRef.current = { litRatio, count };
    // Also runs on mount; the engine ignores an update that changes nothing, so the
    // initial star set is built exactly once.
    if (engineRef.current) engineRef.current.update({ litRatio, count });
  }, [litRatio, count]);

  useEffect(() => {
    if (!flareable) return undefined;
    // Proxy through the ref so the bus always reaches the live engine, even when
    // StrictMode swaps the engine underneath a registration that stays put.
    const handle = {
      flare: () => {
        if (engineRef.current) engineRef.current.flare();
      },
    };
    registerSky(handle);
    return () => unregisterSky(handle);
  }, [flareable]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 h-full w-full pointer-events-none"
      aria-hidden="true"
    />
  );
}
