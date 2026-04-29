# Technical Specification: Configure Route Guards for Protected Areas

**Context Document:** [issue_27_context.md](./issue_27_context.md)
**GitHub Issue:** [#27](https://github.com/Gulybi/KanbAI-Web/issues/27)
**Milestone:** JWT Authentication UI (#3)

## Overview

Issue #29 scaffolded a minimal `authGuard` / `unauthGuard` pair against a 3-route surface (`/`, `/login`, `/board`). This issue formalizes the guard strategy so that (a) every protected route is declaratively guarded, (b) every unauth-only route (landing, login, register) rejects already-authenticated users, (c) the redirect flow preserves the originally requested URL via a safe `returnUrl` query parameter, (d) an unknown URL composes cleanly with the existing guards to resolve to a sensible default, and (e) a route-configuration test enforces the guard contract so future routes cannot be added unguarded by accident.

The work is deliberately scoped around the guards, the route table, a small pure helper, and a new exported constant. It does **not** implement login form logic, interceptor behavior, or the `/register` component — those are out of scope and are flagged as prerequisites / follow-ups where relevant. The design must remain compatible with the in-memory-only `AuthStateService` that exists today; state persistence (localStorage rehydration) is explicitly a follow-up.

---

## Design Decisions

This section directly answers the three Open Questions from the context doc.

### Q1. Authenticated home target — `AUTH_HOME_ROUTE` constant

**Decision:** Introduce a single exported string constant `AUTH_HOME_ROUTE` and route every "send authenticated user home" decision through it. When issue #30 lands, the constant swaps from `/board` to `/dashboard` in one line and `unauthGuard`, the post-login navigation, and any future "home" redirect pick it up for free.

**Rationale:**
- Per-user preference / last-visited-route adds state-rehydration complexity that does not belong in Milestone 3.
- A constant is the minimum indirection that satisfies "ready to swap to `/dashboard` once #30 ships" from the context doc.

**File:** `KanbAI-Web/src/app/core/constants/auth-routes.ts` (new).

### Q2. Auth state persistence — out of scope; contract-ready

**Decision:** Rehydration is **out of scope** for #27. The guards assume `AuthStateService` is in-memory only (current reality) and make a **deterministic decision on the signal's current value at navigation time**. The "deep link during cold start" edge case is resolved with the "treat not-yet-authenticated as unauthenticated, preserve URL for post-login redirect" approach from the context doc.

**Follow-up contract:** A future issue should add `localStorage`-backed rehydration to `AuthStateService` by reading the persisted token during service construction and seeding the signal before any guard runs. Because guards only read `isAuthenticated()`, that change is drop-in and requires **no guard modifications**. Recommended shape (documented here, not implemented):

```typescript
// Future AuthStateService constructor (NOT part of #27)
constructor() {
  const persisted = localStorage.getItem(AUTH_STORAGE_KEY);
  if (persisted) {
    const { token, userId } = JSON.parse(persisted);
    this.state.set({ token, userId });
  }
}
```

This keeps #27's guard contract stable: the guard never awaits a promise, never resolves an Observable — it reads a Signal.

### Q3. Register route — out of scope of #27

**Decision:** `/register` is **out of scope** for this issue. `RegisterPageComponent` does not exist in the codebase today (`KanbAI-Web/src/app/features/auth/` contains only `login-page/`), and adding a route entry that references a non-existent lazy-loaded component would break the build. This issue's #25 (register form UI) shows CLOSED on GitHub but the component is missing locally — flag this as a gap to surface when wiring #28.

**What #27 *does* deliver for `/register`:**
- The `unauthGuard` is designed so that adding a route entry is a one-line change.
- `isSafeReturnUrl` explicitly rejects `/register` to prevent post-login redirect loops once the route is added.
- The route-configuration test declares the `/register` path in the `UNAUTH_ONLY_PATHS` registry but tolerates its absence until the component lands (see "Route-Configuration Test" below).

**Target shape** (for whoever wires `/register` in a follow-up):

```typescript
{
  path: 'register',
  loadComponent: () => import('./features/auth/register-page/register-page.component').then(m => m.RegisterPageComponent),
  canActivate: [unauthGuard]
}
```

---

## Component Architecture

This feature is primarily a guard/routing/contract change. No new visual components are introduced. The only component contract defined here is the **integration point** on `LoginPageComponent` where post-login navigation reads `returnUrl` — the implementation of that integration is explicitly deferred (the current `LoginPageComponent` is an empty stub and login submission does not exist).

### Routing

**Route Changes:**

| Path | Component | Guard | Notes |
|------|-----------|-------|-------|
| `''` | LandingPageComponent (existing) | `unauthGuard` (existing, unchanged) | Redirects authenticated users to `AUTH_HOME_ROUTE`. |
| `'login'` | LoginPageComponent (existing stub) | `unauthGuard` (**NEW**) | Adds guard so authenticated users cannot see the login form. |
| `'board'` | BoardPageComponent (existing) | `authGuard` (existing, signature extended) | Guard now preserves `returnUrl` on redirect. |
| `'register'` | RegisterPageComponent (**not yet wired**) | `unauthGuard` | See Design Decision Q3 — OUT OF SCOPE, shape provided for follow-up. |
| `'**'` | — | — (**NEW** wildcard) | `redirectTo: ''`, `pathMatch: 'full'`. Composes with `unauthGuard` on `''` so authed users bounce to `AUTH_HOME_ROUTE`, unauthed users land on `/`. |

**Target Route Configuration (in-scope for #27 — excludes `/register`):**

**File:** `KanbAI-Web/src/app/app.routes.ts`

```typescript
import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { unauthGuard } from './core/guards/unauth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/landing/landing-page/landing-page.component').then(m => m.LandingPageComponent),
    canActivate: [unauthGuard]
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login-page/login-page.component').then(m => m.LoginPageComponent),
    canActivate: [unauthGuard]
  },
  {
    path: 'board',
    loadComponent: () =>
      import('./features/board/board-page/board-page.component').then(m => m.BoardPageComponent),
    canActivate: [authGuard]
  },
  {
    path: '**',
    redirectTo: '',
    pathMatch: 'full'
  }
];
```

### Why the wildcard alone is enough

A reviewer might ask: "Why doesn't the wildcard need to know whether the user is authenticated?"

The composition is deliberate:

1. Wildcard hits → router rewrites URL to `''`.
2. The `''` route has `canActivate: [unauthGuard]`.
3. `unauthGuard` runs fresh against the current `isAuthenticated()` signal:
   - If authenticated → redirected to `AUTH_HOME_ROUTE`.
   - If not → landing page renders.

This is exactly the "authenticated users → home; unauthenticated users → landing" acceptance criterion, achieved without the wildcard itself needing auth awareness. Document this composition inline in `app.routes.ts` with a short comment so a future contributor who changes the `''` guard understands the coupling.

### New files to create

- `KanbAI-Web/src/app/core/constants/auth-routes.ts` — exports `AUTH_HOME_ROUTE`, `LOGIN_ROUTE`, `REGISTER_ROUTE`, `PROTECTED_PATHS`, `UNAUTH_ONLY_PATHS`.
- `KanbAI-Web/src/app/core/guards/return-url.util.ts` — exports pure helper `isSafeReturnUrl`.
- `KanbAI-Web/src/app/core/guards/return-url.util.spec.ts` — unit tests for the helper.

### Files to modify

- `KanbAI-Web/src/app/app.routes.ts` — add `canActivate: [unauthGuard]` on `'login'`, add wildcard route, add the composition comment.
- `KanbAI-Web/src/app/core/guards/auth.guard.ts` — extend to attach `returnUrl` query param to the redirect UrlTree.
- `KanbAI-Web/src/app/core/guards/unauth.guard.ts` — use `AUTH_HOME_ROUTE` constant instead of hard-coded `'/board'`.
- `KanbAI-Web/src/app/core/guards/auth.guard.spec.ts` — add tests for `returnUrl` attachment, trivial-URL exclusion.
- `KanbAI-Web/src/app/core/guards/unauth.guard.spec.ts` — update expected redirect target to `AUTH_HOME_ROUTE`.
- `KanbAI-Web/src/app/app.routes.spec.ts` — add the route-configuration test that iterates `PROTECTED_PATHS` / `UNAUTH_ONLY_PATHS`.

### Files explicitly NOT modified by #27

- `KanbAI-Web/src/app/core/services/auth-state.service.ts` — no persistence, no `login()`/`logout()` methods introduced here. (Flagged as follow-up.)
- `KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts` — currently a pass-through stub; the 401 → `clearAuthState()` wiring is a prerequisite for the "session expiry" criterion and must be delivered by a separate issue. See "Prerequisites & Known Gaps" below.
- `KanbAI-Web/src/app/features/auth/login-page/login-page.component.ts` — contract documented only; implementation of `returnUrl` read + post-login navigation is out of scope.

---

## State & Data Layer

No new state is introduced. This work depends on one existing reactive primitive:

- `AuthStateService.isAuthenticated: Signal<boolean>` (already exists, unchanged).

The guards are naturally reactive because Angular re-runs `CanActivateFn` on **every** navigation attempt, and each re-run reads `isAuthenticated()` fresh. There is no subscription, no caching, no stale decision to invalidate. When a future `logout()` call invokes `clearAuthState()`, the very next navigation (including browser Back/Forward) re-evaluates and redirects.

### Constants module

**File:** `KanbAI-Web/src/app/core/constants/auth-routes.ts`

```typescript
/**
 * Central registry of auth-related route paths.
 * Change `AUTH_HOME_ROUTE` in one place when the authenticated landing
 * target shifts (e.g., from `/board` to `/dashboard` once #30 ships).
 */

/**
 * The default destination for a successfully-authenticated user who has
 * no explicit `returnUrl`. Also used by `unauthGuard` when redirecting
 * an already-authenticated user away from `/login`, `/register`, or `/`.
 */
export const AUTH_HOME_ROUTE = '/board';

/**
 * Canonical path to the login page. Used by `authGuard` when redirecting
 * unauthenticated users and by `isSafeReturnUrl` to block redirect loops.
 */
export const LOGIN_ROUTE = '/login';

/**
 * Canonical path to the register page. Route itself is not yet wired
 * (see tech spec Design Decision Q3), but listed here so that
 * `isSafeReturnUrl` can reject it and `UNAUTH_ONLY_PATHS` can enforce
 * its guard once the component lands.
 */
export const REGISTER_ROUTE = '/register';

/**
 * Paths that MUST be protected by `authGuard`. The route-configuration
 * test iterates this list and asserts each corresponding route in
 * `app.routes.ts` has `authGuard` in its `canActivate` array.
 *
 * Add new authenticated routes here as they land (e.g., `/dashboard`).
 */
export const PROTECTED_PATHS: readonly string[] = ['board'];

/**
 * Paths that MUST be protected by `unauthGuard` (visible to anonymous
 * visitors only). The route-configuration test iterates this list.
 *
 * `register` is listed for future-proofing; the test tolerates its
 * absence from the route table until the component is wired.
 */
export const UNAUTH_ONLY_PATHS: readonly string[] = ['', 'login', 'register'];
```

### Return-URL helper

**File:** `KanbAI-Web/src/app/core/guards/return-url.util.ts`

```typescript
import { LOGIN_ROUTE, REGISTER_ROUTE } from '../constants/auth-routes';

/**
 * Decide whether a candidate `returnUrl` (typically read from a query
 * param) is safe to navigate to after a successful login.
 *
 * Safe ⇔
 *   - is a non-empty string
 *   - starts with a single `/` (in-app relative path)
 *   - is NOT `/login` or `/register` (would cause a redirect loop)
 *   - does NOT start with `//` (protocol-relative URL → external)
 *   - does NOT contain a scheme (`http:`, `https:`, `javascript:`, etc.)
 *
 * Callers (e.g., `LoginPageComponent.onSubmit`) should fall back to
 * `AUTH_HOME_ROUTE` when this returns `false`.
 */
export function isSafeReturnUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('/')) return false;      // must be in-app relative
  if (url.startsWith('//')) return false;       // protocol-relative → external
  if (url === LOGIN_ROUTE || url.startsWith(LOGIN_ROUTE + '/')) return false;
  if (url === REGISTER_ROUTE || url.startsWith(REGISTER_ROUTE + '/')) return false;
  return true;
}
```

**Design notes:**
- Pure function, no Angular dependencies → trivially unit-testable.
- The `startsWith('/')` check implicitly rejects `http://...`, `https://...`, `javascript:...`, empty strings, and `#fragment` / `?query` standalone strings.
- We compare against `LOGIN_ROUTE`/`REGISTER_ROUTE` constants so the loop-prevention logic tracks the constants module automatically.
- We accept sub-paths like `/board/abc-123` (prefix check on `/`, not on any literal protected path) — the guard will run anyway, so the helper only needs to block obviously-malicious inputs.

---

## Guards

### `authGuard` — extended to preserve `returnUrl`

**File:** `KanbAI-Web/src/app/core/guards/auth.guard.ts`

```typescript
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStateService } from '../services/auth-state.service';
import { LOGIN_ROUTE } from '../constants/auth-routes';

/**
 * Guard that protects routes requiring an authenticated session.
 *
 * Behavior:
 *   - Authenticated → returns `true`, navigation proceeds.
 *   - Unauthenticated → returns a `UrlTree` redirecting to `/login`.
 *     If the originally-requested URL (`state.url`) is a non-trivial
 *     in-app path, it is attached to the redirect as `?returnUrl=<...>`
 *     so `LoginPageComponent` can restore the user's destination after
 *     a successful login.
 *
 * Re-runs on every navigation, so a mid-session `clearAuthState()`
 * (e.g., from a 401 interceptor or a logout) immediately blocks further
 * access to protected routes.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const authState = inject(AuthStateService);
  const router = inject(Router);

  if (authState.isAuthenticated()) {
    return true;
  }

  // Only attach returnUrl when the attempted URL is non-trivial.
  // `/` alone is the landing page — preserving it adds no value
  // (and is never reached here anyway, because `/` is not guarded
  // by authGuard), so this branch is defensive.
  const attemptedUrl = state.url;
  const shouldPreserve = !!attemptedUrl && attemptedUrl !== '/' && attemptedUrl !== '';

  return shouldPreserve
    ? router.createUrlTree([LOGIN_ROUTE], { queryParams: { returnUrl: attemptedUrl } })
    : router.createUrlTree([LOGIN_ROUTE]);
};
```

**Signature contract:**
- Type: `CanActivateFn` (unchanged).
- Return: `true | UrlTree` (synchronous) — unchanged.
- The switch from `router.parseUrl('/login')` to `router.createUrlTree([LOGIN_ROUTE], { queryParams })` is required to attach query params without hand-rolling URL strings and URI-encoding by hand.

### `unauthGuard` — uses `AUTH_HOME_ROUTE` constant

**File:** `KanbAI-Web/src/app/core/guards/unauth.guard.ts`

```typescript
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStateService } from '../services/auth-state.service';
import { AUTH_HOME_ROUTE } from '../constants/auth-routes';

/**
 * Guard that protects routes intended only for anonymous visitors
 * (landing, login, register). Authenticated users are redirected to
 * `AUTH_HOME_ROUTE` so they never see the login / register form or
 * the public landing page while already signed in.
 */
export const unauthGuard: CanActivateFn = () => {
  const authState = inject(AuthStateService);
  const router = inject(Router);

  return authState.isAuthenticated()
    ? router.createUrlTree([AUTH_HOME_ROUTE])
    : true;
};
```

### `LoginPageComponent` integration contract (OUT OF SCOPE to implement)

The developer implementing login submission (a future issue — `LoginPageComponent` is currently an empty stub) **must** follow this contract:

```typescript
// CONTRACT — not implemented as part of #27
import { ActivatedRoute, Router } from '@angular/router';
import { AUTH_HOME_ROUTE } from '../../../core/constants/auth-routes';
import { isSafeReturnUrl } from '../../../core/guards/return-url.util';

// Inside the login form submission handler, AFTER a successful auth call:
const raw = activatedRoute.snapshot.queryParamMap.get('returnUrl');
const target = isSafeReturnUrl(raw) ? raw! : AUTH_HOME_ROUTE;
router.navigateByUrl(target);
```

The guard attaches `returnUrl`; the login page is the sole consumer. Keeping the read + safety check in one place prevents the safety rules from drifting.

---

## Service Integration

No changes to `AuthStateService`, `authInterceptor`, or any other service are in scope. The guards read existing APIs only.

### Prerequisites & Known Gaps

The context doc implies several pieces exist; the code says otherwise. These are **not** fixed by #27 but must be surfaced so downstream work does not assume they are done:

| Gap | Status | Impact on #27 | Recommended Follow-up |
|-----|--------|---------------|-----------------------|
| `AuthStateService.login()` / `logout()` methods | Missing (only `setAuthState` / `clearAuthState` exist) | None — guards only read `isAuthenticated()`. | #28 or a dedicated issue to add semantic methods that wrap state mutation + (future) side effects. |
| `AuthStateService` localStorage rehydration | Missing | None for #27; reload-while-on-`/board` redirects to `/login` and this is accepted per Q2. | Dedicated issue — drop-in as shown in Design Decision Q2. |
| `authInterceptor` 401 handling → `clearAuthState()` | Currently a pass-through TODO | Blocks the "session expires mid-session → redirect" acceptance criterion in PRACTICE. The guard is *ready* to handle it (it re-runs every navigation); it just never fires because the interceptor never clears state. | Dedicated issue; must not redesign the guard. |
| `RegisterPageComponent` | Missing | None for #27; route is explicitly not wired. | Follow-up issue creates component + adds route entry (one line). |
| `LoginPageComponent.onSubmit` reading `returnUrl` | Component is an empty stub | None for #27 (contract only); full flow can't be end-to-end tested until login submit exists. | Whoever wires login submission follows the integration contract above. |

---

## Implementation Steps

Execute in this order. Each step leaves the build green.

### 1. Create the constants module

- [ ] Create `KanbAI-Web/src/app/core/constants/` directory.
- [ ] Create `auth-routes.ts` with `AUTH_HOME_ROUTE`, `LOGIN_ROUTE`, `REGISTER_ROUTE`, `PROTECTED_PATHS`, `UNAUTH_ONLY_PATHS` exports (exact contents above).

### 2. Create the `isSafeReturnUrl` helper

- [ ] Create `KanbAI-Web/src/app/core/guards/return-url.util.ts` (exact contents above).
- [ ] Create `return-url.util.spec.ts` with the test cases enumerated in "QA Guidance" below.

### 3. Refactor `unauthGuard` to use the constant

- [ ] Replace hard-coded `'/board'` with `AUTH_HOME_ROUTE`.
- [ ] Switch from `router.parseUrl(...)` to `router.createUrlTree([...])` for consistency with `authGuard`.
- [ ] Update `unauth.guard.spec.ts` to assert the guard calls `createUrlTree([AUTH_HOME_ROUTE])` (or, if the existing test is kept using `parseUrl`, migrate it to `createUrlTree`).

### 4. Extend `authGuard` with `returnUrl` preservation

- [ ] Import `LOGIN_ROUTE`.
- [ ] Replace the existing `parseUrl('/login')` branch with the `createUrlTree` + query-param logic above.
- [ ] Preserve the "non-trivial URL" guard so `/` never ends up as a `returnUrl`.

### 5. Update `app.routes.ts`

- [ ] Add `canActivate: [unauthGuard]` to the `'login'` route.
- [ ] Add the wildcard route `{ path: '**', redirectTo: '', pathMatch: 'full' }`.
- [ ] Add an inline comment explaining the wildcard ↔ `unauthGuard` composition (see "Why the wildcard alone is enough" above).
- [ ] Do **not** add the `/register` route — it is out of scope (Design Decision Q3).

### 6. Extend guard unit tests

- [ ] In `auth.guard.spec.ts`:
  - Add a test: unauthenticated + `state.url = '/board'` → `createUrlTree` called with `['/login'], { queryParams: { returnUrl: '/board' } }`.
  - Add a test: unauthenticated + `state.url = '/'` → `createUrlTree` called with `['/login']` and **no** query params.
  - Update the existing "unauthenticated redirects" test to the new API (`createUrlTree` instead of `parseUrl`).
- [ ] In `unauth.guard.spec.ts`:
  - Update the redirect assertion to `createUrlTree([AUTH_HOME_ROUTE])`.

### 7. Add the route-configuration test

- [ ] Extend `KanbAI-Web/src/app/app.routes.spec.ts` with a new `describe('Guard Coverage')` block (see "QA Guidance" below for exact assertions).

### 8. Build & test verification

- [ ] `npm run build` — must succeed.
- [ ] `npm run test -- --watch=false` — all tests must pass. Any new failures must be classified INTRODUCED and fixed before completion.

---

## QA Guidance

### Unit tests — `authGuard`

**File:** `KanbAI-Web/src/app/core/guards/auth.guard.spec.ts`

Follow the existing Vitest style (TestBed + `runInInjectionContext` + `signal()` mocks for `isAuthenticated`). Replace `mockRouter.parseUrl` with `mockRouter.createUrlTree`.

Required cases:

| Case | `isAuthenticated()` | `state.url` | Expected |
|------|---------------------|-------------|----------|
| Happy path | `true` | `/board` | returns `true`; `createUrlTree` not called |
| Unauth + non-trivial URL | `false` | `/board` | returns UrlTree; `createUrlTree(['/login'], { queryParams: { returnUrl: '/board' } })` called exactly once |
| Unauth + nested URL | `false` | `/board/abc-123` | `createUrlTree(['/login'], { queryParams: { returnUrl: '/board/abc-123' } })` |
| Unauth + root URL | `false` | `/` | `createUrlTree(['/login'])` — no query params |
| Unauth + empty URL | `false` | `''` | `createUrlTree(['/login'])` — no query params |
| Reactive re-evaluation | flips `false` → `true` across calls | any | first call returns UrlTree, second returns `true` |

### Unit tests — `unauthGuard`

**File:** `KanbAI-Web/src/app/core/guards/unauth.guard.spec.ts`

| Case | `isAuthenticated()` | Expected |
|------|---------------------|----------|
| Happy path | `false` | returns `true`; `createUrlTree` not called |
| Auth redirect | `true` | `createUrlTree(['/board'])` (imported as `AUTH_HOME_ROUTE` constant — test should import the constant rather than hard-code `/board` so it stays aligned when #30 swaps it) |

### Unit tests — `isSafeReturnUrl`

**File:** `KanbAI-Web/src/app/core/guards/return-url.util.spec.ts`

| Input | Expected |
|-------|----------|
| `/board` | `true` |
| `/board/abc-123` | `true` |
| `/dashboard?foo=bar` | `true` |
| `https://evil.example.com` | `false` |
| `http://evil.example.com` | `false` |
| `//evil.example.com` | `false` |
| `javascript:alert(1)` | `false` |
| `/login` | `false` |
| `/login?x=1` | `false` (because `/login?x=1` starts with `/login` — test covers the `startsWith(LOGIN_ROUTE + '/')` AND exact match branches; note `/login?x=1` matches exact-prefix rule via `startsWith('/login')` — adjust assertion based on exact helper semantics) |
| `/register` | `false` |
| `/registering` | `true` *(not a sub-path of `/register` — the helper uses `startsWith('/register/')`, not `startsWith('/register')`, specifically to avoid this false positive)* |
| `''` | `false` |
| `null` | `false` |
| `undefined` | `false` |
| `board` (no leading slash) | `false` |

### Route-configuration test

**File:** `KanbAI-Web/src/app/app.routes.spec.ts` (extend existing file)

Add a new `describe('Guard Coverage')` block:

```typescript
import { PROTECTED_PATHS, UNAUTH_ONLY_PATHS } from './core/constants/auth-routes';
import { authGuard } from './core/guards/auth.guard';
import { unauthGuard } from './core/guards/unauth.guard';

describe('Guard Coverage', () => {
  it('every path in PROTECTED_PATHS is registered with authGuard', () => {
    for (const path of PROTECTED_PATHS) {
      const route = routes.find(r => r.path === path);
      // If the path is not yet registered (e.g., future `/dashboard`), skip —
      // the test enforces "IF registered, MUST have authGuard", not "must exist".
      if (!route) continue;
      expect(route.canActivate).toBeDefined();
      expect(route.canActivate).toContain(authGuard);
    }
  });

  it('every path in UNAUTH_ONLY_PATHS is registered with unauthGuard', () => {
    for (const path of UNAUTH_ONLY_PATHS) {
      const route = routes.find(r => r.path === path);
      if (!route) continue; // tolerates `/register` not being wired yet
      expect(route.canActivate).toBeDefined();
      expect(route.canActivate).toContain(unauthGuard);
    }
  });

  it('declares a wildcard catch-all route', () => {
    const wildcard = routes.find(r => r.path === '**');
    expect(wildcard).toBeDefined();
    expect(wildcard?.redirectTo).toBe('');
  });

  it('ensures every non-wildcard, non-redirect route has at least one guard', () => {
    const unguarded = routes.filter(r =>
      r.path !== '**' &&
      !r.redirectTo &&
      (!r.canActivate || r.canActivate.length === 0)
    );
    expect(unguarded).toEqual([]);
  });
});
```

The fourth test is the "prevents future routes from being added unguarded by accident" safety net called out in the acceptance criteria — it fires whenever anyone adds a route without a guard, even if they forgot to update `PROTECTED_PATHS` / `UNAUTH_ONLY_PATHS`.

### Existing navigation tests

The existing `describe('Edge Cases')` block in `app.routes.spec.ts` contains:

```typescript
it('should reject navigation to invalid routes', async () => {
  await expect(router.navigate(['/invalid-route'])).rejects.toThrow();
});
```

This test **will break** once the wildcard is added — the navigation will now succeed (redirect to `''`). Update it to:

```typescript
it('redirects unknown paths to the landing route', async () => {
  await router.navigate(['/invalid-route']);
  expect(location.path()).toBe('');
});
```

Classify this change as INTRODUCED-and-fixed in the development status report.

### Manual test steps (edge cases)

1. **Deep link while logged out:** In a private window with no stored auth, paste `/board/some-id` → expect URL becomes `/login?returnUrl=%2Fboard%2Fsome-id`.
2. **Deep link to `/` while logged out:** paste `/` → no `returnUrl` on redirect (stays on landing).
3. **Logged-in user visits `/login`:** set auth state via browser DevTools console, then paste `/login` → URL rewrites to `/board`.
4. **Browser Back after logout:** from `/board`, call `clearAuthState()` via DevTools and then navigate to `/` → hit browser Back → must redirect to `/login` (Angular re-runs `authGuard` on Back/Forward navigations).
5. **Tampered returnUrl:** paste `/login?returnUrl=https://evil.example.com` → login form renders (this is `unauthGuard` allowing an unauthed user through); when login submission lands, it must ignore the external URL and send the user to `AUTH_HOME_ROUTE`. (This step can only be fully exercised once login submission exists — flag as deferred manual test.)
6. **Unknown path while logged in:** set auth state, paste `/foo-bar-baz` → `'**'` redirects to `''`, then `unauthGuard` bounces to `/board`.
7. **Unknown path while logged out:** same URL, unauthed → lands on landing page at `/`.

---

## Design Validation (Self-Check)

**Interface alignment:**
- [x] `AUTH_HOME_ROUTE`, `LOGIN_ROUTE`, `REGISTER_ROUTE` exported as `const` strings.
- [x] `PROTECTED_PATHS` / `UNAUTH_ONLY_PATHS` are `readonly string[]` registries the route test iterates.
- [x] `isSafeReturnUrl` is a pure function with `(url: string | null | undefined) => boolean`.
- [x] `authGuard` return type stays `true | UrlTree` (no Promise/Observable introduced).

**Standards compliance:**
- [x] `inject()` used in guards (unchanged from current code).
- [x] Signals-based `isAuthenticated` read fresh per navigation (no RxJS subscription).
- [x] Functional `CanActivateFn` guards (unchanged).
- [x] Constants file colocated under `core/constants/` (no magic strings in guards or routes).

**Security:**
- [x] External `returnUrl` values rejected by `isSafeReturnUrl` before navigation.
- [x] `javascript:` scheme rejected by the leading-`/` check.
- [x] Login/register loop prevented by explicit rejection in the helper.
- [x] `AuthStateService` stays the single source of truth; guards never read `localStorage` directly.

**Accessibility:**
- [x] N/A — no visual changes in this spec. Focus states, color contrast, and keyboard flows are inherited from existing components.

**Completeness:**
- [x] Every acceptance criterion in the context doc maps to an implementation step (see Traceability Matrix below).
- [x] Out-of-scope items (register route, localStorage persistence, login submit) are explicitly flagged.
- [x] Files to modify and files to leave alone are both listed explicitly.

---

## Traceability Matrix

Each row maps a context-doc acceptance criterion to the implementation step(s) and test(s) that satisfy it.

| Acceptance Criterion (verbatim snippet) | Implementation Step | Test |
|-----------------------------------------|---------------------|------|
| Every protected route has `canActivate: [authGuard]` | Step 5 + `PROTECTED_PATHS` | Route-config test #1 + #4 |
| Every unauth-only route has `canActivate: [unauthGuard]` | Step 5 + `UNAUTH_ONLY_PATHS` | Route-config test #2 + #4 |
| Wildcard `'**'` route present, sensible default | Step 5 | Route-config test #3 + updated Edge-Cases test |
| Unauth → protected URL → redirect to `/login` (no flash) | Step 4 | `authGuard` test "Unauth + non-trivial URL" |
| Redirect preserves original URL as `?returnUrl=` | Step 4 | `authGuard` test "Unauth + nested URL" |
| External/unsafe `returnUrl` ignored | Step 2 (`isSafeReturnUrl`) + Login contract | `isSafeReturnUrl` spec — `https://`, `//`, `javascript:` cases |
| Authed → `/login` → redirect to home | Step 5 (add guard) | `unauthGuard` "Auth redirect" + existing navigation test adapted |
| Authed → `/register` → redirect (when wired) | Out of scope; Design Decision Q3 | Route-config test tolerates absence; re-asserts on future wire-up |
| Authed → `/` → redirect to home | Existing `unauthGuard` on `''` (Step 3 refactor) | Existing `unauthGuard` test with updated target |
| Session cleared mid-session → next nav redirects | Guards re-read signal per nav (no code change needed beyond interceptor prerequisite) | Manual test step 4 |
| Logout → can't navigate back into protected areas | Same — re-runs on Back/Forward | Manual test step 4 |
| Unknown path → auth-state-appropriate default | Step 5 wildcard + composition with `unauthGuard` on `''` | Route-config test #3 + Manual steps 6–7 |
| Guard decision reactive to `isAuthenticated` | No caching by design; Step 4 reads signal each call | `authGuard` "Reactive re-evaluation" test |
| No console errors during flows | Manual verification in Step 8 | Manual browser DevTools check |
| `authGuard` unit tests | Step 6 | `auth.guard.spec.ts` all cases above |
| `unauthGuard` unit tests | Step 6 | `unauth.guard.spec.ts` all cases above |
| Route-config test exists | Step 7 | Four-part `Guard Coverage` describe block |
| `returnUrl` tampering rejected | Step 2 + Login contract | `isSafeReturnUrl` spec |
| Deep link during cold start | Design Decision Q2 (treat not-yet-auth as unauth; preserve URL) | `authGuard` "Unauth + non-trivial URL" + Manual step 1 |
| Simultaneous tabs — logout in Tab A | Reactive guard re-evaluation | Covered by "session cleared mid-session" row; manual step 4 |
| Redirect loop on `/login` from expired session | `unauthGuard` allows unauthed users through | Existing `unauthGuard` happy-path test |
| Back-button after logout | Angular re-runs guards on Back/Forward | Manual step 4 |

---

## Architecture Summary

**Key design decisions:**

1. **Single-point redirect target (`AUTH_HOME_ROUTE`)** — swapping `/board` for `/dashboard` when #30 lands is a one-line edit.
2. **`returnUrl` via `createUrlTree` + query params** — no hand-rolled URL strings, no manual URI encoding, and the login page contract is centralized in `isSafeReturnUrl`.
3. **Safety is a pure function** — `isSafeReturnUrl` has no Angular dependencies, lives in a `.util.ts` file, and is trivially unit-testable in isolation.
4. **Wildcard route composes with `unauthGuard`** — the wildcard itself is auth-agnostic; the existing guard on `''` does the auth-branching, which avoids duplicating auth logic in the route table.
5. **`PROTECTED_PATHS` + `UNAUTH_ONLY_PATHS` registries** — the route-config test enforces the guard contract automatically; adding a new route without a guard fails CI.
6. **Guards remain synchronous `CanActivateFn`s** — no Promise/Observable; re-evaluation on every navigation is the reactivity mechanism.
7. **Persistence deferred** — no localStorage writes in #27; rehydration is a drop-in follow-up that does not touch guard code.
8. **Register route deferred** — component does not exist; `unauthGuard` and `isSafeReturnUrl` are already built to accept it with a one-line route-table addition.

**Trade-offs:**
- **No cold-start rehydration** means a page reload while on `/board` sends the user back to `/login` (with `returnUrl` preserved). Explicitly accepted per Design Decision Q2; the `returnUrl` round-trip keeps the UX acceptable.
- **Registry lists must be maintained by hand.** The safety net is the "every non-wildcard route has at least one guard" test, which catches forgotten additions even when the registries drift.
- **Interceptor prerequisite not solved here.** "Session expires → redirect" only fires in practice once the interceptor actually calls `clearAuthState()` on 401. The guards are correct in isolation; the full loop depends on a follow-up.

---

## Next Steps

1. **Web Designer Phase:** Invoke the `web-designer` agent with this tech spec. Although the feature is largely non-visual, the designer should:
   - Confirm no visual changes are required beyond what already ships in `LandingPageComponent` / `LoginPageComponent` / `BoardPageComponent`.
   - Define loading/empty-state behavior if any brief "guard-evaluating" flash should be masked (likely N/A since guards are synchronous).
   - Produce `docs/handoffs/issue_27_design_spec.md` to keep the workflow artifact chain complete.
2. **Developer Phase:** Implement per the steps above, run `npm run build` and `npm run test`, then update this document with a "Development Status" section.
3. **Follow-up Issues (surface to the PO):**
   - Implement `AuthStateService.login()` / `logout()` semantic methods.
   - Add localStorage rehydration to `AuthStateService` (constructor-seeded signal).
   - Replace the pass-through `authInterceptor` with the real 401 → `clearAuthState()` handler.
   - Create `RegisterPageComponent` and wire the `/register` route (add `canActivate: [unauthGuard]`).
   - Implement `LoginPageComponent.onSubmit` following the integration contract in this document.

---

The technical specification is saved. You can now instruct the web-designer agent to create the design specification.

---

## Development Status

**Implementation Date:** 2026-04-29
**Developer:** Claude Opus 4.7 (developer agent)

### Files Created
- `KanbAI-Web/src/app/core/constants/auth-routes.ts` — `AUTH_HOME_ROUTE`, `LOGIN_ROUTE`, `REGISTER_ROUTE`, `PROTECTED_PATHS`, `UNAUTH_ONLY_PATHS`.
- `KanbAI-Web/src/app/core/guards/return-url.util.ts` — `isSafeReturnUrl` pure helper.
- `KanbAI-Web/src/app/core/guards/return-url.util.spec.ts` — 17 unit tests covering safe, tampered, redirect-loop and empty inputs.
- `KanbAI-Web/src/app/features/auth/login-page/components/context-banner/context-banner.component.ts`
- `KanbAI-Web/src/app/features/auth/login-page/components/context-banner/context-banner.component.html`
- `KanbAI-Web/src/app/features/auth/login-page/components/context-banner/context-banner.component.scss`
- `KanbAI-Web/src/app/features/auth/login-page/components/context-banner/context-banner.component.spec.ts`
- `KanbAI-Web/src/styles/variables/_colors.scss`
- `KanbAI-Web/src/styles/variables/_typography.scss`
- `KanbAI-Web/src/styles/variables/_spacing.scss`
- `KanbAI-Web/src/styles/variables/_radius.scss`
- `KanbAI-Web/src/styles/variables/_shadows.scss`
- `KanbAI-Web/src/styles/variables/_layout.scss`
- `KanbAI-Web/src/styles/variables/_motion.scss`
- `KanbAI-Web/src/styles/variables/_breakpoints.scss`

### Files Modified
- `KanbAI-Web/src/app/app.routes.ts` — added `canActivate: [unauthGuard]` to `/login`, added `'**'` wildcard, inline comment documents the wildcard ↔ unauthGuard composition.
- `KanbAI-Web/src/app/app.routes.spec.ts` — updated the "invalid route" edge case to assert redirect-to-`''`; added a `Guard Coverage` describe block with four assertions (PROTECTED_PATHS have authGuard, UNAUTH_ONLY_PATHS have unauthGuard, wildcard exists, no route is unguarded).
- `KanbAI-Web/src/app/core/guards/auth.guard.ts` — switched from `parseUrl` to `createUrlTree`, now attaches `returnUrl` when `state.url` is non-trivial.
- `KanbAI-Web/src/app/core/guards/auth.guard.spec.ts` — rewritten to cover the new API (happy path, nested URL, root URL, empty URL, reactive re-evaluation).
- `KanbAI-Web/src/app/core/guards/unauth.guard.ts` — uses `AUTH_HOME_ROUTE` constant and `createUrlTree` for consistency with `authGuard`.
- `KanbAI-Web/src/app/core/guards/unauth.guard.spec.ts` — asserts redirect via `createUrlTree([AUTH_HOME_ROUTE])`.
- `KanbAI-Web/src/app/features/auth/login-page/login-page.component.ts` — reads `returnUrl` via `toSignal(queryParamMap)`, exposes `returnUrlSafe()` computed signal, emits cancel handler that clears the query param.
- `KanbAI-Web/src/app/features/auth/login-page/login-page.component.html` — replaced Tailwind-only stub with column layout that renders the context banner above the login card when a safe returnUrl is present.
- `KanbAI-Web/src/app/features/auth/login-page/login-page.component.scss` — column + card layout sourced from canonical design tokens.
- `KanbAI-Web/src/app/features/auth/login-page/login-page.component.spec.ts` — rewritten to cover: no returnUrl (no banner), safe returnUrl (banner + input wiring), unsafe returnUrl (banner suppressed), cancel interaction (navigate to `/login`), redirect-loop case (`/login` as returnUrl).
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.scss` — appended guard-evaluating skeleton block and keyframes (styling only; not wired in #27).
- `KanbAI-Web/angular.json` — added `stylePreprocessorOptions.includePaths: ["."]` so component SCSS can `@use 'src/styles/variables/colors' as *;`.

### Build & Test Results
- **Build:** ✅ SUCCESS (`npm run build` — initial total 233.84 kB, well under the 1 MB budget).
- **Tests:** 314 total / 314 passed / 0 failed / 0 skipped (19 test files).
- **Pre-existing failures:** none.
- **Introduced failures fixed:** one OnPush input-binding issue in the context-banner spec (replaced `component.returnUrl = ...` with `fixture.componentRef.setInput('returnUrl', ...)`).

### Edge Cases Verified by Tests
- Unauth → `/board` → `/login?returnUrl=%2Fboard` (integration + unit).
- Unauth → `/` → `/login` with no query params (unit).
- `isSafeReturnUrl` rejects `https://`, `http://`, `//`, `javascript:`, `/login`, `/login?x=1`, `/login/*`, `/register`, `/register/*`, empty, null, undefined, non-string and no-leading-slash inputs.
- `isSafeReturnUrl` accepts `/board`, nested paths, paths with query strings, and `/registering` (which is NOT a sub-path of `/register`).
- LoginPage suppresses banner for external / redirect-loop returnUrls.
- LoginContextBanner renders `returnUrl` as text-only (XSS-safe default interpolation verified with `<img>` payload).
- Wildcard navigation goes to `''`, not a thrown error.
- Every non-wildcard, non-redirect route carries at least one guard (fail-safe test).

### Out-of-Scope / Follow-ups (as flagged in the tech spec)
- `AuthStateService.login()` / `logout()` semantic methods.
- localStorage rehydration in `AuthStateService` constructor.
- `authInterceptor` 401 → `clearAuthState()` wiring (the "session expires" path depends on this).
- `RegisterPageComponent` + route entry (one-liner once the component exists).
- `LoginPageComponent.onSubmit` that reads `returnUrlSafe()` and calls `router.navigateByUrl(target)`. The contract is already in place — the integration point is the `returnUrlSafe` signal on the component.
- The landing page's hero gradient still uses hardcoded hex values (`#eff6ff`, `#1e40af`, …) — per the design spec this pre-existing drift is out of scope for #27 and should be tracked as "align landing page styling to design tokens v1.0".
- Toast surface for post-login returnUrl rejection — deferred to the issue that introduces the toast primitive; the SCSS block in the design spec is preserved for reuse.

### Notes
- Guards stay synchronous `CanActivateFn`s; reactivity comes from `isAuthenticated()` being read fresh on every navigation.
- The `returnUrl` safety check lives in exactly one place (`isSafeReturnUrl`) and is consumed symmetrically by both the login page (render decision) and the future post-login navigation (destination decision).
- `stylePreprocessorOptions.includePaths: ["."]` was the minimum angular.json change needed to let component SCSS reference `src/styles/variables/*` with stable paths — no component needs to know the relative depth to the token directory.
