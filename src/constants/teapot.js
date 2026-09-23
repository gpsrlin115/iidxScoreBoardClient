/**
 * Path of the teapot screen the Konami-code easter egg lands on.
 *
 * Three places must agree on it: the SPA route in `App.jsx`, the easter egg
 * that navigates there, and the `teapotStatus` plugin in `vite.config.js`
 * that answers it with a real 418. The production Caddy rule
 * (`deploy/oci-cloudflare/Caddyfile.example`) cannot import this and spells
 * the path out, so change both together.
 */
export const TEAPOT_PATH = '/418';
