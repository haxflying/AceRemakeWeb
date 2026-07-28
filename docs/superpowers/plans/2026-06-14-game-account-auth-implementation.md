# Game Account Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working ACE Remake website auth slice with a static-site auth UI, a Node.js auth service, and a pluggable game-account adapter boundary that can later be wired to the legacy server stack.

**Architecture:** Keep the existing static homepage as the frontend shell, add modal-based auth flows in browser JavaScript, and add a separate `auth-service` Express app that owns cookies, validation, email-token flows, and an adapter interface for the game account backend. For this implementation pass, ship a file-backed local adapter so the flow runs end-to-end while keeping the service boundary ready for real game-side integration.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js, Express, Vitest, Supertest

---

### Task 1: Bootstrap the auth-service workspace and its first failing API tests

**Files:**
- Create: `D:\ACE_Source\AceRemakeWeb\package.json`
- Create: `D:\ACE_Source\AceRemakeWeb\auth-service\tests\auth-api.test.js`

- [ ] **Step 1: Write the failing auth API tests**

```js
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("auth api", () => {
  it("registers, activates, logs in, reads session, logs out", async () => {
    const app = createApp({ dataDir: "auth-service/.tmp-test" });
    const registerResponse = await request(app)
      .post("/auth/register-request")
      .send({
        accountName: "pilot001",
        password: "Secret123!",
        email: "pilot@example.com",
        agreeToTerms: true
      });

    expect(registerResponse.status).toBe(200);
    expect(registerResponse.body.ok).toBe(true);
    expect(registerResponse.body.activationToken).toEqual(expect.any(String));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- auth-service/tests/auth-api.test.js`
Expected: FAIL because `auth-service/src/app.js` does not exist yet

- [ ] **Step 3: Add package metadata and test scripts**

```json
{
  "name": "ace-remake-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev:auth": "node auth-service/src/server.js",
    "test": "vitest run"
  },
  "dependencies": {
    "cookie-parser": "^1.4.7",
    "express": "^4.21.2"
  },
  "devDependencies": {
    "supertest": "^7.1.1",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 4: Re-run the failing test**

Run: `npm test -- auth-service/tests/auth-api.test.js`
Expected: FAIL because `createApp` is still undefined or app module missing

- [ ] **Step 5: Commit**

```bash
git add package.json auth-service/tests/auth-api.test.js
git commit -m "test: add failing auth api bootstrap tests"
```

### Task 2: Implement the auth service with file-backed account state and session cookies

**Files:**
- Create: `D:\ACE_Source\AceRemakeWeb\auth-service\src\app.js`
- Create: `D:\ACE_Source\AceRemakeWeb\auth-service\src\file-store.js`
- Create: `D:\ACE_Source\AceRemakeWeb\auth-service\src\session-store.js`
- Create: `D:\ACE_Source\AceRemakeWeb\auth-service\src\server.js`
- Modify: `D:\ACE_Source\AceRemakeWeb\auth-service\tests\auth-api.test.js`

- [ ] **Step 1: Expand the failing tests to cover the full flow**

```js
expect(registerResponse.body.activationToken).toEqual(expect.any(String));

const activateResponse = await request(app)
  .post("/auth/activate")
  .send({ token: registerResponse.body.activationToken });
expect(activateResponse.status).toBe(200);

const loginResponse = await request(app)
  .post("/auth/login")
  .send({ accountName: "pilot001", password: "Secret123!" });
expect(loginResponse.status).toBe(200);
expect(loginResponse.headers["set-cookie"]).toBeTruthy();

const cookie = loginResponse.headers["set-cookie"][0].split(";")[0];
const meResponse = await request(app)
  .get("/auth/me")
  .set("Cookie", cookie);
expect(meResponse.body.authenticated).toBe(true);

const logoutResponse = await request(app)
  .post("/auth/logout")
  .set("Cookie", cookie);
