# Design Specification: Open Kanban Board from Dashboard Project Card

**Tech Spec:** [issue_66_tech_spec.md](./issue_66_tech_spec.md)
**Context Document:** [issue_66_context.md](./issue_66_context.md)
**GitHub Issue:** #66
**Label:** `bug`
**Scope posture:** Scope-minimal bug fix. The only visual change authorised by the tech spec is `cursor: pointer` on `.project-card`. Every other section of this spec is either (a) a no-op that defers to the existing card styling, or (b) a non-visual contract (interaction states, a11y) that documents the behaviour of already-present tokens.

---

## 1. Overview

This design spec accompanies the bug fix that makes the existing dashboard `ProjectCardComponent` activatable as a navigation affordance to `/board/:projectId`. The tech spec (§"Out of Scope" and §"Visual affordance") restricts this ticket to a single SCSS token swap on the host `<article>`:

```
.project-card { cursor: default; }   →   .project-card { cursor: pointer; }
```

All other visual surfaces (hover elevation, shadows, role-aware affordances, focus-ring colour, card padding, badge styling, manage-button appearance, typography, description colour, meta row) are **preserved verbatim**. This spec does not add, remove, or recolour any rule outside that one declaration. Where a section below would otherwise introduce new styling, it explicitly declares itself a no-op so a future reader does not mistake "not mentioned here" for "up to the developer".

**Design goal:** communicate "this card is activatable" via the single minimal cue sanctioned by the tech spec (cursor) while keeping the existing focus ring, hover elevation, and card shadow intact so the change is invisible to non-pointer users and to users who never hover the card.

---

## 2. Token Consumption

All tokens used by this spec already exist at `KanbAI-Web/src/styles/variables/*.scss` and are already imported by `project-card.component.scss` (lines 1–7) via `@use '...' as *`. **No new tokens are introduced.** **No existing tokens are modified.** The `@use` paths below match the paths already present in the file; no discrepancy with the canonical token system was found.

| Role in this spec | Token | File | Value |
|---|---|---|---|
| Card background (unchanged) | `$bg-card` | `_colors.scss` | `#FFFFFF` |
| Card border (unchanged) | `$border-light` | `_colors.scss` | `#EAEAEA` |
| Card rest shadow (unchanged) | `$shadow-card` | `_shadows.scss` | `0 2px 8px rgba(0, 0, 0, 0.04)` |
| Card hover shadow (unchanged — retained; not tied to clickability in this ticket) | `$shadow-card-hover` | `_shadows.scss` | `0 4px 12px rgba(0, 0, 0, 0.08)` |
| Focus ring colour (unchanged — now applies to activatable host) | `$brand-primary` | `_colors.scss` | `#8C9B7B` |
| Focus / hover transition timing (unchanged — governs the focus-ring fade-in only) | `$motion-fast` | `_motion.scss` | `150ms cubic-bezier(0.4, 0, 0.2, 1)` |
| Touch-viewport breakpoint for 44×44+ target guidance | `$bp-md` | `_breakpoints.scss` | `768px` (via existing `@media (max-width: #{$bp-md - 1px})` block already present in the card SCSS for the manage-button enlargement) |

**Tokens explicitly *not* consumed by this spec (deferred per tech spec §"Out of Scope"):**
- No new hover-state token for "clickable vs. non-clickable" card variants.
- No active-state token (no `:active { ... }` rule is added; see §5).
- No role-tinted outline (owner vs. member cards share the same focus ring today and continue to do so).
- No shadow override tied specifically to "activatable card". The existing `$shadow-card-hover` on `:hover` is retained as-is — it is not being re-contracted as "I am clickable". It means what it meant yesterday.

---

## 3. Per-Component Styling

### 3.1 `ProjectCardComponent` — `project-card.component.scss`

**Modification — the only visual change in this ticket:**

Line 27 of the existing file changes from:

```scss
cursor: default;
```

to:

```scss
cursor: pointer;
```

No other lines in `.project-card { … }` change. The surrounding rules (background, border, border-radius, box-shadow, padding, min-height, flex layout, gap, transition, `:hover`, `:focus-visible`, `:focus:not(:focus-visible)`) are kept byte-for-byte as they appear today.

**Full authoritative block after the edit** (for review clarity — do not reformat beyond the one-line swap):

