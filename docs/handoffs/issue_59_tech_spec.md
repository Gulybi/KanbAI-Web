# Technical Specification: Fix Environment API URL Configuration (SSL/Domain Error)

**Context Document:** [issue_59_context.md](./issue_59_context.md)
**GitHub Issue:** [#59](https://github.com/Gulybi/KanbAI-Web/issues/59)
**Branch (to create):** `59-fix-environment-api-url-configuration` off `main` (current working branch `58-...` is unrelated — do not stack)

## Overview

This is a **configuration-only fix**. Angular's build system is wired so `ng build`/`ng serve` correctly swap `src/environments/environment.ts` for `src/environments/environment.development.ts` under the `development` configuration, while the production build (the default for `ng build`) keeps the existing file. No TypeScript source code changes. No new components, routes, services, or state. The fix lives entirely in [KanbAI-Web/angular.json](../../KanbAI-Web/angular.json) plus one new regression test.

## Key Design Decisions

1. **Mechanism: `fileReplacements` in `angular.json`.** Standard Angular pattern (documented since v2). The only well-supported alternative is an `InjectionToken` + runtime environment detection, which (a) is explicitly marked out-of-scope by AC refactoring non-goals in the context doc, (b) adds runtime cost and code changes to every consumer, and (c) is not needed because the defect is a missing build-step swap, not a design flaw. Verified current state: `angular.json` defines both `production` and `development` build configurations but **neither lists a `fileReplacements` array**, which is exactly the defect.
2. **`ng serve` already points at `development`.** `angular.json` → `architect.serve.defaultConfiguration: "development"` is already set. Once `fileReplacements` is added to `architect.build.configurations.development`, `ng serve` (and `npm start`, which aliases to `ng serve`) will resolve to the dev environment with no further config changes.
3. **`ng build` already defaults to `production`.** `angular.json` → `architect.build.defaultConfiguration: "production"` is already set. AC2 is preserved automatically — no change needed for prod behavior.
4. **Regression guard (AC10): a structural test that reads `angular.json`.** A unit test that asserts `environment.development.apiUrl === 'http://localhost:5257/api'` is redundant (already covered by 30+ assertions in [environment.spec.ts](../../KanbAI-Web/src/environments/environment.spec.ts), which directly imports both files). The *actual* regression surface is "someone deletes or breaks the `fileReplacements` entry in `angular.json`." A single Vitest test that reads `angular.json` via `fs`, parses it, and asserts the development configuration contains the expected `fileReplacements` mapping catches the exact regression. Cheap, no CI changes, no new dependencies (AC15).
5. **Test runs unaffected.** Angular's `@angular/build:unit-test` builder (Vitest) runs tests against the default `test` configuration, which is not listed in `architect.build.configurations`. `fileReplacements` therefore does NOT affect test resolution — existing tests that import `environment` and assert on `environment.apiUrl` (e.g. [AuthService.spec.ts:235-241](../../KanbAI-Web/src/app/core/services/AuthService.spec.ts#L235-L241)) will continue to see the production URL and keep passing. AC9, AC11 preserved.

## Component Architecture

**N/A.** This ticket introduces zero new components, routes, guards, or services. No existing source files in `src/app/` are modified.

### Consumers of `environment.apiUrl` (reference only, no changes)

For blast-radius awareness. After the fix, each of these will correctly see the dev URL at `ng serve` and the prod URL at `ng build`:

- [src/app/core/services/AuthService.ts:13](../../KanbAI-Web/src/app/core/services/AuthService.ts#L13)
- [src/app/core/interceptors/auth.interceptor.ts:21](../../KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts#L21)
- [src/app/core/state/example-user-state.service.ts:89](../../KanbAI-Web/src/app/core/state/example-user-state.service.ts#L89)
- [src/app/features/projects/services/projects-api.service.ts:23](../../KanbAI-Web/src/app/features/projects/services/projects-api.service.ts#L23)
- [src/app/features/projects/services/members-api.service.ts:40](../../KanbAI-Web/src/app/features/projects/services/members-api.service.ts#L40)

## State & Data Layer

**N/A.** No state management changes.

## Service Integration

**N/A.** Existing services already read `environment.apiUrl` correctly. HTTP contracts unchanged.

## New Files to Create

- [KanbAI-Web/src/environments/environment-config.spec.ts](../../KanbAI-Web/src/environments/environment-config.spec.ts) — new regression test covering AC10 (asserts `angular.json` has the expected `fileReplacements` wiring).

## Files to Modify

- [KanbAI-Web/angular.json](../../KanbAI-Web/angular.json) — add `fileReplacements` to `projects.KanbAI-Web.architect.build.configurations.development`.

## Implementation Steps

Follow in order. Each step has a verifiable outcome.

### 1. Create branch
- [ ] From `main`: `git checkout main && git pull && git checkout -b 59-fix-environment-api-url-configuration`.
- [ ] Confirm pwd is the repo root `c:\temp\KanbAI-Web`, and that Angular commands run from `c:\temp\KanbAI-Web\KanbAI-Web\`.

### 2. Add `fileReplacements` to `angular.json`
- [ ] Open [KanbAI-Web/angular.json](../../KanbAI-Web/angular.json).
- [ ] Locate `projects.KanbAI-Web.architect.build.configurations.development` (currently only has `optimization`, `extractLicenses`, `sourceMap`).
- [ ] Add a `fileReplacements` array. Final state of the `development` block must be exactly:

```json
"development": {
  "optimization": false,
  "extractLicenses": false,
  "sourceMap": true,
  "fileReplacements": [
    {
      "replace": "src/environments/environment.ts",
      "with": "src/environments/environment.development.ts"
    }
  ]
}
```

- [ ] Do NOT modify the `production` configuration. Do NOT modify `defaultConfiguration` for either `build` or `serve` — both are already correct.
- [ ] Save. Verify the file is still valid JSON (no trailing commas, matched braces).

### 3. Add the regression test
- [ ] Create [KanbAI-Web/src/environments/environment-config.spec.ts](../../KanbAI-Web/src/environments/environment-config.spec.ts) with:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regression guard for GitHub issue #59.
 *
 * This test reads angular.json and asserts that the development build
 * configuration is wired to swap environment.ts for environment.development.ts
 * via `fileReplacements`. Without this entry, `ng serve` and
 * `ng build --configuration development` bundle the production apiUrl,
 * producing net::ERR_SSL_UNRECOGNIZED_NAME_ALERT on every authenticated call.
 *
 * If this test fails, something in angular.json has reverted the fix
 * — re-add the fileReplacements block under:
 *   projects.KanbAI-Web.architect.build.configurations.development
 */
describe('angular.json — build configuration wiring (issue #59 regression guard)', () => {
  const angularJsonPath = join(__dirname, '..', '..', 'angular.json');
  const angularJson = JSON.parse(readFileSync(angularJsonPath, 'utf-8'));
  const devBuildConfig =
    angularJson.projects['KanbAI-Web'].architect.build.configurations.development;

  it('development build configuration exists', () => {
    expect(devBuildConfig).toBeDefined();
  });

  it('development build declares fileReplacements', () => {
    expect(Array.isArray(devBuildConfig.fileReplacements)).toBe(true);
    expect(devBuildConfig.fileReplacements.length).toBeGreaterThan(0);
  });

  it('fileReplacements swaps environment.ts for environment.development.ts', () => {
    const entry = devBuildConfig.fileReplacements.find(
      (r: { replace: string; with: string }) =>
        r.replace === 'src/environments/environment.ts'
    );
    expect(entry).toBeDefined();
    expect(entry.with).toBe('src/environments/environment.development.ts');
  });

  it('ng serve defaults to the development configuration', () => {
    const serve = angularJson.projects['KanbAI-Web'].architect.serve;
    expect(serve.defaultConfiguration).toBe('development');
  });

  it('ng build defaults to the production configuration', () => {
    const build = angularJson.projects['KanbAI-Web'].architect.build;
    expect(build.defaultConfiguration).toBe('production');
  });
});
```

- [ ] Run the test in isolation to confirm it passes: `npm run test -- --watch=false src/environments/environment-config.spec.ts` (from `KanbAI-Web/KanbAI-Web/`).

### 4. Verify build outputs (ACs 1, 2, 12)
- [ ] From `KanbAI-Web/KanbAI-Web/`, run `npx ng build --configuration development`. Must exit 0.
- [ ] Grep the emitted bundle: on Windows bash, `grep -r "localhost:5257/api" dist/` must return matches; `grep -r "api.kanbai.com" dist/` must return NO matches. (If `grep -r` is unavailable, `find dist -name "*.js" -exec grep -l <pattern> {} \;` is equivalent.)
- [ ] Run `npm run build` (default = production). Must exit 0.
- [ ] Grep the prod bundle: `grep -r "api.kanbai.com" dist/` must find matches; `grep -r "localhost:5257/api" dist/` must return none.
- [ ] Clean `dist/` between builds to avoid stale artifacts (`rm -rf dist/` or delete via Explorer).

### 5. Full test suite (ACs 9, 11)
- [ ] From `KanbAI-Web/KanbAI-Web/`: `npm run test -- --watch=false`.
- [ ] Compare to `main` baseline. Record total / passed / failed / skipped.
- [ ] All 30+ assertions in `environment.spec.ts` must pass unchanged. The 5 new assertions in `environment-config.spec.ts` must pass.
- [ ] Any newly failing test → classify per CLAUDE.md rules. INTRODUCED failures block completion.

### 6. Manual E2E verification (ACs 3, 4, 5, 6, 7, 14)
- [ ] Start the local .NET backend on `http://localhost:5257`. Confirm it responds to a `GET /api/health` (or equivalent) from curl before continuing — a backend that isn't running will make step 7 ambiguous.
- [ ] From `KanbAI-Web/KanbAI-Web/`: `npm start`.
- [ ] Open the app in a fresh browser tab with DevTools → Network and Console panes open.
- [ ] Register a new account. Verify the network row shows `POST http://localhost:5257/api/auth/register` with a 2xx response.
- [ ] Log in. Verify `POST http://localhost:5257/api/auth/login` → 2xx, redirect to `/dashboard`.
- [ ] On `/dashboard`, verify `GET http://localhost:5257/api/project` → 2xx. Dashboard renders projects or empty state.
- [ ] Click "New Project", submit. Verify `POST http://localhost:5257/api/project` → 2xx, new project appears without a full reload.
- [ ] On the new project's members page (if navigable without other open work), verify any `GET /project/:id/members` call also targets localhost.
- [ ] Throughout the session, the Console must contain **zero** `ERR_SSL_UNRECOGNIZED_NAME_ALERT` entries and **zero** network rows with `api.kanbai.com` as the host.
- [ ] On any authenticated request, inspect the request headers in DevTools → Network → Headers. Confirm `Authorization: Bearer ...` is present (AC14 — interceptor still gates on the correctly-resolved `environment.apiUrl`).

### 7. Regression search (AC8) — interpretation note
The context doc's AC8 lists three files as the only legitimate sources of `api.kanbai.com`: `environment.ts`, `environment.spec.ts`, and the interface JSDoc. The current repo has **one additional legitimate match** not enumerated in AC8:

- [src/app/core/interceptors/auth.interceptor.spec.ts:267,338-339](../../KanbAI-Web/src/app/core/interceptors/auth.interceptor.spec.ts) — uses the literal `'https://api.kanbai.com'` in tests that deliberately compare against a production-shaped URL to validate interceptor host-matching behavior.

These lines are legitimate test fixtures; they do not represent the defect AC8 is guarding against. The developer should:
- Keep these lines as-is (they test real behavior).
- Confirm in the PR description that AC8's exception list is broadened to include `auth.interceptor.spec.ts` as a test-fixture reference, and that no *new* matches have been introduced.
- Confirm by running: `grep -r "api.kanbai.com" src/` — the only matches should be in `src/environments/environment.ts`, `src/environments/environment.spec.ts`, `src/app/core/models/environment.interface.ts`, and `src/app/core/interceptors/auth.interceptor.spec.ts`.

### 8. Commit & PR
- [ ] Stage only `KanbAI-Web/angular.json` and `KanbAI-Web/src/environments/environment-config.spec.ts`. Do NOT stage `dist/` or anything in `node_modules/`.
- [ ] Commit message: `fix: wire angular fileReplacements so dev builds use local api url (#59)`.
- [ ] Update the Development Status section of this tech spec (see template at the bottom).
- [ ] Open PR against `main` with a body that checks off AC1–AC15 and notes the AC8 interpretation from step 7.

## QA Guidance

### AC → verification matrix

| AC | Verified by | Location in this spec |
|----|-------------|----------------------|
| AC1 (dev build has localhost URL) | Step 4 bundle grep after `ng build --configuration development` | Step 4 |
| AC2 (prod build has api.kanbai.com) | Step 4 bundle grep after `npm run build` | Step 4 |
| AC3 (`npm start` yields dev values) | Step 6 DevTools Network inspection | Step 6 |
| AC4 (login succeeds locally) | Step 6 register+login | Step 6 |
| AC5 (dashboard loads locally) | Step 6 dashboard load | Step 6 |
| AC6 ("New Project" succeeds) | Step 6 create-project | Step 6 |
| AC7 (zero SSL errors in console) | Step 6 console pane check | Step 6 |
| AC8 (no hardcoded host) | Step 7 repo-wide grep with explicit exception list | Step 7 |
| AC9 (existing env tests pass) | Step 5 full suite | Step 5 |
| AC10 (automated regression guard) | New `environment-config.spec.ts` | Step 3 |
| AC11 (full suite green) | Step 5 | Step 5 |
| AC12 (both builds succeed) | Step 4 (both `ng build` variants) | Step 4 |
| AC13 (no trailing-slash change) | Step 5 (covered by existing env tests) | Step 5 |
| AC14 (interceptor still gates on apiUrl) | Step 6 Authorization header check | Step 6 |
| AC15 (no new npm deps) | Diff review — only `angular.json` + one `.spec.ts` | Step 8 |

### Edge cases to watch

- **Browser caching of the old bundle.** If a developer has previously run `ng serve` against the broken config, the service worker / HTTP cache may still serve old JS referencing `api.kanbai.com`. Step 6 says "fresh browser tab" for this reason; also hard-reload (Ctrl+Shift+R) or open in an Incognito window on first verification.
- **Backend not running on 5257.** If the local backend is down, the verification in step 6 will show connection-refused errors (`ERR_CONNECTION_REFUSED`) rather than SSL errors. That still *proves the fix works* (the request is hitting localhost, not api.kanbai.com), but the developer should note it in the PR rather than claiming end-to-end success.
- **Stale `dist/` from a prior build.** The grep in step 4 is only meaningful on a freshly-built `dist/`. Delete between runs.
- **Windows path separators.** `angular.json` uses forward slashes in the replacement paths (`src/environments/environment.ts`) regardless of OS. Keep them as forward slashes — Angular normalizes.

## Design Validation (Self-Check)

- [x] **Interface alignment:** No new interfaces; existing `Environment` interface unchanged.
- [x] **Standards compliance:** No code changes. Existing `inject()` / Signals / OnPush patterns unaffected.
- [x] **Security:** Prevents accidental dev-machine calls to production host (context doc §Problem). No new auth surface. `environment.ts` remains secret-free (existing env tests assert this).
- [x] **Completeness:** All 15 ACs mapped to a verification step. Files to modify = 1, files to create = 1. No ambiguity flagged.

## Development Status

**Implementation Date:** 2026-05-02
**Developer:** Claude Opus 4.7 (acting as developer agent)
**Branch:** `59-fix-environment-api-url-configuration-ssldomain-error` (pre-existing — created by prior agent off `main`, confirmed 0 commits ahead of `origin/main` before implementation)

### Files Modified
- `KanbAI-Web/angular.json` — added `fileReplacements` to `build.configurations.development`; added new `build.configurations.test` (no `fileReplacements`); wired `architect.test.options.buildTarget` to `KanbAI-Web:build:test`.

### Files Created
- `KanbAI-Web/src/environments/environment-config.spec.ts` — regression guard (AC10), 5 assertions.

### Build & Test Results
- **Dev build** (`ng build --configuration development`): ✅ SUCCESS. Bundle grep: `localhost:5257/api` present (`chunk-MQRO5LYH.js`); `api.kanbai.com` absent. AC1, AC12 ✅.
- **Prod build** (`npm run build`): ✅ SUCCESS. Bundle grep: `api.kanbai.com` present (`chunk-AHKBBQRK.js`); `localhost:5257` absent. AC2, AC12 ✅.
- **Full test suite** (`npx ng test --watch=false`): ✅ **39 files, 600 tests, 600 passed, 0 failed, 0 skipped.** Includes the 5 new assertions in `environment-config.spec.ts`. AC9, AC10, AC11 ✅.
- **Repo grep for `api.kanbai.com` in `src/`**: 4 files matched, all in the AC8 allowlist (broadened per spec Step 7): `environment.ts`, `environment.spec.ts`, `environment.interface.ts`, `auth.interceptor.spec.ts`. No new matches introduced. AC8 ✅.
- **Existing tests unchanged** (AC13): `environment.spec.ts` (trailing-slash check) still passes unmodified.

### Manual E2E (ACs 3, 4, 5, 6, 7, 14): ⚠ PENDING MANUAL VERIFICATION
These ACs require a running local .NET backend on `http://localhost:5257` and an interactive browser session (DevTools Network/Console inspection). They have not been performed in this automated implementation pass. Reviewer should run `npm start` with the backend up and walk through Step 6 of the tech spec.

### Deviation from spec — added a `test` build configuration
**What changed beyond spec:** The spec's "Files to Modify" section listed `angular.json` with one edit (add `fileReplacements` under `build.configurations.development`). I made two additional edits to `angular.json`:
1. Added a new `build.configurations.test` block (no `fileReplacements`).
2. Added `architect.test.options.buildTarget: "KanbAI-Web:build:test"` to the `test` architect target.

**Why:** Tech spec Design Decision #5 asserted that `@angular/build:unit-test` runs against a `test` configuration not listed in `architect.build.configurations`, so `fileReplacements` would not affect test resolution. That assertion is **incorrect for Angular 21's `@angular/build:unit-test` builder**: per `ng test --help`, `--build-target` "defaults to the `build` target of the current project **with the `development` configuration**." Empirically confirmed — before this deviation, the full suite failed 9/600, all in `environment.spec.ts`, because both `./environment` and `./environment.development` imports resolved to the same dev file once `fileReplacements` was in place.

**Options considered and rejected:**
- Modify `environment.spec.ts` to read both files via `fs` instead of importing them. Rejected: touches a file the spec explicitly lists under AC9 as "must pass unchanged."
- Add `--build-target=KanbAI-Web:build:production` in `npm test`. Rejected: couples test runs to prod build flags (optimization, budgets) — slower and unrelated to what tests actually need.

**Impact on ACs:** None negative. Dev build, prod build, and all 600 tests pass. `fileReplacements` is still scoped to the `development` configuration for `ng serve`/`ng build --configuration development` (the defect surface). A PR reviewer should sanity-check the two extra angular.json edits.

### Deviation from spec — test file imports
**What changed:** The spec's sample `environment-config.spec.ts` used `import { readFileSync } from 'node:fs'` and `import { join } from 'node:path'` plus bare `__dirname`. The repo does not have `@types/node` installed (and AC15 bans new npm deps). I swapped these for ambient `declare const require`/`__dirname` plus `const { readFileSync } = require('fs') as FsLike` at runtime. Vitest runs under Node.js, so the modules are available; this avoids adding types and keeps AC15 intact.

### Notes for QA / PR reviewer
- Check the two angular.json deviations (new `build.configurations.test`, new `architect.test.options.buildTarget`) are acceptable. If the preference is to avoid them, the alternative is to rewrite `environment.spec.ts` to read both env files via `fs` — but that touches a file AC9 pins.
- Manual E2E (ACs 3–7, 14) still to run with local backend.
- No new npm dependencies added (AC15 ✅).
- AC8 exception list: `auth.interceptor.spec.ts` confirmed as legitimate test fixture per tech spec Step 7.

### Testing Summary (QA phase, 2026-05-02)

**QA agent:** Claude Opus 4.7 (acting as qa-tester agent)

**Test Files Created**
- `KanbAI-Web/src/environments/environment-coverage.spec.ts` — 8 assertions, companion to `environment-config.spec.ts`. Covers AC8 via repo-walk and sanity-checks the two developer-phase `angular.json` deviations plus the production-configuration-unchanged invariant.

**Test Files Pre-existing (developer phase)**
- `KanbAI-Web/src/environments/environment-config.spec.ts` — 5 assertions (AC10 regression guard).

**Test Files NOT Modified** (per constraints)
- `KanbAI-Web/src/environments/environment.spec.ts` (AC9 pins as "must pass unchanged").
- `KanbAI-Web/angular.json` (configuration owned by tech spec).
- `KanbAI-Web/package.json` / `package-lock.json` (AC15 — verified no diff vs `main`).

**Final Test Suite Stats**
- Total files: 40 (was 39; +1 from `environment-coverage.spec.ts`).
- Total tests: **608 passed, 0 failed, 0 skipped** (was 600; +8 new assertions).
- Command: `npx ng test --watch=false` from `KanbAI-Web/KanbAI-Web/`.

**AC Coverage Delta**

| AC | Coverage before QA phase | Coverage after QA phase | Notes |
|----|--------------------------|-------------------------|-------|
| AC1 (dev build has localhost URL) | Manual build-step grep (tech spec Step 4) | Unchanged — manual | Build-and-grep inside Vitest rejected: slow, couples unit tests to CLI build state, and wiring is already covered structurally by `environment-config.spec.ts` (if `fileReplacements` is intact, Angular's build system guarantees the swap). |
| AC2 (prod build has prod URL) | Manual build-step grep | **Added structural guard** | New assertion in `environment-coverage.spec.ts`: `production` config must NOT contain `fileReplacements`. Catches the "fileReplacements leaks into prod" regression without a full build. |
| AC3 (`npm start` → dev values) | Manual E2E | Unchanged — manual-only | Requires running dev server + DevTools. Out of scope for automated unit suite. |
| AC4 (login locally) | Manual E2E | Unchanged — manual-only | Requires running .NET backend on 5257. |
| AC5 (dashboard locally) | Manual E2E | Unchanged — manual-only | Same. |
| AC6 (new project locally) | Manual E2E | Unchanged — manual-only | Same. |
| AC7 (zero SSL errors) | Manual E2E | Unchanged — manual-only | Requires browser DevTools console. |
| AC8 (no hardcoded prod host outside allowlist) | Manual grep (tech spec Step 7) | **Added automation** | New repo-walk assertion in `environment-coverage.spec.ts` enumerates allowlist (4 files) and flags any new matches. Confirmed current repo state: zero offenders. Also verifies allowlist does not drift. |
| AC9 (existing env tests pass) | Implicit (tests run) | Unchanged — covered by suite run | `environment.spec.ts` untouched by QA per constraint. |
| AC10 (regression guard) | `environment-config.spec.ts` (5 assertions) | Unchanged | Already adequate. |
| AC11 (full suite green) | Confirmed at dev-phase close | **Re-confirmed**: 608/608 passing. |
| AC12 (both builds succeed) | Manual (tech spec Step 4) | Unchanged — manual (fast, local) | Developer phase already confirmed both builds exit 0. |
| AC13 (trailing-slash invariant) | `environment.spec.ts` lines 37, 79 | Unchanged — already covered | Not duplicated per instructions. |
| AC14 (interceptor gates on apiUrl) | `auth.interceptor.spec.ts` "Environment Integration" + "Acceptance Criteria Verification" blocks | Unchanged — already covered | Verified during QA read. |
| AC15 (no new npm deps) | Diff review | **Confirmed**: `git diff main -- package.json package-lock.json` is empty. Verified (not tested). |

**New automated coverage summary**
- AC2 — added structural invariant (no `fileReplacements` in production block).
- AC8 — added repo-walking enforcement with drift detection on the allowlist.
- Two extra guards around the developer-phase `angular.json` deviations (`build.configurations.test` exists and has no `fileReplacements`; `architect.test.options.buildTarget` = `KanbAI-Web:build:test`). These prevent a silent regression where removing either deviation would re-break `environment.spec.ts` (9/600 failures).

**Gaps / Reviewer Attention**
- ACs 3, 4, 5, 6, 7, 14 remain manual-only by design (they require a running .NET backend + browser DevTools; not reproducible in a Vitest runner). Reviewer must still walk tech-spec Step 6 before merging.
- AC1 and AC12 (actual `ng build` output grep) are left manual in the tech spec's Step 4; QA judged a Vitest-driven `ng build` shell-out to be outside the unit-test boundary and redundant given the structural guards. If the reviewer wants a CI-level sanity, that belongs in a workflow YAML, not this spec.
- The new `environment-coverage.spec.ts` uses the same ambient `declare const require`/`__dirname` runtime-shim pattern as the existing `environment-config.spec.ts` — no `@types/node` added, AC15 preserved.

**No production code was modified during the QA phase.** The only new file is a test spec.

---

*Test suite complete. All acceptance criteria that can reasonably be automated are covered. Manual E2E ACs (3–7, 14) remain for the reviewer to walk with a local backend. Feature is ready for manual QA and PR.*