expect(logoutResponse.body.ok).toBe(true);
```

- [ ] **Step 2: Run the test to verify it fails for the missing endpoints**

Run: `npm test -- auth-service/tests/auth-api.test.js`
Expected: FAIL with 404 or missing handler assertions

- [ ] **Step 3: Implement the minimal auth service**

```js
app.post("/auth/register-request", ...);
app.post("/auth/activate", ...);
app.post("/auth/login", ...);
app.get("/auth/me", ...);
app.post("/auth/logout", ...);
app.post("/auth/forgot-password", ...);
app.post("/auth/reset-password", ...);
```

Implementation requirements:
- persist accounts, activation tokens, reset tokens in a JSON file under `auth-service/data`
- create `sid` session cookies
- return stable JSON error codes
- include test-only token values in responses only when `exposeTestTokens` is enabled

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- auth-service/tests/auth-api.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add auth-service/src auth-service/tests/auth-api.test.js
git commit -m "feat: add auth service core flows"
```

### Task 3: Add the website auth UI and front-end controller with failing UI tests first

**Files:**
- Create: `D:\ACE_Source\AceRemakeWeb\auth-ui.js`
- Create: `D:\ACE_Source\AceRemakeWeb\auth-ui.test.js`
- Create: `D:\ACE_Source\AceRemakeWeb\auth.css`
- Modify: `D:\ACE_Source\AceRemakeWeb\index.html`

- [ ] **Step 1: Write the failing UI controller tests**

```js
import { describe, expect, it } from "vitest";
import { buildAuthViewModel } from "./auth-ui.js";

describe("buildAuthViewModel", () => {
  it("shows guest actions when unauthenticated", () => {
    expect(buildAuthViewModel({ authenticated: false }).ctaLabel).toBe("登录 / 注册");
  });

  it("shows account actions when authenticated", () => {
    expect(buildAuthViewModel({
      authenticated: true,
      user: { accountName: "pilot001" }
    }).ctaLabel).toBe("pilot001");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- auth-ui.test.js`
Expected: FAIL because `auth-ui.js` does not exist yet

- [ ] **Step 3: Implement the front-end controller and page wiring**

```js
export function buildAuthViewModel(session) {
  return session?.authenticated
    ? { ctaLabel: session.user.accountName, guest: false }
    : { ctaLabel: "登录 / 注册", guest: true };
}
```

Implementation requirements:
- add login/register/forgot/reset/activate modal markup to `index.html`
- load `auth.css` and `auth-ui.js`
- render navbar auth button state from `GET /auth/me`
- submit forms to `/auth/*`
- parse `?activate=` and `?reset=` query params to open the matching flow

- [ ] **Step 4: Run the UI tests**

Run: `npm test -- auth-ui.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add index.html auth.css auth-ui.js auth-ui.test.js
git commit -m "feat: add static site auth ui"
```

### Task 4: Verify the integrated flow and document how to run it

**Files:**
- Create: `D:\ACE_Source\AceRemakeWeb\AUTH_SETUP.md`
- Modify: `D:\ACE_Source\AceRemakeWeb\netlify.toml`
- Modify: `D:\ACE_Source\AceRemakeWeb\.gitignore`

- [ ] **Step 1: Add a dev/proxy note and local data ignores**

```gitignore
auth-service/data/
auth-service/.tmp-test/
```
```md
npm install
npm run dev:auth
python -m http.server 8080
```

- [ ] **Step 2: Add a static-site deployment note**

Document:
- auth service origin and `ACE_AUTH_API_BASE`
- cookie requirements
- the future replacement point for the file-backed adapter with the real game backend

- [ ] **Step 3: Run the full verification**

Run:
- `npm test`
- `node auth-service/src/server.js`

Expected:
- test suite PASS
- auth service starts and prints listening URL

- [ ] **Step 4: Commit**

```bash
git add AUTH_SETUP.md netlify.toml .gitignore
git commit -m "docs: add auth setup and deployment notes"
```