```scss
.project-card {
  background-color: $bg-card;
  border: 1px solid $border-light;
  border-radius: $radius-lg;
  box-shadow: $shadow-card;

  padding: $space-lg;
  min-height: 168px;

  display: flex;
  flex-direction: column;
  gap: $space-sm;

  cursor: pointer;                         // ← changed from `default`

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

  &:focus:not(:focus-visible) {
    outline: none;
  }
}
```

**Everything else in the file (header, title, badge variants, description, meta row, manage-button, the existing `@media (max-width: #{$bp-md - 1px})` manage-button enlargement) is untouched.**

### 3.2 `ProjectGridComponent` — `project-grid.component.scss`

**No style changes.** This is a passive event-relay update (see tech spec §"Passive relay"). The grid's SCSS remains as it is today (grid-template-columns, gap, breakpoint-driven column count, raw-pixel 640/1024 media queries kept verbatim with their existing inline justification comment).

### 3.3 `DashboardPageComponent` — `dashboard-page.component.scss`

**No style changes.** The dashboard only gains a `Router` injection and an `openBoard(project)` method; its template binds a new output but does not add or remove any DOM. The dashboard SCSS (padding, max-width, `respond-to` gap overrides, min-height) is untouched.

---

## 4. User Flows — Interaction States

This section is entirely about existing tokens and the single `cursor: pointer` edit. It introduces no new CSS rules, only contracts on what the browser already does.

### 4.1 State matrix

| State | Trigger | Visual treatment | CSS source |
|---|---|---|---|
| **Default / rest** | Card rendered, no pointer over, no keyboard focus | `$bg-card` fill, `$border-light` 1px border, `$shadow-card` drop shadow, `$radius-lg` corners, no outline | Existing `.project-card` block |
| **Hover (pointer)** | Mouse cursor over any part of the card (including the title, description, meta row, badge) | Cursor is `pointer` (new). Card lifts by `translateY(-2px)` and shadow intensifies to `$shadow-card-hover`, both transitioning over `$motion-fast`. Border and fill unchanged. | Existing `:hover` rule + the single-line cursor swap in §3.1 |
| **Hover (pointer over Manage button)** | Mouse cursor over the owner-only `.project-card__manage-btn` inside the header | Cursor remains `pointer` (was already `pointer` on the button, unchanged). Button gains `$bg-sidebar-light` fill and `$text-primary` colour via its existing `:hover:not(:disabled)` rule. The outer card continues to receive its own `:hover` because the pointer is also over `.project-card`. The *visual* hover treatment of the outer card (lift + shadow) is therefore active. This is identical to today — the ticket does not change it. | Existing `.project-card__manage-btn:hover` (line 168) and existing `.project-card:hover` |
| **Keyboard focus on the card host** | User tabs to the `<article>`; `:focus-visible` matches | 2px solid `$brand-primary` outline with 2px `outline-offset`. Transitions in via `$motion-fast` on `box-shadow`/`transform` inherited from the block (the outline itself is not animated — intentional, matches the rest of the design system). | Existing `:focus-visible` rule |
| **Keyboard focus on the Manage button** | User tabs past the card host into the nested button; `:focus-visible` matches on the button | 2px solid `$brand-primary` outline with 2px `outline-offset`, on the button only. The outer card's focus ring is **not** active (the `<article>` no longer has `:focus-visible`). This correctly reflects the two-stop tab order. | Existing `.project-card__manage-btn:focus-visible` (line 178) |
| **Active (mouse press) — card** | User mouse-downs on the card body | **No change from today.** The spec intentionally does *not* add a `.project-card:active { ... }` rule. Browsers render the default "no visual change" for `:active` on a generic `<article>`, which is what we want for the three guarded cases (see §4.2). Adding an active visual would produce a spurious press flash on text-selection drags and Manage-button clicks. | Intentional no-op |
| **Active (mouse press) — Manage button** | User mouse-downs on the Manage icon | Button takes `$brand-primary-light` fill and `$text-primary` colour via its existing `:active:not(:disabled)` rule. No change. | Existing `.project-card__manage-btn:active` (line 173) |
| **Keyboard-activated (Enter / Space on the card)** | User presses Enter or Space while the card host has focus | **No new visual flash.** The card does not render a "pressed" state for keyboard activation. The browser is expected to navigate within one frame of the keydown; any flash would be shorter than `$motion-fast` and perceived as noise. The focus ring remains visible on the card during the keydown until navigation replaces the view. Space's default page-scroll is suppressed by `event.preventDefault()` in the component handler (tech spec §Interaction Model). | Intentional no-op |

