import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TEAPOT_PATH } from './src/constants/teapot.js';

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
export default defineConfig({
  plugins: [react(), tailwindcss(), teapotStatus()],
  worker: { format: 'es' },
  server: {
    allowedHosts: ['entryway-manhole-colony.ngrok-free.dev'],
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        headers: {
          Origin: 'http://localhost:5173',
        },
        secure: false,
      },
    },
  },
});
