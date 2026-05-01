# Technical Specification: Fix Header Navigation, Auth Buttons, and Logo Routing

**Context Document:** [issue_56_context.md](./issue_56_context.md)
**GitHub Issue:** #56
**Parent Branch:** `55-restore-login-ui-and-fix-authentication-flow`
**Depends On (already merged on this branch):** #55 (commit `4a89615`) — aligned `AuthService` and `AuthStateService` writes so both signals flip atomically on login/logout.

---

## Overview

This ticket is a targeted refactor of the existing global `NavbarComponent` (`src/app/core/layout/navbar/`). No new services, no new HTTP endpoints, no new routes — only template, SCSS, and one small constants-file addition. The change delivers three things: (1) an anonymous branch of the navbar rendering Login and Register controls, (2) a context-aware, routerLink-driven brand element that replaces the inert `<h1>`, and (3) a single-source-of-truth fix for the authenticated-branch gate so the Logout button stops disappearing mid-session. Signals continue to drive reactive rendering and OnPush change detection is preserved.

---

## Component Architecture

### Routing
**No new routes.** All four destinations required by this ticket already exist in `KanbAI-Web/src/app/app.routes.ts`:

| Path          | Component                | Guard         | Status          |
|---------------|--------------------------|---------------|-----------------|
| `/`           | LandingPageComponent     | `unauthGuard` | existing        |
| `/login`      | LoginPageComponent       | `unauthGuard` | existing        |
| `/register`   | RegisterPageComponent    | `unauthGuard` | existing        |
| `/dashboard`  | DashboardPageComponent   | `authGuard`   | existing        |

The guards already provide the safety net required by Acceptance Criterion "anonymous auth buttons do not trap a signed-in user" — `unauthGuard` bounces any authenticated visitor off `/login` and `/register` to `AUTH_HOME_ROUTE`.

### Component Hierarchy

**Single component touched: `NavbarComponent`** (`src/app/core/layout/navbar/`).

It remains a **smart component** (reads auth services, owns logout side effect). No new child components — the anonymous and authenticated branches are two sibling template fragments, not worth extracting at this scale (YAGNI).

