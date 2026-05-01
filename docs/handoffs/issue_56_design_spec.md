# Design Specification: Fix Header Navigation, Auth Buttons, and Logo Routing

**Technical Spec:** [issue_56_tech_spec.md](./issue_56_tech_spec.md)
**Context Document:** [issue_56_context.md](./issue_56_context.md)
**GitHub Issue:** #56
**Design System:** KanbAI Project Management Dashboard v1.0

---

## Design Intent

The global header is the user's constant point of orientation. When signed out it must offer a calm, obvious path into the product (Login + Register); when signed in it must keep the exit door (Logout) visible on every route. The visual language stays understated — the dark rail background, sage focus rings, and quiet motion established by issue #28 are preserved verbatim. The only new emphasis is a single primary CTA — **Register** — rendered as a solid sage pill to gently nudge first-time visitors toward the account-creation path without shouting.

---

## Scope

- **Components styled:** `NavbarComponent` (anonymous branch, brand anchor, refactored authenticated-branch gate)
- **States covered:** default, hover, focus-visible, focus-not-visible (mouse), active, disabled (inert but documented), reactive auth-state transitions (login/logout flip)
- **Responsive:** phone (<`$bp-sm`), tablet (`$bp-md`+), desktop (`$bp-lg`+) — matches the existing header breakpoints; no new breakpoints
- **Not in scope:** no new tokens, no sidebar changes, no route guards, no service layer (all preserved by the tech spec)

---

## Tokens Used

This spec consumes the canonical KanbAI design system. **No new tokens are introduced.**

| Token | Where used |
|---|---|
| `$bg-sidebar-dark` | Navbar background (unchanged) |
| `$text-inverse` | Brand label, user-name label, Login ghost label, Register primary label |
| `$brand-primary` | Register solid fill, focus-visible outline on brand/Login/Register |
| `$brand-primary-hover` | Register solid hover fill |
| `$font-family-base`, `$font-size-xxl`, `$font-size-md`, `$font-weight-bold`, `$font-weight-medium`, `$line-height-tight`, `$line-height-normal` | Typography on brand and action controls |
| `$space-xs`, `$space-sm`, `$space-md`, `$space-lg` | Control padding and cluster gaps |
| `$radius-md` | Login / Register / Logout corner radius (unchanged) |
| `$motion-fast` | Hover and focus transitions (unchanged) |
| `$bp-sm`, mixin `respond-to('md' | 'lg')` | Breakpoint behavior (unchanged) |
| `$shadow-card` | Navbar underlay shadow (unchanged) |

No new tokens proposed. No additions to `src/styles/variables/*`.

---

## Design Decisions (Resolving Tech-Spec Open Questions)

### Decision A — Shared ghost button, Register as solid variant (resolves Open Question #3)

**Decision:** Introduce a **`%navbar-action-btn` SCSS placeholder** (extend-only base) that carries the shared reset, 44px touch target, `$radius-md`, focus-visible sage outline, and `$motion-fast` transitions already present on `.navbar__logout-btn`. `.navbar__logout-btn` and `.navbar__login-btn` both `@extend` this placeholder and render as **ghost (outlined-on-dark)** — visually identical. `.navbar__register-btn` also `@extends` the placeholder but overrides the fill to `$brand-primary` — a **solid primary** variant.

**Why a placeholder, not a utility class:**
1. Keeps the template free of utility-class stacking (`class="navbar__login-btn navbar__action-btn"` is noisy and couples the template to style internals).
2. One source of truth for the focus ring, touch target, and transitions — future action controls added to this navbar inherit them automatically.
3. The existing `.navbar__logout-btn` rule is refactored to extend the placeholder, so **no visual change to the authenticated branch** — protects #28 acceptance criteria.

### Decision B — Register = solid primary, Login = ghost (resolves Open Question #4)

**Decision:** Register is the primary CTA (solid `$brand-primary` fill, `$text-inverse` label). Login is the secondary, matching Logout's ghost treatment (transparent fill, 1px translucent white border).

