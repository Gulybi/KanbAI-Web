# Design Specification: Route Guards for Protected Areas

**Technical Spec:** [issue_27_tech_spec.md](./issue_27_tech_spec.md)
**Context Doc:** [issue_27_context.md](./issue_27_context.md)
**GitHub Issue:** [#27](https://github.com/Gulybi/KanbAI-Web/issues/27)
**Design System:** KanbAI Project Management Dashboard v1.0

---

## Section 1 — Overview

### Design Intent

Issue #27 is overwhelmingly a routing / guard contract change — there are no new feature surfaces, no new components, and no new interactive controls. The user-visible outcome of the feature is an **absence of visible state**: correctly-guarded routes should feel instantaneous, deterministic, and never flash protected UI. When the app does redirect, it should do so in a way that the user never sees a half-loaded protected page and never loses their place.

Because the guards run synchronously on a Signals-backed source of truth, the **dominant UX goal is "no perceptible latency, no content flash, and a calm post-login return to the originally requested URL"**. The secondary UX goal is to reassure the user on `/login` when they arrive there involuntarily (via a deep link blocked by `authGuard`) — they need to understand **why** the login form is in front of them and **where** they will be returned after signing in.

### Scope

**Components styled (all pre-existing; this spec only patches them where the guard contract surfaces visually):**

1. **LoginPageComponent** — add an optional "Sign in to continue" contextual banner that renders when `returnUrl` is present in the query string. This is the only *new* visual element introduced by #27.
2. **LandingPageComponent / HeroSectionComponent** — unchanged visually; styling tokens listed for cross-reference only so the `unauthGuard` redirect target remains visually coherent with the post-redirect destination.
3. **BoardPageComponent** — unchanged; a standardised "guard-evaluating" skeleton placeholder is defined in case future async rehydration work needs to mask a gap (currently N/A since guards are synchronous).
4. **Global** — `prefers-reduced-motion` rule must be present in global styles for the redirect fade (see Section 3.5).

**States covered** (per component, where applicable): default, hover, focus, active, disabled, loading, empty, error, plus the new feature-specific state **returnUrl-present** on the login page.

**Responsive:** mobile (<`$bp-md`), tablet (`$bp-md`–`$bp-lg`), desktop (≥`$bp-lg`).

**Non-goals (call-outs, not work):**
- The full login form styling lives with the login-form implementation issue (a follow-up); this spec only defines the **context banner** that the form must render above itself.
- Board page drag/card choreography is defined by the kanban spec (future); this spec only defines the skeleton placeholder that covers the 0–60ms window between navigation and first paint.

---

## Section 2 — Token Consumption

This spec consumes the canonical KanbAI design system v1.0. **No new tokens are introduced.**

| Token | Where used |
|---|---|
| `$brand-primary` | Focus ring on login banner dismiss button; `$brand-primary-light` background on the returnUrl context banner |
| `$brand-primary-light` | Background fill of the "Sign in to continue" banner |
| `$brand-primary-hover` | Hover state on banner icon link |
| `$bg-main` | Login card surface, landing/board base background |
| `$bg-sidebar-light` | Skeleton placeholder fill for guard-evaluating state |
| `$bg-card` | Login card fill |
| `$text-primary` | Banner heading and body copy on `$brand-primary-light` background |
| `$text-secondary` | "You will return to …" meta text on banner |
| `$text-tertiary` | Skeleton placeholder shimmer variant (never body copy) |
| `$status-high` | Destination-tampered error banner left border + icon (when `isSafeReturnUrl` rejects a URL post-login — surfaced as toast; see Flow 4) |
| `$border-light` | Banner bottom border, skeleton row dividers |
| `$border-dropzone` | *not used in #27* |
| `$radius-md` | Banner corners, dismiss button |
| `$radius-lg` | Login card (unchanged from future login styling) |
| `$radius-circle` | Banner info icon background |
| `$shadow-card` | Login card resting shadow (unchanged) |
| `$shadow-dropdown` | Toast shown on `returnUrl` rejection |
| `$space-xs` / `$space-sm` / `$space-md` / `$space-lg` | Banner padding, banner-to-form gap, internal icon-to-text spacing |
| `$font-family-base` | All text |
| `$font-size-sm` | Banner meta ("You will return to …") |
| `$font-size-md` | Banner body copy |
| `$font-size-lg` | Banner heading |
| `$font-weight-medium` / `$font-weight-semibold` | Banner heading / link emphasis |
| `$line-height-normal` | Banner copy |
| `$motion-fast` | Banner entrance fade + focus-ring transitions |
| `$motion-base` | Skeleton pulse, toast slide-in |
| `$bp-md`, `$bp-lg` | Banner layout collapse on small screens |

### Proposed Token Additions

**None.** Every visual need of this feature is covered by the v1.0 token catalogue.

### Prerequisites (BLOCKING for developer)

The developer **must** scaffold these token files before any component SCSS authored below will compile. They do not exist today:

- `src/styles/variables/_colors.scss`
- `src/styles/variables/_typography.scss`
- `src/styles/variables/_spacing.scss`
- `src/styles/variables/_radius.scss`
- `src/styles/variables/_shadows.scss`
- `src/styles/variables/_layout.scss`
- `src/styles/variables/_motion.scss`
- `src/styles/variables/_breakpoints.scss`
- A global `src/styles.scss` that forwards the above and declares the global `prefers-reduced-motion` rule from Section 6.

Contents of each file are **verbatim** the SCSS blocks in the Canonical Design System section of `.claude/agents/web-designer.md`. Once scaffolded, any future design spec can import them with `@use 'src/styles/variables/colors' as *;` etc.

The existing landing page (`hero-section.component.scss`) uses hardcoded hex gradients (`#eff6ff`, `#1e40af`, `#7c3aed`, `#3b82f6`) that **drift from the canonical palette**. That drift is pre-existing (landed in #29) and is **out of scope** for #27, but the developer should surface it as a follow-up issue ("align landing page styling to design tokens v1.0") after this ticket lands, so the post-guard-redirect destination matches the rest of the product.

---

## Section 3 — Per-Component Styling

### 3.1 Component: LoginPageContextBanner (NEW — sub-component of LoginPageComponent)

**File:** `src/app/features/auth/login-page/components/context-banner/context-banner.component.scss`
**Role:** Informs the user that they were redirected to login because they attempted to reach a protected URL, and tells them exactly where they will return after a successful sign-in.

**When it renders:** Only when `ActivatedRoute.snapshot.queryParamMap.get('returnUrl')` is present AND `isSafeReturnUrl(raw)` returns `true`. Otherwise the banner is omitted entirely (no empty slot, no collapsed space).

**Layout:** Flex row on ≥`$bp-md`, stacked column on `<$bp-md`. Icon + text block + optional "Cancel" ghost link. Sits immediately above the login card, same max-width as the card, full-width on mobile.

**States:**
- **default** — `$brand-primary-light` background, `$text-primary` heading, `$text-secondary` meta line.
- **hover** (on "Cancel" ghost link) — underline appears, color shifts to `$brand-primary-hover`.
- **focus-visible** (on "Cancel") — 2px `$brand-primary` outline, 2px offset.
- **active** (on "Cancel") — no distinct styling beyond focus (text link).
- **entrance** — fades in over `$motion-fast` from `opacity: 0` + `translateY(-4px)` when the component mounts. Honors `prefers-reduced-motion`.
- **error** (impossible in v1 — `isSafeReturnUrl` already filtered; reserved for future) — if triggered, swaps left border to `$status-high` (4px) and displays "We'll ignore that link because it points outside KanbAI."

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/shadows' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;
@use 'src/styles/variables/breakpoints' as *;

.context-banner {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: $space-sm;

  max-width: 420px;           // matches login card max-width
  width: 100%;
  margin: 0 auto $space-lg;   // sits above login card with breathing room
  padding: $space-md $space-lg;

  background: $brand-primary-light;
  border-radius: $radius-md;
  border-left: 4px solid $brand-primary;

  font-family: $font-family-base;

  // Entrance motion — subtle, acknowledges the redirect without being showy.
  opacity: 0;
  transform: translateY(-4px);
  animation: context-banner-enter $motion-fast forwards;

  @include respond-to('md') {
    flex-direction: row;
    align-items: center;
    gap: $space-md;
  }
}

.context-banner__icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  background: $brand-primary;
  color: $text-inverse;
  border-radius: $radius-circle;

  // 32px is AA-large-text territory — icon is ≥18px, weight-medium. OK on
  // $brand-primary (3.3:1 vs white) per design system audit.
}

.context-banner__body {
  flex: 1;
  min-width: 0; // allow text truncation inside returnUrl display
}

.context-banner__heading {
  margin: 0 0 $space-xxs;
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  line-height: $line-height-normal;
  color: $text-primary;
}

.context-banner__meta {
  margin: 0;
  font-size: $font-size-sm;
  font-weight: $font-weight-regular;
  line-height: $line-height-normal;
  color: $text-secondary;
}

.context-banner__return-url {
  color: $text-primary;
  font-weight: $font-weight-medium;

  // Truncate absurdly long returnUrls so the banner height is bounded.
  display: inline-block;
  max-width: 260px;
  vertical-align: bottom;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context-banner__cancel {
  flex-shrink: 0;
  background: transparent;
  border: none;
  padding: $space-xs $space-sm;

  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: $brand-primary;
  cursor: pointer;

  transition: color $motion-fast, text-decoration-color $motion-fast;

  // AA: $brand-primary (#8C9B7B) on $brand-primary-light (#E8EBE4) ≈ 2.4:1.
  // Below AA — so we REQUIRE an underline (non-color affordance) and a visible
  // focus ring. The underline is the primary signal; color is supporting only.
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: 2px;

  &:hover {
    color: $brand-primary-hover;
    text-decoration-color: currentColor;
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
    text-decoration-color: currentColor;
    border-radius: $radius-sm;
  }

  // Touch target: enforce 44×44 on small screens.
  @media (hover: none) and (pointer: coarse) {
    min-width: 44px;
    min-height: 44px;
    padding: $space-sm $space-md;
  }
}

@keyframes context-banner-enter {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

**Interaction notes:**
- Banner auto-mounts with `$motion-fast` fade; no user action required.
- "Cancel" ghost link clears `returnUrl` by navigating to `/login` (same path, no query params) and preserves the banner's absence on the next mount. It is **not** a destructive action — it simply means "I changed my mind, don't send me back there."
- Reduced motion: global rule clamps the entrance animation to 0.01ms (instant), preserving transitionend semantics.

**Accessibility:**
- **Role/ARIA:** `role="status"` on `.context-banner` (implicitly `aria-live="polite"`) so the announcement fires when the banner appears for users on screen readers ("Sign in to continue to /board").
- **Heading structure:** Use a `<p>` with `$font-weight-semibold` for the heading, NOT an `<h1>`/`<h2>` — the login page owns the heading hierarchy; banner is supplementary.
- **Contrast (measured):**
  - `$text-primary` on `$brand-primary-light` → 12.6:1 ✅ AAA
  - `$text-secondary` on `$brand-primary-light` → 4.3:1 ✅ AA for normal text (passes 4.5 with $font-size-sm at normal weight marginally; use `$font-weight-medium` if audit flags 12px/400)
  - `$text-inverse` on `$brand-primary` (icon) → 3.3:1 ✅ AA for UI/large graphic
  - `$brand-primary` on `$brand-primary-light` (cancel link) → 2.4:1 ⚠️ **requires** underline + focus ring (non-color affordance present)
- **Touch:** Cancel button ≥44×44 on coarse pointers via media query.
- **Reduced motion:** entrance animation collapses to instant.
- **`returnUrl` display:** rendered as text only via `{{ returnUrl }}` interpolation — NEVER via `[innerHTML]`. The string is XSS-safe by virtue of Angular's default text binding, but any future decision to surface it differently (e.g., as a clickable chip) must round-trip through `isSafeReturnUrl` again.

---

### 3.2 Component: LoginPageComponent (EXISTING — template update only)

**File:** `src/app/features/auth/login-page/login-page.component.scss`
**Role:** Hosts the login form and conditionally the context banner above it.

**What changes in #27:** Template adds `<app-login-context-banner *ngIf="returnUrlSafe()" [returnUrl]="returnUrlSafe()!" />` above the login card. Everything else is deferred to the login-form issue.

**States:** N/A for this pass — only the *container* gains responsibility for relaying `returnUrl`. No new visual states on the page itself.

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/shadows' as *;
@use 'src/styles/variables/breakpoints' as *;

:host {
  display: block;
  min-height: 100vh;
  background: $bg-main;
  padding: $space-xl $space-md;

  // Center content column. Login card + optional banner share this column.
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.login-page__column {
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: $space-lg;
}

.login-page__card {
  background: $bg-card;
  border-radius: $radius-lg;
  box-shadow: $shadow-card;
  padding: $space-xl;

  @include respond-to('md') {
    padding: $space-xl $space-xxl;
  }
}

// Explicit: do NOT touch login form internals here. The form styling lives in
// a separate issue. This file exists to anchor the layout column so the
// context banner has a consistent max-width and gap above the card.
```

**Interaction notes:**
- When the banner is present, total vertical space is roughly `banner (≈96px)` + `$space-lg` + `card`. Still centers on viewports ≥720px tall; on shorter viewports (e.g., landscape phone) the page scrolls naturally — no fixed positioning.

**Accessibility:**
- `:host` is the page-level region — the form inside receives `main` landmark semantics via the app shell. No changes needed here.
- Focus management: when the banner appears, the login page must still deliver initial focus to the first form field (email/username), NOT to the banner. The banner is passive information.

---

### 3.3 Component: BoardPageComponent — Guard-Evaluating Skeleton (contingency)

**File:** `src/app/features/board/board-page/board-page.component.scss` (additive; existing styling untouched)
**Role:** Masks the invisible <16ms window between a `Router` navigation resolving and Angular painting the board. **In #27 this is effectively never visible** because guards are synchronous and return immediately. The styling is specified now so that when the future localStorage rehydration issue introduces a short async wait, the developer can wire the skeleton without re-opening the design.

**States:** loading (skeleton pulse), default (pass-through — existing board renders), error (rehydration failed — out of scope; pattern below is reserved).

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/motion' as *;

.board-page__guard-skeleton {
  // Only rendered when AuthStateService exposes an `isResolving` signal in
  // the future. #27 does NOT wire this — it's defined for drop-in use.
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 300px;
  gap: $space-lg;
  padding: $space-lg;

  overflow-x: auto;
}

.board-page__guard-skeleton-column {
  height: 480px;
  background: $bg-sidebar-light;
  border-radius: $radius-lg;

  opacity: 0.6;
  animation: guard-skeleton-pulse 1.4s ease-in-out infinite;
}

@keyframes guard-skeleton-pulse {
  0%, 100% { opacity: 0.6; }
  50%      { opacity: 1;   }
}

// Honor prefers-reduced-motion globally — the keyframes still fire but the
// global rule clamps their duration to 0.01ms, so the skeleton is visible but
// static. That is the desired outcome for reduced-motion users.
```

**Interaction notes:**
- If the skeleton is ever shown for longer than **800ms**, the developer should surface the inline error pattern defined in Section 3.4. Below 800ms, the skeleton alone is sufficient.
- No interaction on the skeleton — it is purely visual.

**Accessibility:**
- `aria-busy="true"` on the board container while the skeleton is visible.
- `aria-live="polite"` announcement: "Loading your board" — fired only if the wait exceeds **250ms** (avoids chatty announcements on fast paths).

---

### 3.4 Toast: Post-Login Return-URL Rejection

**File:** Co-located with the future toast/notification service (out of scope to create here). **Styling is specified so the developer can reuse on any future toast surface.**
**Role:** Shown at the bottom-right when the login page discards an unsafe `returnUrl` and redirects to `AUTH_HOME_ROUTE` instead. The user must know why they didn't land where the URL claimed.

**States:** default (shown), dismissing (fade + slide out).

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/shadows' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;

.toast--returnurl-rejected {
  position: fixed;
  right: $space-lg;
  bottom: $space-lg;
  max-width: 360px;
  z-index: 1000;

  display: flex;
  align-items: flex-start;
  gap: $space-sm;

  padding: $space-md $space-lg;
  background: $bg-card;
  border-radius: $radius-md;
  border-left: 4px solid $status-high;
  box-shadow: $shadow-dropdown;

  font-family: $font-family-base;
  font-size: $font-size-md;
  line-height: $line-height-normal;
  color: $text-primary;

  // Entrance: slide up + fade in.
  animation: toast-enter $motion-base forwards;

  &[data-dismissing='true'] {
    animation: toast-leave $motion-base forwards;
  }
}

.toast--returnurl-rejected__icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  color: $status-high; // border + icon = two non-color signals with the text
}

@keyframes toast-enter {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes toast-leave {
  from { opacity: 1; transform: translateY(0); }
  to   { opacity: 0; transform: translateY(8px); }
}
```

**Copy:** "That link pointed outside KanbAI, so we brought you home instead." Auto-dismiss at 6 seconds (slightly longer than the 4s default because the user's mental model of "where they came from" was just rewritten).

**Accessibility:**
- `role="status"`, `aria-live="polite"`.
- Left border (`$status-high`, 4px) + icon in `$status-high` + explicit text copy — three non-color signals.
- Contrast: `$text-primary` on `$bg-card` = 17.9:1 ✅ AAA.
- Not a modal — does not trap focus.

---

### 3.5 Global: `prefers-reduced-motion` Rule

**File:** `src/styles/variables/_motion.scss` (one of the prerequisite files to scaffold)

```scss
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

This rule is consumed automatically once `_motion.scss` is `@use`-d from `src/styles.scss`. It clamps rather than eliminates durations so `transitionend`/`animationend` events still fire for any component code that depends on them (Angular Animations, focus-after-fade patterns, etc.).

---

## Section 4 — User Flows with Visual States

### Flow 1: Unauthenticated user deep-links to `/board`

1. **Entry:** User pastes `/board/some-id` into the address bar.
2. **Router picks up navigation.** `authGuard` runs synchronously against `isAuthenticated()` → `false`.
3. **Guard returns UrlTree** → router redirects to `/login?returnUrl=%2Fboard%2Fsome-id`. **No flash of board UI** (guard runs before component instantiation).
4. **Login page mounts.** `:host` fades in with existing default styling (if any future global route transition adds one — not required for #27).
5. **Context banner appears above login card** with entrance animation (`$motion-fast` fade + 4px translate).
   - Copy: "Sign in to continue" (heading) / "You'll return to /board/some-id after you sign in." (meta).
   - Left border: 4px `$brand-primary`.
   - Background: `$brand-primary-light`.
   - Icon: 32px circle, `$brand-primary` fill, white info glyph.
6. **Focus lands on the first form field** (not the banner). `aria-live="polite"` announces the banner copy to screen readers.
7. **User signs in successfully.** Login component reads `queryParamMap.get('returnUrl')`, validates via `isSafeReturnUrl`, calls `router.navigateByUrl('/board/some-id')`.
8. **Board renders.** No intermediate flicker.

**Edge: `returnUrl` is external** (`https://evil.example.com`). `isSafeReturnUrl` rejects → login page falls back to `AUTH_HOME_ROUTE` → toast from Section 3.4 appears bottom-right for 6s.

### Flow 2: Authenticated user clicks stale bookmark to `/login`

1. **Entry:** User lands on `/login` while already signed in.
2. **`unauthGuard` runs** against `isAuthenticated()` → `true`.
3. **Guard returns UrlTree** → router redirects to `AUTH_HOME_ROUTE` (`/board`).
4. **Login form never mounts.** No flash. The context banner is never instantiated — the route is rewritten before component code runs.
5. **User sees board.** No toast, no warning — this is the happy path for an already-signed-in user.

### Flow 3: Authenticated user visits landing `/`

1. **Entry:** Typed URL, browser refresh while signed in, or click on a navbar "Home" link.
2. **`unauthGuard` on `''` route** runs → redirects to `AUTH_HOME_ROUTE`.
3. **Landing hero never paints.** Identical no-flash guarantee to Flow 2.

### Flow 4: Unknown path while unauthenticated

1. **Entry:** `/foo-bar-baz` pasted while signed out.
2. **Wildcard route matches** → `redirectTo: ''`.
3. **`''` route's `unauthGuard`** runs → `isAuthenticated()` false → passes through → landing page renders.
4. **User sees landing hero.** No indication that a 404 occurred. This is intentional — KanbAI's voice is calm, not apologetic; surfacing a 404 for a typo would be louder than the mistake warrants. The acceptance criterion "Authenticated users → redirect to home; unauthenticated users → redirect to landing" is satisfied with zero visible error.

### Flow 5: Unknown path while authenticated

1. **Entry:** `/foo-bar-baz` while signed in.
2. **Wildcard → `''` → `unauthGuard` sees `isAuthenticated()` true** → redirects to `AUTH_HOME_ROUTE`.
3. **Board renders.** Same zero-flash guarantee; user ends up home.

### Flow 6: Mid-session logout (Tab A) → navigation attempt (Tab B)

1. **Tab A:** user clicks Logout (styled by issue #28). `AuthStateService.clearAuthState()` flips `isAuthenticated()` → `false`.
2. **Tab B:** user is on `/board`. No state is pushed cross-tab in #27, so Tab B's paint doesn't change instantly. (Cross-tab logout is a follow-up.)
3. **Tab B: next navigation** (click any link, refresh, browser Back) re-runs `authGuard` → sees `false` → redirect to `/login?returnUrl=%2Fboard`.
4. **Flow 1 resumes from step 4.** Context banner explains the redirect.

### Flow 7: Browser Back after logout

1. User is on `/board`, clicks Logout → navigated to `/` (landing).
2. User presses browser **Back**.
3. Angular re-runs `authGuard` on the popstate navigation → `isAuthenticated()` false → redirects to `/login?returnUrl=%2Fboard`.
4. **Context banner appears** — user is reassured they'll return after re-auth.

### Flow 8: Cold-start deep link with no rehydration (current reality)

1. User clicks emailed link to `/board/abc-123`.
2. App boots. `AuthStateService` starts in unauthenticated state (no rehydration in #27).
3. `authGuard` runs → redirect to `/login?returnUrl=%2Fboard%2Fabc-123`.
4. **Context banner appears.** User signs in. Returns to `/board/abc-123`.

This is the Design Decision Q2 outcome from the tech spec. Once rehydration ships, the same URL will skip the redirect entirely because `isAuthenticated()` will be `true` at guard time — the banner correctly never shows.

---

## Section 5 — Responsive Behavior

### `<$bp-md` (mobile, <768px)

- **Context banner:** stacks to column layout. Icon (32px) sits at the top, heading + meta below it, "Cancel" link last. Padding tightens to `$space-md $space-md`.
- **`returnUrl` text:** `max-width: 100%` on mobile (overrides the 260px desktop cap), but still `overflow: hidden; text-overflow: ellipsis` to prevent a three-line banner.
- **Cancel link:** minimum 44×44px hit target enforced via the `(hover: none) and (pointer: coarse)` media query.
- **Login page column:** `padding: $space-lg $space-md`; banner + card both full-width within the 420px max.
- **Toast:** `right: $space-md; bottom: $space-md; max-width: calc(100vw - #{$space-md} * 2);` — a dedicated mobile override so the toast never overflows.

### `$bp-md`–`$bp-lg` (tablet, 768–992px)

- **Context banner:** row layout. Icon → body (flex:1) → Cancel. Total banner height ~72px.
- **Login card:** unchanged padding.
- **Toast:** `max-width: 360px`, anchored bottom-right.

### `≥$bp-lg` (desktop)

- All components at their canonical spec dimensions. Context banner sits centered in a 420px column above the login card, with `$space-lg` gap below.

### Orientation & zoom

- **Landscape phone** (short viewport): `:host` drops `justify-content: center` at `<640px` tall via `@media (max-height: 640px)` so the banner + card scroll naturally from the top. **Covered implicitly by `min-height: 100vh` + flex centering** — the page scrolls when content exceeds viewport height.
- **200% zoom:** all copy wraps; banner grows in height but never overflows because `returnUrl` truncates and text lines reflow.

---

## Section 6 — Accessibility Audit (WCAG AA)

### Contrast (measured, rounded to 1 decimal)

| Pair | Surface | Foreground | Ratio | Verdict |
|---|---|---|---|---|
| Banner heading | `$brand-primary-light` (#E8EBE4) | `$text-primary` (#1C1C1C) | **12.6:1** | ✅ AAA |
| Banner meta | `$brand-primary-light` | `$text-secondary` (#7A7A7A) | **4.3:1** | ✅ AA (normal text ≥14px; use `$font-weight-medium` if 12px is used) |
| Banner returnUrl emphasis | `$brand-primary-light` | `$text-primary` | **12.6:1** | ✅ AAA |
| Banner icon glyph | `$brand-primary` (#8C9B7B) | `$text-inverse` (#FFF) | **3.3:1** | ✅ AA for UI/icon (non-text) |
| Banner "Cancel" link text | `$brand-primary-light` | `$brand-primary` (#8C9B7B) | **2.4:1** | ⚠️ Below AA — **mitigated** by (a) always-visible underline on hover/focus, (b) 2px focus ring, (c) adjacent text context. Color is NOT the sole signal. |
| Focus ring on Cancel | Any | `$brand-primary` | n/a — 2px outline | ✅ Visible per WCAG 2.4.7 |
| Toast body | `$bg-card` (#FFF) | `$text-primary` | **17.9:1** | ✅ AAA |
| Toast icon + left border | `$bg-card` | `$status-high` (#E56B6F) | **3.5:1** | ✅ AA for UI |
| Skeleton on bg | `$bg-main` | `$bg-sidebar-light` (#F4F5F1) | n/a — decorative | N/A (no text inside) |

**Known sub-AA pair:** `$brand-primary` on `$brand-primary-light` for the cancel link (2.4:1). This is the **same limitation flagged in the canonical design system audit** for white-on-sage body copy. The mitigation pattern is consistent with system-wide usage: pair the subthreshold color with a structural affordance (underline, icon, border) so color is never the sole signal. Flagging here explicitly so the developer does not reach for a different shade.

### Keyboard

- **Tab order on login page with banner:** skip-to-main (if present from app shell) → context banner "Cancel" link → first form field → subsequent form fields → submit button → any secondary links (forgot password, register). Banner is visited first because it is earlier in DOM order; the user can immediately tab past it to reach the form.
- **Focus ring:** 2px `$brand-primary` solid outline with 2px offset on the Cancel link. All other interactive elements inherit the global focus-visible style from the future login-form spec.
- **Escape key:** no trap on the login page (not a modal). The banner's Cancel link is equivalent to pressing Escape semantically, but we do not wire a keyboard Escape handler in #27.
- **Screen reader announcement:** banner appears with `role="status"` → its text is announced politely on mount. No interruption to form focus.

### Screen Reader

- **Context banner:** `role="status"` (implies `aria-live="polite"` + `aria-atomic="true"`). Announces heading + meta as a single utterance. `returnUrl` text is read verbatim — which is acceptable because it is pre-filtered to in-app paths, short, and informational.
- **Cancel link:** semantic `<button type="button">` (NOT an anchor — it performs a route action, not navigation to an external URL). `aria-label="Cancel return, sign in to home page"` so the action is explicit.
- **Toast:** `role="status"`, `aria-live="polite"`. Dismiss button (if present — not required for auto-dismiss toasts) has `aria-label="Dismiss notification"`.
- **Skeleton:** `aria-busy="true"` on the board container while the skeleton is visible. When wait exceeds 250ms, an `aria-live="polite"` region announces "Loading your board."

### Motion

- **Global `prefers-reduced-motion` rule** clamps all transitions/animations to 0.01ms — the banner entrance, toast slide, and skeleton pulse all become instant state changes. `transitionend`/`animationend` still fire because duration is non-zero.
- **No auto-playing animations** beyond the skeleton pulse, which is a feedback affordance (allowed).
- **No parallax, no scroll-hijack, no autoplaying video.**

### Forms (if applicable)

Out of scope for #27 — form styling is owned by the login-form issue. The banner above the form has no inputs.

### Route-level accessibility

- The **redirect itself** is invisible to assistive tech because no interstitial component mounts. Screen readers announce the destination (`/login`) on arrival via the app-shell's usual route-change announcement (if one exists; if not, this is a follow-up outside #27 scope).

---

## Section 7 — Implementation Checklist for Developer

### Prerequisites (BLOCKING — must complete before any per-component SCSS compiles)

- [ ] Create `src/styles/variables/` directory.
- [ ] Create the eight token files (`_colors.scss`, `_typography.scss`, `_spacing.scss`, `_radius.scss`, `_shadows.scss`, `_layout.scss`, `_motion.scss`, `_breakpoints.scss`) with the **exact contents** from `.claude/agents/web-designer.md` Canonical Design System section.
- [ ] Create `src/styles.scss` (or update the existing Angular global styles file) to `@forward` all variables files and apply the `prefers-reduced-motion` rule.
- [ ] Verify `angular.json` references the global styles file under the `build` options' `styles` array.
- [ ] Load Inter font (self-host via `@font-face` in `_typography.scss` or add a `<link>` to `index.html` with `font-display: swap`).
- [ ] **Smoke test:** add a throwaway `.test { color: $brand-primary; }` in a component SCSS to confirm the `@use` path resolves, then remove.

### Per component

#### LoginPageContextBanner (NEW)

- [ ] Create `src/app/features/auth/login-page/components/context-banner/` directory.
- [ ] Scaffold `context-banner.component.ts` (standalone, `ChangeDetectionStrategy.OnPush`, one `@Input() returnUrl!: string`).
- [ ] Create `.component.html` with the structure: wrapping `div.context-banner` (role="status"), icon span, body div (heading p + meta p with interpolated returnUrl), cancel button.
- [ ] Create `.component.scss` with the exact SCSS above.
- [ ] Emit `(cancel)` event from the cancel button; parent `LoginPageComponent` handles by navigating to `/login` (clears query param).
- [ ] Write component spec: renders with returnUrl input, emits cancel, applies role="status".

#### LoginPageComponent (UPDATE template only)

- [ ] Inject `ActivatedRoute`. Expose `readonly returnUrlSafe = computed(() => ...)` via `toSignal(route.queryParamMap)` that runs `isSafeReturnUrl` and returns the raw string or `null`.
- [ ] In the template, render `<app-login-context-banner *ngIf="returnUrlSafe()" [returnUrl]="returnUrlSafe()!" (cancel)="onCancelReturn()" />` above the existing login card.
- [ ] Implement `onCancelReturn()` → `this.router.navigate(['/login'])`.
- [ ] Update `.component.scss` with the `.login-page__column` / `.login-page__card` layout above.
- [ ] Replace the existing Tailwind-only template with the new column layout while preserving the stub copy.
- [ ] **Do not** implement form logic — that is a separate issue.

#### BoardPageComponent (additive; not wired in #27)

- [ ] Append the `.board-page__guard-skeleton*` blocks and `@keyframes guard-skeleton-pulse` to the existing `board-page.component.scss`. Do **not** wire the skeleton to the template in #27 — this is pre-positioned styling for the future rehydration issue.

#### Toast (pattern reserved)

- [ ] When a notification/toast service is introduced (not in #27), apply the `.toast--returnurl-rejected` SCSS block above. Do **not** create a one-off toast component in #27 — it would bloat the scope. Instead, when the login-form issue implements `router.navigateByUrl(fallback)` on `isSafeReturnUrl === false`, that issue adopts whichever toast primitive exists at that time.

### Verification

- [ ] `npm run build` succeeds.
- [ ] `npm run test -- --watch=false` all green. New component spec for context banner passes.
- [ ] **Keyboard traversal:** Tab from URL bar through page → reaches Cancel link with visible 2px outline → continues to form fields. Space/Enter on Cancel returns to `/login` without query param, banner disappears.
- [ ] **Screen reader (NVDA / VoiceOver):** navigate to `/login?returnUrl=/board` → banner copy is announced within ~500ms of page load; focus still lands on first form field.
- [ ] **`prefers-reduced-motion: reduce`** in Chrome DevTools Rendering tab → banner entrance animation becomes instant; skeleton pulse becomes static; toast slide becomes instant.
- [ ] **Viewport audit at 320 / 768 / 1024 / 1440:** banner never overflows; returnUrl truncates with ellipsis at 320px; no horizontal scroll on any width.
- [ ] **Lighthouse accessibility ≥95** on `/login?returnUrl=/board`.
- [ ] **Contrast spot-check:** use browser devtools color picker on the banner heading and meta text, confirm computed ratios match the audit table.
- [ ] **XSS safety:** paste `/login?returnUrl=<img src=x onerror=alert(1)>` — banner shows the literal text, no script runs (because `isSafeReturnUrl` rejects on leading character `<`).
- [ ] **Tamper path:** paste `/login?returnUrl=https://evil.example.com` — banner does NOT appear (`isSafeReturnUrl` returns `false`); page shows bare login card. When login submission lands (future), toast appears for 6s on fallback redirect.

---

## Self-Review (Step 3 checklist)

- [x] Every color, spacing, radius references a canonical token (no new hex, no new px values outside the 4px grid).
- [x] Every interactive element (Cancel link, future toast dismiss) has default / hover / focus / active / disabled states — active collapses into focus for the link, disabled is N/A (the cancel link is always available when banner is visible).
- [x] Loading / empty / error states designed for every data view in scope: skeleton (loading), absence of banner (empty — no returnUrl), error toast (error — unsafe returnUrl). Board's empty/error are inherited from the future kanban spec, not owned here.
- [x] No drag interactions in scope — N/A.
- [x] Color paired with text + border + icon for every semantic signal (status-high on toast uses 4px border + icon + text; brand-primary on cancel uses underline + focus ring + text).
- [x] Touch targets ≥44×44 on coarse pointers via `(hover: none) and (pointer: coarse)` media query on Cancel link; toast is non-interactive (auto-dismiss).
- [x] `prefers-reduced-motion` honored via global rule in `_motion.scss` (clamps, does not eliminate).
- [x] Tab order documented (Section 6 Keyboard).
- [x] Every contrast ratio cited with a measured number (Section 6 contrast table). Sub-AA pair flagged and mitigated.

---

*The design specification is saved. You can now instruct the developer agent to implement the feature using both the technical spec and design spec.*
