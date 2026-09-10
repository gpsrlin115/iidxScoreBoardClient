# Google account login and linking

The client continues using the server session and the existing `/users/me` response. Google tokens are never read by the client or stored in browser storage. No Google client secret or client ID belongs in Vite configuration.

## Browser flow

- `/login`: Google login remains available when new signup/link enrollment is paused. If provider discovery fails or Google is disabled, password login still works.
- `/signup`: optional Google entry. Existing password signup remains unchanged. Google enrollment is hidden when the provider is off and disabled with guidance when enrollment is paused.
- `/signup/google`: publicly accessible pending-signup screen. It asks for a trimmed 3–50 character site username; pending Google authentication does not update the auth store. It explains how existing users can recover/login and link from their profile.
- `/profile`: the existing protected layout now displays current contact details and login methods. Linking requires the current password, a Google selection, and an explicit confirmation showing the selected Google email and current site username. Google-only accounts can reauthenticate with their linked Google identity to add an initial password of at least eight characters.
- There are no unlink, replace, merge, or arbitrary return-URL controls.

The callback redirects are owned by the server: `/`, `/signup/google`, `/profile?google=pending`, or `/login`/`/profile` with `googleError=CODE`. Unknown error codes use safe generic copy; raw server messages are not rendered. Pending metadata has a five-minute server deadline and is invalidated on screen when that deadline passes.

## Transport and compatibility

`src/api/googleAuth.js` wraps provider discovery, pending state, login methods, flow start, signup confirmation, linking confirmation, and initial password creation. Every new POST first fetches `/csrf`; the existing Axios interceptor then reads the raw `XSRF-TOKEN` cookie for `X-XSRF-TOKEN`. The JSON CSRF token is deliberately unused.

Only `401 INVALID_CREDENTIALS` from exact `/auth/google/start` bypasses global session-expiry handling. A wrong current password therefore leaves the signed-in user and their caches intact. `AUTH_REQUIRED` and session-mismatch failures retain normal logout behavior; `410 FLOW_EXPIRED` stays an inline flow error. Successful mutations refresh `/users/me` through the existing auth store so its identity/cache-reset subscription remains authoritative. A saved mutation is not repeated if the follow-up refresh fails.

If a profile callback arrives after the session expires, the route guard preserves its safe Google error code when redirecting to login. Unrelated protected routes keep their previous login redirect.

Use the existing `VITE_API_BASE_URL` and `/api` Vite/Caddy proxy. The `authorizationUrl` comes from the server, and navigation is a top-level browser redirect rather than an Axios Google request.

## Validation

Run `npm test`, `npm run lint`, and `npm run build`. Node tests cover the narrow credential-recheck exception, safe error mapping, pending intent/deadline validation, username/password constraints, CSRF request ordering, and non-replay of failed confirmations.

Implementation checks on 2026-08-31: all 96 Node tests, ESLint, and the production build passed. In-app Browser screenshots and interaction checks used disposable local HTTP fixtures at 1280px and 390px widths: login, duplicate username, pending expiry, password-recheck rejection without logout, link confirmation/success, initial-password form, enrollment pause, and disabled-provider fallback. Mobile content had no horizontal overflow. These fixtures do not validate real Google credentials, signed tokens, or deployment cookies; those remain server integration/release checks. The fixture initially omitted `Cache-Control`, which allowed a cached 410 to outlive the scenario; fresh no-store fixtures resolved it. Real pending responses, including errors, must be no-store.

Before enabling production Google login, validate with the real backend and test Google clients:

1. Password signup/login/recovery and existing sessions remain usable with Google disabled and when provider discovery fails.
2. Google signup stays unauthenticated until site-username confirmation; duplicate username/email errors remain actionable.
3. Linking a different email preserves the site identity, role and records. Wrong-password recheck does not log out; duplicate linking or expired sessions cannot confirm.
4. Google cancellation and wrong-account reauthentication display the correct message. Refreshing the signup/confirmation screen preserves only the server's pending flow, and expiry removes confirmation controls.
5. Initial password setup requires linked-account reauthentication, rejects mismatching confirmation, and cannot overwrite an existing password.
6. Test actual redirect/cookie/CSRF behavior behind HTTPS and on mobile; unit tests and UI fixtures do not establish provider or deployment readiness.

The button uses Google's unmodified [official G asset](https://developers.google.com/static/identity/images/g-logo.png), Google Sans from Google Fonts, and the light button colors/padding in the [branding guidelines](https://developers.google.com/identity/branding-guidelines). No GIS runtime is loaded.