- `NavbarComponent`
  - Reads `AuthStateService.isAuthenticated()` (**new — source of truth for branch gate, see Design Decision #1**)
  - Reads `AuthService.currentUser()` (existing — continues to supply the user's display name inside the authenticated branch)
  - Imports `RouterLink` from `@angular/router` to wire the brand anchor and the Login/Register anchors
  - Owns `onLogout()` side effect (unchanged from current implementation)
  - Exposes a `brandTargetRoute` computed signal that returns `AUTH_HOME_ROUTE` when authenticated, `PUBLIC_HOME_ROUTE` when anonymous

### New Files to Create
None.

### Files to Modify

- `KanbAI-Web/src/app/core/constants/auth-routes.ts` — add `PUBLIC_HOME_ROUTE` export (Design Decision #2).
- `KanbAI-Web/src/app/core/layout/navbar/navbar.component.ts` — inject `AuthStateService`, expose `isAuthenticated` + `brandTargetRoute`, import `RouterLink` in the component's `imports` array.
- `KanbAI-Web/src/app/core/layout/navbar/navbar.component.html` — replace inert `<h1>` brand with a routed `<a>`, add `@else` branch for anonymous Login/Register controls, retain existing authenticated branch unchanged.
- `KanbAI-Web/src/app/core/layout/navbar/navbar.component.scss` — add `.navbar__brand` styling for the anchor variant (preserve current typography, suppress default link underline and color), add `.navbar__login-btn` and `.navbar__register-btn` (or a shared `.navbar__action-btn` per Open Question #3 — defer to web-designer).
- `KanbAI-Web/src/app/core/layout/navbar/navbar.component.spec.ts` — extend coverage for the new branch; see QA Guidance below.

### Files NOT Modified (guardrail)
- `AuthService.ts`, `auth-state.service.ts`, `auth.guard.ts`, `unauth.guard.ts`, `app.routes.ts`, `app.html` — this ticket does not touch service logic, guards, or the route table. The #55 fix to `AuthService` is sufficient; this ticket only consumes it.

---

## State & Data Layer

### State Management Strategy

**Branch gate (new — single source of truth):**
```typescript
// navbar.component.ts
private readonly authState = inject(AuthStateService);
readonly isAuthenticated = this.authState.isAuthenticated;   // computed<boolean>, shared with guards
```

**User display name (existing — unchanged):**
```typescript
private readonly authService = inject(AuthService);
readonly currentUser = this.authService.currentUser;          // signal<UserProfileDto | null>
```

**Context-aware brand target (new — computed):**
```typescript
readonly brandTargetRoute = computed(() =>
  this.isAuthenticated() ? AUTH_HOME_ROUTE : PUBLIC_HOME_ROUTE
);
```

### TypeScript Interfaces
No new interfaces. `UserProfileDto` (`KanbAI-Web/src/app/core/models/auth.models.ts`) is consumed as-is.

### Constants — New Export

**File:** `KanbAI-Web/src/app/core/constants/auth-routes.ts`

Add one new export, placed next to `AUTH_HOME_ROUTE` for symmetry:

```typescript
/**
 * The public landing page shown to anonymous visitors.
 * Navbar brand click target when `isAuthenticated()` is false.
 */
export const PUBLIC_HOME_ROUTE = '/';
```

No change to existing exports (`AUTH_HOME_ROUTE`, `LOGIN_ROUTE`, `REGISTER_ROUTE`, `PROTECTED_PATHS`, `UNAUTH_ONLY_PATHS`).

---

## Service Integration

### Design Decision #1 — Source of truth for the authenticated-branch gate

**Decision:** The navbar's branch gate (the `@if` condition selecting between anonymous and authenticated branches) **reads `AuthStateService.isAuthenticated()`**, not `AuthService.currentUser`.

**Justification:**

1. **Consistency with guards.** `authGuard` and `unauthGuard` both read `AuthStateService.isAuthenticated()`. Aligning the navbar with the same source guarantees that whenever a guard allows a user onto a route, the navbar renders the matching branch for that route. No drift is possible by construction.
2. **The #55 fix makes this safe.** Commit `4a89615` (issue #55) changed `AuthService.handleAuthSuccess()` to call `authStateService.setAuthState(token, userId)` and `AuthService.logout()` to call `authStateService.clearAuthState()`. Both signals are now written atomically within the same synchronous code paths, so they no longer diverge on the happy path. Reading `isAuthenticated()` from the navbar no longer risks "user is logged in but navbar shows anonymous" the way it would have pre-#55.
3. **Resilience against future 401-interceptor paths.** If a future interceptor or error-handler calls `authStateService.clearAuthState()` in isolation (for example, to invalidate a session on a 401 without touching `currentUser`), the navbar will follow the guards and correctly flip to the anonymous branch. Reading `currentUser` would leave the navbar stuck in the authenticated state while guards redirect the user to `/login` — exactly the symptom this ticket is fixing.
4. **The user's `name` still comes from `currentUser`.** Inside the authenticated branch, the template reads `currentUser()?.name` (or equivalent null-safe access) to render the display name. This is a presentation-only read — not a branch gate — so it does not compromise the single-source-of-truth property. In practice `currentUser()` is non-null whenever `isAuthenticated()` is true (enforced by `handleAuthSuccess`), but the template uses safe navigation to tolerate the one-tick window where that might not hold.

**Rejected alternatives:**
- *Keep reading `AuthService.currentUser` in the navbar.* Rejected. Leaves the navbar in a different signal graph from the guards; any future write path that touches one signal without the other reintroduces the original bug.
- *Introduce a third signal / facade that unifies the two.* Rejected as YAGNI — the existing alignment from #55 makes a new abstraction unnecessary. Revisit only if a future feature needs session-level metadata (roles, permissions) that neither current signal provides.

### Design Decision #2 — Introduce `PUBLIC_HOME_ROUTE = '/'`

**Decision:** Add a new named constant `PUBLIC_HOME_ROUTE = '/'` in `src/app/core/constants/auth-routes.ts`.

**Justification:**

1. **Symmetry with `AUTH_HOME_ROUTE`.** The brand's context-aware target toggles between two named constants. Naming both sides makes the intent self-documenting in the `computed()` that resolves `brandTargetRoute`.
2. **Test-friendliness.** The navbar spec can import `PUBLIC_HOME_ROUTE` and assert the anchor's `href` / `routerLink` binding against the constant, keeping the test resilient to any future rename of the landing route.
3. **Zero runtime cost.** It is a string literal; no module-level side effect.

**Placement:** Immediately below `AUTH_HOME_ROUTE` in `auth-routes.ts`, with a JSDoc block matching the style of the surrounding exports.

### Open Questions Deferred to Web Designer

The context doc flags two styling questions as web-designer territory. Noted here for handoff; this spec does **not** resolve them:

- **Open Question #3 (styling parity):** Whether to generalize `.navbar__logout-btn` into a shared `.navbar__action-btn` utility class or duplicate/rename per-control for Login and Register. The SCSS file in this spec's Implementation Steps leaves the class names as `.navbar__login-btn` and `.navbar__register-btn` placeholders; the web-designer may collapse them into a shared class in the design spec.
- **Open Question #4 (Login vs Register visual hierarchy):** Whether Register is styled as a solid/primary button and Login as a quiet/ghost button. The component template in this spec renders both as `<a>` elements with distinct class hooks; the design spec decides the visual variant.

### HTTP Request/Response Contracts
None. This ticket does not introduce, modify, or consume any HTTP endpoint.

---

## Implementation Steps

Follow these steps in order. All paths are repo-relative; note the nested `KanbAI-Web/KanbAI-Web/` Angular project root.

### 1. Add the `PUBLIC_HOME_ROUTE` constant
- [ ] Open `KanbAI-Web/src/app/core/constants/auth-routes.ts`.
- [ ] Add the `PUBLIC_HOME_ROUTE` export per **Design Decision #2** immediately after `AUTH_HOME_ROUTE`.
- [ ] Do not modify any other export in the file.

### 2. Update `NavbarComponent` class (TypeScript)
- [ ] Open `KanbAI-Web/src/app/core/layout/navbar/navbar.component.ts`.
- [ ] Add imports: `computed` from `@angular/core`; `RouterLink` from `@angular/router`; `AuthStateService` from `../../services/auth-state.service`; `AUTH_HOME_ROUTE` and `PUBLIC_HOME_ROUTE` from `../../constants/auth-routes`.
- [ ] Add `RouterLink` to the component's `imports: []` array (currently empty).
- [ ] Inject `AuthStateService` alongside the existing `AuthService` and `Router` injections using `inject()`.
- [ ] Expose `readonly isAuthenticated = this.authState.isAuthenticated;` on the component class.
- [ ] Expose `readonly brandTargetRoute = computed(() => this.isAuthenticated() ? AUTH_HOME_ROUTE : PUBLIC_HOME_ROUTE);`.
- [ ] **Do not modify `onLogout()`** — it remains synchronous and keeps the `authService.logout()` → `router.navigateByUrl(LOGIN_ROUTE)` order that guarantees the branch flip happens in the current change-detection tick (as documented in the existing JSDoc).
- [ ] Keep `ChangeDetectionStrategy.OnPush`.
- [ ] Keep `readonly currentUser = this.authService.currentUser;` — the template still reads this for the user's display name inside the authenticated branch.

### 3. Rewrite `NavbarComponent` template (HTML)
- [ ] Open `KanbAI-Web/src/app/core/layout/navbar/navbar.component.html`.
- [ ] Replace the `<h1 class="navbar__brand">KanbAI</h1>` element with an `<a>` anchor that:
  - Uses `[routerLink]="brandTargetRoute()"` so the target changes reactively with auth state.
  - Carries `class="navbar__brand"` so existing SCSS typography rules continue to apply (after the SCSS update in Step 4).
  - Carries `aria-label="KanbAI — home"` (or equivalent) so screen readers identify it as the home link.
  - Contains the literal text `KanbAI` as its visible label.
  - Uses `<span>` inside the anchor if wrapping is needed to preserve the `<h1>`-like appearance; the outer element is an `<a>` for semantics, not an `<h1>` with a click handler.
- [ ] Keep the `@if (currentUser(); as user) { ... }` structure but **change the gate expression** to read the authenticated-state signal AND still alias the user for display:
  - Recommended form: `@if (isAuthenticated()) { ... } @else { ... }`, and inside the authenticated branch dereference `currentUser()?.name` (safe-navigation) for the user name span. This keeps the branch gate on the single source of truth while letting the presentation use `currentUser` for its display field.
  - The authenticated branch's markup (`.navbar__auth-cluster`, `.navbar__user-name`, `.navbar__logout-btn`, existing ARIA) is **preserved verbatim** except for the name-read expression.
- [ ] Add the `@else { ... }` branch containing a mirror `.navbar__auth-cluster` div (preserving `role="group"` and setting `aria-label="Authentication"`) with two interactive elements:
  - A Login link: `<a routerLink="/login" class="navbar__login-btn">Login</a>` (the literal `/login` may be replaced with an expression bound to `LOGIN_ROUTE` if the team prefers constants in templates — this is a style nit, not a behavior change).
  - A Register link: `<a routerLink="/register" class="navbar__register-btn">Register</a>`.
  - Both elements must be focusable and activate on Enter / Space (anchors with `routerLink` satisfy this natively).
- [ ] Do not simultaneously render the anonymous and authenticated clusters — enforced by the `@if`/`@else` structure.

### 4. Update `NavbarComponent` SCSS
- [ ] Open `KanbAI-Web/src/app/core/layout/navbar/navbar.component.scss`.
- [ ] The existing `.navbar__brand` rule was written for an `<h1>`. Extend it so it also applies cleanly to the `<a class="navbar__brand">` variant:
  - Keep current `font-family`, `font-size`, `font-weight`, `line-height`, `color`, `letter-spacing`, `user-select`.
  - Add `text-decoration: none;` to suppress the default underline on anchors.
  - Add `color: $text-inverse;` explicitly (already the brand color, but anchors inherit a user-agent default if not overridden).
  - Add `cursor: pointer;` (anchors get this by default, but make it explicit).
  - Add a `&:focus-visible` rule mirroring the existing `.navbar__logout-btn:focus-visible` treatment (2px `$brand-primary` outline, 2px offset), and a `&:focus:not(:focus-visible)` suppressor for mouse clicks.
  - Add `&:hover { opacity: 0.88; }` (or equivalent subtle hover — final value owned by web-designer).
- [ ] Add placeholder rules `.navbar__login-btn` and `.navbar__register-btn` that carry a baseline matching the existing `.navbar__logout-btn` (44px min-height, touch target, focus-visible ring, dark-surface contrast). **Flag these as web-designer territory** — final visual variants (solid vs ghost) are resolved in the design spec per Open Questions #3 and #4.
- [ ] Do not modify `.navbar__auth-cluster`, `.navbar__user-name`, `.navbar__logout-btn`, or the `@keyframes` block — preserving these protects the #28 acceptance criteria.

### 5. Verify Reactive Transitions (no flicker)
- [ ] After the above changes, the branch gate is `isAuthenticated()`, which is written synchronously inside `AuthService.handleAuthSuccess()` (on login) and `AuthService.logout()` (on logout) — both in the same tick as the token write and the `currentUser` set. This preserves the no-flicker invariant described in Flow E of the context document.
- [ ] Confirm by inspection: no `setTimeout`, no `Promise.resolve().then(...)`, no microtask scheduling is introduced in the navbar or its dependencies.

### 6. Build & Lint
- [ ] Run `npm run build` from `KanbAI-Web/KanbAI-Web/`. Zero TypeScript and template errors.
- [ ] If a strict-template diagnostic fires on the `@else` / `isAuthenticated()` gate change, confirm that `RouterLink` is listed in the component's `imports` array.

**Performance Considerations:**
- `OnPush` is preserved; signal reads in the template (`isAuthenticated()`, `currentUser()`, `brandTargetRoute()`) drive re-renders automatically.
- `brandTargetRoute` is a `computed()` — it memoizes and only recomputes when `isAuthenticated` changes, which happens at most once per login/logout.
- No new subscriptions, no `takeUntilDestroyed()` needed (no RxJS streams are introduced).

---

## QA Guidance

### Test Strategy

**Unit Tests — `navbar.component.spec.ts`**

The existing spec (`KanbAI-Web/src/app/core/layout/navbar/navbar.component.spec.ts`) already has thorough coverage of the authenticated branch, OnPush, logout, and localStorage clearing. It assumes the branch gate is `AuthService.currentUser`, which is the existing implementation. After the gate migrates to `AuthStateService.isAuthenticated()`, the spec needs these updates:

**Update existing `beforeEach`:**
- Also reset `AuthStateService` state: after `authService.currentUser.set(null)`, call `authStateService.clearAuthState()` on an injected `AuthStateService`. This keeps every spec starting in the anonymous state across BOTH signals.

**Update existing specs that set `currentUser` to simulate an authenticated session:**
- Wherever the current spec does `authService.currentUser.set(mockUser)`, it must also call `authStateService.setAuthState('test-token', mockUser.id)` so the branch gate evaluates true. Suggested helper:
  ```typescript
  function signInAs(user: UserProfileDto): void {
    authService.currentUser.set(user);
    authStateService.setAuthState('test-token', user.id);
  }
  ```
  and mirror it with a `signOut()` helper that clears both.
- The existing "should clear AuthService.currentUser when Logout is clicked" spec still passes unchanged — `authService.logout()` clears both signals.
- The existing "should collapse back to anonymous state after Logout is clicked" spec still passes, because the branch gate flips when `clearAuthState()` runs.

**New specs to add (anonymous branch):**
1. **Anonymous branch renders Login control.** When `isAuthenticated()` is `false`, a DOM element with accessible name "Login" exists and its `routerLink` binding resolves to `/login` (or to `LOGIN_ROUTE`).
2. **Anonymous branch renders Register control.** As above, for "Register" → `/register` (or `REGISTER_ROUTE`).
3. **Anonymous branch does not render user-name span or Logout button.** Query for `[data-testid="navbar-user-name"]` and any element with accessible name "Logout" — both should be absent.
4. **Mutually exclusive branches.** Assert that in no signal configuration does both a Login control AND a Logout control render simultaneously.
5. **Reactive login transition.** Start anonymous, assert Login is rendered; call `signInAs(mockUser)`, run `detectChanges()`, assert Logout is rendered and Login is absent. Flow E.
6. **Reactive logout transition.** Start authenticated, assert Logout is rendered; click Logout (or call `signOut()`), run `detectChanges()`, assert Login is rendered and Logout is absent. Flow D.

**New specs to add (context-aware brand):**
7. **Brand is rendered as an `<a>` element, not an `<h1>`.** Query for `a.navbar__brand`; assert truthy. Query for `h1` inside `<nav>`; assert null (or assert the brand class is on the `<a>`, not on any `<h1>`).
8. **Brand has an accessible name identifying it as home.** Assert the anchor's `getAttribute('aria-label')` is non-empty and includes either "home" or the application name.
9. **Brand target is `PUBLIC_HOME_ROUTE` when anonymous.** With no authenticated state, read the `routerLink` binding on `.navbar__brand` (via `By.directive(RouterLink)` or by inspecting `getAttribute('href')` after `detectChanges()`) and assert it equals `PUBLIC_HOME_ROUTE` (i.e. `'/'`).
10. **Brand target is `AUTH_HOME_ROUTE` when authenticated.** Call `signInAs(mockUser)`, `detectChanges()`, assert the brand anchor's target equals `AUTH_HOME_ROUTE` (i.e. `'/dashboard'`).
11. **Brand target flips reactively when auth state flips.** Flow B → C transition coverage in a single test.

**New specs to add (branch gate source of truth — regression lock):**
12. **Navbar respects `AuthStateService.isAuthenticated()` as the gate.** Set only `authStateService.setAuthState(...)` without touching `authService.currentUser` — the authenticated branch should render (user-name will be empty/fallback, but Logout MUST appear). This pins Design Decision #1 in place and prevents a future regression where someone reintroduces a `currentUser`-only gate.
13. **Inverse regression lock.** Set only `authService.currentUser.set(mockUser)` without calling `setAuthState()` — the anonymous branch should render (Login + Register visible, Logout absent). Confirms that a phantom `currentUser` without a token no longer leaks the authenticated UI.

### Mocking Instructions

The existing spec stubs `localStorage` and provides a fake `Router`. Keep those. Add:
```typescript
let authStateService: AuthStateService;
// ... in beforeEach, after TestBed configuration:
authStateService = TestBed.inject(AuthStateService);
authStateService.clearAuthState();
```
No HTTP mocking is needed — the navbar makes no HTTP calls.

### Manual QA Scenarios

Map directly to the context doc's Flows:

- **Flow A (anonymous entry).** Load `/`; header shows Login + Register; click each; URL becomes `/login` / `/register` respectively. No console errors.
- **Flow B (anonymous logo click).** From `/login`, click brand; URL becomes `/`; Login + Register still rendered.
- **Flow C (authenticated logo click).** From `/board`, click brand; URL becomes `/dashboard`; user-name + Logout still rendered.
- **Flow D (authenticated logout).** From any authenticated route, click Logout; URL becomes `/login`; header shows Login + Register. No flicker of user-name during transition.
- **Flow E (mid-session transition).** Sign in on `/login`; observe the header flip to user-name + Logout without an observable frame of both branches rendered simultaneously; navigate `/dashboard` → `/board` → `/dashboard`; Logout remains visible throughout. This is the headline acceptance flow for this ticket.

### Regression / Build Gates
- `npm run build` succeeds (per existing CLAUDE.md standards).
- `npm run test -- --watch=false`: zero INTRODUCED failures. The existing 13 navbar specs must all still pass after the `beforeEach` helper update; the new specs (6 anonymous + 5 brand + 2 regression locks = 13 additions) are greenfield and count toward the new coverage.
- `auth.guard.spec.ts`, `unauth.guard.spec.ts`, and any `app.routes` test pass unchanged — this ticket does not touch them.
- Browser console is clean during Flows A, C, D end-to-end.

### Edge Cases to Test
- **`isAuthenticated()` is true but `currentUser()` is null (race window).** The user-name span uses safe navigation (`currentUser()?.name`) and renders empty/fallback, but the Logout button still renders. In practice this is a one-tick window inside `handleAuthSuccess` and should not be observable under normal flows — the test exists as a regression lock.
- **`isAuthenticated()` is false but `currentUser()` is non-null.** Anonymous branch renders; the stale `currentUser` is ignored until it is explicitly cleared. The next tick of any logout path clears both signals.
- **Rapid login → logout → login sequence.** The branch gate flips synchronously on each transition; no stale render should survive a `detectChanges()`.
- **Keyboard-only navigation.** Tab through the header: brand (Enter navigates home), then Login, then Register in the anonymous state; brand, then Logout in the authenticated state. Each element shows the focus-visible ring.

---

## Design Validation (Self-Check)

**Interface Alignment:**
- [x] No new interfaces; existing `UserProfileDto` consumed unchanged.
- [x] Signals typed: `isAuthenticated: Signal<boolean>`, `currentUser: Signal<UserProfileDto | null>`, `brandTargetRoute: Signal<string>`.

**Standards Compliance (CLAUDE.md):**
- [x] Uses `inject()` for DI (preserved).
- [x] Uses Signals for UI state (preserved + extended).
- [x] `ChangeDetectionStrategy.OnPush` preserved.
- [x] Standalone component (preserved).
- [x] Uses `@if` / `@else` control flow (Angular 17+ syntax, matches the rest of the codebase).
- [x] No RxJS subscriptions introduced; `takeUntilDestroyed` not required.

**Security:**
- [x] Routes (`/login`, `/register`, `/dashboard`, `/`) are guard-protected upstream; the navbar does not bypass any guard.
- [x] No user input is accepted by the navbar.
- [x] No `[innerHTML]`, no direct DOM manipulation.
- [x] No new `localStorage` usage.

**Completeness:**
- [x] All files to modify listed.
- [x] Implementation steps ordered (constant → class → template → SCSS → verify → build).
- [x] Every acceptance criterion in the context doc maps to an implementation step or a QA spec — most tightly:
  - "Anonymous Header" AC block → Steps 2 + 3 + 4; QA specs 1–3.
  - "Authenticated Header (Logout stability)" AC block → Steps 2 + 3 (gate migration); QA specs 4–6, 12–13 (regression locks).
  - "Context-Aware Logo" AC block → Steps 2 + 3 + 4; QA specs 7–11.
  - "Reactive Transitions" AC block → Step 5 (inspection); QA specs 5–6.
  - "Regression / Build Gates" AC block → Step 6.

---

## Development Status

**Implementation Date:** 2026-05-01
**Developer:** Claude Opus 4.7

### Files Created
None.

### Files Modified
- `KanbAI-Web/src/app/core/constants/auth-routes.ts` — added `PUBLIC_HOME_ROUTE = '/'`.
- `KanbAI-Web/src/app/core/layout/navbar/navbar.component.ts` — injected `AuthStateService`, exposed `isAuthenticated` + `brandTargetRoute` (computed), imported `RouterLink`.
- `KanbAI-Web/src/app/core/layout/navbar/navbar.component.html` — replaced inert `<h1>` with a routed `<a class="navbar__brand">`, migrated branch gate to `isAuthenticated()`, added `@else` anonymous cluster with Login + Register links.
- `KanbAI-Web/src/app/core/layout/navbar/navbar.component.scss` — refactored to design spec: `%navbar-action-btn` + `%navbar-action-btn--ghost` placeholders, brand anchor rules, Login (ghost) / Register (solid primary) / Logout (ghost) variants.
- `KanbAI-Web/src/app/core/layout/navbar/navbar.component.spec.ts` — full rewrite: added `provideRouter([])`, AuthStateService reset helpers (`signInAs`, `signOut`), anonymous-branch specs (6), reactive-transition specs (2), context-aware-brand specs (3), single-source-of-truth regression locks (2). Brand-target assertion reads rendered `href` attribute (black-box) rather than `RouterLink` private fields.
- `KanbAI-Web/src/app/app.spec.ts` — added `provideRouter([])` + HTTP client providers (now required because `NavbarComponent` imports `RouterLink`); updated `app-navbar h1` selector to `app-navbar .navbar__brand` to match the new anchor-based brand.

### Files NOT Modified (guardrail respected)
- `AuthService.ts`, `auth-state.service.ts`, `auth.guard.ts`, `unauth.guard.ts`, `app.routes.ts`, `app.html` — per tech spec.

### Design Decisions Honored
- **D1 (Design Spec): `%navbar-action-btn` placeholder** — adopted verbatim; Login/Logout extend `%navbar-action-btn--ghost`, Register extends `%navbar-action-btn` with solid `$brand-primary` fill.
- **D2 (Design Spec): Register solid, Login ghost** — adopted.
- **TechSpec D1: `AuthStateService.isAuthenticated()` as gate** — adopted; regression-locked with two new specs.
- **TechSpec D2: `PUBLIC_HOME_ROUTE = '/'`** — adopted.

### Build & Test Results
- **Build:** ✅ SUCCESS (`npm run build` — 0 errors, 0 warnings that reference modified files).
- **Tests:** 590 total, 590 passed, 0 failed (39 test files). The 13 existing navbar specs were refactored in-place; 13 new specs were added (anonymous branch, reactive transitions, context-aware brand, regression locks).
- **Pre-existing failures:** None observed on this run.

### Acceptance-Criteria Coverage Snapshot
- Anonymous Login/Register links + keyboard focus + 44px touch target + focus ring — covered by SCSS `%navbar-action-btn` + specs "should render a Login control with routerLink to /login" / "…Register…".
- Logout stability across authenticated routes — gate migrated to `AuthStateService.isAuthenticated()`; "branch gate single source of truth" specs prevent regression.
- Mutually-exclusive branches — `@if` / `@else` in template; "should never simultaneously render Login and Logout controls" spec asserts it.
- Context-aware brand — `brandTargetRoute = computed(...)`; "should target PUBLIC_HOME_ROUTE when anonymous" / "…AUTH_HOME_ROUTE when authenticated" / "…flip reactively…" specs.
- No observable double-branch frame during reactive transitions — `handleAuthSuccess` / `logout` write both signals synchronously before `navigateByUrl` (unchanged from #55).

### Edge Cases for QA
- Hard-refresh on `/dashboard` without a token: `authGuard` bounces to `/login`; navbar renders the anonymous cluster immediately. No manual flicker.
- `AuthStateService` cleared without `currentUser.set(null)` (hypothetical interceptor path): navbar correctly flips to anonymous — covered by regression-lock spec 13.
- `currentUser` set without a token (hypothetical phantom state): navbar stays anonymous — covered by regression-lock spec 13.
- Reduced-motion: handled globally by `_motion.scss`; no component override required.
- 320px viewport: brand + Login + Register fits per design-spec pressure test (≈261px in a 320px viewport).

### Known Limitations
- None introduced. The anonymous-branch fade-in reuses the existing `navbar-auth-cluster-in` keyframe — the keyframe plays for the authenticated cluster too (unchanged from #28).

### Notes
- `RouterLink` brand-target assertions read the rendered `href` attribute instead of reaching into the directive's private `.routerLink` field — the private field is getter-backed and reads as `undefined` under Vitest, which the first pass stumbled on.
- `Router.navigateByUrl` is spied on the real `Router` instance (rather than providing a mock) so `RouterLink` keeps using the same injector-resolved instance for its own navigation calls. The spy returns a resolved Promise to match the real signature.