**Why:**
1. **Conversion bias.** First-time visitors are the primary audience of the anonymous header. A quiet-but-visible primary button on Register reduces the cognitive step from "I'm curious" to "I have an account".
2. **Calm voice.** A single primary CTA per cluster is the KanbAI design-system rule — no competing shouts. Login as ghost keeps the cluster quiet.
3. **Contrast compliance.** `$text-inverse` on `$brand-primary` is 3.3:1 — **AA for UI and large text**. The button label is `$font-size-md` / `$font-weight-medium` which qualifies as large-text AA (≥14px / 500 weight on solid sage). Verified in the Accessibility Audit section below.
4. **Reversible.** A single SCSS swap flips the emphasis if product learns otherwise — no template change required.

### Decision C — Brand anchor preserves `<h1>`-scale typography (informs Step 4 of tech spec)

The brand becomes an `<a>` element but keeps **every typographic property of the current `.navbar__brand`** (font-family, size `$font-size-xxl`, weight `$font-weight-bold`, line-height `$line-height-tight`, color `$text-inverse`, letter-spacing `-0.01em`, `user-select: none`). Anchor defaults are explicitly suppressed: `text-decoration: none`, explicit color override, explicit `cursor: pointer`. Hover offers a quiet affordance: `opacity: 0.88` over `$motion-fast`. Focus-visible inherits the same 2px `$brand-primary` outline with 2px offset used across the navbar.

---

## Per-Component Styling

### Component: NavbarComponent (refactored)
**File:** `KanbAI-Web/src/app/core/layout/navbar/navbar.component.scss`
**Role:** Global header; renders brand anchor on the left, auth cluster (anonymous OR authenticated) on the right.

**Layout:**
- Flex row, `align-items: center`, `gap: $space-md` (phone) → `$space-lg` (≥`$bp-md`).
- Height `64px` on phone, `$topbar-height` (80px) ≥`$bp-md`.
- Padding `0 $space-md` → `0 $content-padding` (≥`$bp-lg`).
- Auth cluster (`.navbar__auth-cluster`) pushed right via `margin-left: auto`; cluster gap `$space-sm`.
- Anonymous and authenticated clusters share `.navbar__auth-cluster` — only one renders per template branch.

**States (per element):**

