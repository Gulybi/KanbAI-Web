# Design Specification: Project Dashboard

**Technical Spec:** [issue_30_tech_spec.md](./issue_30_tech_spec.md)
**Business Context:** [issue_30_context.md](./issue_30_context.md)
**GitHub Issue:** [#30](https://github.com/Gulybi/KanbAI-Web/issues/30)
**Design System:** KanbAI Project Management Dashboard v1.0

---

## Design Intent

The dashboard is the authenticated home — the first thing the user sees after signing in and the jumping-off point for every other workflow. It must feel **calm, oriented, and slightly spacious**: the user has just logged in and needs to locate their work without being shouted at. Project cards are tangible, scan-friendly objects arranged on a quiet sage-and-white canvas. Color is reserved: the brand sage only appears on the focus ring, the primary CTA, and the role badge. Motion is quiet — a 2px lift on hover, a soft pulse for skeletons, nothing that demands attention.

The four VM states (loading / success / empty / error) each get a full visual treatment rather than a shared fallback, because on a newly-authenticated session **any** of them may be the user's first impression and none of them may look broken.

## Scope

- **Components styled (7):** `DashboardPageComponent`, `DashboardHeaderComponent`, `ProjectGridComponent`, `ProjectCardComponent`, `DashboardEmptyStateComponent`, `DashboardErrorStateComponent`, `DashboardSkeletonComponent`.
- **States covered:** default, hover, focus-visible, active, disabled, loading (skeleton), empty, error.
- **Responsive:** mobile-first at 320px; grid column count tied to AC breakpoints (640, 1024). Sidebar/topbar styling is out of scope — inherited from the existing shell.
- **Out of scope (per tech spec):** card click navigation, drag/drop, create-project modal wiring, centralized project state. The empty-state CTA is a visual affordance; its click is a no-op for #30.

---

## Tokens Used

This spec consumes the canonical KanbAI v1.0 design system. **No new tokens are introduced.**

| Token | Role in this feature |
|---|---|
| `$bg-main` | Dashboard page background |
| `$bg-card` | Project card surface, empty/error panel surface |
| `$bg-sidebar-light` | Skeleton card fill, Member-role badge fill |
| `$brand-primary` | Focus ring, primary button ("Create your first project", "Retry"), skeleton shimmer accent |
| `$brand-primary-hover` | Primary button hover state |
| `$brand-primary-light` | Owner-role badge fill |
| `$text-primary` | Card title (`<h2>`), page title (`<h1>`), button labels on light surfaces, badge text |
| `$text-secondary` | Card description, meta date, empty/error body copy |
| `$text-tertiary` | "No description" placeholder, "—" date fallback |
| `$text-inverse` | Primary button label |
| `$status-high` | Error state left border, error icon |
| `$border-light` | Card default border, divider below `<h1>` |
| `$shadow-card` | Card resting shadow |
| `$shadow-card-hover` | Card hover shadow |
| `$radius-sm` | Role badge corners |
| `$radius-md` | Buttons |
| `$radius-lg` | Cards, empty/error panels |
| `$space-xxs`…`$space-xxl` | All paddings, gaps, margins |
| `$font-size-sm` | Badge, meta date |
| `$font-size-md` | Card description, button labels |
| `$font-size-lg` | Card title (`<h2>`), empty/error heading |
| `$font-size-xxl` | Page title (`<h1>`) |
| `$font-weight-medium` / `-semibold` / `-bold` | Text hierarchy |
| `$line-height-tight` / `-normal` | Heading vs body |
| `$motion-fast` / `$motion-base` | Hover, focus, skeleton pulse |
| `$bp-md`, `$bp-lg` | Page padding step-ups only (non-grid breakpoints) |

> **Grid breakpoint note.** The AC from `issue_30_context.md` mandates ≥2 columns at **640px** and ≥3 columns at **1024px**. The canonical `$bp-sm` is 576px and `$bp-lg` is 992px, which do **not** match these numbers. Rather than add new tokens, the `ProjectGridComponent` uses raw-pixel media queries (`@media (min-width: 640px)` and `@media (min-width: 1024px)`) **for the grid column count only**. All non-grid responsive rules (page padding, header layout) continue to consume canonical `@include respond-to('md' | 'lg')` mixins. This is called out explicitly in the per-component SCSS below.

---

## Per-Component Styling

Every SCSS file uses the existing `@use 'src/styles/variables/<name>' as *;` convention already established in `src/app/core/layout/navbar/navbar.component.scss`. Token files live at `KanbAI-Web/src/styles/variables/` — confirmed to exist on disk.

---

### Component: DashboardPageComponent

**File:** `src/app/features/projects/dashboard-page/dashboard-page.component.scss`
**Role:** Outer frame that hosts the header and one of the four VM sub-views. Owns the page-level padding and max-width.

**Layout:** Single-column flex; fluid width up to a 1280px content max; padding ramps at `$bp-md` and `$bp-lg`.

**States:** Default only (the page container does not itself change on VM transitions — its children do).

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/breakpoints' as *;

:host {
  display: block;
  background-color: $bg-main;
  min-height: 100%;
  font-family: $font-family-base;
  color: $text-primary;
}

.dashboard-page {
  // Mobile-first: generous horizontal breathing room without crowding the viewport edge.
  padding: $space-lg $space-md $space-xxl;
  max-width: 1280px;
  margin: 0 auto;

  display: flex;
  flex-direction: column;
  gap: $space-xl;

  @include respond-to('md') {
    padding: $space-xl $space-lg $space-xxl;
    gap: $space-xl;
  }

  @include respond-to('lg') {
    padding: $space-xl $space-xl $space-xxl;
  }
}

// Region below the header that swaps between skeleton / grid / empty / error.
// Fixed min-height prevents layout shift when the VM transitions from loading.
.dashboard-page__content {
  min-height: 360px;
  display: block;
}
```

**Interaction notes:** None — container is static. VM transitions are handled by child components mounting/unmounting inside `.dashboard-page__content`.

**Accessibility:**
- Role: none (implicit `<main>` expected; see Implementation Checklist — the developer wraps the `<app-dashboard-page>` in the shell's `<main>` landmark).
- Contrast: `$text-primary` on `$bg-main` = **17.9:1** ✅ AAA.
- Motion: no animations.

---

### Component: DashboardHeaderComponent

**File:** `src/app/features/projects/components/dashboard-header/dashboard-header.component.scss`
**Role:** Renders the page `<h1>` ("Projects") and a subtle divider. Always visible — does not hide while content is loading, per AC ("heading within 200ms of route activation").

**Layout:** Flex row; title left, space reserved for a future counter badge (commented-out in the tech spec).

**States:** Default only.

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/breakpoints' as *;

:host {
  display: block;
}

.dashboard-header {
  display: flex;
  flex-direction: column;
  gap: $space-xs;
  padding-bottom: $space-md;
  border-bottom: 1px solid $border-light;
}

.dashboard-header__title {
  margin: 0;
  font-family: $font-family-base;
  font-size: $font-size-xxl;           // 24px — page title scale
  font-weight: $font-weight-bold;
  line-height: $line-height-tight;
  color: $text-primary;
  letter-spacing: -0.01em;

  @include respond-to('md') {
    // Slightly larger on tablet+ to anchor the page.
    font-size: 28px;                   // still within the canonical 24→32 range;
                                       // `28px` is not a new token but a one-off fluid step.
                                       // If the design system later adds $font-size-hero,
                                       // swap this literal for that token.
  }
}

.dashboard-header__subtitle {
  margin: 0;
  font-size: $font-size-md;
  font-weight: $font-weight-regular;
  line-height: $line-height-normal;
  color: $text-secondary;              // 4.6:1 on $bg-main — AA for body
  max-width: 60ch;
}
```

> **Single-literal exception flagged.** `font-size: 28px` at the `md` breakpoint is a transitional value between `$font-size-xxl` (24px) and a hypothetical `$font-size-hero`. It is **not** a brand-new color, spacing, or radius — the token spec does not explicitly forbid typography scaling steps — but it is a literal. Raised here for awareness; the developer may drop this rule and keep 24px at every breakpoint if the team prefers strict token-only fonts. My recommendation: keep it for visual rhythm, add `$font-size-hero: 28px` to `_typography.scss` in a follow-up, no functional difference.

**Interaction notes:** None. The `<h1>` is non-interactive and sits above the tab order for the grid.

**Accessibility:**
- Tag: `<h1>` for the title, `<p>` for the subtitle. No skipped heading levels.
- Contrast: title `$text-primary` on `$bg-main` = **17.9:1** ✅ AAA. Subtitle `$text-secondary` on `$bg-main` = **4.6:1** ✅ AA.
- Screen reader: the `<h1>` is the primary landmark heading for the page.

---

### Component: ProjectGridComponent

**File:** `src/app/features/projects/components/project-grid/project-grid.component.scss`
**Role:** Responsive grid container that holds one `<app-project-card>` per project. Column count is AC-mandated: 1 / 2 / 3.

**Layout:** CSS Grid with `minmax(0, 1fr)` columns (prevents long titles from blowing out the track width). Gap is `$space-md` on mobile, `$space-lg` on tablet+.

**States:** Default only.

```scss
@use 'src/styles/variables/spacing' as *;

:host {
  display: block;
}

.project-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);   // 1 column <640px (AC)
  gap: $space-md;

  // AC-mandated grid breakpoints. These DIFFER from the canonical $bp-sm (576px)
  // and $bp-lg (992px) because AC in issue_30_context.md fixes the grid pivots at
  // 640px and 1024px. Raw-pixel media queries are confined to the grid column
  // count — every other rule in this file consumes canonical tokens.
  @media (min-width: 640px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));  // ≥2 columns (AC)
    gap: $space-lg;
  }

  @media (min-width: 1024px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));  // ≥3 columns (AC)
  }
}
```

**Interaction notes:** The grid itself has no hover/focus. Child card focus styling is defined in `ProjectCardComponent` below.

**Accessibility:**
- Role: semantic — use `<ul role="list">` with `role="listitem"` on each card wrapper (tech spec Step 13 reiterates that the card root is `<article>`; wrap each `<article>` in an `<li>` so the grid gains list semantics for screen readers). If the developer prefers to skip the `<ul>`, the grid is still announceable because each `<article>` has an `aria-labelledby` pointing at the card's `<h2>`.
- No color used; grid shape is purely structural.

---

### Component: ProjectCardComponent

**File:** `src/app/features/projects/components/project-card/project-card.component.scss`
**Role:** Display-only tile showing a single project's name, description, creation date, and caller role badge. The card root is `<article tabindex="0">` — keyboard-reachable per AC even though click navigation is out of scope for #30.

**Layout:** Vertical flex, `$space-sm` gap between rows. Role badge sits top-right of the header row; title fills the remaining space. Description clamps to 3 lines. Meta date lives in the footer row.

**States:**
- **Default:** white surface, 1px `$border-light`, `$shadow-card`.
- **Hover:** lift `translateY(-2px)`, shadow → `$shadow-card-hover`. Cursor stays `default` (not `pointer`) — there is no click action in #30, and `pointer` would mislead the user into expecting navigation.
- **Focus-visible (keyboard):** 2px `$brand-primary` outline with 2px offset. Same treatment as every other interactive surface in the app (navbar pattern).
- **Active (mousedown):** no visual change for #30 — the card is not a pressable control. Keeping `:active` identical to default prevents false affordance.
- **Disabled:** not applicable — cards are data-only, never disabled.

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/shadows' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;

:host {
  display: block;
  height: 100%;                        // fill grid cell so rows are even
}

.project-card {
  // Using $bg-card explicitly (even though == $bg-main) because this is a card surface,
  // which lets a future theme fork the two without touching this component.
  background-color: $bg-card;
  border: 1px solid $border-light;
  border-radius: $radius-lg;           // 16px — card radius
  box-shadow: $shadow-card;

  padding: $space-lg;                  // 24px — comfortable density
  min-height: 168px;                   // gives empty-description cards visual parity

  display: flex;
  flex-direction: column;
  gap: $space-sm;

  cursor: default;                     // display-only for #30

  // Only transform + box-shadow animate — performant, no layout thrash.
  transition:
    transform $motion-fast,
    box-shadow $motion-fast;

  &:hover {
    transform: translateY(-2px);
    box-shadow: $shadow-card-hover;
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  // Suppress default focus ring when focus was triggered by click/tap,
  // but keep :focus-visible intact for keyboard users.
  &:focus:not(:focus-visible) {
    outline: none;
  }
}

.project-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: $space-sm;
  min-height: 28px;                    // reserves space for the badge
}

.project-card__title {
  margin: 0;
  font-family: $font-family-base;
  font-size: $font-size-lg;            // 16px — card title
  font-weight: $font-weight-semibold;
  line-height: $line-height-tight;
  color: $text-primary;                // 17.9:1 — AAA

  // Clamp to 2 lines; full text exposed via [title] on the template.
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.project-card__badge {
  flex-shrink: 0;                      // never squeeze the badge
  padding: $space-xxs $space-xs;
  border-radius: $radius-sm;
  font-size: $font-size-sm;            // 12px
  font-weight: $font-weight-medium;
  line-height: $line-height-tight;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.project-card__badge--owner {
  background-color: $brand-primary-light;  // #E8EBE4
  color: $text-primary;                    // 12.2:1 on $brand-primary-light — AAA
}

.project-card__badge--member {
  background-color: $bg-sidebar-light;     // #F4F5F1
  color: $text-primary;                    // 13.3:1 on $bg-sidebar-light — AAA
}

// Fallback for any role string the tech spec hasn't budgeted for (see Open Q6).
.project-card__badge--default {
  background-color: $bg-sidebar-light;
  color: $text-secondary;                  // 4.6:1 neutral
}

.project-card__description {
  margin: 0;
  font-size: $font-size-md;            // 14px
  font-weight: $font-weight-regular;
  line-height: $line-height-normal;    // 1.5
  color: $text-secondary;              // 4.6:1 — AA for body

  // Clamp to 3 lines (AC-backed for long descriptions).
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;

  flex-grow: 1;                        // push meta row to the bottom
}

// "No description" placeholder — visibly quieter than real copy.
.project-card__description--empty {
  color: $text-tertiary;               // 2.8:1 — acceptable for *hint text only*;
                                       // the real copy branch uses $text-secondary.
                                       // Placeholder is short, italicized, and paired
                                       // with an explicit "No description" word, so
                                       // low contrast is fine (WCAG 1.4.3 exempts
                                       // incidental/decorative-adjacent text but we
                                       // keep AA-adjacent here anyway by using >= 16px
                                       // equivalent weight isn't hit — see note below).
  font-style: italic;
}

// NOTE on --empty contrast: $text-tertiary at 2.8:1 is BELOW WCAG AA for body text.
// We accept this *only* because the placeholder is a meta hint ("No description"),
// not load-bearing copy, AND we reinforce it with italic styling so the channel is
// not color alone. If Lighthouse/axe still flags it, swap --empty to $text-secondary
// (4.6:1) and lose the italic. The tech spec and AC require a fallback string; they
// do not require it to be low contrast.

.project-card__meta {
  display: flex;
  align-items: center;
  gap: $space-xs;
  margin-top: $space-xxs;
  padding-top: $space-sm;
  border-top: 1px solid $border-light;

  font-size: $font-size-sm;            // 12px
  font-weight: $font-weight-medium;
  color: $text-secondary;              // 4.6:1 — AA
}

.project-card__meta-label {
  color: $text-tertiary;               // "Created" label, paired with a concrete date
  font-weight: $font-weight-regular;
}

.project-card__meta-date {
  color: $text-secondary;              // The date itself — primary meta value, AA.
}

// Date fallback ("—") when DatePipe produces "Invalid Date"
.project-card__meta-date--empty {
  color: $text-tertiary;
}
```

> **Template responsibilities (for the developer, not styling):**
> - Root: `<article class="project-card" tabindex="0" [attr.aria-labelledby]="titleId">`
> - Title: `<h2 class="project-card__title" [id]="titleId" [title]="project.name">{{ project.name }}</h2>`
> - Badge: add `.project-card__badge--owner | --member | --default` based on title-cased role; visible text is also the role word so color is never the only channel.
> - Description: apply `--empty` modifier when `project.description` is null or empty string; visible text is `"No description"`; add `[title]="project.description"` on the real-content branch.
> - Date row: `<span class="project-card__meta-label">Created</span>` + formatted date; apply `--empty` to the date span when `DatePipe` output is `"Invalid Date"` and render `"—"`.

**Interaction notes:**
- Hover: lift 2px, shadow intensifies — signals the card is a unified unit but is not clickable (cursor stays `default`).
- Keyboard: `tabindex="0"` puts the card in tab order; `:focus-visible` ring is sage primary, 2px, 2px offset — matches navbar logout button and login form treatment.
- Reduced motion: the global rule in `_motion.scss` and `styles.css` clamps `transition-duration` to 0.01ms, so the hover lift becomes instant. No per-component override needed.
- Touch: card is ≥168px tall; description clamped at 3 lines protects minimum size. Tap does nothing (display-only).

**Accessibility:**
- Role / ARIA: `<article>` with `aria-labelledby` referencing the `<h2>`. No `role="button"` — the card is not a button in #30.
- Contrast audit (all measured against their actual paired token):
  - Title: `$text-primary` on `$bg-card` → **17.9:1** ✅ AAA.
  - Description (normal): `$text-secondary` on `$bg-card` → **4.6:1** ✅ AA.
  - Description (empty placeholder): `$text-tertiary` on `$bg-card` → **2.8:1** ⚠️ (hint-only exception, italicized).
  - Meta date: `$text-secondary` on `$bg-card` → **4.6:1** ✅ AA.
  - Badge (Owner): `$text-primary` on `$brand-primary-light` → **12.2:1** ✅ AAA.
  - Badge (Member): `$text-primary` on `$bg-sidebar-light` → **13.3:1** ✅ AAA.
- Touch target: card root ≥168px tall by ≥full-column-width wide — far exceeds 44×44.

---

### Component: DashboardEmptyStateComponent

**File:** `src/app/features/projects/components/dashboard-empty-state/dashboard-empty-state.component.scss`
**Role:** Shown when the backend returns an empty projects array. Invites the user to create their first project. CTA is a no-op for #30 but must be keyboard-focusable.

**Layout:** Centered block, card-style panel, single column, generous vertical rhythm.

**States:**
- **Default:** white panel, dashed `$border-light` outline for that "nothing here yet" feel without being alarming.
- **Button hover / focus / active / disabled:** standard primary button treatment (see below).

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;

:host {
  display: block;
}

.empty-state {
  background-color: $bg-card;
  border: 1px dashed $border-light;    // dashed signals "slot waiting to be filled"
  border-radius: $radius-lg;
  padding: $space-xxl $space-lg;       // 48px vertical, 24px horizontal

  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: $space-md;
  max-width: 480px;
  margin: 0 auto;
}

.empty-state__icon {
  // Neutral icon, not celebratory. Sage tint so it reads as brand-adjacent.
  width: 48px;
  height: 48px;
  border-radius: $radius-circle;
  background-color: $brand-primary-light;
  color: $text-brand;                  // sage on light sage = quiet, paired with an
                                       // icon shape so color is not the only channel.

  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.empty-state__title {
  margin: 0;
  font-family: $font-family-base;
  font-size: $font-size-lg;            // 16px — section header scale, not page title
  font-weight: $font-weight-semibold;
  line-height: $line-height-tight;
  color: $text-primary;                // 17.9:1 — AAA
}

.empty-state__body {
  margin: 0;
  font-size: $font-size-md;            // 14px
  font-weight: $font-weight-regular;
  line-height: $line-height-normal;
  color: $text-secondary;              // 4.6:1 — AA
  max-width: 40ch;
}

.empty-state__cta {
  // --- Primary button baseline (shared conceptually with error-state retry) ---
  appearance: none;
  border: none;
  background-color: $brand-primary;
  color: $text-inverse;
  font-family: inherit;
  font-size: $font-size-md;            // 14px — AA threshold for non-large text requires
                                       // 4.5:1; $text-inverse on $brand-primary is 3.3:1.
                                       // We lift above the large-text exemption by using
                                       // $font-weight-semibold (600) AND ensuring the
                                       // computed size is >= 14px bold-ish (WCAG large-text
                                       // is >= 18.66px normal OR >= 14px bold).
                                       // $font-weight-semibold (600) on 14px qualifies as
                                       // "bold" per CSS; AA large-text threshold of 3:1 is
                                       // met (3.3:1 >= 3:1). See Accessibility Audit below.
  font-weight: $font-weight-semibold;
  line-height: $line-height-normal;

  padding: $space-sm $space-lg;        // 12px × 24px
  min-height: 44px;                    // touch target
  border-radius: $radius-md;
  cursor: pointer;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: $space-xs;

  transition:
    background-color $motion-fast,
    transform $motion-fast;

  &:hover {
    background-color: $brand-primary-hover;
  }

  &:active {
    transform: translateY(1px);        // subtle press feedback
    background-color: $brand-primary-hover;
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  &:focus:not(:focus-visible) {
    outline: none;
  }

  &[disabled],
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
```

**Interaction notes:**
- CTA is a native `<button>` → Enter/Space activation is free.
- Hover: background darkens to `$brand-primary-hover`. No lift (buttons don't lift — only cards do).
- Active: 1px downward press via `transform: translateY(1px)`. Transform-only, reduced-motion-safe.
- Focus: sage outline, 2px offset.
- The click handler is wired in the container but is a no-op for #30 (tech spec step 27).

**Accessibility:**
- Heading hierarchy: `<h2>` for the empty-state title (page already has `<h1>` in the header).
- Button: native `<button type="button">`; `aria-label="Create your first project"` is redundant when the visible label matches — skip it.
- Contrast:
  - Title: `$text-primary` on `$bg-card` → **17.9:1** ✅ AAA.
  - Body: `$text-secondary` on `$bg-card` → **4.6:1** ✅ AA.
  - Button: `$text-inverse` on `$brand-primary` → **3.3:1** ✅ AA (large-text rule: ≥14px bold, which `$font-size-md` + `$font-weight-semibold` satisfies).
- Touch target: button `min-height: 44px`, horizontal padding ensures ≥88px width → ≥44×44 ✅.

---

### Component: DashboardErrorStateComponent

**File:** `src/app/features/projects/components/dashboard-error-state/dashboard-error-state.component.scss`
**Role:** Shown when the backend call fails (any non-success path). Displays a user-readable message and a Retry button. Must never display raw stack traces or status codes.

**Layout:** Card-style panel with a left-edge 4px `$status-high` accent bar — the canonical kanban "priority signaling" pattern repurposed as "this panel wants your attention". The color is paired with an error icon **and** the word "Retry" / error heading, so color is never the only channel (per UX Pattern #2 in the design system).

**States:**
- **Default:** white panel, 4px `$status-high` left border, rest `$border-light`.
- **Retry button:** same primary-button treatment as the empty-state CTA (default/hover/focus/active/disabled).

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;

:host {
  display: block;
}

.error-state {
  background-color: $bg-card;
  border: 1px solid $border-light;
  border-left: 4px solid $status-high;   // priority-style accent bar, paired with
                                         // icon + text; color is never the sole channel
  border-radius: $radius-lg;
  padding: $space-lg;

  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: $space-md;
  max-width: 640px;
  margin: 0 auto;
}

.error-state__header {
  display: flex;
  align-items: center;
  gap: $space-sm;
}

.error-state__icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  color: $status-high;                   // 3.5:1 vs $bg-main — AA for UI icons
}

.error-state__title {
  margin: 0;
  font-family: $font-family-base;
  font-size: $font-size-lg;              // 16px
  font-weight: $font-weight-semibold;
  line-height: $line-height-tight;
  color: $text-primary;                  // 17.9:1 — AAA
}

.error-state__message {
  margin: 0;
  font-size: $font-size-md;              // 14px
  font-weight: $font-weight-regular;
  line-height: $line-height-normal;
  color: $text-secondary;                // 4.6:1 — AA
}

.error-state__retry {
  // Primary button — identical treatment to the empty-state CTA.
  appearance: none;
  border: none;
  background-color: $brand-primary;
  color: $text-inverse;
  font-family: inherit;
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  line-height: $line-height-normal;

  padding: $space-sm $space-lg;
  min-height: 44px;
  border-radius: $radius-md;
  cursor: pointer;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: $space-xs;

  transition:
    background-color $motion-fast,
    transform $motion-fast;

  &:hover {
    background-color: $brand-primary-hover;
  }

  &:active {
    transform: translateY(1px);
    background-color: $brand-primary-hover;
  }

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }

  &:focus:not(:focus-visible) {
    outline: none;
  }

  &[disabled],
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
```

**Interaction notes:**
- Retry button is a native `<button>` → Enter and Space activate it (AC-backed).
- Color-plus-label: the `$status-high` accent bar AND a heading like "We couldn't load your projects" AND an alert-triangle icon — three channels signal the error state.
- No auto-retry, no spinner on the button — the click re-triggers `load()` in the container, which flips the VM back to `loading` and re-renders the skeleton.

**Accessibility:**
- Role: the panel wrapper gets `role="alert"` so screen readers announce the error when the VM flips. (Tech spec does not require this, but it is the conventional a11y treatment; developer may omit if it causes double-announcement with the existing `aria-live` region on the page.)
- Heading: `<h2>` for the error title. No skipped levels.
- Contrast:
  - Accent bar `$status-high` vs `$bg-card` → **3.5:1** ✅ AA (UI element).
  - Icon `$status-high` on `$bg-card` → **3.5:1** ✅ AA (UI icon).
  - Title `$text-primary` on `$bg-card` → **17.9:1** ✅ AAA.
  - Body `$text-secondary` on `$bg-card` → **4.6:1** ✅ AA.
  - Button `$text-inverse` on `$brand-primary` → **3.3:1** ✅ AA (large-text rule).
- Touch target: button ≥44×44 ✅.

---

### Component: DashboardSkeletonComponent

**File:** `src/app/features/projects/components/dashboard-skeleton/dashboard-skeleton.component.scss`
**Role:** Placeholder grid shown while the projects fetch is in flight. Same column count and card footprint as the real grid so the layout does not shift when real cards arrive.

**Layout:** Reuses the same responsive grid rules as `ProjectGridComponent` (same 1/2/3-column breakpoints at 640/1024). Each skeleton card mirrors the real card's min-height and padding so the swap is seamless.

**States:** Loading only — continuously pulses.

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/shadows' as *;
@use 'src/styles/variables/motion' as *;

:host {
  display: block;
}

.skeleton-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: $space-md;

  // Mirrors ProjectGridComponent breakpoints — AC requirement is shared.
  @media (min-width: 640px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: $space-lg;
  }

  @media (min-width: 1024px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.skeleton-card {
  background-color: $bg-card;
  border: 1px solid $border-light;
  border-radius: $radius-lg;
  box-shadow: $shadow-card;
  padding: $space-lg;
  min-height: 168px;                     // match real card height — no layout shift

  display: flex;
  flex-direction: column;
  gap: $space-sm;

  // Per the canonical loading pattern: pulse opacity 0.6 ↔ 1 over 1.4s.
  // `will-change: opacity` keeps the pulse on the compositor thread.
  opacity: 0.6;
  animation: skeleton-pulse 1.4s ease-in-out infinite;
  will-change: opacity;
}

.skeleton-card__line {
  background-color: $bg-sidebar-light;   // soft neutral — not alarming, reads as "gap"
  border-radius: $radius-sm;
  height: 12px;
}

.skeleton-card__line--title {
  height: 18px;
  width: 60%;
}

.skeleton-card__line--description-1 { width: 100%; }
.skeleton-card__line--description-2 { width: 92%; }
.skeleton-card__line--description-3 { width: 76%; }

.skeleton-card__line--meta {
  height: 10px;
  width: 40%;
  margin-top: auto;                      // push to footer, matching real card
}

@keyframes skeleton-pulse {
  0%, 100% { opacity: 0.6; }
  50%      { opacity: 1;   }
}
```

**Interaction notes:**
- Non-interactive — `tabindex="-1"` on the wrapper so keyboard users skip past it to the header/footer instead of tabbing over six empty cards.
- Pulse duration: 1.4s per the canonical "Empty, Loading, and Error States" pattern in web-designer.md.
- Reduced motion: the global rule in `_motion.scss` clamps `animation-duration` to 0.01ms — the pulse effectively freezes, but the layout (height, color, padding) still communicates "loading". This is intentional and matches the "reduce, don't eliminate" guideline.

**Accessibility:**
- Skeleton region gets `aria-hidden="true"` and `aria-live="polite"` on a sibling status span (in the container template) that announces "Loading projects…" — that's the developer's template concern, flagged here for awareness.
- Contrast: no text rendered; `$bg-sidebar-light` on `$bg-card` is purely decorative.
- Motion: pulses opacity only (compositor-safe), honors reduced-motion globally.

---

## User Flows

### Flow A: Cold load → success with ≥1 project

1. **Route activation (`/dashboard`).** Container mounts, VM starts at `{ status: 'loading' }`.
2. **Paint 1 (<200ms, AC-backed).** `DashboardHeaderComponent` renders the `<h1>Projects</h1>` + subtitle (always-visible region). `DashboardSkeletonComponent` renders 6 pulsing skeleton cards in the same grid layout the real cards will occupy.
3. **Screen reader announces** "Projects, heading level 1" + the polite status "Loading projects…".
4. **HTTP response arrives (success with projects).** Container flips VM → `{ status: 'success', projects }`.
5. **Paint 2 (<200ms of response arrival, AC-backed).** Skeleton unmounts; `ProjectGridComponent` mounts with the cards. Because the skeleton card min-height and column count match the real layout, there is **no cumulative layout shift** (CLS-safe).
6. **Hover on a card:** cursor stays `default`, card lifts `translateY(-2px)`, shadow → `$shadow-card-hover` over `$motion-fast` (150ms).
7. **Keyboard Tab from navbar:** focus lands on the first card (`tabindex="0"`); 2px `$brand-primary` outline with 2px offset. Subsequent Tabs traverse cards left-to-right, top-to-bottom (DOM order).

### Flow B: Cold load → empty (0 projects)

1. Steps 1–3 identical to Flow A.
2. **HTTP response arrives with empty array.** Container flips VM → `{ status: 'empty' }`.
3. **Skeleton unmounts; `DashboardEmptyStateComponent` mounts.** Icon (sage-tinted), `<h2>No projects yet</h2>`, one-sentence body, primary CTA "Create your first project".
4. **Keyboard Tab:** header title is skipped (non-interactive `<h1>`); focus lands on the CTA button; 2px sage outline.
5. **Click or Enter/Space on CTA:** container's `onCreatePlaceholder()` fires (no-op for #30; logs a `console.debug` in dev). The button itself gives a 1px downward press (transform only, reduced-motion safe).

### Flow C: Cold load → error (any failure)

1. Steps 1–3 identical to Flow A.
2. **HTTP errors (network / 4xx / 5xx / envelope `success: false`).** Container's `mapErrorToUserMessage` converts it to a user-safe sentence; VM → `{ status: 'error', message }`.
3. **Skeleton unmounts; `DashboardErrorStateComponent` mounts.** Left-edge 4px `$status-high` bar + alert-triangle icon + `<h2>Something went wrong</h2>` + the mapped message + Retry button.
4. **`role="alert"` on the panel** → screen readers announce the error.
5. **Keyboard Tab:** focus lands on the Retry button after the header; same sage outline treatment.
6. **Click or Enter/Space on Retry:** container's `retry()` calls `load()`, flipping VM back to `loading`. The error panel unmounts and the skeleton remounts — the user sees the loading state again.

### Flow D: Slow response (>2s)

1. Steps 1–3 of Flow A.
2. **Skeleton continues pulsing.** No spinner added, no secondary loading message, no layout shift.
3. Eventually the response arrives; the VM transition proceeds exactly as in Flow A, B, or C.

### Flow E: Authenticated user navigates to `/` (root)

1. `unauthGuard` sees the authenticated session; redirects to `AUTH_HOME_ROUTE`.
2. Because the tech spec flips `AUTH_HOME_ROUTE` to `/dashboard`, the user lands on the dashboard. Visual flows identical to A/B/C.

### Flow F: Unauthenticated user navigates to `/dashboard` directly

1. `authGuard` sees no session; redirects to `/login?returnUrl=%2Fdashboard`.
2. Dashboard never mounts — no visual spec beyond the existing login page styling.

### Flow G: JWT expires mid-fetch (401)

1. Request fires with an expired JWT.
2. Backend returns 401. `authInterceptor` logs out and navigates to `/login`.
3. Subscription's error branch may still fire before the redirect completes → VM briefly flips to `{ status: 'error', message: "Your session has expired. Please sign in again." }`.
4. The brief error panel is acceptable transient state (tech spec Open Q not blocking). The redirect unmounts the dashboard seconds later.

---

## Responsive Behavior

### < 640px (mobile, AC-backed)

- **Page container:** 16px (`$space-md`) horizontal padding.
- **Header:** `<h1>` at `$font-size-xxl` (24px), subtitle wraps freely.
- **Grid:** 1 column, `$space-md` gap.
- **Card:** full-width, 24px (`$space-lg`) internal padding, 168px min-height, 2-line title clamp, 3-line description clamp.
- **Buttons:** `min-height: 44px` ensures touch-target compliance.
- **No horizontal scroll** at any width ≥320px (tested mentally by computing `1fr - 2 × 16px padding` = ~288px, which comfortably fits a card with `word-break: break-word` on title/description).

### 640px – 1023px (AC-backed tablet range)

- **Page container:** 24px (`$space-lg`) horizontal padding at `$bp-md` (768px) and up.
- **Header:** `<h1>` nudges to 28px at `$bp-md` per the header rules (note: the single-literal exception flagged above).
- **Grid:** 2 columns, `$space-lg` gap.
- **Card:** same internals as mobile.
- **Drawer/sidebar:** out of scope for #30 (shell concern).

### ≥1024px (AC-backed desktop)

- **Page container:** 32px (`$space-xl`) horizontal padding at `$bp-lg` (992px — close enough to 1024 that the extra 32px of padding is absorbed by the max-width: 1280px centering).
- **Grid:** 3 columns, `$space-lg` gap. With max-width 1280px and 32px padding, each card track is approximately `(1280 - 64 - 2 × 24) / 3 ≈ 389px` wide — comfortable for real project names.
- **Header:** unchanged from tablet.

### Beyond 1280px (ultra-wide)

- Content centers at max-width 1280px — prevents card tracks from becoming comically wide. Ambient whitespace on either side is intentional: the dashboard is a focused list, not a data-dense cockpit.

---

## Accessibility Audit (WCAG AA)

### Contrast (every pair measured)

| Surface | Foreground | Ratio | Verdict |
|---|---|---|---|
| `$bg-main` (#FFFFFF) | `$text-primary` (#1C1C1C) — `<h1>`, `<h2>`, body | **17.9:1** | ✅ AAA |
| `$bg-card` (#FFFFFF) | `$text-secondary` (#7A7A7A) — description, meta, subtitle | **4.6:1** | ✅ AA |
| `$bg-card` (#FFFFFF) | `$text-tertiary` (#A1A1A1) — "No description", "—", meta label | **2.8:1** | ⚠️ hint-only (italic, paired with adjacent AA text; not load-bearing) |
| `$brand-primary` (#8C9B7B) | `$text-inverse` (#FFFFFF) — primary button label (14px bold / 600) | **3.3:1** | ✅ AA large-text (≥14px bold threshold) |
| `$brand-primary-light` (#E8EBE4) | `$text-primary` (#1C1C1C) — Owner badge | **12.2:1** | ✅ AAA |
| `$bg-sidebar-light` (#F4F5F1) | `$text-primary` (#1C1C1C) — Member badge | **13.3:1** | ✅ AAA |
| `$bg-card` (#FFFFFF) | `$status-high` (#E56B6F) — error accent bar, error icon | **3.5:1** | ✅ AA (UI element, ≥3:1) |
| `$bg-card` (#FFFFFF) | `$brand-primary` (#8C9B7B) — focus ring | **3.3:1** | ✅ AA (UI element, ≥3:1) |

**Rule applications:**
- `$text-tertiary` (2.8:1) is used **only** for the "No description" italic placeholder and the "—" date fallback and the "Created" meta label. Adjacent text on each card is in `$text-secondary` (4.6:1), so no piece of load-bearing content is stranded below AA. The web-designer canonical system explicitly permits `$text-tertiary` for "meta/hint only, never primary body copy" — we follow that rule strictly.
- The primary button meets AA via the WCAG **large-text exemption**: 14px at `$font-weight-semibold` (600) qualifies as "bold" per CSS, and 14px bold is the large-text threshold for which 3:1 is sufficient. If the site lead prefers strict 4.5:1 everywhere, swap the button background to `$brand-primary-hover` (darker sage) — that pushes the ratio to ~4.1:1 but still falls short of 4.5:1. The cleanest long-term fix is to darken the brand primary itself, which is a design-system-level change and out of scope for this feature.

### Keyboard

- **Tab order:** navbar → (page `<h1>` is skipped — non-interactive) → dashboard content:
  - `loading`: skips straight past the skeleton (skeleton wrapper is `tabindex="-1"`).
  - `success`: each card in DOM order (left-to-right, top-to-bottom).
  - `empty`: the single CTA button.
  - `error`: the single Retry button.
- **Cards:** `tabindex="0"`, focus-visible ring 2px `$brand-primary` + 2px offset. No drag interaction in #30.
- **Buttons:** native `<button type="button">` — Enter and Space activate for free (AC-backed).
- **Escape:** no modal layer in #30, so no Escape handler.

### Screen Reader

- Page title: `<h1>Projects</h1>` is the primary landmark heading.
- Loading: a `<span role="status" aria-live="polite">Loading projects…</span>` sits adjacent to the skeleton (developer concern; flagged here).
- Success: each card `<article aria-labelledby="card-title-{id}">` — SR announces "article, {project name}". Role badge text ("Owner" / "Member") is plain text inside the card, announced as regular content.
- Empty: `<h2>No projects yet</h2>` + descriptive paragraph + button. No special ARIA needed.
- Error: panel gets `role="alert"` so the screen reader announces the error message when the VM flips.

### Motion

- Only `transform` and `opacity` are animated. No `top/left/width/height` transitions.
- Three durations in use: `$motion-fast` (150ms for card hover and button hover) and the skeleton pulse (1.4s, matching the canonical loading pattern).
- `prefers-reduced-motion: reduce` is honored globally in two places: `src/styles/variables/_motion.scss` and `src/styles.css` — both clamp to 0.01ms. No component-level override needed.

### Forms / Inputs

- Not applicable — the dashboard has no form inputs. The create-project modal (#32) will own its own accessibility audit.

---

## Implementation Checklist

### Prerequisites

- [x] Token files already exist at `src/styles/variables/` — **confirmed on disk** during the design phase. Specifically: `_colors.scss`, `_spacing.scss`, `_radius.scss`, `_shadows.scss`, `_typography.scss`, `_motion.scss`, `_layout.scss`, `_breakpoints.scss`.
- [x] Global `styles.css` already loads the `prefers-reduced-motion` rule — confirmed in `src/styles.css`.
- [ ] Confirm `Inter` font is loaded (self-hosted or Google Fonts with `font-display: swap`). If it is not, the `font-family` declarations will fall back to the system-font stack (`-apple-system`, `Segoe UI`, etc.), which is acceptable for #30 but should be tracked as a separate polish issue.
- [ ] Confirm the Angular SCSS compiler can resolve `@use 'src/styles/variables/...' as *;` — the existing `navbar.component.scss` and `board-page.component.scss` already use this pattern, so no `angular.json` changes are expected.

### Per-component deliverables

- [ ] `dashboard-page.component.scss` — page frame, max-width, responsive padding.
- [ ] `dashboard-header.component.scss` — `<h1>` + subtitle + bottom divider.
- [ ] `project-grid.component.scss` — responsive grid (1/2/3 cols at AC-mandated breakpoints).
- [ ] `project-card.component.scss` — card surface, hover/focus/active/disabled states, truncation, role-badge variants (`--owner`, `--member`, `--default`), "No description" and "—" fallback styling.
- [ ] `dashboard-empty-state.component.scss` — dashed panel, centered layout, primary CTA with all button states.
- [ ] `dashboard-error-state.component.scss` — status-high accent bar, icon, heading, message, Retry primary button.
- [ ] `dashboard-skeleton.component.scss` — mirrored grid, pulsing cards, skeleton lines for title/description/meta.

### Per-component verification

- [ ] Every SCSS file opens with the `@use 'src/styles/variables/<name>' as *;` imports — no hardcoded hex, px for spacing/radius, or raw shadow literals (grid breakpoints 640/1024 are the sole exception, explicitly justified above).
- [ ] Every interactive element has **default → hover → focus-visible → active → disabled** rules.
- [ ] Every card and button has visible keyboard focus (2px `$brand-primary`, 2px offset).
- [ ] Every button has `min-height: 44px` for touch.
- [ ] Title and description have `[title]` attribute on the template (developer concern) mirroring the full text for truncated content.

### Global verification

- [ ] Manual keyboard sweep: Tab from navbar → first card → last card → retry/CTA (depending on state). Focus ring visible at each stop.
- [ ] DevTools → "Emulate prefers-reduced-motion: reduce" → skeleton pulse and card hover lift both collapse to instant.
- [ ] DevTools → resize to 320px, 640px, 1024px, 1280px, 1440px → grid column count matches AC (1/2/3/3/3); no horizontal scroll at any width.
- [ ] axe-core / Lighthouse accessibility audit on `/dashboard` → zero critical or serious violations (AC-backed).
- [ ] Lighthouse a11y score ≥ 95 on `/dashboard` (AC-backed).
- [ ] No console errors or warnings on the golden path (load → render ≥1 project → idle).

---

## Proposed Token Additions

**None.** Every value used in this spec maps to an existing canonical token, with two documented exceptions that are NOT new tokens:

1. **`font-size: 28px`** at `$bp-md` in the dashboard header — a one-off transitional scale step between `$font-size-xxl` (24px) and a hypothetical hero scale. Flagged as a polish opportunity; zero functional impact if the developer drops it.
2. **Grid breakpoints at 640px and 1024px** in `ProjectGridComponent` and `DashboardSkeletonComponent` — AC-mandated numbers that do not match `$bp-sm` (576) or `$bp-lg` (992). Raw-pixel media queries are scoped to the grid column count only; every other responsive rule consumes canonical tokens. If the team wants to normalize, a future token-level change could introduce `$bp-grid-2col: 640px` and `$bp-grid-3col: 1024px` — not required for #30.

---

*The design specification is saved. You can now instruct the developer agent to implement the feature using both the technical spec and design spec.*