### 4.2 Guarded-case visual contracts

The tech spec (§Interaction Model) defines three guarded cases where the click handler **must not** emit `openBoard`. This spec pins what the user sees in each case.

| Guarded case | What the user sees | Why this is correct |
|---|---|---|
| **Click on the Manage icon button** | Button's own `:hover` → `:active` → back to `:hover` treatment plays normally (existing design). The outer card shows no visual activation — no flash, no press state, because no `.project-card:active` rule is defined. The members dialog opens. URL stays `/dashboard`. | The card's `cursor: pointer` is consistent with the button being pointer-addressable too; there is no misleading "card press" cue because we deliberately did not author one. |
| **Text selection release inside the card** | Browser's native text-selection highlight appears on the selected range (default selection colour, unchanged by this ticket — no `::selection` rule is added). On mouseup, selection remains visible. No card visual activation. No navigation. | Absent a `.project-card:active` rule, there is no spurious press-flash at selection release. This is the direct visual consequence of the "no active-state styling" decision. |
| **Right-click (context menu)** | Native browser context menu appears. No card visual activation. No navigation. | Same rationale — no active rule means no spurious press state for mouse button 2. |

### 4.3 Pointer affordance rationale

The `cursor: pointer` change applies to the whole `<article>` including the title `<h2>`, the description `<p>`, the badge `<span>`, and the meta row. This is intentional: the tech spec treats any click within the `<article>` (except the Manage button) as activation, so the cursor must match the activation surface. On the Manage button the cursor was already `pointer` (line 160 of the existing SCSS), so hovering the button shows no cursor change and no visual discontinuity at the boundary. On the title and description — text content the user may want to select — the cursor is `pointer`, not `text`. We accept this trade-off: the activation contract is "click anywhere in the card body", so a pointer cursor across the text is an accurate affordance. Text selection still works (governed by the `isTextBeingSelected` handler guard, not by cursor style).

---

## 5. Responsive Design

### 5.1 Card dimensions

**No change to card width, height, or padding at any breakpoint.** The card's `min-height: 168px` and `padding: $space-lg` (24px) are preserved, which at the existing `$space-lg` padding guarantees the card host is well above the 44×44 minimum tappable size on every viewport — on the smallest layout (`< 640px`, single-column grid) the card spans the full content width (typically 320–639px) and its height starts at 168px, so the activatable surface is on the order of ~320×168px minimum. The 44×44 touch-target requirement is satisfied by the card itself being the activation surface.

### 5.2 Manage-button touch target (unchanged — documented for completeness)

The existing `@media (max-width: #{$bp-md - 1px})` block at the bottom of `project-card.component.scss` already enlarges the nested Manage button from 32×32 to 44×44 on touch viewports (< 768px). This ticket does not touch that block. It is called out here only because nested-interactive activation requires both the outer card (≥44×44 by virtue of being much larger) and the inner button (44×44 below `$bp-md`, 32×32 on larger viewports where fine pointer input dominates) to meet a11y sizing guidance.

### 5.3 Grid breakpoints (unchanged)

The grid's 1-col / 2-col / 3-col breakpoints at 640px and 1024px are preserved verbatim from the existing `project-grid.component.scss`. No change.

### 5.4 Reduced motion

`_motion.scss` already defines a global `@media (prefers-reduced-motion: reduce)` rule that clamps all `transition-duration` and `animation-duration` to `0.01ms`. The card's `transform` and `box-shadow` transitions on hover, and the focus ring (which is un-animated anyway), therefore respect the user preference without further work. **No new `prefers-reduced-motion` block is added** — the global rule covers this component.

---

## 6. Accessibility Audit

### 6.1 Semantic / ARIA contract (from tech spec §"ARIA trade-off")