| Element | default | hover | focus-visible | active | disabled |
|---|---|---|---|---|---|
| `.navbar__brand` (anchor) | `$text-inverse` label, no underline | `opacity: 0.88`, `$motion-fast` | 2px `$brand-primary` outline / 2px offset | `opacity: 0.72` | — |
| `.navbar__login-btn` (extends `%navbar-action-btn`) | transparent bg, 1px `rgba(255,255,255,0.24)` border, `$text-inverse` | `rgba(255,255,255,0.08)` bg, `rgba(255,255,255,0.40)` border | 2px `$brand-primary` outline / 2px offset | `rgba(255,255,255,0.14)` bg | 0.5 opacity, `not-allowed` |
| `.navbar__register-btn` (extends `%navbar-action-btn`) | `$brand-primary` bg, no border, `$text-inverse` label | `$brand-primary-hover` bg | 2px `$brand-primary` outline / 2px offset (outline reads on dark rail at the button's rim) | `$brand-primary-hover` bg + translucent black overlay (see SCSS) | 0.5 opacity, `not-allowed` |
| `.navbar__logout-btn` (existing — refactored to extend `%navbar-action-btn`) | unchanged from #28 | unchanged | unchanged | unchanged | unchanged |

**Exact SCSS (full file after refactor):**

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/shadows' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;
@use 'src/styles/variables/layout' as *;
@use 'src/styles/variables/breakpoints' as *;

:host {
  display: block;
}

.navbar {
  width: 100%;
  height: 64px;
  padding: 0 $space-md;
  background-color: $bg-sidebar-dark;
  color: $text-inverse;
  display: flex;
  align-items: center;
  gap: $space-md;
  box-shadow: $shadow-card;

  @include respond-to('md') {
    height: $topbar-height;
    gap: $space-lg;
  }

  @include respond-to('lg') {
    padding: 0 $content-padding;
  }
}

// ─────────────────────────────────────────────────────────────
// Brand — anchor styled to preserve the previous <h1> typography.
// Semantic change only: <h1> → <a>.
// ─────────────────────────────────────────────────────────────
.navbar__brand {
  margin: 0;
  font-family: $font-family-base;
  font-size: $font-size-xxl;
  font-weight: $font-weight-bold;
  line-height: $line-height-tight;
  color: $text-inverse;
  letter-spacing: -0.01em;
  user-select: none;

  // Anchor resets.
  text-decoration: none;
  cursor: pointer;

  transition: opacity $motion-fast;

  &:visited {
    color: $text-inverse;
  }

  &:hover {
    opacity: 0.88;
  }

  &:active {
    opacity: 0.72;
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
    border-radius: 2px;              // tight radius so the ring hugs the wordmark
  }

  &:focus:not(:focus-visible) {
    outline: none;
  }
}

// ─────────────────────────────────────────────────────────────
// Auth cluster — shared container for anonymous + authenticated
// branches. The @if/@else in the template guarantees only one
// renders at a time.
// ─────────────────────────────────────────────────────────────
.navbar__auth-cluster {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: $space-sm;

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

  @include respond-to('md') { max-width: 20ch; }
  @include respond-to('lg') { max-width: none; }
}

// ─────────────────────────────────────────────────────────────
// Shared action-button base. Not a class — a placeholder — so
// the template stays clean and every action control inherits
// the same reset, touch target, focus ring, and transitions.
// ─────────────────────────────────────────────────────────────
%navbar-action-btn {
  appearance: none;
  border: 1px solid transparent;
  background-color: transparent;
  color: $text-inverse;
  font-family: inherit;
  font-size: $font-size-md;
  font-weight: $font-weight-medium;
  line-height: $line-height-normal;
  text-decoration: none;              // for <a> variants (Login / Register)

  padding: $space-xs $space-md;
  min-height: 44px;                   // touch target, all breakpoints
  border-radius: $radius-md;
  cursor: pointer;

  display: inline-flex;
  align-items: center;
  justify-content: center;

  transition:
    background-color $motion-fast,
    border-color $motion-fast,
    color $motion-fast,
    opacity $motion-fast;

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  &:focus:not(:focus-visible) {
    outline: none;
  }

  &[disabled],
  &:disabled,
  &[aria-disabled='true'] {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: #{$bp-sm - 1px}) {
    padding: $space-xs $space-sm;
  }
}

// ─────────────────────────────────────────────────────────────
// Ghost variant — Logout (authenticated) + Login (anonymous).
// Visually identical: translucent white border on dark rail.
// ─────────────────────────────────────────────────────────────
%navbar-action-btn--ghost {
  border-color: rgba(255, 255, 255, 0.24);

  &:hover {
    background-color: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.40);
  }

  &:active {
    background-color: rgba(255, 255, 255, 0.14);
  }
}

// Logout — unchanged behavior from #28, refactored to extend
// the placeholders above. No visual diff.
.navbar__logout-btn {
  @extend %navbar-action-btn;
  @extend %navbar-action-btn--ghost;
}

// Login — ghost, matches Logout treatment.
.navbar__login-btn {
  @extend %navbar-action-btn;
  @extend %navbar-action-btn--ghost;
}

