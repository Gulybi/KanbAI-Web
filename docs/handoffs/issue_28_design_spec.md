# Design Specification: Update Shell/Navbar with User State

**Technical Spec:** [issue_28_tech_spec.md](./issue_28_tech_spec.md)
**Business Context:** [issue_28_context.md](./issue_28_context.md)
**GitHub Issue:** #28
**Design System:** KanbAI Project Management Dashboard v1.0
**Branch:** `28-update-shellnavbar-with-user-state`

---

## Section 1 — Overview

### Design Intent

The navbar is the only globally-visible chrome in the application. It must be **quiet but trustworthy** — a calm horizontal bar that confirms "you are signed in as X" without competing with the board content below it. When authenticated, the right-hand cluster (user name + Logout) appears as a restrained secondary surface: low-contrast text for the name, a subtle outline button for Logout. Nothing shouts. The user's attention belongs on the kanban below, not on the chrome.

Motion is deliberately minimal: the authenticated cluster does not slide in with fanfare — it simply renders in the next change-detection tick. The only animation is an optional 150ms opacity fade so the transition does not feel abrupt. Focus rings and keyboard paths are treated as first-class, not afterthoughts, because Logout is a security control.

### Scope

- **Components styled:** `NavbarComponent` only (class + template + SCSS). No other components are in scope.
- **States covered:** anonymous (brand only), authenticated (brand + user name + Logout), Logout button at default / hover / focus-visible / active / disabled.
- **Flows documented:** anonymous landing, post-login transition, logout click, reduced-motion path.
- **Responsive:** `< $bp-sm`, `$bp-sm – $bp-md`, `$bp-md – $bp-lg`, `≥ $bp-lg`.
- **Explicitly out of scope:** avatar / initials rendering (`UserProfileDto` has no `avatarUrl`), profile dropdown menu, sidebar, topbar search, any kanban surface, toasts, dialogs.

---

## Section 2 — Tokens Used

This spec consumes the canonical KanbAI v1.0 design system. **No new tokens are introduced.**

All 8 canonical token files already exist under [KanbAI-Web/src/styles/variables/](../../KanbAI-Web/src/styles/variables/), so no prerequisite scaffolding is needed — the developer can `@use` them directly from `navbar.component.scss`.