- Host becomes `<article class="project-card" role="button" tabindex="0" aria-labelledby="…">`. `tabindex="0"` and `aria-labelledby` are retained from today.
- **Nested-interactive trade-off:** `role="button"` on the `<article>` contains a native `<button>` (the Manage-members icon) when `canManage()` is true. WAI-ARIA 1.2 §6.5 discourages nesting interactive content inside an interactive role. The tech spec (§"Architecture Choice — ARIA trade-off") weighs three options and accepts `role="button"` as the least-bad: Chrome/Firefox with NVDA, JAWS, and VoiceOver announce both the outer role ("button, Alpha") and the inner `<button>` ("button, Manage members for Alpha"), and Tab reaches each independently. `role="link"` would be more semantically honest (the action is navigation) but would carry the same nested-interactive constraint. Dropping the role and relying on `tabindex="0"` alone would silently lose the "activatable" announcement for screen-reader users, which is worse.
- **This design spec does not change that trade-off** and does not propose a restructure that would remove the nested button. A future redesign could promote the Manage action to a dashboard-level side panel or a card context menu and eliminate the nested interactive; that is out of scope here.

### 6.2 Focus visibility

- The existing rule `:focus-visible { outline: 2px solid $brand-primary; outline-offset: 2px; }` applies to the activatable host. `$brand-primary` is `#8C9B7B`.
- **Contrast of the focus ring against the card background:** `$brand-primary` (`#8C9B7B`, relative luminance ≈ 0.301) against `$bg-card` (`#FFFFFF`, relative luminance 1.0) yields a contrast ratio of approximately **2.74 : 1**.
  - WCAG 2.1 SC 1.4.11 (Non-text Contrast, AA) requires **3 : 1** for visual boundaries of focus indicators.
  - The current focus ring therefore **falls short of AA by ~0.26** against the card fill.
  - **This is a pre-existing issue in the design system — the focus ring, `$brand-primary`, and `$bg-card` are all shipping tokens used in every other focusable component on the dashboard (Manage button, Create-project button, etc.) with identical contrast.** The tech spec (§"Out of Scope" and §"Visual affordance") forbids introducing new visual tokens or changing the focus ring for this ticket.
  - **Recommendation (deferred, not in scope):** raise this with the design-system owner as a system-wide fix — either darken `$brand-primary` toward `$brand-primary-hover` (`#7A8A69`, luminance ≈ 0.223, ratio ≈ 3.62 : 1 against white → passes AA) for focus-ring use, or add a dedicated `$focus-ring` token. Do not fix locally in this ticket, because doing so would create a one-off focus treatment on project cards that diverges from every other focusable surface in the product.
  - The 2px outline width and 2px `outline-offset` already meet SC 2.4.13 Focus Appearance (WCAG 2.2 AA) criteria for size and adjacency.

### 6.3 Text contrast (unchanged — documented for AC traceability)

All text on the card uses tokens that are unchanged by this ticket; their contrast is a property of the existing design system, not this fix:

| Text | Token | Value | vs. `$bg-card` `#FFFFFF` | Ratio | WCAG AA (normal text ≥ 4.5:1) |
|---|---|---|---|---|---|
| Title (`.project-card__title`) | `$text-primary` | `#1C1C1C` | white | ≈ 16.9 : 1 | Pass |
| Description | `$text-secondary` | `#7A7A7A` | white | ≈ 4.48 : 1 | **Borderline / sub-AA by 0.02** — pre-existing, not introduced here |
| Empty-description italic | `$text-tertiary` | `#A1A1A1` | white | ≈ 2.83 : 1 | Sub-AA — pre-existing, not introduced here |
| Meta row date | `$text-secondary` | `#7A7A7A` | white | ≈ 4.48 : 1 | Borderline, pre-existing |
| Badge text (owner variant on `$brand-primary-light` `#E8EBE4`) | `$text-primary` | `#1C1C1C` | `#E8EBE4` | ≈ 14.7 : 1 | Pass |

Borderline / sub-AA rows are **pre-existing** and flagged only so a reviewer does not attribute them to this ticket. The tech spec forbids introducing new text or recolouring existing text; these concerns belong to a design-system pass.

### 6.4 Keyboard interaction contract