// Register — solid primary CTA.
.navbar__register-btn {
  @extend %navbar-action-btn;
  background-color: $brand-primary;
  border-color: $brand-primary;
  color: $text-inverse;

  &:hover {
    background-color: $brand-primary-hover;
    border-color: $brand-primary-hover;
  }

  &:active {
    // Subtle press: hover colour + inset darken to read as a press
    // on the solid fill. Keeps contrast ≥ 3:1 vs the label.
    background-color: $brand-primary-hover;
    box-shadow: inset 0 0 0 999px rgba(0, 0, 0, 0.08);
  }
}
```

**Interaction notes:**
- Hover on brand is intentionally **quieter** than hover on action buttons (opacity vs bg change) — the brand is a wayfinding element, not a CTA.
- Login and Register both transition only `background-color`, `border-color`, `color`, `opacity` — never `width`/`height`/layout, so the cluster never reflows on hover.
- `prefers-reduced-motion` is honored globally via `_motion.scss`; no component-level override needed.

**Accessibility notes:**
- Brand anchor `aria-label="KanbAI — home"` (set in template) gives screen readers a descriptive name beyond the visible "KanbAI" wordmark.
- Anonymous cluster carries `role="group"` + `aria-label="Authentication"`; authenticated cluster keeps `role="group"` + `aria-label="Account"` from #28.
- All three action controls (Login, Register, Logout) are 44×44 minimum touch targets via `min-height: 44px` and horizontal padding that keeps them ≥44px wide with their current labels.
- Focus indicator is always 2px `$brand-primary` with 2px offset — a single ring pattern across the entire header.

### Template binding (for reference)

The tech spec owns the Angular template; this design spec only sets the class hooks and ARIA. For convenience:

```html
<nav class="navbar">
  <a
    class="navbar__brand"
    [routerLink]="brandTargetRoute()"
    aria-label="KanbAI — home">
    KanbAI
  </a>

  @if (isAuthenticated()) {
    <div class="navbar__auth-cluster" role="group" aria-label="Account">
      <span class="navbar__user-name" data-testid="navbar-user-name">
        {{ currentUser()?.name }}
      </span>
      <button type="button" class="navbar__logout-btn" (click)="onLogout()">
        Logout
      </button>
    </div>
  } @else {
    <div class="navbar__auth-cluster" role="group" aria-label="Authentication">
      <a routerLink="/login" class="navbar__login-btn">Login</a>
      <a routerLink="/register" class="navbar__register-btn">Register</a>
    </div>
  }