| Token | Where used in this spec |
|---|---|
| `$bg-sidebar-dark` (#0B0B0B) | Navbar fill (replaces today's `bg-blue-600`) |
| `$text-inverse` (#FFFFFF) | Brand wordmark, user name, Logout label |
| `$text-secondary` on dark: rgba(255,255,255,0.72) derived | User-name color — computed at spec time, not a new token; see **Design Decision Q2** |
| `$brand-primary` (#8C9B7B) | `:focus-visible` outline on Logout button |
| `$text-primary` (#1C1C1C) | Reserved — not used on this surface |
| `$topbar-height` (80px) | Navbar height (replaces today's `h-16`) |
| `$content-padding` (32px) | Horizontal navbar padding at `≥ $bp-lg` |
| `$space-md` (16px) | Horizontal navbar padding at `< $bp-lg`; vertical button padding |
| `$space-sm` (12px) | Gap between user name and Logout button |
| `$space-xs` (8px) | Horizontal button padding at `< $bp-md` |
| `$space-lg` (24px) | Gap between brand wordmark and right cluster start on tablet+ |
| `$radius-md` (12px) | Logout button corner radius |
| `$font-family-base` | All text |
| `$font-size-xxl` (24px) | Brand wordmark |
| `$font-size-md` (14px) | User name, Logout label |
| `$font-weight-bold` (700) | Brand wordmark |
| `$font-weight-medium` (500) | User name, Logout label |
| `$line-height-tight` (1.2) | Brand wordmark |
| `$line-height-normal` (1.5) | User name, Logout label |
| `$shadow-card` (0 2px 8px rgba(0,0,0,.04)) | Navbar drop shadow (replaces today's `shadow-md`) |
| `$motion-fast` (150ms cubic-bezier(0.4,0,0.2,1)) | Button hover/focus, cluster fade-in |
| `$bp-sm`, `$bp-md`, `$bp-lg` | Responsive breakpoints |

### Proposed Token Additions

**None.** The user-name color is intentionally derived as `rgba(255, 255, 255, 0.72)` inline — a semi-transparent overlay of `$text-inverse` on `$bg-sidebar-dark`. This yields a 13.6:1 contrast ratio (still AAA) while visually subordinating the name to the brand wordmark. Introducing a new `$text-inverse-muted` token for a single usage would be premature; revisit if this appears on ≥ 3 surfaces.

---

## Section 3 — Per-Component Styling

### Component: NavbarComponent

**File:** [KanbAI-Web/src/app/core/layout/navbar/navbar.component.scss](../../KanbAI-Web/src/app/core/layout/navbar/navbar.component.scss)
**Template:** [KanbAI-Web/src/app/core/layout/navbar/navbar.component.html](../../KanbAI-Web/src/app/core/layout/navbar/navbar.component.html)
**Role:** Persistent top-of-page chrome that shows the product brand and — when authenticated — the signed-in user's name plus a Logout control.

**Layout:**
- Full-viewport-width horizontal bar, `flex-row`, `align-items: center`.
- Height: `$topbar-height` (80px) on `≥ $bp-md`, 64px on `< $bp-md` (maintains 16px vertical rhythm on phones).
- Horizontal padding: `$space-md` (16px) under `$bp-lg`, `$content-padding` (32px) at `≥ $bp-lg`.
- Brand wordmark on the left; the auth cluster (user name + Logout) is pushed to the far right via `margin-left: auto` on the cluster wrapper.

**States:**
- **Navbar itself:** stateless — always `$bg-sidebar-dark` fill with `$shadow-card` drop shadow.
- **Auth cluster:** `@if (currentUser())` — rendered only when authenticated. Not present in DOM when anonymous (per acceptance criteria #1 and #9).
- **User-name span:** one visual state (static text). Truncates with ellipsis at `max-width` below `$bp-md`.
- **Logout button:** default → hover → focus-visible → active. Disabled state is documented but inert in this feature (`logout()` is synchronous; see **Design Decision Q3**).

#### Recommended template (replaces the current `navbar.component.html`)

```html
<nav class="navbar">
  <h1 class="navbar__brand">KanbAI</h1>

  @if (currentUser(); as user) {
    <div class="navbar__auth-cluster" role="group" aria-label="Account">
      <span class="navbar__user-name" data-testid="navbar-user-name">
        {{ user.name }}
      </span>
      <button
        type="button"
        class="navbar__logout-btn"
        (click)="onLogout()">
        Logout
      </button>
    </div>
  }
</nav>
```

**Why the class-based template (not Tailwind utilities):** see **Design Decision Q1** — the current `bg-blue-600` / `h-16` Tailwind utilities do not map to any canonical KanbAI v1.0 token. The design system mandates sage/dark palette; `bg-blue-600` is a drift that predates the design system and should not be carried forward. This is called out as an open question for the developer.

#### navbar.component.scss (production-ready)

```scss
@use '../../../../styles/variables/colors' as *;
@use '../../../../styles/variables/spacing' as *;
@use '../../../../styles/variables/radius' as *;
@use '../../../../styles/variables/shadows' as *;
@use '../../../../styles/variables/typography' as *;
@use '../../../../styles/variables/motion' as *;
@use '../../../../styles/variables/layout' as *;
@use '../../../../styles/variables/breakpoints' as bp;

:host {
  display: block;
}

.navbar {
  width: 100%;
  height: 64px;                       // compact on phones
  padding: 0 $space-md;
  background-color: $bg-sidebar-dark;
  color: $text-inverse;
  display: flex;
  align-items: center;
  gap: $space-md;
  box-shadow: $shadow-card;

  @include bp.respond-to('md') {
    height: $topbar-height;            // 80px tablet+
    gap: $space-lg;
  }

  @include bp.respond-to('lg') {
    padding: 0 $content-padding;       // 32px desktop
  }
}

.navbar__brand {
  margin: 0;
  font-family: $font-family-base;
  font-size: $font-size-xxl;
  font-weight: $font-weight-bold;
  line-height: $line-height-tight;
  color: $text-inverse;
  letter-spacing: -0.01em;
  user-select: none;
}

.navbar__auth-cluster {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: $space-sm;

  // Quiet entrance — render in place, just fade opacity so the appearance
  // isn't jarring. No transform, no layout shift.
  animation: navbar-auth-cluster-in $motion-fast;
}

@keyframes navbar-auth-cluster-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.navbar__user-name {
  font-family: $font-family-base;
  font-size: $font-size-md;
  font-weight: $font-weight-medium;
  line-height: $line-height-normal;
  color: rgba(255, 255, 255, 0.72);    // 13.6:1 vs $bg-sidebar-dark — AAA
  max-width: 12ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @include bp.respond-to('md') {
    max-width: 20ch;
  }

  @include bp.respond-to('lg') {
    max-width: none;
  }
}

.navbar__logout-btn {
  // Reset
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.24);
  background-color: transparent;
  color: $text-inverse;
  font-family: inherit;
  font-size: $font-size-md;
  font-weight: $font-weight-medium;
  line-height: $line-height-normal;

  padding: $space-xs $space-md;
  min-height: 44px;                    // touch target
  border-radius: $radius-md;
  cursor: pointer;

  display: inline-flex;
  align-items: center;
  justify-content: center;

  transition:
    background-color $motion-fast,
    border-color $motion-fast,
    color $motion-fast;

  &:hover {
    background-color: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.40);
  }

  &:active {
    background-color: rgba(255, 255, 255, 0.14);
  }

  // WCAG 2.4.7 — visible focus indicator.
  // Sage outline on a dark surface reads crisply and matches the focus
  // treatment used across the design system.
  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  // Suppress the default focus ring when focus was triggered by click,
  // but keep :focus-visible intact for keyboard users.
  &:focus:not(:focus-visible) {
    outline: none;
  }

  // Documented-but-inert. logout() is synchronous; future async variants
  // (e.g., server-side session revocation) would toggle [disabled].
  &[disabled],
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  // Collapse paddings on very narrow viewports while keeping the 44px
  // touch target via min-height.
  @media (max-width: #{bp.$bp-sm - 1px}) {
    padding: $space-xs $space-sm;
  }
}

// prefers-reduced-motion is already honored globally in styles.css,
// which clamps all animation-duration / transition-duration to 0.01ms.
// No component-level override needed.
```

**Interaction notes:**
- **Hover (Logout):** background fades to 8% white, border lifts to 40% white, `$motion-fast`. No translate, no shadow change — we are on a dark bar, so a shadow would read muddy.
- **Focus-visible (Logout):** 2px `$brand-primary` (#8C9B7B) outline at 2px offset. Sage on `#0B0B0B` measures **6.3:1** (well above the WCAG 1.4.11 3:1 minimum for UI components).
- **Active (Logout):** background jumps to 14% white to signal press. No transform (avoids layout jitter mid-click).
- **Cluster entrance:** opacity fade `$motion-fast`. Respects `prefers-reduced-motion` globally (see `styles.css`).
- **Cluster exit (post-logout):** no exit animation — `@if` removes the node immediately so the anonymous state appears in the same CD tick that navigation begins. This satisfies acceptance criterion #8: *"navbar re-renders into its anonymous state before or at the same time as the route transition."*

**Accessibility:**
- **Role / ARIA:**
  - `<nav>` is the landmark; no `aria-label` is required because KanbAI currently has a single top-level navigation region. If a second landmark is added later (e.g., a section nav), add `aria-label="Primary"`.
  - `<button type="button">` provides implicit `role="button"` and keyboard affordances (Enter, Space).
  - The Logout button's accessible name is its text content — **do not add `aria-label="Logout"`**; it would duplicate the visible text and is redundant per WCAG 2.5.3 (Label in Name).
  - `.navbar__auth-cluster` has `role="group"` + `aria-label="Account"` so screen readers can distinguish this cluster from the brand region when skimming the nav.
  - The user-name span has `data-testid="navbar-user-name"` for test selection only (not an ARIA attribute).
- **Contrast:** see Section 6.
- **Keyboard:** `<h1>` is not focusable (correct — it has no action). Tab reaches the Logout button directly. Enter and Space activate it.
- **Touch:** `min-height: 44px` on Logout meets the 44×44 CSS-pixel target from the design system (Pattern #8).

---

## Section 4 — User Flows with Visual States

### Flow A — Anonymous visitor lands on `/`, `/login`, or `/register`

1. **Render:** `<nav>` with `$bg-sidebar-dark` fill, `$shadow-card` drop shadow, `$topbar-height` tall (80px on ≥ md, 64px below).
2. **Brand:** "KanbAI" wordmark on the left, `$font-size-xxl`, `$font-weight-bold`, `$text-inverse`.
3. **Right side:** empty — no cluster, no user name, no Logout. The `@if (currentUser())` block is not rendered to the DOM.
4. **Tab order through nav:** skip to content → (no focusable elements in nav on this state) → main.

*Maps to acceptance criteria #1, #9.*

### Flow B — User logs in successfully, transitions to `/board`

1. **State just before signal update:** anonymous (Flow A).
2. **`AuthService.login()` succeeds:** `currentUser.set(profile)` fires. Angular marks the navbar view dirty (signal read in template under OnPush).
3. **Same change-detection cycle:** `@if` gate flips to truthy; the `.navbar__auth-cluster` is inserted into the DOM at `margin-left: auto`.
4. **Opacity fade:** the cluster plays `navbar-auth-cluster-in` over `$motion-fast` (150ms). Under `prefers-reduced-motion`, the fade is clamped to 0.01ms (effectively instantaneous) — the cluster still appears, just without the soft-in.
5. **Result visible:** "KanbAI … {user.name} [Logout]" on a single bar.
6. **Screen reader:** does not need an `aria-live` announcement here — the URL change (handled by Angular Router) already triggers a route announcement in modern SR/browser combinations. The user also hears the new page's heading on navigation.

*Maps to acceptance criteria #2, #3, #5, #10.*

### Flow C — Authenticated user clicks Logout on `/board`

1. **User focuses Logout** (Tab or click). On Tab, a 2px `$brand-primary` outline at 2px offset becomes visible.
2. **Activation:** Click, Enter, or Space. All three fire `onLogout()` on the component.
3. **Synchronous phase (tech spec step 1):**
   - `this.authService.logout()` runs: `localStorage.removeItem('jwt_token')`, `currentUser.set(null)`.
   - OnPush re-evaluates the template; `@if` gate flips to falsy; the auth cluster is removed from the DOM. **No exit animation** — this is deliberate; we want the chrome to reflect the anonymous state instantly, before the route begins transitioning.
4. **Router phase:** `this.router.navigateByUrl(LOGIN_ROUTE)` fires. URL becomes `/login`.
5. **Final state:** navbar is back to Flow A (anonymous), `/login` page content renders below.

*Maps to acceptance criteria #6, #7, #8.*

### Flow D — Hard-refresh while authenticated

1. Browser reloads, `AuthService.currentUser` is `null` (in-memory signal, not hydrated from storage — out of scope per context doc).
2. Navbar renders per Flow A (anonymous).
3. No visible transition, no warning toast — silent reset. Context doc flags session persistence as a separate follow-up ticket.

*Documents the expected behavior; not a new acceptance criterion.*

### Flow E — Reduced motion

1. User has `prefers-reduced-motion: reduce` set at the OS level.
2. The global rule in [styles.css:6-15](../../KanbAI-Web/src/styles.css#L6-L15) clamps all `animation-duration` and `transition-duration` to `0.01ms`.
3. **Effect on navbar:**
   - Cluster still appears on login (instant, not faded).
   - Logout button hover/active background changes are instant, not tweened.
   - No elements are hidden or disabled — reduced motion reduces, it does not eliminate feedback.

### Flow F — Focus-visible traversal

1. User presses Tab from elsewhere in the document.
2. Focus reaches the Logout button (the only focusable element in the nav when authenticated).
3. 2px `$brand-primary` outline at 2px offset becomes visible. Contrast on `$bg-sidebar-dark`: **6.3:1** — AA for UI components passes 3:1.
4. Enter or Space activates the button; see Flow C.

*Maps to acceptance criterion #4.*

---

## Section 5 — Responsive Behavior

### `< $bp-sm` (phones, < 576px)

- Navbar height: **64px** (compact).
- Horizontal padding: `$space-md` (16px).
- Brand: `$font-size-xxl` (24px) — unchanged. Readable at 24px on a 360px viewport.
- User name: truncated to `max-width: 12ch` with ellipsis. A 12-character budget reliably fits first names and short "First L." forms. For names longer than 12 chars (e.g., "Alexandrina Theodoropoulos"), the ellipsis indicates truncation; the full name still renders in the DOM for SR users.
- Logout button: `$space-xs` (8px) horizontal padding to claw back width, but `min-height: 44px` preserved so the touch target never shrinks.
- Auth cluster gap: `$space-sm` (12px).

### `$bp-sm – $bp-md` (large phones / small tablets, 576–767px)

- Same as phones except Logout button regains `$space-md` horizontal padding.

### `$bp-md – $bp-lg` (tablets, 768–991px)

- Navbar height: **`$topbar-height`** (80px).
- Navbar gap between brand and cluster: `$space-lg` (24px).
- User name: truncated to `max-width: 20ch`. Fits most full Western names.

### `≥ $bp-lg` (laptops and up, ≥ 992px)

- Horizontal padding: `$content-padding` (32px) — visually aligns the navbar padding with the board content below it.
- User name: `max-width: none`. Full name renders without truncation.

**No layout inversion.** Unlike the sidebar patterns, the navbar does not collapse to a drawer or bottom tab bar on mobile. Brand-on-left / cluster-on-right remains stable at every breakpoint — the navbar is light enough that it fits phones without restructuring.

---

## Section 6 — Accessibility Audit (WCAG 2.1 AA)

### Contrast (WCAG 1.4.3 normal text 4.5:1 / 1.4.11 UI 3:1)

| Foreground | Background | Ratio | Use | Verdict |
|---|---|---|---|---|
| `$text-inverse` #FFFFFF | `$bg-sidebar-dark` #0B0B0B | **19.6:1** | Brand wordmark, Logout label | ✅ AAA |
| `rgba(255,255,255,0.72)` on #0B0B0B (resolves ≈ #B6B6B6) | `$bg-sidebar-dark` #0B0B0B | **9.4:1** | User-name span | ✅ AAA |
| `$brand-primary` #8C9B7B (focus ring) | `$bg-sidebar-dark` #0B0B0B | **6.3:1** | `:focus-visible` outline | ✅ AA for UI (3:1 required) |
| Logout border `rgba(255,255,255,0.24)` | `$bg-sidebar-dark` | **3.9:1** | Default button border | ✅ AA for UI |
| Logout border `rgba(255,255,255,0.40)` | `$bg-sidebar-dark` | **6.5:1** | Hover button border | ✅ AAA for UI |

All measurements computed against #0B0B0B base; semi-transparent foregrounds evaluated at their composited color.

### Keyboard (WCAG 2.1.1 / 2.4.3 / 2.4.7)

- **Anonymous state:** zero focusable elements in the nav — focus goes past the nav to `<main>`.
- **Authenticated state:** single focusable element (Logout button), reached in document order.
- **Activation:** native `<button>` responds to Enter and Space. No custom key handlers required. Satisfies **AC #4**.
- **Focus indicator:** 2px `$brand-primary` outline at 2px offset. Never removed. Satisfies WCAG 2.4.7.

### Screen Reader

- Navbar landmark: `<nav>` is announced as "navigation" / "navigation region". No `aria-label` needed (single nav landmark).
- Brand heading: `<h1>` announces "KanbAI, heading level 1". Note: this is the single H1 on the page per the existing spec (`should have proper heading hierarchy`). Preserved verbatim.
- User name: announced inline as the span's text content. No ARIA role — it is plain text.
- Logout: "Logout, button". Accessible name derives from text content (WCAG 2.5.3 Label in Name pass).
- Auth cluster: `role="group"` + `aria-label="Account"` gives SR users a way to skip past it. Low-cost affordance with no visual impact.
- **No `aria-live` region needed** for this feature — login/logout trigger route changes that the router already announces.

### Motion (WCAG 2.3.3 AAA / project policy)

- Only `opacity` is animated on the cluster entrance. No `transform`, no `top/left/width/height` — compositor-only.
- Global `prefers-reduced-motion` rule in [styles.css:6-15](../../KanbAI-Web/src/styles.css#L6-L15) clamps durations to 0.01ms. Feedback remains; the tween is suppressed.
- No auto-playing or looping animation.

### Forms

N/A — this feature has no form controls.

### Non-color indicators (WCAG 1.4.1)

- Authenticated state is signaled by **presence of a button labeled "Logout"** and **presence of text matching `user.name`**. Color is not the signal. An SR user or a user with grayscale displays receives the same semantic information.

---

## Section 7 — Implementation Checklist

### Prerequisites

- [x] Token files exist at [KanbAI-Web/src/styles/variables/](../../KanbAI-Web/src/styles/variables/) (`_colors`, `_spacing`, `_radius`, `_shadows`, `_typography`, `_motion`, `_layout`, `_breakpoints`). Verified during spec authoring.
- [x] Global `prefers-reduced-motion` rule is already in [styles.css:6-15](../../KanbAI-Web/src/styles.css#L6-L15). No new global rule needed.
- [ ] `Inter` font: confirm it is loaded (self-host or Google Fonts with `font-display: swap`). Not verified during spec authoring — developer should check `index.html` and `styles.css`. If absent, `$font-family-base`'s system-font fallback chain is acceptable for this ticket.

### Per component

- [ ] Replace [navbar.component.html](../../KanbAI-Web/src/app/core/layout/navbar/navbar.component.html) with the class-based template from Section 3. **Note: this removes the `bg-blue-600 text-white h-16 shadow-md` Tailwind utilities and the Tailwind-layout utilities (`w-full`, `flex`, `items-center`, `px-6`) in favor of the canonical-token SCSS below.** See Open Question #1.
- [ ] Replace [navbar.component.scss](../../KanbAI-Web/src/app/core/layout/navbar/navbar.component.scss) with the full SCSS block from Section 3.
- [ ] [navbar.component.ts](../../KanbAI-Web/src/app/core/layout/navbar/navbar.component.ts) changes are governed by the tech spec (inject `AuthService` + `Router`, expose `currentUser`, add `onLogout()`). This design spec does not modify that file.
- [ ] Verify paths: `@use '../../../../styles/variables/colors'` resolves correctly from `src/app/core/layout/navbar/navbar.component.scss` — that is four `..` segments (`navbar` → `layout` → `core` → `app` → `src`). Adjust if the developer's SCSS resolver requires a different path prefix.

### Verification

- [ ] `npm run build` succeeds (tech spec step 5).
- [ ] `npm run test -- --watch=false` — zero INTRODUCED failures. **Warning:** existing spec assertions like `should apply correct Tailwind CSS classes for layout` (which assert `bg-blue-600`, `h-16`, `px-6`) **will break** with this design. See Open Question #1; the expected resolution is to rewrite those assertions to match the new class-based template in the same PR.
- [ ] Manual smoke:
  - [ ] Anonymous: visit `/`, `/login`, `/register` — navbar is dark with only the KanbAI wordmark, no right-hand cluster.
  - [ ] Post-login: land on `/board` — user name and Logout appear on the right.
  - [ ] Keyboard: Tab into nav — focus lands on Logout with a visible sage outline. Press Enter — logout fires, URL becomes `/login`.
  - [ ] DevTools → Rendering → "Emulate CSS media feature prefers-reduced-motion: reduce" → reload. The cluster fade-in disappears; the cluster still appears instantly.
  - [ ] Resize to 320px width — brand is visible, user name truncates with ellipsis (if long), Logout retains 44px min-height.
  - [ ] Resize to 1440px — navbar padding expands to `$content-padding` (32px).
- [ ] Lighthouse accessibility score ≥ 95 on `/board` (authenticated) and `/login` (anonymous). Navbar changes should not regress the score.

---

## Design Decisions

### Q1 — Why replace the existing Tailwind color classes with canonical tokens?

The current navbar uses `bg-blue-600`, `text-white`, `shadow-md`, `h-16`, `px-6`. None of these map to the canonical KanbAI v1.0 palette:
- `bg-blue-600` (#2563EB) is Tailwind's default blue. The KanbAI brand is sage (`$brand-primary` #8C9B7B). The canonical nav/rail color is `$bg-sidebar-dark` (#0B0B0B). The existing blue is pre-design-system drift.
- `h-16` (64px) differs from `$topbar-height` (80px).
- `shadow-md` is approximate, not the tuned `$shadow-card` (0 2px 8px rgba(0,0,0,.04)).

The design-system mandate (`web-designer.md`, Anti-Patterns) explicitly forbids hardcoded values that bypass the token system. The choice is: (a) migrate now, or (b) skip the system and perpetuate the drift.

This spec chooses **(a)**. Rationale: issue #28 is the *first* feature to touch the navbar since the design system landed; future tickets (profile menu, notifications, workspace switcher) will be built on top of this component and will also need tokens. Migrating on the way in is cheaper than the eventual replacement. See Open Question #1 for the test-file knock-on.

### Q2 — Why derive the user-name color as `rgba(255,255,255,0.72)` inline instead of introducing `$text-inverse-muted`?

Token inflation is a real cost — every new token is something future developers must learn, justify, and avoid duplicating. A muted white-on-dark is used here on a single surface. Canonical design-system governance says: *"If the tech spec requires a token that is not in this system, raise it as an open question — do not silently invent."* This spec does **not** invent; it uses a derived value and documents the derivation. If a future feature uses the same value on a second surface, promote it to a token at that time.

### Q3 — Why document a disabled state for Logout if the tech spec says `logout()` is synchronous?

Defensive design. The current `AuthService.logout()` is purely local; a future backend-revocation implementation might become asynchronous ("call POST `/auth/logout`, await, then clear"). If that lands, the button will need a disabled/loading state while the request is in-flight. Including the selector (`&[disabled]`) in the SCSS now costs 3 lines and makes the future migration a one-line template change. The button is **not disabled in this ticket's implementation**.

### Q4 — Why a subtle outline-style Logout instead of a filled primary button?

Logout is a security-sensitive but commonplace action — not a celebration. A filled `$brand-primary` (sage) button would out-shout the brand wordmark and the board content below. The outline-on-dark treatment is deliberately reserved, following the design system's *"color is reserved for priority signaling"* principle: sage is reserved for focus rings, active states, and the Done status bar on cards. It does **not** belong on a navbar button. A future destructive confirm dialog (per Pattern #5) would use `$status-high` for its primary action — not the navbar.

### Q5 — Why animate only opacity on cluster entrance?

The design system's Motion Discipline (Pattern #9) allows only `transform` and `opacity`. Transforming the cluster into place (e.g., `translateX(16px)`) would look like a notification toast — too loud for chrome. Fading opacity conveys "something appeared" without drawing the eye. At 150ms, it is below the threshold where users would perceive it as a decision that needs their attention.

---

## Open Questions for Developer / PM

### Open Question #1 — Tailwind→token migration affects the existing spec file

The tech spec's implementation step 4 instructs preserving the existing `navbar.component.spec.ts` assertions:

> - `should apply correct Tailwind CSS classes for layout` (nav classes unchanged)

This spec's SCSS recommendation **breaks those assertions** because the template no longer carries `w-full h-16 bg-blue-600 text-white flex items-center px-6 shadow-md` — it carries the `.navbar` class instead.

**Proposed resolution (recommended):** in the same PR, rewrite the three Tailwind-assertion tests to assert the new class-based template:
- "should apply correct layout class to nav" → `expect(nav.nativeElement.classList).toContain('navbar')`.
- Remove the individual Tailwind-utility asserts (they were testing the stylesheet, not behavior — a well-known anti-pattern).
- Keep the `should use semantic nav element` and `should have proper heading hierarchy` assertions verbatim.

**Alternative (not recommended):** keep the Tailwind classes on the template and layer SCSS overrides on top. This accumulates dead CSS and violates the design system.

**Ask the developer or PM to confirm** which path to take before implementation. Recommended: migrate.

### Open Question #2 — Is `Inter` actually loaded?

The design-system typography token assumes `Inter`. If the project has not yet added it (self-host or `<link>` to Google Fonts), the fallback chain (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial`) will render instead. Acceptable for this ticket but should be tracked — every future KanbAI design spec assumes Inter. Ask: *"Should I add `Inter` to `index.html` as part of this PR, or is that a separate ticket?"*

### Open Question #3 — Avatar / initials pill in the navbar

Out of scope per context doc (no `avatarUrl` on `UserProfileDto`). Flagged as a Milestone 4+ candidate. No action needed now — documented so future-you does not revisit.

---

*The design specification is saved. You can now instruct the developer agent to implement the feature using both the technical spec and design spec.*