- Tab reaches the card host (focus stop 1). Enter or Space activates; Space also suppresses page scroll via `event.preventDefault()` in `onKeyboardActivate` (tech spec §Interaction Model).
- Tab reaches the nested Manage button (focus stop 2, owner-only). Enter or Space on the button fires the button's native `click`, which runs `onManageMembers($event)`, which calls `event.stopPropagation()`; the card's handler additionally guards via `isInsideManageButton(event.target)` so keyboard activation of the button never emits `openBoard`.
- All other keys (arrow keys, letters, Escape) are not bound by the card handlers and have no effect.
- The focus ring is visible throughout the keydown on the card until navigation replaces the view. No focus is lost to the DOM.
- `restoreFocus: true` on the CDK Dialog (existing behaviour from #56/#57) ensures closing the Manage-members dialog returns focus to the Manage button, not the card host — unchanged.

### 6.5 Pointer interaction contract

- `cursor: pointer` on the card body signals activatability to sighted pointer users.
- No `:active` rule means right-click, text-selection release, and Manage-button clicks do not produce a misleading press flash on the card.
- The guarded cases (right-click, text selection, Manage-button click) produce the correct visual: native browser behaviour and/or the Manage button's own states, with no competing cue from the card.

### 6.6 Screen-reader announcement

With `role="button"` + `aria-labelledby="<title-id>"`, a screen reader announces each card as, e.g., "Alpha, button". The focus stop count per card matches the tab-stop count (1 for member cards, 2 for owner cards). The Manage button retains its `aria-label="Manage members for <name>"`.

---

## 7. Implementation Checklist

Developer workstream — file-by-file. Everything in this checklist is already mandated by the tech spec; this list exists only to confirm the design spec introduces no additional styling work.

- [ ] **`project-card.component.scss`** — change the single token on `.project-card`:
  - `cursor: default;` → `cursor: pointer;` (line 27)
  - Do not modify any other rule in this file.
- [ ] **`project-card.component.html`** — per tech spec only (no design-spec changes):
  - Add `role="button"`, `(click)="onCardActivate($event)"`, `(keydown.enter)="onKeyboardActivate($event)"`, `(keydown.space)="onKeyboardActivate($event)"` to the `<article>`.
  - Keep `tabindex="0"` and `[attr.aria-labelledby]="titleId()"`.
  - Do not touch the header, title, badge, description, meta row, or manage-button markup.
- [ ] **`project-grid.component.scss`** — no changes.
- [ ] **`dashboard-page.component.scss`** — no changes.
- [ ] **No new tokens, no new mixins, no new SCSS files.**
- [ ] **No changes to `_colors.scss`, `_motion.scss`, `_shadows.scss`, `_spacing.scss`, `_typography.scss`, `_breakpoints.scss`, `_radius.scss`, `_layout.scss`.**
- [ ] **No `::selection` rule added** — native text-selection styling is preserved (guarded-case contract in §4.2).
- [ ] **No `.project-card:active { ... }` rule added** — intentional, see §4.1 and §4.2.
- [ ] **No `@media (hover: none)` branch added** — cursor: pointer is inert on touch devices, which is the desired no-op.
- [ ] **No `prefers-reduced-motion` branch added** — the global rule in `_motion.scss` covers this component.
- [ ] Verify visually in dev: hover a card → cursor becomes a pointer; focus ring still appears on Tab; existing hover lift + shadow still plays; Manage-button hover/active/focus look identical to today; right-click shows native context menu with no card flash; drag-select over the title completes without card flash.
- [ ] Verify a11y with NVDA or VoiceOver: each card announces as "<project name>, button"; owner cards also expose "Manage members for <name>, button" as a separate Tab stop.

---

## 8. Open Design Questions (pre-existing, not blocking)

1. **Focus-ring contrast against white card fill is ~2.74:1, below WCAG AA 3:1 (SC 1.4.11).** This is a design-system-wide concern: every focusable element on a white background inherits it. This ticket intentionally does not fix it (forbidden by tech spec §"Out of Scope"). **Recommendation:** file a follow-up design-system ticket to reserve a dedicated `$focus-ring` token (candidate value: `$brand-primary-hover` `#7A8A69` at ≈ 3.62:1 against white) and retrofit all `:focus-visible` rules.
2. **Description and meta-date text use `$text-secondary` `#7A7A7A` on white at ≈ 4.48:1** — borderline AA for normal text (passes at ≥ 4.5:1 only on the generous side of rounding). Also a system-wide concern, also out of scope here.

Neither question blocks implementation of this ticket.

---

*"The design specification is saved. You can now instruct the developer agent to implement the feature using both the technical spec and design spec."*
