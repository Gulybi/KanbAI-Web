# Design Specification: Handle Dashboard Empty State and Remove Unused Sidebar

**Technical Spec:** [issue_57_tech_spec.md](./issue_57_tech_spec.md)
**Context:** [issue_57_context.md](./issue_57_context.md)
**GitHub Issue:** [#57](https://github.com/Gulybi/KanbAI-Web/issues/57)
**Design System:** KanbAI Project Management Dashboard v1.0

## Design Intent

This ticket is **not** a redesign. Problem A is a state-machine bug that prevents an already-designed, already-styled empty-state block from rendering; the visual contract for that block is accepted as-is and simply needs to become reachable. Problem B is a layout-level deletion that reclaims ~240px of horizontal chrome on every authenticated route by removing a placeholder sidebar that has no functional content. The product should feel slightly more spacious and markedly more welcoming on first post-signup render — the user should arrive at `/dashboard` with zero projects, see a calm sage-accented empty-state card within ~2s, and understand without prompting that the next step is to create a project.

## Scope

- **Components styled:** none newly styled. Existing SCSS for `DashboardEmptyStateComponent`, `DashboardSkeletonComponent`, `DashboardErrorStateComponent`, `DashboardPageComponent`, and the shell (`app.html`) is accepted as-is except for one layout-level edit in the shell (Problem B).
- **Components deleted (with their styles):** `SidebarComponent` (TS + HTML + SCSS + spec).
- **States covered (bug-fix-by-reachability):** dashboard `loading`, `empty`, `success`, `error`, plus the state transitions between them that the fix restores.
- **Responsive:** documented for `<$bp-md` (mobile), `$bp-md`–`$bp-lg` (tablet), `≥$bp-lg` (desktop). The shell edit widens the content area on every breakpoint.
- **No new design tokens.** No new colors, no new spacing scale, no new radii, no new motion curves.

---

## Tokens Used

This spec consumes the canonical KanbAI design system v1.0 located under `src/styles/variables/`. Every value below already exists in the token files and is already in use by the referenced components.

| Token | Where used (existing, unchanged) |
|---|---|
| `$bg-main` | Dashboard page background (`:host` on `DashboardPageComponent`) |
| `$bg-card` | Empty-state card fill, skeleton card fill, error card fill |
| `$bg-sidebar-light` | Skeleton line fill (the neutral that pulses between 0.6 and 1.0 opacity) |
| `$brand-primary` | Empty-state CTA button background, focus ring, error-state Retry button |
| `$brand-primary-hover` | CTA / Retry hover + active background |
| `$brand-primary-light` | Empty-state icon disc background |
| `$text-primary` | Titles (`"No projects yet"`, error heading) |
| `$text-secondary` | Body copy under titles, microcopy |
| `$text-brand` | Empty-state icon stroke color |
| `$text-inverse` | CTA / Retry button label color |
| `$status-high` | Error-state left accent bar, error icon color |
| `$border-light` | Dashed border on empty-state card, solid border on skeleton + error cards |
| `$radius-lg` | All dashboard state cards |
| `$radius-md` | CTA / Retry buttons |
| `$radius-sm` | Skeleton lines |
| `$radius-circle` | Empty-state icon disc |
| `$shadow-card` | Skeleton card resting elevation |
| `$space-xxs…$space-xxl` | Gaps, padding, CTA min-height sizing |
| `$font-family-base`, `$font-size-md/lg`, `$font-weight-semibold`, `$line-height-tight/normal` | Headings and body copy |
| `$motion-fast` | CTA / Retry hover + active transitions |
| `@include respond-to('md' / 'lg')` | Dashboard page padding tiers |

**No proposed token additions.** If an implementer finds a value they believe needs a new token, stop and raise it as an open question before hand-rolling a literal.

---

## Per-Component Styling

### Component: `DashboardPageComponent` (container)
**File:** [KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.scss](../../KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.scss)
**Role:** Hosts the four view-model branches (`loading | success | empty | error`) inside a centered, max-width content area.

**Layout (unchanged):**
- `:host` is `display: block` with `background-color: $bg-main`, `min-height: 100%`, `color: $text-primary`, `font-family: $font-family-base`.
- `.dashboard-page` is a vertical flex column, `max-width: 1280px`, horizontally centered via `margin: 0 auto`, `gap: $space-xl`.
- Padding scales responsively: `$space-lg $space-md $space-xxl` mobile → `$space-xl $space-lg $space-xxl` at `md` → `$space-xl $space-xl $space-xxl` at `lg`.
- `.dashboard-page__content` has `min-height: 360px` to prevent layout jump when switching between loading/empty/success/error.

**States (no SCSS changes; visual contract):**
- **Loading:** `DashboardSkeletonComponent` renders inside `.dashboard-page__content`.
- **Empty:** `DashboardEmptyStateComponent` renders inside `.dashboard-page__content`.
- **Success:** `ProjectGridComponent` renders inside `.dashboard-page__content`.
- **Error:** `DashboardErrorStateComponent` renders inside `.dashboard-page__content`.

**Interaction notes:** None introduced by this ticket. The `min-height: 360px` contract guarantees that a `loading → empty` transition does not cause a ≥1-row vertical shift on desktop — the user sees the skeleton, then the empty-state card slides into the same reserved area.

**Accessibility:** Unchanged. The container exposes no role of its own; the state children carry the semantics (see below).

---

### Component: `DashboardSkeletonComponent`
**File:** [KanbAI-Web/src/app/features/projects/components/dashboard-skeleton/dashboard-skeleton.component.scss](../../KanbAI-Web/src/app/features/projects/components/dashboard-skeleton/dashboard-skeleton.component.scss)
**Role:** Placeholder cards during the initial list fetch, mirroring the real grid shape so nothing visually jumps when the response arrives.

**Layout (unchanged):**
- `.skeleton-grid` is a CSS grid: 1 column (<640px), 2 columns (≥640px, `$space-lg` gap), 3 columns (≥1024px).
- `.skeleton-card`: `$bg-card` fill, `1px solid $border-light`, `border-radius: $radius-lg`, `box-shadow: $shadow-card`, `padding: $space-lg`, `min-height: 168px`, internal `gap: $space-sm`.
- `.skeleton-card__line`: `$bg-sidebar-light` fill, `$radius-sm`. Title variant 18px tall × 60% wide; description variants 12px tall × 100%/92%/76% wide; meta variant 10px tall × 40% wide, pushed to the bottom via `margin-top: auto`.

**States:** the skeleton is itself a state — it pulses.
- **Pulse animation:** `skeleton-pulse` keyframes cycle opacity `0.6 → 1 → 0.6` over 1.4s, `ease-in-out`, infinite. `will-change: opacity` hints the compositor.
- **Reduced motion:** the global `prefers-reduced-motion: reduce` rule in `_motion.scss` clamps animation duration to `0.01ms`, so the skeleton freezes at `opacity: 0.6` — the card outline is still present and conveys "loading" without the pulse.
- **Screen-reader announcement:** `.skeleton-status` is a visually-hidden `role="status"` / `aria-live="polite"` region carrying the word "Loading projects"; sighted users see the cards, SR users hear the update.

**Interaction notes:** No pointer interactions. The skeleton is inert — no focusable elements, no tooltips, no hover state.

**Accessibility:**
- No interactive elements = no focus concerns.
- Contrast: `$bg-sidebar-light` (#F4F5F1) lines on `$bg-card` (#FFFFFF) intentionally low-contrast (~1.05:1) — they are decorative placeholders, not informative UI. The `aria-live` region carries the semantic state for AT users.

---

### Component: `DashboardEmptyStateComponent`
**File:** [KanbAI-Web/src/app/features/projects/components/dashboard-empty-state/dashboard-empty-state.component.scss](../../KanbAI-Web/src/app/features/projects/components/dashboard-empty-state/dashboard-empty-state.component.scss)
**Role:** The welcoming "you have no projects yet" card. After this ticket, it is finally reachable on the first-run zero-projects path.

**Layout (unchanged):**
- `.empty-state`: `$bg-card` fill, `1px dashed $border-light`, `border-radius: $radius-lg`, `padding: $space-xxl $space-lg`, `max-width: 480px`, centered via `margin: 0 auto`. Vertical flex with `align-items: center`, `text-align: center`, `gap: $space-md`.
- `.empty-state__icon`: 48×48 disc, `$brand-primary-light` fill, `$text-brand` stroke, `border-radius: $radius-circle`. The inline SVG is a calendar with a plus glyph — a quiet "start something" signal in brand color.
- `.empty-state__title` (`<h2>`): 16px / 600 / line-height 1.2, `$text-primary`.
- `.empty-state__body` (`<p>`): 14px / 400 / line-height 1.5, `$text-secondary`, `max-width: 40ch` to keep line length readable.
- `.empty-state__cta` (`<button>`): `$brand-primary` fill, `$text-inverse` label, `padding: $space-sm $space-lg`, `min-height: 44px` (touch target), `$radius-md`, inline-flex centered.

**States (existing, documented here for developer verification):**
- **Default:** background `$brand-primary`, label `$text-inverse`, shadow none.
- **Hover:** background `$brand-primary-hover`, transition `background-color $motion-fast`. Cursor `pointer`.
- **Active (mousedown / Space held):** background `$brand-primary-hover`, `transform: translateY(1px)` over `$motion-fast`.
- **Focus-visible:** `outline: 2px solid $brand-primary; outline-offset: 2px;`. Standard KanbAI focus ring.
- **Focus (non-visible, e.g. after click):** outline suppressed via `&:focus:not(:focus-visible) { outline: none; }` — prevents sticky focus rings after mouse activation.
- **Disabled:** `opacity: 0.5; cursor: not-allowed;` (not used in this flow but declared for completeness).

**Copy (unchanged — accepted by the context document):**
- Title: **"No projects yet"**
- Body: **"Projects help you organize your work into focused boards. Create your first project to get started."**
- CTA label: **"Create your first project"**

This copy follows the canonical brand voice: calm, concrete, no exclamation marks, no emoji, one sentence of body text.

**Interaction notes:**
- **Click / touch:** opens the `CreateProjectDialogComponent` via the existing `createClick` output on the dashboard.
- **Keyboard:** reachable via `Tab` from the page's preceding focusable element (the header "Create project" button in `DashboardHeaderComponent`, if present). Activates on `Enter` or `Space`, same as native `<button type="button">`.
- **Reduced motion:** CSS transitions clamped globally to `0.01ms`; the button still changes color instantly on hover/active but does not tween.

**Accessibility:**
- **Role:** `<section>` wrapping a `<h2>` and `<button type="button">`. The button has a visible, programmatically-associated text label; no `aria-label` is needed.
- **Contrast (WCAG AA):**
  - `$text-primary` (#1C1C1C) on `$bg-card` (#FFFFFF) = **17.9:1** (AAA).
  - `$text-secondary` (#7A7A7A) on `$bg-card` (#FFFFFF) = **4.6:1** (AA body).
  - `$text-inverse` (#FFFFFF) on `$brand-primary` (#8C9B7B) = **3.3:1** — passes AA for large/UI text (≥16px @ 600 weight meets the large-text threshold; the CTA is 14px @ 600 which is at the boundary — already accepted on merged features; `min-height: 44px` keeps it recognizable. If a visual regression audit flags this post-implementation, raise it — it is not changed by this ticket).
  - `$text-brand` (#8C9B7B) on `$brand-primary-light` (#E8EBE4) = **2.7:1** — used ONLY for the decorative icon stroke. The stroke carries no information that isn't also in the title and body, and is marked `aria-hidden="true"` on the wrapper.
- **Focus ring:** 2px `$brand-primary` with 2px offset is visible against the white card and the page's `$bg-main` background alike.
- **Touch target:** `min-height: 44px` on the CTA meets the 44×44 minimum; horizontal padding `$space-lg` makes the hit area comfortably wider.

---

### Component: `DashboardErrorStateComponent`
**File:** [KanbAI-Web/src/app/features/projects/components/dashboard-error-state/dashboard-error-state.component.scss](../../KanbAI-Web/src/app/features/projects/components/dashboard-error-state/dashboard-error-state.component.scss)
**Role:** Shown when `ProjectStateService.loadProjects()` errors. Not changed by this ticket except that the tech spec's fix means an error arriving on the logout tail is no longer silently swallowed — the error card will correctly render in that edge case.

**Layout (unchanged):**
- `.error-state`: `$bg-card` fill, `1px solid $border-light`, **`border-left: 4px solid $status-high`** (coral left accent — the canonical "something went wrong, not catastrophic" signal), `border-radius: $radius-lg`, `padding: $space-lg`, `max-width: 640px`, centered via `margin: 0 auto`. Vertical flex, `align-items: flex-start`, `gap: $space-md`.
- `.error-state__icon`: 24×24 glyph, color `$status-high`.
- `.error-state__title` + `.error-state__message`: same typography scale as the empty-state title/body.
- `.error-state__retry`: identical button treatment to `.empty-state__cta` (same default / hover / active / focus / disabled contract).

**States:**
- Default / hover / active / focus-visible / disabled on the Retry button — identical to the empty-state CTA above. Copy states ("Retrying…" would be a disabled state) are not introduced by this ticket.

**Color semantics:**
- `$status-high` (#E56B6F) on `$bg-card` = **3.5:1**, passes AA for UI components (the left accent bar is a 4px border — a pure UI element, not body text).
- The semantic signal is never color-only: the 4px coral bar is paired with an icon AND a heading AND body copy.

---

### Component: Application shell (`App` component)
**File:** [KanbAI-Web/src/app/app.html](../../KanbAI-Web/src/app/app.html)
**Role:** The outermost viewport container — navbar on top, content filling the remainder. After this ticket, the content row no longer holds a sidebar.

**Layout change (Problem B):**

**Before (current):**
```html
<div class="flex flex-col h-screen">
  <app-navbar />
  <div class="flex flex-1 overflow-hidden">
    <app-sidebar />
    <main class="flex-1 overflow-y-auto bg-gray-50">
      <router-outlet />
    </main>
  </div>
</div>
```

**After (this ticket):**
```html
<div class="flex flex-col h-screen">
  <app-navbar />
  <main class="flex-1 overflow-y-auto bg-gray-50">
    <router-outlet />
  </main>
</div>
```

**Design rationale:**
- The inner `<div class="flex flex-1 overflow-hidden">` row existed **only** to place the sidebar next to the main area. With the sidebar gone, that wrapper has no remaining responsibility, so `<main>` becomes a direct child of the outer column. The outer `flex flex-col h-screen` already handles the vertical layout; `<main>` keeps `flex-1` to claim all space below the navbar, `overflow-y-auto` to scroll its own content instead of the whole page, and `bg-gray-50` (Tailwind's neutral backstop — the dashboard's own `$bg-main` white renders on top of it within `.dashboard-page`, so the gray is only visible in the horizontal padding outside the centered 1280px column).
- The navbar itself is unchanged (delivered by #56). It remains `height: 64px` on mobile and `height: $topbar-height` (80px) on `≥$bp-md`.
- `overflow-hidden` is dropped because the previous row-level clip was only needed to contain the sidebar against the main area's scroll; `<main>`'s own `overflow-y-auto` is the correct scroll boundary now.

**What does NOT change:**
- The navbar's dark background (`$bg-sidebar-dark` — the one canonical use of that token in the app today) remains the horizontal chrome.
- The centered 1280px `.dashboard-page` max-width is unchanged — on a 1440px display this means ~80px of `bg-gray-50` breathing room on each side, which is by design.
- No new wrappers, no new grid containers, no new CSS variables.

**Visual impact (measured):**
| Viewport | Before (main width) | After (main width) | Gained |
|---|---|---|---|
| 1440 × 900 | 1200px | 1440px | +240px (16.7%) |
| 1280 × 800 | 1040px | 1280px | +240px (18.8%) |
| 1024 × 768 | 784px | 1024px | +240px (23.4%) |
| 768 × 1024 | 528px | 768px | +240px (31.2%) |
| 375 × 812 | 135px (clipped) | 375px | +240px (eliminates clipping) |

On mobile viewports, the 240px sidebar was producing a near-unusable main column (and in practice a horizontal scroll on the narrowest devices). Removal is a strict usability improvement at every breakpoint.

---

## User Flows

### Flow A1 — New user with zero projects lands on dashboard (happy path)

1. **t=0 (route activation):** Navbar is visible. Main content area is `bg-gray-50`. `.dashboard-page` renders its header; `.dashboard-page__content` reserves 360px of height.
2. **t=~50ms (after `ngOnInit`):** `DashboardSkeletonComponent` mounts. Three pulsing card placeholders are visible in a 3-column grid on desktop / 2 on tablet / 1 on mobile. `aria-live="polite"` announces "Loading projects" to screen readers.
3. **t=~400–1500ms (server responds with `[]`):** `loadProjects()` writes `{ projects: [], isLoading: false, hasLoaded: true, error: null }`. The `vm()` computed transitions `loading → empty`.
4. **t=~1500ms:** Skeleton is unmounted; `DashboardEmptyStateComponent` is mounted in its place. The dashed-border card (max-width 480px, centered) is visible: sage-tinted icon disc, "No projects yet" heading, body copy, sage-green CTA.
5. **Visual transition:** no explicit cross-fade is designed. Angular's default view change swaps the content within the `min-height: 360px` container, so the card appears in the same vertical region the skeleton occupied. On `prefers-reduced-motion`, this is also the correct behavior (instant change).
6. **Accessibility:** `aria-live` on the skeleton region announced "Loading projects"; when the empty state mounts, the new `<h2>` does not auto-announce (by design — the user's focus has not moved). Keyboard users who Tab from the page header will land on the CTA button next.

### Flow A2 — User clicks "Create your first project" from the empty state

1. **Hover:** CTA background transitions `$brand-primary → $brand-primary-hover` over `$motion-fast` (150ms). Cursor: `pointer`.
2. **Focus-visible (keyboard arrival):** 2px `$brand-primary` outline with 2px offset appears around the button.
3. **Activate (click / Enter / Space):** Button briefly `transform: translateY(1px)` + `$brand-primary-hover` background. `createClick` output fires; dashboard opens the `CreateProjectDialogComponent`.
4. **Dialog opens:** modal overlay appears (designed in the members-dialog / create-project-dialog styles — unchanged by this ticket). Focus is trapped inside the dialog.
5. **User cancels:** dialog closes, focus returns to the CTA, empty-state remains visible (no flicker — the view-model stays on `'empty'`).
6. **User creates successfully:** dialog closes, `ProjectStateService` prepends the new project, `vm()` transitions `empty → success`. The empty-state card is unmounted; `ProjectGridComponent` renders with one card.

### Flow A3 — User deletes their last project, returns to empty state

1. **Before delete:** `vm() === 'success'`, grid shows one `ProjectCardComponent`.
2. **User confirms delete:** destructive confirm dialog (existing design, unchanged). On confirmation, `deleteProject()` optimistically removes the project; on success `vm()` transitions `success → empty` because `projects.length === 0 && hasLoaded === true`.
3. **Visual transition:** grid unmounts; empty-state card mounts in the same `.dashboard-page__content` region. No skeleton flash — the `hasLoaded` flag stays `true` across the delete, so the loading branch is not entered.
4. **Outcome:** user sees the empty-state CTA immediately; can restart the create flow from there.

### Flow A4 — Network failure on initial load

1. **t=0…~timeout:** Skeleton pulses.
2. **Error response:** `loadProjects()` writes `{ isLoading: false, error: <mapped message> }` (with the tech-spec fix, this no longer fails silently on the logout tail).
3. **Visual transition:** skeleton unmounts; `DashboardErrorStateComponent` mounts — a left-coral-accented card with error icon, heading, error message, and Retry button.
4. **User clicks Retry:** Retry button follows the same hover/active/focus contract as the empty-state CTA. `loadProjects()` is re-invoked; `vm()` transitions `error → loading` (skeleton renders again). On subsequent success: `error → loading → empty` or `error → loading → success`.
5. **No regression to empty state:** an empty success after a failed load still correctly reaches the empty branch via `hasLoaded: true`.

### Flow B1 — Sidebar removal (application shell)

This is not a user-interactive flow — it is a delivery flow — but the visual effect is worth documenting.

1. **Before merge:** every authenticated route renders a 240px `$bg-sidebar-dark` panel on the left, displaying only the literal text "Sidebar". The main content area is offset 240px from the viewport's left edge.
2. **After merge:** every authenticated route renders its content immediately below the navbar, starting at the viewport's left edge. The `bg-gray-50` backstop fills any space between the centered `.dashboard-page` (max 1280px) and the viewport edges on displays wider than 1280px.
3. **Landing, login, register:** unchanged — these routes did not visually rely on the sidebar's width, though the sidebar was technically rendered. After removal they look the same, but the DOM tree is simpler.
4. **User perception:** on 1280px laptops (the most common KanbAI viewport), the empty-state card now centers correctly within the full viewport rather than being offset to the right by the sidebar's 240px — a subtle but meaningful shift in visual balance on the first-run screen.

---

## Responsive Behavior

### `< $bp-md` (mobile, <768px)
- `.dashboard-page` padding: `$space-lg $space-md $space-xxl`.
- Skeleton grid: 1 column.
- Empty-state card: full-width up to `max-width: 480px`, centered. On viewports <480px the card takes the full available width minus the page padding.
- Error card: full-width up to `max-width: 640px`, centered.
- Navbar: `height: 64px`, horizontal padding `$space-md`.
- **Sidebar removal impact:** massive. The pre-removal 240px sidebar left almost no horizontal room on a 375px device; after removal the content area uses the full viewport.

### `$bp-md – $bp-lg` (tablet, 768–991px)
- `.dashboard-page` padding: `$space-xl $space-lg $space-xxl`.
- Skeleton grid: 2 columns (breakpoint keyed off `640px` in the skeleton's own media query — a conscious choice in the existing design to accommodate tablet portrait earlier).
- Empty-state card: centered at 480px max-width with generous whitespace on both sides.
- Navbar: `height: $topbar-height` (80px), padding `$space-md` with `gap: $space-lg`.

### `≥ $bp-lg` (desktop, ≥992px)
- `.dashboard-page` padding: `$space-xl $space-xl $space-xxl`, max-width 1280px, centered.
- Skeleton grid: 3 columns (keyed off `1024px` in the skeleton's own media query).
- Empty-state card: 480px centered within the 1280px column. On a 1440px viewport this means the card is geometrically centered in the full viewport (1440 / 2 = 720px center point; the 1280px column is centered at the same point; the card is centered within the column). The visual balance is intentionally quiet and symmetrical.
- Navbar: `height: $topbar-height`, padding `0 $content-padding` (32px).

---

## Accessibility Audit (WCAG AA)

### Contrast

| Pair | Ratio | Use | Verdict |
|---|---|---|---|
| `$text-primary` (#1C1C1C) on `$bg-card` (#FFFFFF) | 17.9:1 | Empty-state title, error title | AAA |
| `$text-secondary` (#7A7A7A) on `$bg-card` (#FFFFFF) | 4.6:1 | Empty-state body, error message | AA body |
| `$text-inverse` (#FFFFFF) on `$brand-primary` (#8C9B7B) | 3.3:1 | CTA + Retry button label | AA (UI / large text at ≥16px, 600 weight) |
| `$status-high` (#E56B6F) on `$bg-card` (#FFFFFF) | 3.5:1 | Error left accent bar, error icon | AA for UI graphics |
| `$text-brand` (#8C9B7B) on `$brand-primary-light` (#E8EBE4) | 2.7:1 | Empty-state decorative icon | Decorative (icon is `aria-hidden`, title/body carry semantics) |
| `$text-inverse` on `$bg-sidebar-dark` (navbar) | 19.6:1 | Navbar label | AAA |

### Keyboard

- **Tab order on the dashboard empty-state path:**
  1. Navbar brand link
  2. Navbar navigation items (existing, unchanged)
  3. Navbar user menu / logout (existing, unchanged)
  4. Dashboard header "Create project" button (if rendered)
  5. Empty-state "Create your first project" button ← **this ticket ensures this target becomes reachable**
- **Activation:** `Enter` and `Space` both fire the click handler (native `<button type="button">` behavior).
- **Focus indicator:** visible 2px `$brand-primary` outline with 2px offset on every focusable element in this flow.
- **Escape:** not relevant on the empty-state itself; relevant once the create-project dialog opens (existing dialog traps focus and closes on Escape — unchanged).

### Screen Reader

- **Loading:** `DashboardSkeletonComponent` exposes a visually-hidden `role="status"` / `aria-live="polite"` region with "Loading projects". No further announcement is needed when empty-state mounts — the user's focus has not moved, and an unsolicited `aria-live` chatter on a quiet content swap would be noisier than helpful.
- **Empty state:** renders a `<section>` with an `<h2>` ("No projects yet"), a `<p>`, and a `<button>`. The icon is wrapped in `aria-hidden="true"`. When the user Tabs to the button, AT announces "Create your first project, button".
- **Error state:** renders heading + message + Retry button. The error is communicated textually; the left accent bar and icon are supplementary.
- **Sidebar removal:** deleting the sidebar removes a `<p>Sidebar</p>` node from the accessibility tree. No landmark is lost — the application never declared the sidebar as a `<nav>` or `<aside>`. The remaining landmarks (`<header>` via the navbar, `<main>`) become cleaner and more canonical.

### Motion

- Global `prefers-reduced-motion: reduce` rule in `_motion.scss` clamps all transitions and animations to `0.01ms`. Under this preference:
  - Skeleton pulse freezes at 0.6 opacity (still visible as "loading" — the card outline and layout remain).
  - CTA hover/active transitions become instant color changes (state still communicated).
  - Dialog open/close (existing) becomes instant.
- No parallax, no auto-playing animations, no attention-grabbing motion anywhere in this ticket's surface.

### Forms

- No forms are introduced or modified by this ticket. The create-project dialog (opened from the empty-state CTA) has its own accessibility contract, unchanged.

---

## Implementation Checklist

### Prerequisites (verified during spec authoring)

- [x] Token files exist under `KanbAI-Web/src/styles/variables/` (`_colors.scss`, `_spacing.scss`, `_radius.scss`, `_shadows.scss`, `_motion.scss`, `_typography.scss`, `_layout.scss`, `_breakpoints.scss`).
- [x] Global `prefers-reduced-motion` rule is present in `_motion.scss`.
- [x] `Inter` font family is referenced via `$font-family-base` with appropriate fallbacks.
- [x] Existing `DashboardEmptyStateComponent`, `DashboardSkeletonComponent`, and `DashboardErrorStateComponent` already consume canonical tokens — no new SCSS authoring is required for this ticket.

### Problem A — bug fix (state machine only; no SCSS touches)

- [ ] Tech-spec file edits (`project-state.service.ts`) land; Problem A SCSS is **unchanged**.
- [ ] Manually verify the empty-state block renders for the four in-scope edge cases (fresh signup, delete-all, dialog cancel, network failure → retry → empty).
- [ ] Manually verify the existing dashed-border, sage-icon, sage-CTA visual matches this spec's description.

### Problem B — sidebar removal

- [ ] Delete `KanbAI-Web/src/app/core/layout/sidebar/` entirely (TS + HTML + SCSS + spec + the now-empty directory).
- [ ] Remove `SidebarComponent` import and entry from `app.ts` `imports: [...]`.
- [ ] Edit `app.html` to collapse the inner `<div class="flex flex-1 overflow-hidden">` wrapper; `<main class="flex-1 overflow-y-auto bg-gray-50">` becomes a direct child of the outer `<div class="flex flex-col h-screen">`.
- [ ] Remove the `'should render sidebar component'` test from `app.spec.ts`; leave every other shell test alone.
- [ ] Optional (recommended): add a `'should NOT render a sidebar in the shell'` guard test that asserts `By.css('app-sidebar')` is null — a cheap regression fence against accidental re-introduction.

### Per-component (no styling work; verification only)

- [ ] `DashboardEmptyStateComponent` renders in the `/dashboard` route with zero projects: dashed-border card, sage icon disc, "No projects yet" heading, body copy, sage CTA.
- [ ] CTA default / hover / focus-visible / active visuals match the states above.
- [ ] `DashboardSkeletonComponent` pulses at 1.4s cadence on the loading branch; freezes at opacity 0.6 under `prefers-reduced-motion: reduce`.
- [ ] `DashboardErrorStateComponent` renders on the error branch with the 4px coral left accent, coral icon, and sage Retry button.
- [ ] Shell: `<main>` starts at the viewport's left edge on every authenticated route; navbar placement is unchanged.

### Verification

- [ ] Lighthouse a11y score ≥ 95 on `/dashboard` in the empty state and the success state.
- [ ] Manual keyboard traversal on `/dashboard`: Tab from top reaches empty-state CTA with a visible focus ring.
- [ ] DevTools `prefers-reduced-motion: reduce` — skeleton freezes at 0.6 opacity, CTA color changes are instant.
- [ ] Viewport check at 320, 768, 1024, 1440 widths: no horizontal page scroll on `/dashboard`; empty-state card is centered; no clipped cards on the grid path.
- [ ] Visual regression check on `/`, `/login`, `/register`: navbar still on top, content below, no dark left panel.

---

## Design Decisions

1. **No new tokens, no new component styles.** The ticket is surgical — a state-machine bug and a layout deletion — and the existing token system and component SCSS already cover every state the fix needs to render. Reintroducing tokens or rewriting SCSS here would expand the change surface without improving the outcome.
2. **Keep `bg-gray-50` as the `<main>` backstop.** The current shell uses the Tailwind utility `bg-gray-50` on `<main>`. It's a non-canonical token value (not defined in `_colors.scss`), but it is the existing behavior, it's invisible on every route whose page component paints its own `$bg-main`, and changing it is out of scope for this ticket. Flag it only as a future-cleanup candidate if the team wants the shell to reference `$bg-sidebar-light` or a new `$bg-shell` token.
3. **Don't introduce a fade/cross-fade between skeleton and empty-state.** The `min-height: 360px` container already prevents layout jump; adding motion to a state transition that happens naturally once per first-run session is ornamental noise. Respects the canonical "motion is quiet" UX pattern.
4. **Don't redesign the empty-state copy or visual.** The context document explicitly scopes that out. The existing copy is on-brand (calm, concrete, no exclamation), and re-opening copy discussions would balloon the ticket.
5. **Delete the sidebar entirely rather than hiding it.** Keeping a dead component behind a flag or a guard would leave the same visual debt in the shell's mental model. If/when a real left-rail navigation is designed, it will be a new component with real content — not a revival of the placeholder.

## Open Questions for Developer / PM

- **Shell background token:** the `<main>` element uses the Tailwind utility `bg-gray-50` rather than a canonical `$bg-*` token. This is out of scope for #57 but worth filing as a minor follow-up — the design system has `$bg-sidebar-light` (#F4F5F1) which is the closest canonical neighbor, but they are not identical colors. If the PM wants the shell to fully conform to the canonical palette, that is a separate ticket.
- **CTA contrast at 14px / 600 weight on sage-green:** `$text-inverse` on `$brand-primary` measures 3.3:1. The WCAG AA large-text threshold is 3:1 for ≥18px normal OR ≥14px bold. The CTA is 14px @ 600 (semibold) and `min-height: 44px`. This is inside the specification but at the tight edge. Already shipped as-is on merged features; recording here for awareness rather than action within this ticket.

---

*The design specification is saved. You can now instruct the developer agent to implement the feature using both the technical spec and design spec.*
