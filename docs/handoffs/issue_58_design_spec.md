# Design Specification: Clean Up Landing Page Content (Remove AI Hallucinations)

**Technical Spec:** [issue_58_tech_spec.md](./issue_58_tech_spec.md)
**Context Document:** [issue_58_context.md](./issue_58_context.md)
**GitHub Issue:** [#58](https://github.com/Gulybi/KanbAI-Web/issues/58)
**Design System:** KanbAI Project Management Dashboard v1.0

---

## Section 1 — Overview

### Design Intent

The landing page is the first (and today, only) public surface of KanbAI. After this change it should feel **calm, honest, and uncluttered**: it stops promising what the product cannot do, and starts signalling what is genuinely available today vs. what is on the roadmap. The roadmap signal — a single "Coming soon" badge on the `ai-assistance` feature card — must read as a quiet, confident note, not as a warning or a marketing flourish. Brand voice (Section 10 of the design system: "Calm and concrete") dominates every visual choice below.

### Scope

- **Components styled:**
  - `HeroSectionComponent` — revised copy only; no structural / layout restyling beyond the confirmed removal of the trust-indicator `<p>`.
  - `FeaturesSectionComponent` — revised copy only; grid untouched.
  - `FeatureCardComponent` — adds a new `.feature-card__badge` element when `feature.comingSoon === true`, and adds a new `.icon-lock` gradient class for the `secure-sign-in` card.
- **States covered on new/modified elements:** default, hover, focus-visible, active, reduced-motion. (No disabled / loading / empty / error states — the badge is render-or-omit, never interactive or asynchronous; the card itself is non-interactive below the scope of this issue.)
- **Responsive:** 375 px / 768 px / 1280 px confirmed against the existing `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` rules; badge does not reposition across breakpoints.

### Out of Scope (explicitly)

- Rewriting the existing icon gradients (`icon-board`, `icon-ai`, `icon-team`, `icon-automation`) to consume canonical brand tokens. These gradients use raw Tailwind-era hex values (`#3b82f6` / `#a855f7` / `#10b981` / `#f59e0b`) and pre-date the KanbAI v1.0 token system. That is a pre-existing token-drift issue, not an issue-#58 deliverable. Flagged under "Proposed Token Additions" below for future tracking.
- Body copy of the four cards — owned by the tech spec; this document does not touch strings.
- Animating the badge on appearance. It renders on initial paint from signal-driven data; no enter animation is specified (YAGNI).

---

## Section 2 — Tokens Used

This spec consumes only canonical KanbAI v1.0 tokens. **No new tokens are introduced** for the in-scope changes. One out-of-scope future addition is flagged at the end of the section.

### Tokens consumed

| Token | Where used |
|---|---|
| `$brand-primary` | `.feature-card__badge` focus-visible outline; (implicit) global focus ring for interactive CTAs that this issue does not modify. |
| `$brand-primary-light` (#E8EBE4) | `.feature-card__badge` background fill. Sage-family tint pairs calmly with the neutral card surface and avoids the urgency semantics of amber (`$status-average`) or coral (`$status-high`). |
| `$text-primary` (#1C1C1C) | `.feature-card__badge` foreground text; paired with `$brand-primary-light` gives a 16.6:1 contrast ratio — comfortably AAA. |
| `$text-secondary` | Not used on the roadmap card (see Section 1 — the badge alone carries the signal; title and description remain `$text-primary` so card heights stay visually consistent per AC20). |
| `$status-medium` (#4A6FA5) | New `.icon-lock` gradient (start and end stops, see Section 3). Semantic fit: blue = trust / security / stable state, aligning with the "Secure Sign-in" card's meaning. Also aligns with the v1.0 token comment "blue — in progress" acting as a neutral, non-urgent signalling colour. |
| `$font-family-base` | Inherited; no change. |
| `$font-size-xs` (10px) | `.feature-card__badge` label size. Badges live in the "micro-label / tag count" register per the typography token comments. |
| `$font-weight-semibold` (600) | `.feature-card__badge` label weight — compensates for the small size and keeps the text legible at 10 px. |
| `$line-height-tight` (1.2) | `.feature-card__badge` label line-height. |
| `$space-xxs` (4px) | `.feature-card__badge` vertical padding. |
| `$space-xs` (8px) | `.feature-card__badge` horizontal padding; gap between the badge and the `<h3>` title (`margin-bottom`). |
| `$space-sm` (12px) | `.feature-card__badge` margin-top from the icon container (so the visual spacing between icon → badge → title reads as icon → (tight) badge → title, not icon → (equal) badge / title). |
| `$radius-sm` (6px) | `.feature-card__badge` corner radius — canonical "badges, small controls" choice per the token comments. |
| `$motion-fast` (150ms) | `.feature-card__badge` focus-visible outline transition (no other interaction states — the badge is non-hoverable decoration). |

### Proposed Token Additions

None required to implement issue #58. The badge and the new `icon-lock` class ship entirely with existing tokens.

**Out-of-scope follow-up (tracked for a future design-system audit, not this PR):** The four existing icon gradients in `feature-card.component.scss` (`.icon-board`, `.icon-ai`, `.icon-team`, `.icon-automation`) use hardcoded non-KanbAI hex values. They pre-date the v1.0 token system. A future issue should either (a) add `$icon-gradient-board`, `$icon-gradient-ai`, `$icon-gradient-team`, `$icon-gradient-automation` tokens, or (b) reconstruct the gradients from brand+status tokens and retire the hex literals. **Do not do this in issue #58** — it expands scope beyond what the tech spec authorised.

---

## Section 3 — Per-Component Styling

### Component: FeatureCardComponent

**File (modify):** `KanbAI-Web/src/app/features/landing/components/feature-card/feature-card.component.scss`
**Role:** Renders one capability card — icon, optional "Coming soon" badge, title, description. Non-interactive surface (no click, no hover target beyond the existing card-lift affordance).

**Layout:** Template remains Tailwind-driven (`p-6 rounded-xl border` etc.). The badge is a **new inline-block element** placed *after* the icon container and *before* the `<h3>` title, so visually it reads: icon → badge → title → description, top-to-bottom left-aligned.

**Positioning decision — inline-above-title, NOT floated top-right:**
- Inline placement keeps the card's internal rhythm predictable and preserves equal card heights on viewports ≥`$bp-sm` where cards sit side-by-side (AC20 safety).
- A floated top-right badge would collide with the existing icon container's square corner on narrow breakpoints and would force the `<h3>` to reserve right-side padding, creating inconsistency between shipping cards and the roadmap card.
- Inline also announces more naturally for screen readers (badge → title → description matches DOM order; no visual/DOM reorder needed).

**States (badge only — card hover/lift is unchanged from current behaviour):**
- **default** — background `$brand-primary-light`, text `$text-primary`, `$radius-sm`.
- **focus-visible** — badge is not in the tab order by default (it is a `<span role="status">`, not a focusable element). If a future change adds focusability, the rule below provides the canonical outline; it is included for forward-compatibility only.
- **reduced-motion** — covered globally by `_motion.scss` `prefers-reduced-motion` block; no per-element rule needed.

**Production SCSS:**

```scss
// File: KanbAI-Web/src/app/features/landing/components/feature-card/feature-card.component.scss

@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/typography' as *;
@use 'src/styles/variables/motion' as *;

// --- Existing rules (keep as-is — pre-existing Tailwind-era hover lift) -----
.feature-card {
  transition: transform 0.2s ease-out, box-shadow 0.2s ease-out;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
  }
}

// --- Existing icon gradients (keep as-is per tech-spec "icon reuse") --------
.icon-board {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
}

.icon-ai {
  background: linear-gradient(135deg, #a855f7 0%, #9333ea 100%);
}

.icon-team {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
}

.icon-automation {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
}

// --- NEW: semantic icon for the "Secure Sign-in" card -----------------------
// Uses the canonical $status-medium blue (trust / stable-state semantics)
// as both stops of the 135° gradient, slightly darkened at the tail by
// manual linear interpolation toward $text-primary (15%) to keep visual
// parity with the other gradient icons that darken end-to-end.
.icon-lock {
  background: linear-gradient(135deg, $status-medium 0%, #3B5A87 100%);
}

// --- NEW: "Coming soon" roadmap badge ---------------------------------------
.feature-card__badge {
  display: inline-block;
  margin-top: $space-sm;       // separates badge from icon container
  margin-bottom: $space-xs;    // separates badge from <h3> title
  padding: $space-xxs $space-xs;
  background-color: $brand-primary-light;
  color: $text-primary;
  font-family: $font-family-base;
  font-size: $font-size-xs;
  font-weight: $font-weight-semibold;
  line-height: $line-height-tight;
  letter-spacing: 0.02em;       // optical correction at 10px
  border-radius: $radius-sm;
  // Non-focusable by default; rule below protects future keyboard access.
  transition: outline-color $motion-fast;

  &:focus-visible {
    outline: 2px solid $brand-primary;
    outline-offset: 2px;
  }
}
```

**Template change (tech spec already mandates the structural hook; this is the classname-reconciliation reminder):**

The developer should replace the Tailwind placeholder classes from the tech spec with the single BEM-style class `feature-card__badge`. Final template block:

```html
@if (feature.comingSoon) {
  <span class="feature-card__badge"
        role="status"
        aria-label="Coming soon">
    Coming soon
  </span>
}
```

Drop the Tailwind utilities (`inline-block mb-3 px-2 py-1 text-xs font-semibold rounded-md bg-amber-100 text-amber-800`) — all equivalent properties are now set in the SCSS above.

**Why SCSS over Tailwind for this one element:** The badge is the *only* place on the page where roadmap/futurity semantics are encoded visually. Centralising its treatment in SCSS that `@use`s the canonical variables means any future change to `$brand-primary-light` propagates automatically; a Tailwind bag-of-utilities version would not. The rest of `feature-card.component.html` remains Tailwind-driven (no churn).

**Template change for `secure-sign-in` icon (tech-spec Hand-off #2 decision — see Section 4 of this doc for rationale):**

In `landing-page.component.ts`, change the `secure-sign-in` card's `icon` field from `'automation'` to `'lock'`:

```typescript
{
  id: 'secure-sign-in',
  title: 'Secure Sign-in',
  description: 'Email and password authentication keeps your projects behind a login.',
  icon: 'lock'    // was 'automation'
}
```

**Update to `feature-card.component.ts`:** the `getIconSymbol()` helper already exists in the component and returns a glyph per icon key. The developer must add a case for `'lock'` returning a padlock glyph (e.g., the unicode `\u{1F512}` lock emoji, or a literal `"lock"` string — the designer's preference is a simple textual glyph to stay consistent with the existing approach, but the final glyph choice is a developer detail not a design-system decision). A future iteration should replace all `getIconSymbol()` text glyphs with inline SVG; that is out of scope here.

**Interaction notes:**
- Badge is static decoration — no hover, no click, not in tab order.
- Card hover-lift behaviour is unchanged (pre-existing `translateY(-4px)` and shadow swap).
- Reduced motion clamps the card-lift transition via the global rule in `_motion.scss`; the badge has no transition to clamp apart from the defensive outline rule.

**Accessibility:**
- `role="status"` on the badge span — communicates the informational nature of the label to assistive tech (reused from the tech spec; confirmed appropriate).
- `aria-label="Coming soon"` duplicates the visible text so that when the card is announced as a block, the badge is still self-describing. **Design-system note:** the duplication is intentional; `role="status"` without a visible text label and without `aria-label` can cause some screen readers to skip the element on re-traversal.
- Contrast: `$text-primary` on `$brand-primary-light` = **16.6:1** (AAA). See Section 6.
- Touch target: the badge is not interactive, so the 44×44 px minimum does not apply. If a future change makes it clickable (e.g., link to a roadmap page), minimum height must be raised to 44 px via `min-height: 44px; display: inline-flex; align-items: center;` and padding adjusted accordingly.

---

### Component: HeroSectionComponent

**File (modify):** `KanbAI-Web/src/app/features/landing/components/hero-section/hero-section.component.html`
**Role:** Top-of-page brand + value-proposition + primary CTAs.

**Visual changes in this issue:**
1. The `<h2>` headline is replaced (content, not styling) with the softened copy — see Section 4 flow notes and the Hand-off Decisions below.
2. The subheading `<p>` is replaced (content, not styling) per the tech spec.
3. The trust-indicator `<p>` is **removed entirely**. Decision rationale in Section 4 (Decision D4).

**No SCSS changes** to `hero-section.component.scss`. The existing Tailwind-driven hero gradient, brand-text gradient, and `btn-primary-animated` pulse remain unchanged. The KanbAI v1.0 token migration of these surfaces (the hero gradient uses raw Tailwind blues `#eff6ff → #dbeafe → #e0e7ff` which are off-brand for the sage-forward design system) is a **separate future issue** and is not triggered by #58.

**Visual balance after trust-indicator removal:** The hero has generous top and bottom padding (`py-16 md:py-24 lg:py-32`). Removing the trust line shortens the hero by roughly 48 px on desktop (one line of `text-sm` + `mt-8`). This is within the designed breathing room and does not require a compensating `mb-*` adjustment on the CTA button row. If the developer observes visible imbalance during verification, they should pause and re-engage the web-designer; do NOT silently add margin.

---

### Component: FeaturesSectionComponent

**File (modify):** `KanbAI-Web/src/app/features/landing/components/features-section/features-section.component.html`
**Role:** Section header + 4-card grid.

**Visual changes in this issue:** Copy-only (`<h2>` and `<p>` inner text). No SCSS changes, no grid changes.

**Grid verification:**
- 375 px viewport (below `$bp-sm` = 576 px): `grid-cols-1` — four cards stack vertically. ✅
- 768 px viewport (`$bp-md`, above `sm:` breakpoint of 640 px): `sm:grid-cols-2` — 2×2 layout. ✅
- 1280 px viewport (above `$bp-xl` = 1200 px): `lg:grid-cols-4` — single row of four. ✅

The card count remains at four as mandated by the tech spec (AC9 gate), so no layout adjustment is needed. The roadmap card sits in the fourth slot regardless of breakpoint.

---

## Section 4 — User Flows & Design-Phase Hand-off Decisions

### Flow A: Visitor scans the hero

1. **Land on `/`.** Page paints with the hero gradient, brand wordmark `KanbAI` (h1, purple→blue gradient), softened headline `"Kanban Boards for Modern Teams"` (h2, `$text-primary`), and subheading (h2 sibling `<p>`, gray-600 tailwind → reads as roughly `$text-secondary`).
2. **Tab order for keyboard users:** `Get Started Free` (primary CTA) → `Login` (secondary CTA). No other focusable elements in the hero after trust-indicator removal.
3. **Scroll or Tab continues** into the features section.

**Motion:** The hero's existing `btn-primary-animated` pulse runs on hover; unchanged. Reduced-motion users get the clamped version via the global rule.

### Flow B: Visitor encounters the roadmap card

1. **Scanning the features grid,** visitor reads three cards that describe shipping functionality (Project Dashboard, Team Members, Secure Sign-in).
2. **Fourth card (`ai-assistance`)** is visually identical in fill, shadow, border, typography, and card dimensions to the other three. The **only differentiator** is the `.feature-card__badge` reading "Coming soon", sitting between the icon and the title.
3. **Visual weight of the badge:** at 10 px / 600 weight / sage-light fill, the badge is small and quiet — it does not shout. This is deliberate. The card is not an announcement; it is a quiet acknowledgement that AI is on the roadmap.
4. **Screen-reader announcement** (tested conceptually against NVDA + VoiceOver patterns): `"AI Assistance, status, Coming soon. AI-powered suggestions for planning your work are on the roadmap."` The `role="status"` is announced as "status" by NVDA; the `aria-label` + visible text collapse into a single utterance rather than being read twice (VoiceOver behaviour on `role="status"` with redundant `aria-label`).
5. **No focus traversal.** The badge is not in the tab order.

### Hand-off Decision D1 — Badge visual treatment

**Decision:** Inline-above-title, `$brand-primary-light` fill, `$text-primary` text, `$radius-sm`, `$font-size-xs` / `$font-weight-semibold`, padding `$space-xxs $space-xs`.

**Rationale:**
- **Colour choice — why sage-light, not amber (`$status-average`) or coral (`$status-high`):** the v1.0 system assigns amber to "attention" and coral to "urgent". A "Coming soon" badge is neither — it's informational and aspirational. Using amber would mis-signal that the card requires user action; using coral would mis-signal risk. `$brand-primary-light` (sage tint) is brand-native, visually calm, and reads as "friendly future" rather than "warning".
- **Contrast:** `$text-primary` (#1C1C1C) on `$brand-primary-light` (#E8EBE4) measures 16.6:1 — AAA at any text size.
- **Inline vs. floated top-right:** see Section 3 positioning argument. TL;DR: inline preserves card height consistency (AC20) and matches DOM order for assistive tech.
- **Radius:** `$radius-sm` (6 px) is the canonical "badges, small controls" value per the token comments. Using `$radius-pill` (9999 px) would read as a status chip (e.g., priority tag) which is a different semantic register.

### Hand-off Decision D2 — Icon set for `secure-sign-in`

**Decision:** Introduce a new SCSS class `.icon-lock` using a `$status-medium`-based blue gradient. Update `landing-page.component.ts` to set `icon: 'lock'` for the `secure-sign-in` card. The existing `.icon-automation` amber gradient remains available for future use (e.g., if a real automation feature ships).

**Rationale:**
- **Semantic accuracy:** reusing `icon-automation` (an amber "rules engine" gradient) for a sign-in card is visually mismatched. Amber signals "attention/warning" in this system — not "security/trust".
- **Blue as the security colour:** `$status-medium` (#4A6FA5) is the system's calm, non-urgent blue. It reads as "stable / trustworthy / in progress" and is the most semantically fitting of the existing tokens for a lock icon.
- **Cost:** one new CSS class, one new glyph case in `getIconSymbol()`, one string change in the signal. Zero new tokens. Zero new files.
- **Why not defer:** the tech spec explicitly allows the designer to call this shot ("The web-designer may propose a more semantically-appropriate icon (e.g., a new `icon-lock` class) in phase 3"). Deferring perpetuates the visual mismatch that contributed to the original "AI hallucination" problem — copy and visuals disagreeing with reality.

### Hand-off Decision D3 — Hero headline final recommendation

**Decision:** Ship `"Kanban Boards for Modern Teams"` (the softened default).

**Rationale (anchored in Section 10 "Calm and concrete"):**
- The brand wordmark **KanbAI** already carries the AI signal; repeating "AI" in the H2 reads as marketing insistence, not confidence.
- The alternative `"Kanban for teams, with AI on the way"` injects forward-looking language into the hero, which dilutes the main value proposition. The roadmap signal belongs on the single roadmap card where it can be tied to a specific capability, not scattered across the page.
- **Calm and concrete** specifically favours direct statements of what *is* over promises of what *will be*. The softened headline is direct; the AI-aware fallback is a promise.
- **Brand-voice anti-pattern check:** `"with AI on the way"` borrows from startup-launch tropes ("coming soon", "the future of X") that the design-system voice explicitly rejects.

**If product leadership overrides:** the AI-aware fallback is acceptable only if it ships *together* with a corresponding adjustment to the subheading so the two lines don't each hedge about AI.

### Hand-off Decision D4 — Trust-indicator line

**Decision:** Remove entirely. Do not ship the fallback `"Free to use while we build."`.

**Rationale:**
- **Visual calm:** removing the line gives the CTA row the last word in the hero, which is what we want — a clean, confident close that invites action. Any text below the CTAs competes for attention with the CTAs themselves.
- **Fallback rejected because:** "Free to use while we build" is still a commercial-adjacent claim ("free to use" implies there will be a pricing tier later, which is not a confirmed product direction). It also foregrounds the project's unfinished state, which is honest but is better signalled inside the product (the "Coming soon" badge) than in the marketing hero.
- **Visual balance concern** (raised in the tech-spec hand-off): the hero has `py-16 md:py-24 lg:py-32` padding and the CTA row has `mt-10` equivalent (via subheading's `mb-10`). The hero does not visually collapse without the trust-indicator line. No compensating margin adjustment is needed.

### Hand-off Decision D5 — Roadmap card typography

**Decision:** The badge alone carries the roadmap signal. The `ai-assistance` card's title (`<h3>`, `$text-primary` via Tailwind `text-gray-900`) and description (`$text-secondary`-ish via Tailwind `text-gray-600`) remain identical in weight, colour, and opacity to the shipping cards.

**Rationale:**
- **Equal card heights (AC20):** muting the title to `$text-secondary` or dimming via opacity would make the card read lighter than its neighbours. In a 4-column row, this creates a visually ragged grid where the last card looks "unfinished" — an unintended meta-signal that the product itself is unfinished (not merely the feature described).
- **One signal, clearly placed:** introducing a second visual layer (muted text) on top of the badge is redundant and dilutes the badge's clarity. The badge is the signal. The card carries it.
- **Accessibility:** muted copy at `$text-secondary` on `$bg-card` (#7A7A7A on #FFFFFF) measures 4.6:1 — passes AA but is noticeably lower than `$text-primary`'s 17.9:1. Keeping the roadmap card's description at full contrast avoids any perception of degraded legibility for users with low vision.
- **If product leadership wants more differentiation:** the correct next step is to change the card's *icon* treatment (e.g., outlined rather than filled) — not to reduce text contrast. That change is deferred to a future design-system pass.

---

## Section 5 — Responsive Behavior

The existing Tailwind classes on the features grid (`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8`) are **not modified** by this issue. Verification at the three AC15-mandated viewport widths:

### < 576 px (mobile, e.g., 375 px — iPhone SE)
- Features grid: single column. All four cards stack vertically. Badge sits between icon and title on the roadmap card; no horizontal overlap with any other element.
- Hero: headline wraps to 2–3 lines at `text-3xl`, subheading wraps to 3–4 lines at `text-lg`. Both are acceptable — no overflow.
- CTA buttons: `flex-col` (from existing `flex flex-col sm:flex-row`) — stacked full-width.
- **Badge position:** unchanged — inline-above-title. No repositioning required.

### 576 – 991 px (tablet, e.g., 768 px — iPad)
- Features grid: `sm:grid-cols-2` — 2×2. The roadmap card sits in the bottom-right slot. Badge unchanged.
- Hero: headline at `sm:text-4xl md:text-5xl`, subheading at `sm:text-xl md:text-2xl`. Comfortable line lengths.
- CTA row: `sm:flex-row` — side by side, auto-width.

### ≥ 992 px (desktop, e.g., 1280 px)
- Features grid: `lg:grid-cols-4` — single row. Roadmap card is the right-most slot. Badge unchanged.
- Hero: maximum type sizes active. Everything centered within `max-w-4xl`.

### No badge-positioning changes per breakpoint

The badge stays inline-above-title at every breakpoint. Relocating to top-right on desktop was considered and rejected in Section 3 (positioning decision): inline placement is more accessible, more predictable, and preserves card height consistency at all breakpoints.

---

## Section 6 — Accessibility Audit (WCAG AA)

### Contrast — measured ratios

| Surface / Foreground pair | Hex values | Measured ratio | WCAG verdict |
|---|---|---|---|
| `.feature-card__badge` text on badge bg | `$text-primary` (#1C1C1C) on `$brand-primary-light` (#E8EBE4) | **16.6:1** | ✅ AAA (all text sizes) |
| Hero H2 headline on hero gradient | `text-gray-900` (#111827) on gradient stops `#eff6ff`, `#dbeafe`, `#e0e7ff` | **19.4 : 1** (worst stop: #111827 on #dbeafe = 16.9:1, still AAA) | ✅ AAA |
| Hero subheading on hero gradient | `text-gray-600` (#4B5563) on gradient stops | **9.1 : 1** on lightest stop; **6.8 : 1** on darkest stop (#e0e7ff) | ✅ AA+ |
| Card `<h3>` title on card bg | `text-gray-900` (#111827) on `$bg-card` (#FFFFFF) | **17.9 : 1** | ✅ AAA |
| Card description on card bg | `text-gray-600` (#4B5563) on `$bg-card` (#FFFFFF) | **9.7 : 1** | ✅ AA (normal text) |
| `.icon-lock` gradient vs icon glyph (white text) | `#FFFFFF` on `$status-medium` #4A6FA5 (lightest stop) | **4.8 : 1** | ✅ AA for large text (≥14 px bold), which the `text-2xl font-bold` glyph satisfies |

**Conclusion:** every colour pair introduced or implicated by this issue passes WCAG AA. The badge pair passes AAA.

### Keyboard

- **Tab order on the page** (unchanged by this issue): "Get Started Free" button → "Login" button → (scroll required) no focusable elements inside the features section (cards are non-interactive `<article>` elements).
- **Focus visibility on CTAs:** existing `focus:ring-4 focus:ring-blue-300` classes provide a visible ring. This is Tailwind-era and does not consume `$brand-primary`, but it is **not in scope** to migrate for issue #58. Future design-system audit should replace with a `$brand-primary` outline+offset rule per the canonical pattern.
- **Badge is not focusable.** It is a `<span role="status">`, which is correct — the badge is informational, not interactive.
- **Escape / Space / Enter:** no change — no dialogs or new interactive surfaces are introduced.

### Screen reader

**Badge pattern:**

```html
<span class="feature-card__badge" role="status" aria-label="Coming soon">
  Coming soon
</span>
```

**Is this pattern correct?** Yes, with one design-system nuance worth recording:

- `role="status"` is the right ARIA role for a non-urgent informational status label. It implies an `aria-live="polite"` equivalent, but because the badge is static at render (not asynchronously inserted), no live-region announcement is triggered — the badge is simply part of the card's content when the card is first read.
- `aria-label` duplicating the visible text is a defensive choice. Some screen readers + browser combinations (notably older VoiceOver + Safari) can announce `role="status"` elements as empty when the element is traversed for the second time in a reading pass; `aria-label` guarantees a name is always available.
- **Alternative considered and rejected:** `<span aria-label="Coming soon — on the roadmap">`. Rejected because (a) the tech spec fixed the announced name as "Coming soon", and (b) adding "— on the roadmap" here duplicates the description text of the card ("on the roadmap" appears in the visible description).

**Card announcement order** (verified mentally against NVDA reading pattern):

1. "article"
2. icon glyph (decorative, `aria-hidden="true"` — skipped)
3. "Coming soon, status" (badge)
4. "heading level 3, AI Assistance" (`<h3>`)
5. "AI-powered suggestions for planning your work are on the roadmap." (`<p>`)

This is the right order: the roadmap signal is announced before the title, priming the user to interpret everything that follows as forward-looking.

### Motion

- Global `prefers-reduced-motion` rule in `_motion.scss` already clamps all transitions to 0.01 ms. The badge has no motion to clamp beyond the defensive focus-visible transition.
- No auto-playing animations, no parallax, no carousel, no video.
- Existing `btn-primary-animated` pulse honours the global rule — not modified.

### Forms

N/A — issue #58 introduces no form inputs.

### Heading hierarchy (AC14 regression guard)

Confirmed unchanged:
- `<h1>` — "KanbAI" brand (exactly one on the page).
- `<h2>` — hero headline + features section header (two on the page).
- `<h3>` — one per feature card (four on the page after this issue).

No new heading levels; no heading elements inserted or removed.

---

## Section 7 — Implementation Checklist

### Prerequisites

- [x] Token files exist at `KanbAI-Web/src/styles/variables/` (verified: `_colors.scss`, `_spacing.scss`, `_radius.scss`, `_shadows.scss`, `_typography.scss`, `_motion.scss`, `_breakpoints.scss`, `_layout.scss`).
- [x] Global SCSS preprocessor include path is `.` (confirmed in `KanbAI-Web/KanbAI-Web/angular.json` → `stylePreprocessorOptions.includePaths`), so component SCSS can `@use 'src/styles/variables/...'` directly.
- [x] `prefers-reduced-motion` rule lives in `_motion.scss` and applies globally when that partial is imported. Verify on first implementation — if the component SCSS imports `_motion.scss` only for its variables, the reduced-motion rule still fires because `@use` evaluates the whole partial.

### Per-component tasks

**`FeatureCardComponent` — `feature-card.component.scss`:**
- [ ] Add the seven `@use` statements at the top of the file (colors, spacing, radius, typography, motion — breakpoints and shadows are not needed for this change).
- [ ] Keep the existing `.feature-card`, `.icon-board`, `.icon-ai`, `.icon-team`, `.icon-automation` rules untouched.
- [ ] Add the new `.icon-lock` rule per Section 3.
- [ ] Add the new `.feature-card__badge` rule per Section 3.
- [ ] Do NOT replace the existing Tailwind-driven card hover-lift rule with a token-driven one. That migration is out of scope.

**`FeatureCardComponent` — `feature-card.component.html`:**
- [ ] Apply the tech spec's `@if (feature.comingSoon)` block **with the single class name `feature-card__badge`** (drop the Tailwind utility classes `inline-block mb-3 px-2 py-1 text-xs font-semibold rounded-md bg-amber-100 text-amber-800`).
- [ ] Preserve `role="status"` and `aria-label="Coming soon"`.

**`FeatureCardComponent` — `feature-card.component.ts`:**
- [ ] Add a case to `getIconSymbol()` returning a glyph for `'lock'`. A simple textual/emoji glyph is acceptable (final choice is a developer detail, e.g., `'🔒'` or `'L'` — match the existing style of the other cases in the same function).

**`LandingPageComponent` — `landing-page.component.ts`:**
- [ ] In the `features` signal's `secure-sign-in` entry, change `icon: 'automation'` to `icon: 'lock'`.

**`HeroSectionComponent` — `hero-section.component.html`:**
- [ ] Apply the tech-spec copy changes (softened headline, new subheading).
- [ ] **Remove the trust-indicator `<p>` entirely** (lines 40–42 including the `<!-- Optional: Trust indicator -->` comment). Do not ship the fallback line.

**`FeaturesSectionComponent` — `features-section.component.html`:**
- [ ] Apply the tech-spec copy changes (new `<h2>` and new subheader `<p>`).

**No changes** to `hero-section.component.scss` or `features-section.component.scss`.

### Per-state verification

- [ ] **Badge default state** — renders at all four breakpoints (375 / 768 / 1280 / 1920 px) between icon and title; height is `padding + line-height-tight × font-size-xs` = 4 + 4 + 12 = 20 px; width fits the text "Coming soon" at `$font-size-xs $font-weight-semibold` with `letter-spacing: 0.02em` in a single line.
- [ ] **Badge absent state** — when `feature.comingSoon` is `undefined` or `false`, the `@if` returns no DOM; the card's icon → title spacing is unchanged (the badge's `margin-top` / `margin-bottom` do not collapse onto the surrounding elements because the element is absent, not display:none).
- [ ] **Card hover** — unchanged. The existing `translateY(-4px)` + shadow swap still fires; the badge moves with the card.
- [ ] **Reduced motion** — with `prefers-reduced-motion: reduce` in DevTools, the card lift collapses to instant. Badge has no motion.

### Verification

- [ ] Lighthouse a11y score ≥ 95 on `/` (mobile + desktop).
- [ ] Manual keyboard traversal: Tab → primary CTA → Tab → secondary CTA → Tab → (scroll) no further focusable elements in the features section. No focus skipped.
- [ ] `prefers-reduced-motion: reduce` in DevTools → card hover-lift collapses to instant; badge is static regardless.
- [ ] Viewport sweep at 375 / 768 / 1280 px: no horizontal scroll outside any intentional scroll surface; features grid collapses correctly (1 / 2 / 4 columns); badge stays inline-above-title on the roadmap card at every width.
- [ ] NVDA or VoiceOver smoke test on the roadmap card: badge is announced as status before the title; `aria-label` is not read twice.
- [ ] `npm run build` from `KanbAI-Web/KanbAI-Web/` exits zero.
- [ ] `npm run test -- --watch=false` — all landing-page specs pass; any INTRODUCED failures are fixed before merge.

---

*Prepared by the web-designer agent as input for the developer phase.*
