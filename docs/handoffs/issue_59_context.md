# Feature: Fix Environment API URL Configuration (SSL/Domain Error)

**GitHub Issue:** [#59](https://github.com/Gulybi/KanbAI-Web/issues/59)
**Milestone:** None (tracked as a `bug` label)
**Branch:** _(to be created; at time of writing the active branch is `58-clean-up-landing-page-content-remove-ai-hallucinations`)_

## Business Value

### Who is this for?
- **Developers running the app locally** (`ng serve` against a local .NET backend on `http://localhost:5257/api`) who today cannot exercise any authenticated feature because every HTTP request goes to the wrong host.
- **Anyone demoing or QA-testing a development build** — product owner, prospective beta testers, reviewers looking at a local/staging preview — who currently see "New Project" (and every other API call) fail in the browser console.
- **The engineering team's velocity**, because every open and future issue that touches the backend (project create, members, auth, board work, file uploads, SignalR) is blocked from local verification until this misconfiguration is fixed.

### Why is it valuable?
The entire point of issue [#9](https://github.com/Gulybi/KanbAI-Web/issues/9) (already closed) was to let services reference a single `environment.apiUrl` constant so no URL is ever hardcoded. That work shipped the two environment files and the `Environment` interface, but the Angular build configuration was never wired to swap between them. As a result, even development builds bundle the production URL (`https://api.kanbai.com`), and that domain does not resolve to a valid TLS certificate for the developer's local setup — producing `net::ERR_SSL_UNRECOGNIZED_NAME_ALERT` on every request.

Fixing this is valuable because:
- **Unblocks all authenticated flows in development.** Today clicking "New Project" on the dashboard, logging in, registering, or loading project members all fail. Dashboard empty-state (#62) and members UI (#33) appear to work only until the user tries to hit the API.
- **Restores trust in the environment abstraction.** Issue #9's acceptance criterion — "services reference `environment.apiUrl` without hardcoding" — is technically true in code, but the abstraction is useless if both environments always resolve to the production URL. Fixing this delivers the real intent of #9.
- **Prevents accidental production calls from a dev machine.** A developer running `ng serve` against a local `localhost:5257` backend could, in edge cases, have their browser resolve `api.kanbai.com` to a live server — leaking test data or triggering real side effects. Pointing dev builds at localhost eliminates that risk.
- **Is a prerequisite for downstream real-time and attachment work.** Issues #45 (SignalR client) and #48–#52 (file uploads) will also depend on `environment.apiUrl`. Shipping this fix now prevents each of those stories from rediscovering the same defect.

### What problem does it solve?
**Problem:** Running the Angular app via `ng serve` (or any `ng build --configuration development`) still bundles the production `environment.ts` (which defines `apiUrl: 'https://api.kanbai.com'`). Every HTTP call — login, register, project list, project create, members management — is directed at that production host. The browser fails the TLS handshake and reports `net::ERR_SSL_UNRECOGNIZED_NAME_ALERT`. The visible symptom on the dashboard is that the "New Project" button (and every other authenticated action) never completes: the modal submits, no project appears, and the console fills with SSL errors.

**Root cause (verified in the codebase):**
- `KanbAI-Web/src/environments/environment.ts` — used by default builds — declares `apiUrl: 'https://api.kanbai.com'`.
- `KanbAI-Web/src/environments/environment.development.ts` exists and correctly declares `apiUrl: 'http://localhost:5257/api'`.
- `KanbAI-Web/angular.json` does **not** define a `fileReplacements` entry under the `development` build configuration. Without that replacement, Angular's build system never substitutes `environment.ts` with `environment.development.ts`, so every consumer of `import { environment } from '../../../environments/environment'` receives the production constant regardless of `ng serve` vs `ng build`.
- All downstream services (`AuthService`, `ProjectStateService`, the auth interceptor, `example-user-state.service`) read `environment.apiUrl` correctly — the defect is configuration-only, not service-code.

**Solution (framed as WHAT, not HOW — staff-engineer decides the mechanism):** Ensure that when the application is built or served in the "development" configuration, every module importing `environment` receives the development values (`production: false`, `apiUrl: 'http://localhost:5257/api'`), while the default/production build continues to receive the production values. The developer's definition of "fixed" is: after starting `ng serve` against a running local backend on port 5257, clicking "New Project" on the dashboard successfully creates the project and the browser console shows zero SSL/domain errors.

---

## Current State vs Desired State

### Current State

**Configuration files (as of this branch):**
- `KanbAI-Web/src/environments/environment.ts` — production, `apiUrl: 'https://api.kanbai.com'`.
- `KanbAI-Web/src/environments/environment.development.ts` — development, `apiUrl: 'http://localhost:5257/api'`.
- `KanbAI-Web/src/app/core/models/environment.interface.ts` — `Environment` interface declaring `production: boolean` and `apiUrl: string`.
- `KanbAI-Web/angular.json` — defines `production` and `development` build configurations but **contains no `fileReplacements` array** under either. No proxy config (`proxy.conf.json`) exists in the repo.

**Consumers of `environment.apiUrl` (all functionally correct, no code change needed in these files):**
- `KanbAI-Web/src/app/core/services/AuthService.ts` — `private readonly apiUrl = \`${environment.apiUrl}/auth\`;`
- `KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts` — attaches bearer tokens only to requests whose URL starts with `environment.apiUrl`.
- `KanbAI-Web/src/app/features/projects/state/project-state.service.ts` — issues `GET`/`POST` against `${environment.apiUrl}/project`.
- `KanbAI-Web/src/app/core/state/example-user-state.service.ts` — issues `GET` against `${environment.apiUrl}/auth/me`.

**Observed behaviour when running `ng serve` against a local backend:**
1. Developer starts the backend locally on `http://localhost:5257/api`.
2. Developer runs `ng serve` (defaults to `development` configuration).
3. Browser loads the app, user logs in, navigates to `/dashboard`, clicks "New Project", fills the form, submits.
4. The browser attempts to `POST https://api.kanbai.com/project`.
5. TLS handshake fails → `net::ERR_SSL_UNRECOGNIZED_NAME_ALERT` in the console; the modal shows a generic failure, no project appears on the dashboard.
6. Same failure mode applies to login, register, project list load, member list load, and any future authenticated call.

### Desired State

**Expected behaviour after the fix:**
- Running `ng serve` (or `npm start`, if that is the project's alias) produces a bundle in which `environment.apiUrl` resolves to `http://localhost:5257/api`.
- Running `ng build` (default / `production` configuration) produces a bundle in which `environment.apiUrl` resolves to the production URL defined in `environment.ts`.
- Running `ng build --configuration development` produces a bundle that also resolves to the development URL.
- No source file outside `src/environments/` contains a hardcoded API host. (The interface's JSDoc examples are allowed to reference `api.kanbai.com` as illustrative text, but no runtime code should.)

**Expected user flow after the fix (manual verification):**
1. Start local backend on `http://localhost:5257`.
2. Run `ng serve` from `KanbAI-Web/KanbAI-Web/`.
3. Navigate to the app in a fresh browser tab; open DevTools → Network and Console.
4. Register a new account (or log in with an existing one). The `POST /auth/register` (or `/auth/login`) request visible in Network targets `http://localhost:5257/api/auth/...` and returns a 2xx.
5. Navigate to `/dashboard`. The `GET /project` request targets `http://localhost:5257/api/project` and returns a 2xx.
6. Click "New Project", fill in a name, submit. The `POST /project` request targets `http://localhost:5257/api/project`, returns a 2xx, and the new project appears in the grid without a page reload.
7. Console contains zero `ERR_SSL_UNRECOGNIZED_NAME_ALERT` errors and zero requests to `api.kanbai.com`.

**Non-goals (explicitly out of scope for #59):**
- Changing the actual URL values in either `environment.ts` or `environment.development.ts`. The production URL remains `https://api.kanbai.com` (whether or not that host is live is a separate concern). The development URL remains `http://localhost:5257/api`.
- Introducing staging / preview / per-developer environment files. Only the two existing configurations (production and development) must work correctly.
- Refactoring how services consume the environment (e.g., turning it into an `InjectionToken`). Services already use it correctly; the staff-engineer may revisit this if they judge it essential, but it is not required by this issue.
- Adding a dev-server proxy (`proxy.conf.json`). The issue asks for correct environment resolution, not a proxy. The staff-engineer may discuss proxy as an alternative, but the acceptance criteria below target the environment-resolution outcome directly.

---

## Milestone Context

**Milestone:** None assigned. This is a `bug` label issue.

### Prerequisite Issues
- [#9](https://github.com/Gulybi/KanbAI-Web/issues/9) — Define Environment Variables and API Constants — **CLOSED**. Shipped both environment files and the `Environment` interface. Issue #59 is the follow-up that completes #9's intent by wiring Angular's build to actually swap between them.

### Downstream Issues
- Every currently OPEN issue that touches an authenticated HTTP call depends on this fix working locally. At time of writing this especially includes:
  - [#45](https://github.com/Gulybi/KanbAI-Web/issues/45) — Setup SignalR Client Service — **OPEN**. Will also consume an `apiUrl`-style constant.
  - [#46](https://github.com/Gulybi/KanbAI-Web/issues/46) — Integrate Real-time Events with State Management — **OPEN**.
  - [#47](https://github.com/Gulybi/KanbAI-Web/issues/47) — Implement Visual Drag-and-Drop — **OPEN** (will need to persist board state via the API).
  - [#48](https://github.com/Gulybi/KanbAI-Web/issues/48)–[#52](https://github.com/Gulybi/KanbAI-Web/issues/52) — File upload / attachment work — **OPEN**. All will POST to the backend.
- No downstream issue is formally "blocked by" #59 in GitHub's tracker, but in practice every future feature with a backend dependency will fail the same way locally until this is fixed.

### Related Work
- [#58](https://github.com/Gulybi/KanbAI-Web/issues/58) — Clean Up Landing Page Content — **MERGED on this branch**. Independent bug (content-only). Not a prerequisite.
- [#33](https://github.com/Gulybi/KanbAI-Web/issues/33) — Project Members Management UI — **CLOSED**. The members feature is shipped in code but cannot be exercised locally until #59 is fixed.
- [#62](https://github.com/Gulybi/KanbAI-Web/issues/62) — Dashboard empty state — **MERGED**. Same caveat: the empty state is reachable, but creating a project to leave the empty state requires this fix.

---

## Acceptance Criteria

Each criterion below is observable either in the rendered application or in the repository configuration, and testable by a human reviewer, an automated test, or an inspection of the built bundle.

### Build-time environment resolution

- [ ] **AC1 — Development builds resolve to the localhost URL.** After running `ng build --configuration development` (or `ng serve`) from `KanbAI-Web/KanbAI-Web/`, the emitted JavaScript bundle(s) contain the string `http://localhost:5257/api` and do NOT contain the string `https://api.kanbai.com`. (Reviewer grep/search verification on the `dist/` output is sufficient.)
- [ ] **AC2 — Production builds resolve to the production URL.** After running `ng build` (default, which resolves to the `production` configuration per `angular.json`), the emitted JavaScript bundle(s) contain the string `https://api.kanbai.com` and do NOT contain the string `http://localhost:5257/api`.
- [ ] **AC3 — `npm start` (or the equivalent alias for `ng serve`) yields the development values.** Starting the dev server and inspecting any network request triggered by the running app shows the request URL targets `localhost:5257/api`, not `api.kanbai.com`.

### End-to-end behaviour against a local backend

- [ ] **AC4 — Login succeeds locally.** With a local backend running on `http://localhost:5257`, submitting valid credentials from `/login` results in a 2xx response from `http://localhost:5257/api/auth/login`, the user is redirected to `/dashboard`, and the browser console contains zero SSL errors.
- [ ] **AC5 — Dashboard loads projects locally.** With a logged-in user, visiting `/dashboard` triggers a `GET http://localhost:5257/api/project` request that returns 2xx (or an empty-list 2xx), and the dashboard renders either the project grid or the empty state without SSL errors.
- [ ] **AC6 — "New Project" succeeds locally.** Clicking the "New Project" button on the dashboard, filling the form, and submitting results in a `POST http://localhost:5257/api/project` request, a 2xx response, and the new project appearing in the grid without a full page reload.
- [ ] **AC7 — Zero SSL/domain errors in console during a full happy-path session.** Across a manual session covering register → login → dashboard → create project → members page, the browser console contains zero occurrences of `ERR_SSL_UNRECOGNIZED_NAME_ALERT`, zero occurrences of the substring `api.kanbai.com` in any network log entry, and no CORS-related failures caused by targeting the wrong host.

### Regression guard

- [ ] **AC8 — No hardcoded API host remains in application code.** A repository-wide search for the substring `api.kanbai.com` returns matches only in: (a) `src/environments/environment.ts`, (b) `src/environments/environment.spec.ts` (existing tests that assert on the production value), and (c) the JSDoc comments in `src/app/core/models/environment.interface.ts`. No matches appear in service files, interceptors, components, or templates.
- [ ] **AC9 — Existing environment tests still pass.** The 30-plus assertions in `src/environments/environment.spec.ts` (covering production URL, development URL, URL structure, and security checks) continue to pass. Any test whose intent is superseded by the fix is updated in-place rather than deleted, and new tests are added for any newly introduced configuration file (see AC10).
- [ ] **AC10 — Fix is covered by automated verification.** The PR adds at least one automated check that would fail if a future change reverts this fix. Acceptable forms include: (a) a unit test asserting that `environment.apiUrl` equals the development URL when imported under the `development` build configuration (if the staff-engineer chooses the `fileReplacements` approach, this may be an existing test), (b) a build-script / CI check that greps the dev-build output for `api.kanbai.com` and fails if found, or (c) an equivalent mechanism proposed by the staff-engineer.
- [ ] **AC11 — Full test suite stays green.** `npm run test -- --watch=false` (Vitest) reports zero INTRODUCED failures relative to the baseline on `main`. Pre-existing skipped or failing tests unrelated to environment configuration do not need to be fixed here but must be called out in the handoff.
- [ ] **AC12 — Build succeeds in both configurations.** `npm run build` (production) and `ng build --configuration development` both complete with exit code 0 and no errors reported in the console output.

### Edge cases

- [ ] **AC13 — Trailing-slash handling is unchanged.** Neither `environment.apiUrl` value gains or loses a trailing slash as a side-effect of this fix; the existing tests asserting "should not have trailing slash in apiUrl" continue to pass for both environments.
- [ ] **AC14 — Interceptor token-attachment still gates on `environment.apiUrl`.** After the fix, the auth interceptor continues to attach the bearer token only to requests whose URL starts with the (now correctly resolved) `environment.apiUrl`. Verified by: logging in, triggering any authenticated call in `ng serve`, and confirming in Network that the `Authorization: Bearer …` header is present on the request to `localhost:5257/api/...`.
- [ ] **AC15 — No new runtime dependencies introduced.** The fix does not add a new npm package to `dependencies` or `devDependencies`. (Configuration changes in `angular.json` and possibly `tsconfig.*.json` are in scope; new npm packages are not.)

---

*Prepared by the product-manager agent as input for the staff-engineer phase.*
