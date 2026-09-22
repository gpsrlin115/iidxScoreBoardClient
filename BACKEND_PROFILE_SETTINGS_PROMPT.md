# Backend handoff: profile and account settings

Implement the profile-account API in `C:\Users\Administrator\IdeaProjects\iidxScoreBoard\server` only. Do not change the client repository.

## Safety and baseline

- Run `git fetch --prune origin` and inspect `git status --short --branch` first.
- Preserve the existing dirty/diverged `main` checkout. Work from a clean, isolated checkout of latest `origin/dev`; do not reset, force-checkout, rebase, force-push, merge, deploy, commit, push, or create a PR.
- Google OAuth PR #38 is in `dev`. Keep Spring Session/JDBC authentication, Google account linking, and Google re-authenticated initial-password setup working.

## Required behavior

Keep `username` immutable and internal for authentication, ownership, and audit. Add a unique public nickname, an optional private IIDX-ID, password change for password-enabled accounts, and safe avatar replacement.

### Data and migration

- Add `users.nickname VARCHAR(50) NOT NULL`.
- Add `users.nickname_normalized VARCHAR(50) NOT NULL UNIQUE`.
- Add `users.iidx_id CHAR(8) NULL UNIQUE`.
- Backfill existing `nickname` from `username`; do not overwrite or silently merge colliding data. Add an equivalent H2 test migration.
- Add a new timestamp Flyway migration; never rename an already-applied migration.
- General and Google signup must initialize both nickname fields from username.
- Normalize nickname with NFKC, trim, collapsed internal whitespace, and `Locale.ROOT` lower-case for the unique key. After normalization, permit 2–50 characters and reject control characters and line breaks.
- Accept `12345678` or `1234-5678` as IIDX-ID; store only eight digits, return `1234-5678`, allow null to clear, and enforce global uniqueness. This is a crawler target key, not ownership proof.

### HTTP contract

`GET /api/users/me` keeps its existing fields and adds `nickname` and formatted nullable `iidxId`.

`PUT /api/users/me/profile` accepts:

```json
{ "nickname": "DJ NAME", "iidxId": "1234-5678" }
```

`iidxId: null` clears the saved ID. The authenticated user can update only their own row, and success returns the updated `UserResponse`.

`POST /api/users/me/password` accepts:

```json
{ "currentPassword": "old-password", "newPassword": "new-password" }
```

Require the current password, preserve the existing eight-character minimum, reject an unchanged password, and return `204`. For a Google-only account return `PASSWORD_NOT_ENABLED`; retain the existing Google re-authenticated initial-password flow instead of adding a bypass.

The existing avatar routes remain unchanged:

- `POST /api/users/me/avatar`
- `DELETE /api/users/me/avatar`

Enforce JPEG/PNG/GIF/WebP magic bytes and 5MB maximum. Write a replacement first, update the DB, then best-effort remove the old file. On a DB/write failure, preserve the prior avatar and clean up a new orphan.

### Sessions, errors, and public names

- A successful password change deletes unused reset tokens, records a `PASSWORD_CHANGE` audit event, and invalidates every other Spring Session for the same principal while retaining the session that made the request.
- Rate limit `POST /api/users/me/password` to ten requests per IP per minute.
- Return `{ "error", "code", "message" }` without internal exception details.

| Status | Code |
| --- | --- |
| 409 | `NICKNAME_TAKEN`, `IIDX_ID_TAKEN`, `PASSWORD_NOT_ENABLED` |
| 400 | `INVALID_NICKNAME`, `INVALID_IIDX_ID`, `INVALID_CURRENT_PASSWORD`, `INVALID_NEW_PASSWORD`, `PASSWORD_UNCHANGED` |
| 401 / 403 / 429 | Preserve the current authentication, CSRF, and retry contracts |

- Add `nickname` to public `ChartCommentDto` output. During the client transition, retain the legacy `username` JSON property but populate it with the nickname, never the actual login username. Keep internal audit and authorization uses of username unchanged.

## Tests and report

Cover MySQL/H2 migration parity, backfill, signup defaults, normalization and concurrent uniqueness, IIDX-ID lifecycle, authorization/CSRF, password/session/reset-token behavior, avatar failure safety, and comment username non-disclosure. Run the full Gradle suite and `bootJar`.

Report changed files, migration names, API examples, validation commands/results, and remaining limitations. Exclude crawler jobs, public profiles, username/email changes, nickname history, Google unlink/replacement, client edits, and deployment.
