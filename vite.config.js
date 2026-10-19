import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { resolve } from 'node:path';
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TEAPOT_PATH } from './src/constants/teapot.js';
import { NOTE_RADAR_MOCK_API_CONTEXT, NOTE_RADAR_MOCK_ORIGIN } from './scripts/note-radar-mock-contract.mjs';
import { createNoteRadarMockProxyGuard } from './scripts/note-radar-mock-proxy.mjs';

/**
 * Answers TEAPOT_PATH with a real `418 I'm a teapot` under `vite` and
 * `vite preview`, the same way the Caddy rule in
 * deploy/oci-cloudflare/Caddyfile.example does in production. The body is
 * still index.html, so the app boots and its TEAPOT_PATH route draws the
 * teapot screen.
 *
 * The response is written out here in full. Setting res.statusCode and
 * calling next() does not work: Vite's own HTML middleware sets the status
 * back to 200 when it sends index.html.
 */
const teapotStatus = () => {
  const isTeapotRequest = (req) => (
    (req.method === 'GET' || req.method === 'HEAD')
    && req.url?.split('?')[0] === TEAPOT_PATH
  );

  const sendTeapot = (res, html) => {
    res.statusCode = 418;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(html);
  };

  return {
    name: 'teapot-status',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!isTeapotRequest(req)) return next();
        try {
          const template = await readFile(resolve(server.config.root, 'index.html'), 'utf-8');
          // The dev index.html only works after Vite's transforms (client
          // script, React refresh preamble), so send the transformed copy.
          sendTeapot(res, await server.transformIndexHtml(req.url, template, req.originalUrl));
        } catch (error) {
          next(error);
        }
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!isTeapotRequest(req)) return next();
        try {
          const outDir = resolve(server.config.root, server.config.build.outDir);
          sendTeapot(res, await readFile(resolve(outDir, 'index.html'), 'utf-8'));
        } catch (error) {
          next(error);
        }
      });
    },
  };
};

// https://vite.dev/config/
export default defineConfig(({ command, mode, isPreview }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const mock = env.VITE_NOTE_RADAR_MOCK === '1';
  if (mock && (command !== 'serve' || isPreview)) {
    throw new Error('VITE_NOTE_RADAR_MOCK=1 is only supported by the Vite development server. Disable mock mode before build or preview.');
  }
  return {
    plugins: [react(), tailwindcss(), teapotStatus(), ...(mock ? [createNoteRadarMockProxyGuard()] : [])],
    // Vite 8 raised the default 'baseline-widely-available' target to Chrome/Edge 111,
    // Firefox 114 and Safari 16.4. Keep the Vite 7 baseline so the upgrade does not
    // quietly drop browsers the app supports today.
    build: { target: ['chrome107', 'edge107', 'firefox104', 'safari16'] },
    worker: { format: 'es' },
    server: {
      allowedHosts: ['entryway-manhole-colony.ngrok-free.dev'],
      proxy: {
        [mock ? NOTE_RADAR_MOCK_API_CONTEXT : '/api']: {
          target: mock ? NOTE_RADAR_MOCK_ORIGIN : 'http://localhost:8080',
          changeOrigin: true,
          headers: {
            Origin: 'http://localhost:5173',
          },
          secure: false,
        },
      },
    },
  };
});