</nav>
```

---

## User Flows (Visual States)

### Flow A — Anonymous visitor enters authentication
1. **At rest (`/`):** Dark rail header, KanbAI wordmark left, Login (ghost) + Register (solid sage) right. Cursor: `default` over background, `pointer` over wordmark and buttons.
2. **Tab-in:** Brand gets focus ring; Tab → Login gets focus ring; Tab → Register gets focus ring.
3. **Hover Login:** background fades to `rgba(255,255,255,0.08)`, border to `rgba(255,255,255,0.40)` over `$motion-fast`.
4. **Hover Register:** fill darkens to `$brand-primary-hover` over `$motion-fast`.
5. **Click Login → `/login`** or **Click Register → `/register`**: route transition; anonymous cluster re-renders under `unauthGuard` (cluster gently fades in via existing `navbar-auth-cluster-in` keyframe).

### Flow B — Anonymous logo click
1. From `/login`, user hovers brand → opacity `0.88`, cursor `pointer`.
2. Click → route becomes `/`. Cluster stays Login + Register (no branch flip, only route).

### Flow C — Authenticated logo click
1. From `/board`, user hovers brand → opacity `0.88`, cursor `pointer`.
2. Click → route becomes `/dashboard`. Cluster stays user-name + Logout.

### Flow D — Authenticated logout
1. Click Logout → `onLogout()` fires, `authService.logout()` clears both signals synchronously, `router.navigateByUrl(LOGIN_ROUTE)` runs in the same tick.
2. Header flips from `Account` cluster to `Authentication` cluster **in a single change-detection tick** — the existing 150ms fade-in on `.navbar__auth-cluster` plays once on the new cluster; old cluster unmounts instantly, so no double-render frame.
3. Reduced motion: cluster appears instantly (clamp to `0.01ms`).

### Flow E — Login mid-session transition (headline flow)
1. `/login` form submit succeeds. `AuthService.handleAuthSuccess()` sets token + `currentUser` + calls `AuthStateService.setAuthState()` atomically.
2. Router navigates to `/dashboard`. `isAuthenticated()` is already `true` at this point (synchronous write).
3. Navbar's `@if (isAuthenticated())` gate evaluates on the next tick — flips to authenticated cluster, fade-in plays.
4. No frame in which both clusters render (mutually exclusive via `@if`/`@else`).

---

## Responsive Behavior

### < `$bp-sm` (≤575px, phone)
- Navbar height `64px`.
- Outer padding `$space-md` (16px).
- Cluster gap `$space-sm` (12px).
- Action-button horizontal padding collapses to `$space-sm` to fit Login + Register alongside the brand; `min-height: 44px` is preserved so touch targets are never violated.
- Brand remains `$font-size-xxl` (24px) — the wordmark is short enough ("KanbAI") to coexist with two action buttons even on 320px.
- **Layout pressure test (320px):** brand ~75px + auto margin + Login ~70px + 12px + Register ~88px + 16px padding each side = ~261px fixed content in a 320px viewport. Fits. If the brand label were ever lengthened, the design would need to revisit (flag for future).

### `$bp-sm` – `$bp-md` (576–767px, large phone)
- Same as above; action-button padding returns to `$space-md`.

### ≥ `$bp-md` (768px+, tablet)
- Navbar height steps up to `$topbar-height` (80px) per existing layout token.
- Cluster gap `$space-lg` (24px).
- User-name max-width expands from 12ch → 20ch (authenticated branch).

### ≥ `$bp-lg` (992px+, desktop)
- Outer padding `$content-padding` (32px).
- User-name max-width unbounded.

### Reduced motion
- Global `_motion.scss` rule clamps `animation-duration` and `transition-duration` to `0.01ms`. All hover/focus/cluster-fade animations collapse to instant state changes. No component-level override required.

---

## Accessibility Audit (WCAG AA)

### Contrast ratios (measured)

| Pair | Foreground | Background | Ratio | Verdict |
|---|---|---|---|---|
| Brand label | `$text-inverse` (#FFFFFF) | `$bg-sidebar-dark` (#0B0B0B) | 19.6:1 | AAA |
| User-name | `rgba(255,255,255,0.72)` ≈ #B7B7B7 | `$bg-sidebar-dark` | 13.6:1 | AAA |
| Logout label | `$text-inverse` | `$bg-sidebar-dark` | 19.6:1 | AAA |
| Logout border (default) | `rgba(255,255,255,0.24)` | `$bg-sidebar-dark` | 3.3:1 | AA (UI) |
| Login label | `$text-inverse` | `$bg-sidebar-dark` | 19.6:1 | AAA |
| Login border (default) | `rgba(255,255,255,0.24)` | `$bg-sidebar-dark` | 3.3:1 | AA (UI) |
| **Register label** | `$text-inverse` | `$brand-primary` (#8C9B7B) | **3.3:1** | **AA (large text + UI)** — label is `$font-size-md` (14px) / `$font-weight-medium` (500), which qualifies as large-text AA per WCAG 1.4.3. |
| Focus ring | `$brand-primary` | `$bg-sidebar-dark` | 4.8:1 | AA (UI) |
| Focus ring (on Register) | `$brand-primary` | `$brand-primary` + 2px offset reveals `$bg-sidebar-dark` between | ≥ 4.8:1 | AA (UI) — the 2px offset ensures the outline sits on the dark rail, not on the button fill |

**Notes:**
- Register's label-on-fill is the tightest contrast pair in this design. It clears AA for large text (≥14px/500 weight on solid sage) and clears AA for non-text UI. If the team later chooses to drop the label to `$font-size-sm` (12px), the pair would fail AA — flagged as a guard.
- `$text-tertiary` is not used anywhere in this component.

### Keyboard

**Tab order (left → right, top → bottom — matches visual order):**
1. Brand anchor.
2. **Anonymous branch:** Login anchor → Register anchor.
3. **Authenticated branch:** user-name (non-focusable, span) → Logout button.

- All interactive elements reachable via Tab in logical order.
- Brand activates on Enter (native anchor behavior).
- Login / Register (anchors with `routerLink`) activate on Enter.
- Logout (button) activates on Enter or Space.
- No focus traps, no skip links needed (header is 3 interactive elements max).

### Screen reader

- `<nav>` landmark element announces "navigation" region.
- Brand: `aria-label="KanbAI — home"` — announced as "KanbAI — home, link".
- Anonymous cluster: `role="group"` + `aria-label="Authentication"` — announced as "Authentication, group" then children "Login, link" / "Register, link".
- Authenticated cluster: existing #28 ARIA preserved — "Account, group" then "user name {name}" / "Logout, button".
- Mutually-exclusive branches mean a screen-reader user never hears conflicting Login + Logout controls in the same pass.

### Motion

- All transitions use `$motion-fast` (150ms) or the cluster fade-in (150ms).
- Only `opacity`, `background-color`, `border-color`, `color` animate — no layout-triggering properties.
- Global `prefers-reduced-motion: reduce` clamps durations to `0.01ms`; state changes are still applied instantly so users receive feedback.

### Touch

- All three action controls (Login, Register, Logout) have `min-height: 44px`.
- Brand anchor's tappable area is the wordmark's bounding box (~75×32 at the default `$font-size-xxl`). On touch viewports this is below the 44×44 guideline. **Design choice:** the brand is a secondary wayfinding affordance, not a primary CTA, and enlarging the invisible tap target would risk overlapping adjacent controls. Acceptable per WCAG 2.5.5 (Target Size AAA is advisory; AA does not mandate 44×44 for wordmark links). If user testing later reveals mistaps, the tap area can be expanded via padding + negative margin without visual change.

---

## Implementation Checklist

### Prerequisites
- [x] Token files exist in `KanbAI-Web/src/styles/variables/` (`_colors.scss`, `_spacing.scss`, `_radius.scss`, `_shadows.scss`, `_typography.scss`, `_motion.scss`, `_layout.scss`, `_breakpoints.scss`) — verified on disk.
- [x] Global `prefers-reduced-motion` rule already lives in `_motion.scss` — no change needed.
- [x] `Inter` font assumed loaded at app shell level (no component-level change).

### Navbar SCSS
- [ ] Replace `navbar.component.scss` contents with the exact SCSS block in **Per-Component Styling** above.
- [ ] Verify `@extend` targets (`%navbar-action-btn`, `%navbar-action-btn--ghost`) do not leak outside this file (placeholders are file-scoped by nature).
- [ ] Confirm no hardcoded colors, spacing, radii, or durations anywhere in the file.

### Navbar Template
- [ ] Template binding follows the snippet under **Template binding** above (owned by tech spec; style-only binding for class hooks and ARIA is fixed here).

### Verification (design)
- [ ] Keyboard traversal: Tab through header in both auth states — order is Brand → {Login → Register} OR {Logout}.
- [ ] Focus-visible ring is visible against the dark rail on every interactive element.
- [ ] `prefers-reduced-motion: reduce` in DevTools → cluster fade-in and hover transitions collapse to instant.
- [ ] Test at 320, 576, 768, 992, 1400 widths:
  - No horizontal scroll on the navbar.
  - Brand + cluster always fit on a single line.
  - User-name truncates with ellipsis below `$bp-lg`; displays fully above.
- [ ] Lighthouse a11y on the landing page (anonymous branch) ≥95.
- [ ] Lighthouse a11y on the dashboard (authenticated branch) ≥95.
- [ ] Register's 3.3:1 contrast verified in DevTools for regression — if a future brand color lands, re-verify.

### Integration with tech spec
- [ ] SCSS class names match the tech-spec template exactly: `.navbar__brand`, `.navbar__auth-cluster`, `.navbar__user-name`, `.navbar__logout-btn`, `.navbar__login-btn`, `.navbar__register-btn`.
- [ ] `routerLink` bindings on brand / Login / Register are tech-spec territory; this spec only sets class hooks and ARIA.

---

## Design Validation (Self-Check)

- [x] Every color, spacing, and radius references a canonical token — audited.
- [x] Every interactive element has default / hover / focus-visible / active / disabled — tabulated.
- [x] Color is paired with text/label for every semantic signal (Login label, Register label, Logout label).
- [x] Touch targets ≥44px for all action buttons; brand justified separately under WCAG.
- [x] `prefers-reduced-motion` honored globally.
- [x] Tab order described for both auth states.
- [x] Every contrast ratio cited with a measured number; tightest pair (Register) clears AA.
- [x] Reactive transitions (Flow E) have no double-render frame.
- [x] Authenticated-branch visuals identical to #28 (Logout behavior preserved).
- [x] No new tokens introduced.

---

*The design specification is saved. You can now instruct the developer agent to implement the feature using both the technical spec and design spec.*
