# ACE Remake Auth Setup

## Local development

1. Install dependencies:

```bash
npm install
```

2. Start the auth service:

```bash
npm run dev:auth
```

By default the auth service now targets the legacy game account database instead of the local JSON store.

Optional fallback for local-only development:

```bash
set ACE_AUTH_BACKEND=file
npm run dev:auth
```

3. Start the local static web server from the repo root:

```bash
npm run dev:web
```

4. Open:

```text
http://localhost:8080
```

The homepage auth UI calls `http://localhost:3001` by default when the page itself is running on `localhost` or `127.0.0.1`.

Do not use `python -m http.server 8080` for this repo's local website verification. It does not guarantee `charset=utf-8` on the response headers, which can cause Chinese text to render as mojibake in some browser environments.

## Test commands

Run the full automated suite:

```bash
npm test
```

Run only the auth service tests:

```bash
npm test -- auth-service/tests/auth-api.test.js
```

Run only the auth UI unit tests:

```bash
npm test -- auth-ui.test.js
```

## Auth service behavior

The current implementation includes:

- `POST /auth/register-request`
- `POST /auth/activate`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `GET /health`

The auth service supports two backends:

- default: the legacy game account database (`atum2_db_account.dbo.td_account`)
- fallback: the file-backed adapter under `auth-service/data/`

## Replacing the temporary adapter

The current production-facing path is the direct game-account database adapter in [game-account-store.js](/D:/ACE_Source/AceRemakeWeb/auth-service/src/game-account-store.js).

Its Windows database bridge uses:

- [legacy-game-db-bridge.js](/D:/ACE_Source/AceRemakeWeb/auth-service/src/legacy-game-db-bridge.js)
- [legacy-game-account.ps1](/D:/ACE_Source/AceRemakeWeb/auth-service/scripts/legacy-game-account.ps1)

If you later want to retire direct DB access, replace that bridge with a proper game-side service gateway while keeping the same HTTP contract.

That real adapter should preserve the current HTTP contract but move these responsibilities into the game-side authority:

- account creation request handling
- activation token issuance and validation
- password verification
- password reset token issuance and validation
- blocked / inactive account status checks
- account unique ID lookup

## Deployment note

For production, deploy the static site and auth service separately or behind the same origin reverse proxy.

If the auth service is not same-origin with the website:

- update the `ace-auth-api-base` meta tag in [index.html](/D:/ACE_Source/AceRemakeWeb/index.html)
- keep cookie and CORS settings aligned with the deployed site origin
- replace the default localhost CORS allow-list in [app.js](/D:/ACE_Source/AceRemakeWeb/auth-service/src/app.js)
