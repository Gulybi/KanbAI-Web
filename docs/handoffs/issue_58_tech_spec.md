# Technical Specification: Clean Up Landing Page Content (Remove AI Hallucinations)

**Context Document:** [issue_58_context.md](./issue_58_context.md)
**GitHub Issue:** [#58](https://github.com/Gulybi/KanbAI-Web/issues/58)
**Branch:** `58-clean-up-landing-page-content-remove-ai-hallucinations`

---

## Overview

This change is a **copy revision plus a minimal data-model extension** on the public landing page (`/`). No new components, routes, services, HTTP calls, guards, or state stores are introduced. The existing component tree (`LandingPageComponent` → `HeroSectionComponent`, `FeaturesSectionComponent` → `FeatureCardComponent`), the `features` signal, and the `FeatureHighlight` interface all remain in place.

Two structural edits are required:

1. Extend `FeatureHighlight` with an optional `comingSoon?: boolean` flag so cards that describe roadmap capabilities can render a screen-reader-accessible "Coming soon" badge (AC8, AC19).
2. Render that badge inside `FeatureCardComponent` when the flag is set.

Every other edit in this issue is a pure string/template change: revised hero headline/subheading, removed or rewritten trust-indicator line, revised features-section header/subheader, and rewritten feature-card content in the `features` signal. Unit tests are updated (not deleted) to assert on the new strings per AC17.

---

## Component Architecture

### Routing
**No change.** The public `/` route, its `unauthGuard`, and all downstream routes (`/login`, `/register`, `/dashboard`) are untouched. AC11, AC13 are satisfied by non-modification.

### Component Hierarchy
**No additions or removals.** Existing tree:

- `LandingPageComponent` (smart) — [KanbAI-Web/src/app/features/landing/landing-page/landing-page.component.ts](../../KanbAI-Web/src/app/features/landing/landing-page/landing-page.component.ts)
  - Owns the `features` signal and the `onLoginClick`/`onSignUpClick` navigation handlers.
- `HeroSectionComponent` (dumb) — [KanbAI-Web/src/app/features/landing/components/hero-section/hero-section.component.ts](../../KanbAI-Web/src/app/features/landing/components/hero-section/hero-section.component.ts)
  - Outputs: `loginClick`, `signUpClick`. No inputs. Template contains the headline/subheading/trust line.
- `FeaturesSectionComponent` (dumb) — [KanbAI-Web/src/app/features/landing/components/features-section/features-section.component.ts](../../KanbAI-Web/src/app/features/landing/components/features-section/features-section.component.ts)
  - Input: `features: FeatureHighlight[]`. Template contains the "Why Choose KanbAI?" header and the grid.
- `FeatureCardComponent` (dumb) — [KanbAI-Web/src/app/features/landing/components/feature-card/feature-card.component.ts](../../KanbAI-Web/src/app/features/landing/components/feature-card/feature-card.component.ts)
  - Input: `feature: FeatureHighlight`. Template renders icon, title, description — **will also render the new "Coming soon" badge when `feature.comingSoon` is true.**

### New Files to Create
**None.**

### Files to Modify
| File | What changes | ACs addressed |
|---|---|---|
| `KanbAI-Web/src/app/features/landing/models/feature-highlight.interface.ts` | Add optional `comingSoon?: boolean` property | AC8, AC19 |
| `KanbAI-Web/src/app/features/landing/landing-page/landing-page.component.ts` | Rewrite the `features` signal: new titles, descriptions, ids, icons, and `comingSoon` flags | AC1, AC3, AC4, AC5, AC8, AC9, AC10 |
| `KanbAI-Web/src/app/features/landing/components/hero-section/hero-section.component.html` | Rewrite subheading (line 15–18); remove or rewrite trust-indicator line (line 40–42); optionally soften the `<h2>` headline (see Copy Decision Notes below) | AC1, AC2, AC6, AC12, AC14 |
| `KanbAI-Web/src/app/features/landing/components/features-section/features-section.component.html` | Rewrite section header (line 5–10) | AC7 |
| `KanbAI-Web/src/app/features/landing/components/feature-card/feature-card.component.html` | Add `@if (feature.comingSoon)` block rendering an accessible badge | AC8, AC19 |
| `KanbAI-Web/src/app/features/landing/landing-page/landing-page.component.spec.ts` | Update feature-id and description assertions to match new copy | AC17 |
| `KanbAI-Web/src/app/features/landing/components/hero-section/hero-section.component.spec.ts` | Update subheading assertion (currently asserts "Streamline your workflow"); update or remove the trust-indicator test (currently asserts "No credit card required") | AC17 |
| `KanbAI-Web/src/app/features/landing/components/features-section/features-section.component.spec.ts` | Update description assertion (currently asserts "Powerful features") | AC17 |
| `KanbAI-Web/src/app/features/landing/components/feature-card/feature-card.component.spec.ts` | Add assertions that the "Coming soon" badge renders when `feature.comingSoon` is true and is absent when falsy/undefined | AC17, AC19 |

No other files are touched. `feature-card.component.scss` may be edited by the **web-designer** phase to style the new badge; the developer only provides the structural hook described below.

---

## State & Data Layer

### State Management Strategy
**Unchanged.** `LandingPageComponent` continues to own a single `signal<FeatureHighlight[]>`. No RxJS, no HTTP, no computed signals, no `toSignal()` bridging is added. Change detection remains `OnPush` on all four components.

### TypeScript Interfaces

**File:** `KanbAI-Web/src/app/features/landing/models/feature-highlight.interface.ts`

Extend the existing interface with one optional property. Keep all current JSDoc.

```typescript
export interface FeatureHighlight {
  /** Unique identifier for the feature. */
  id: string;

  /** Display title of the feature (e.g., "Project Dashboard"). */
  title: string;

  /** Description of the feature (1–2 sentences). */
  description: string;

  /**
   * Icon identifier for visual representation.
   * Examples: 'board', 'ai', 'team', 'automation'
   */
  icon: string;

  /**
   * When true, the card is treated as a roadmap / not-yet-shipped capability
   * and a visible "Coming soon" badge is rendered. When omitted or false,
   * the card describes a currently available feature.
   */
  comingSoon?: boolean;
}
```

**Why optional (not required):** Existing tests (e.g., `feature-card.component.spec.ts`'s `mockFeature`) build `FeatureHighlight` literals that do not set `comingSoon`. Making it optional keeps those literals valid without churn and preserves backward compatibility for any future consumer that does not need roadmap labelling.

---

## Copy Decision Notes

These decisions are the output of the staff-engineer phase and should be applied verbatim by the developer unless the web-designer phase proposes refinements that the user explicitly approves. Each decision traces to specific ACs.

### Hero: headline (`<h2>`, hero-section.component.html:10–12)

**Current:** `"AI-Powered Kanban Boards for Modern Teams"`

**Recommendation:** Soften to `"Kanban Boards for Modern Teams"`.

**Rationale:** The brand name `KanbAI` (preserved per AC12) already carries the "AI" connotation. The issue title itself is "remove AI hallucinations," and no AI-driven capability ships today. "AI-Powered" in the headline is the strongest present-tense AI claim on the page and should be retracted. If product leadership insists on retaining AI framing in the hero, the fallback is `"Kanban for teams, with AI on the way"` (treats AI as forward-looking, consistent with AC8-style roadmap framing).

This decision does not itself appear in the AC regex checks but is the top-level consequence of the feature's premise. The developer should apply the softened headline by default and flag the question for the web-designer phase.

### Hero: subheading (`<p>`, hero-section.component.html:15–18) — AC1, AC2, AC3, AC5

**Current:** `"Streamline your workflow with intelligent automation, real-time collaboration, and data-driven insights that adapt to your team's needs."`

**Replacement:** `"A lightweight project-management tool for small teams. Create projects, invite teammates, and keep work organised on Kanban-style boards."`

**Why this passes the regex gates:**
- AC2 (`/real[- ]?time|instant(ly)?|live (update|sync)/i`): no match. ✅
- AC3 (`/machine learning|ml-|sprint velocity|bottleneck|predict|optimi[sz]e (your )?workflow/i`): no match. ✅
- AC5 (`/automat(e|ion)|rules? that|adapt/i`): no match. ✅ (deliberately avoids "adapt", "automation").
- AC4 (`/chat|@mention|mentions|notification/i`): no match. ✅

### Hero: trust-indicator line (hero-section.component.html:40–42) — AC6

**Current:** `"✨ No credit card required • 🔒 Secure by default • 🚀 Set up in minutes"`

**Recommendation: remove the entire `<p>` element.** The product has no commercial pricing flow (so "No credit card required" mimics SaaS boilerplate without a product to price against), no published security posture ("Secure by default" is unverifiable), and no onboarding wizard ("Set up in minutes" is aspirational for an MVP). Removing the line is cleaner than rewriting and is explicitly allowed by AC6 option (a).

If the web-designer phase argues the hero feels visually unbalanced after removal, the sanctioned fallback is a single honest line: `"Free to use while we build."` (no emoji prefixes). Do not reintroduce the original three-claim format.

### Features section: header + subheader (features-section.component.html:5–10) — AC7

**Current:** `<h2>"Why Choose KanbAI?"</h2>` / `<p>"Powerful features that transform how your team collaborates and delivers results."</p>`

**Replacement:**
- `<h2>"What KanbAI offers today"</h2>`
- `<p>"A focused set of features available now, with more on the way."</p>`

**Why this passes:** Drops "powerful features that transform" per AC7. "With more on the way" legitimises the single roadmap card (below) without overclaiming. No regex in AC2–AC5 matches this copy.

### Feature cards — the `features` signal (landing-page.component.ts:19–44) — AC8, AC9, AC10

Rewrite to **four** cards so the existing `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` layout renders cleanly at every breakpoint (AC9, AC15). Three cards describe shipped capability; one is explicitly roadmap (AC8).

```typescript
features = signal<FeatureHighlight[]>([
  {
    id: 'project-dashboard',
    title: 'Project Dashboard',
    description: 'See all your projects in one place. Create new projects and open existing ones from a single overview.',
    icon: 'board'
  },
  {
    id: 'team-members',
    title: 'Team Members',
    description: 'Invite teammates to a project and manage who has access to it.',
    icon: 'team'
  },
  {
    id: 'secure-sign-in',
    title: 'Secure Sign-in',
    description: 'Email and password authentication keeps your projects behind a login.',
    icon: 'automation'
  },
  {
    id: 'ai-assistance',
    title: 'AI Assistance',
    description: 'AI-powered suggestions for planning your work are on the roadmap.',
    icon: 'ai',
    comingSoon: true
  }
]);
```

**Regex-gate verification (AC2–AC5, AC10):**
- AC2 `/real[- ]?time|instant(ly)?|live (update|sync)/i`: no match across all four cards.
- AC3 `/machine learning|ml-|sprint velocity|bottleneck|predict|optimi[sz]e (your )?workflow/i`: no match.
- AC4 `/chat|@mention|mentions|notification/i`: no match.
- AC5 `/automat(e|ion)|rules? that|adapt/i`: no match in the three live cards. The word "automation" appears **only** as the `icon` identifier (`'automation'`, a CSS class key — not visible copy), so the rendered DOM text does not match. The roadmap card references "AI-powered" and "roadmap"; both are allowed by AC10 because the card is flagged `comingSoon: true` and will render a visible "Coming soon" badge per the template change below.

**Icon reuse:** The existing SCSS icon gradients (`icon-board`, `icon-ai`, `icon-team`, `icon-automation` in `feature-card.component.scss`) are kept. `secure-sign-in` is intentionally mapped to `icon: 'automation'` rather than introducing a new icon key, because adding a new icon would pull the web-designer phase into scope that isn't needed for this bug fix. The web-designer may propose a more semantically-appropriate icon (e.g., a new `icon-lock` class) in phase 3; the developer should leave this reuse in place unless that happens.

### FeatureCardComponent template — add the "Coming soon" badge (feature-card.component.html) — AC8, AC19

Insert a new block inside the `<article>`, directly after the icon container and before the `<h3>` title, so the badge appears visually above the title. Use `@if` (Angular control flow) for consistency with the existing `@for` elsewhere in the codebase.

```html
@if (feature.comingSoon) {
  <span class="feature-card__badge inline-block mb-3 px-2 py-1 text-xs font-semibold rounded-md bg-amber-100 text-amber-800"
        role="status"
        aria-label="Coming soon">
    Coming soon
  </span>
}
```

**Accessibility (AC19):**
- The badge is rendered as visible text inside the card, so screen readers read it as part of the card's content naturally.
- `role="status"` communicates the informative purpose to assistive tech.
- `aria-label="Coming soon"` is redundant with the visible text but makes the badge self-describing when the card is announced as a block.

**Styling note for the web-designer:** The Tailwind classes above (`bg-amber-100`, `text-amber-800`) are placeholders chosen to guarantee WCAG AA contrast out of the box (Tailwind's amber-800 on amber-100 is ~7.6:1). The web-designer phase owns the final visual treatment; the developer keeps the class name `feature-card__badge` so the designer can target it in SCSS.

---

## Service Integration

**N/A.** No HTTP, no services are added or modified. The landing page remains fully static.

---

## Implementation Steps

Follow in order. Each step is independently verifiable.

### 1. Extend the FeatureHighlight interface
- [ ] Open `KanbAI-Web/src/app/features/landing/models/feature-highlight.interface.ts`.
- [ ] Add the optional `comingSoon?: boolean` property with JSDoc exactly as specified in the "TypeScript Interfaces" section above.
- [ ] Save; do not alter the existing properties or their JSDoc.

### 2. Rewrite the `features` signal
- [ ] Open `KanbAI-Web/src/app/features/landing/landing-page/landing-page.component.ts`.
- [ ] Replace the array literal passed to `signal<FeatureHighlight[]>([...])` with the four-card array from the "Feature cards" section above, verbatim.
- [ ] Leave the component decorator, imports, router injection, and click handlers untouched.

### 3. Revise hero section HTML
- [ ] Open `KanbAI-Web/src/app/features/landing/components/hero-section/hero-section.component.html`.
- [ ] Replace the `<h2>` inner text (line 11) with `Kanban Boards for Modern Teams` (or the approved fallback).
- [ ] Replace the subheading `<p>` inner text (lines 16–17) with the replacement subheading from "Copy Decision Notes".
- [ ] Delete the entire trust-indicator `<p>` element (lines 40–42) including its surrounding comment `<!-- Optional: Trust indicator -->`. If the designer-approved fallback is used instead, keep the `<p>` but replace its children with the single-line fallback copy and remove all emoji.
- [ ] Do not change the two `<button>` elements, their `aria-label` attributes, or their `(click)` bindings.

### 4. Revise features-section HTML
- [ ] Open `KanbAI-Web/src/app/features/landing/components/features-section/features-section.component.html`.
- [ ] Replace `<h2>` inner text (line 6) with `What KanbAI offers today`.
- [ ] Replace the subheader `<p>` inner text (line 9) with `A focused set of features available now, with more on the way.`
- [ ] Leave the grid container and `@for` loop untouched.

### 5. Render the Coming Soon badge in FeatureCardComponent
- [ ] Open `KanbAI-Web/src/app/features/landing/components/feature-card/feature-card.component.html`.
- [ ] Insert the `@if (feature.comingSoon) { ... }` block from the "FeatureCardComponent template" section, placed **after** the icon container `<div>` (which ends around line 12) and **before** the `<h3>` title element.
- [ ] Do not modify the icon container, title, or description rendering.

### 6. Update unit tests (AC17)
- [ ] `landing-page.component.spec.ts`:
  - Update the "should have correct feature IDs" test (lines 40–48) to assert on the new ids: `'project-dashboard'`, `'team-members'`, `'secure-sign-in'`, `'ai-assistance'`.
  - The "should have 4 feature highlights" assertion (line 37) stays as-is (four cards).
  - No other test changes required in this file unless further assertions are added as part of step 7.
- [ ] `hero-section.component.spec.ts`:
  - Update the "should display subheading" test (lines 41–45) so the substring assertion matches the new subheading (e.g., `expect(subheading.nativeElement.textContent).toContain('lightweight project-management');`).
  - Delete or rewrite the "should display trust indicator" test (lines 47–52) — if the trust line was removed entirely, replace with `expect(fixture.nativeElement.textContent).not.toContain('No credit card required');`. If the fallback line was kept, update the assertion to match the fallback.
  - Update the "should display main headline" test (lines 33–39) to assert on the new headline text (e.g., `'Kanban Boards for Modern Teams'`), unless the original is retained by decision.
- [ ] `features-section.component.spec.ts`:
  - Update the "should render section description" test (lines 68–72): replace `toContain('Powerful features')` with `toContain('A focused set of features')`.
  - Update the "should render section header" test (lines 62–66): replace `toContain('Why Choose KanbAI?')` with `toContain('What KanbAI offers today')`.
- [ ] `feature-card.component.spec.ts`:
  - Add a new describe block `'Coming Soon Badge'` with tests:
    - `'should not render coming-soon badge when feature.comingSoon is undefined'` — queries `By.css('.feature-card__badge')` and expects falsy result. Uses the existing `mockFeature` (no `comingSoon` set).
    - `'should not render coming-soon badge when feature.comingSoon is false'` — `setInput('feature', { ...mockFeature, comingSoon: false })`, expects falsy.
    - `'should render coming-soon badge when feature.comingSoon is true'` — `setInput('feature', { ...mockFeature, comingSoon: true })`, expects the badge element to exist and its text to equal `'Coming soon'`.
    - `'should have aria-label "Coming soon" on the badge'` — verifies the accessible name (AC19).

### 7. Verify AC regex gates against the rendered DOM
- [ ] After build succeeds, serve the app locally (`npm start` from `KanbAI-Web/KanbAI-Web/`) and open `/`.
- [ ] In browser devtools, run the four regexes from AC2–AC5 against `document.body.innerText`. Each must not match outside of the "Coming soon"-flagged card's visible content.
- [ ] Manually confirm AC1, AC6, AC7 by visual inspection.
- [ ] Resize viewport to 375 px, 768 px, 1280 px and confirm AC15 (no horizontal scroll, grid collapses as expected).
- [ ] Tab through CTAs to confirm AC11 (focus visible, Enter/Space activate).

### 8. Build & test gates (AC16, AC17, AC18)
- [ ] From `KanbAI-Web/KanbAI-Web/`: `npm run build` — must exit zero.
- [ ] `npm run test -- --watch=false` — all landing-page specs must pass. Classify any failure as PRE-EXISTING vs INTRODUCED per CLAUDE.md; fix all INTRODUCED failures.
- [ ] Open `/` in a fresh tab and confirm zero console errors/warnings related to the landing page.

**Performance considerations:** Zero — this is a string and template change with no new bindings or subscriptions. `OnPush` is preserved everywhere.

---

## QA Guidance

### Test Strategy

**Unit tests (the four existing `*.component.spec.ts` files):** are updated in step 6 above. No new spec files are created.

**Integration tests:** Not required for this change. The existing `LandingPageComponent` spec already verifies child-component wiring (the hero/features subcomponents receive inputs and their emit events trigger navigation); that behaviour is unchanged.

**E2E tests:** Out of scope. No Playwright/Cypress suite currently exercises `/`. If one is added later, it should assert on the new copy and badge rendering.

### AC → test mapping

| AC | Verified by |
|---|---|
| AC1 (hero subheading accurate) | `hero-section.component.spec.ts` updated subheading assertion (step 6) + manual review |
| AC2 (no real-time claim) | Manual DOM regex sweep in step 7 + no test asserts on forbidden terms |
| AC3 (no ML claim) | Manual DOM regex sweep in step 7 |
| AC4 (no chat/mentions/notifications) | Manual DOM regex sweep in step 7 |
| AC5 (no automation claim) | Manual DOM regex sweep in step 7 |
| AC6 (trust-indicator honest or removed) | `hero-section.component.spec.ts` trust-indicator test rewritten (step 6) |
| AC7 (features header not overclaiming) | `features-section.component.spec.ts` header/subheader tests updated (step 6) |
| AC8 (every card accurate or roadmap-flagged) | New "Coming Soon Badge" describe block in `feature-card.component.spec.ts` (step 6) |
| AC9 (card count 2/3/4 with intact layout) | Four cards retained; `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` test in `features-section.component.spec.ts` still passes |
| AC10 (no card references banned specifics) | DOM regex sweep in step 7; rewritten card copy in `landing-page.component.ts` |
| AC11 (CTAs still work) | Existing `loginClick`/`signUpClick` tests in hero/landing specs remain green |
| AC12 (brand preserved) | `hero-section.component.spec.ts` "should display KanbAI brand name" test unchanged |
| AC13 (routing/guards unchanged) | No routing or guard files touched; existing guard tests stay green |
| AC14 (heading hierarchy) | `hero-section.component.spec.ts` heading-hierarchy test unchanged; features-section `<h2>` preserved; feature-card `<h3>` preserved |
| AC15 (responsive) | Grid-layout tests in `features-section.component.spec.ts` unchanged; manual viewport sweep in step 7 |
| AC16 (no console errors) | Manual verification in step 8 |
| AC17 (specs updated, not deleted) | Step 6 — no `.spec.ts` deletions, only modifications |
| AC18 (build succeeds) | Step 8 `npm run build` |
| AC19 (roadmap label accessible) | New "should have aria-label 'Coming soon' on the badge" test |
| AC20 (long-copy safe) | All new descriptions are ≤120 chars; no change to card heights expected. Web-designer phase may verify by injecting longer fixture copy in dev-mode. |

### Mocking instructions
No new services to mock. The existing `LandingPageComponent` spec already mocks the Router — keep that pattern.

### Edge cases to test
- A card literal where `comingSoon` is explicitly `false` (negative case): no badge rendered.
- A card literal where `comingSoon` is omitted (undefined): no badge rendered.
- A card literal where `comingSoon` is `true`: badge rendered with correct text and `aria-label`.
- Switching `feature` input at runtime from one without `comingSoon` to one with: badge appears on change detection (covered by the new `setInput` test).

---

## Design-Phase Hand-off Notes

These items are out-of-scope for this tech spec but are the **web-designer** phase's responsibility in the next step:

1. **Visual treatment of the `.feature-card__badge`** — colour tokens, padding, positioning, and whether the badge should float top-right of the card instead of inline above the title. The developer will use the placeholder Tailwind classes above until the designer prescribes final styling.
2. **Icon-set review** — specifically whether `secure-sign-in` should keep the reused `icon-automation` gradient or get a new `icon-lock` key.
3. **Hero headline final decision** — whether to ship the softened `"Kanban Boards for Modern Teams"` or the AI-aware fallback.
4. **Trust-indicator decision** — confirm removal vs. the one-line fallback.
5. **Typography of the roadmap card** — should its title or description appear visually muted relative to shipping cards, in addition to the badge?

---

## Design Validation (Self-Check)

**Interface alignment**
- [x] `FeatureHighlight.comingSoon` is optional and boolean; the existing fixtures in `feature-card.component.spec.ts` and `features-section.component.spec.ts` remain type-valid without modification.
- [x] No backend DTO involved (landing page is static).

**Standards compliance**
- [x] `inject()` already used in `LandingPageComponent`; not changed.
- [x] `OnPush` preserved on all four components.
- [x] Signals used for the `features` state; no unnecessary RxJS introduced.
- [x] Angular control flow (`@if`) used in the new template block, consistent with `@for` already present.

**Security**
- [x] No new routes, so no guard changes needed.
- [x] All new copy is static literal text — no `[innerHTML]`, no `DomSanitizer`, no user input rendered.
- [x] No secrets or PII introduced.

**Completeness**
- [x] Every file modification is listed in the "Files to Modify" table and has a corresponding Implementation Step.
- [x] Every AC (AC1–AC20) is mapped to at least one verification in the "AC → test mapping" table.
- [x] Implementation steps are ordered so earlier steps do not depend on later ones.

---

*Prepared by the staff-engineer agent as input for the web-designer phase.*

---

## Development Status

**Implementation Date:** 2026-05-02
**Developer:** Claude Opus 4.7
**Branch:** `58-clean-up-landing-page-content-remove-ai-hallucinations`

### Files Modified
- `KanbAI-Web/src/app/features/landing/models/feature-highlight.interface.ts` — added optional `comingSoon?: boolean`.
- `KanbAI-Web/src/app/features/landing/landing-page/landing-page.component.ts` — rewrote the `features` signal to the four new cards (`project-dashboard`, `team-members`, `secure-sign-in`, `ai-assistance`). `secure-sign-in` uses `icon: 'lock'` per the web-designer hand-off decision D2.
- `KanbAI-Web/src/app/features/landing/components/hero-section/hero-section.component.html` — softened H2 to "Kanban Boards for Modern Teams", replaced subheading, removed the trust-indicator `<p>` entirely (design-spec decision D4).
- `KanbAI-Web/src/app/features/landing/components/features-section/features-section.component.html` — new section H2 "What KanbAI offers today" and subheader.
- `KanbAI-Web/src/app/features/landing/components/feature-card/feature-card.component.html` — added the `@if (feature.comingSoon)` badge block with `role="status"` and `aria-label="Coming soon"`; single BEM-style class `feature-card__badge` per design spec (dropped the Tailwind amber placeholders).
- `KanbAI-Web/src/app/features/landing/components/feature-card/feature-card.component.ts` — added `'lock': '🔒'` case to `getIconSymbol()`.
- `KanbAI-Web/src/app/features/landing/components/feature-card/feature-card.component.scss` — added `@use` statements for the canonical v1.0 variable partials, new `.icon-lock` gradient using `$status-medium`, and the `.feature-card__badge` rule per design spec Section 3.
- `KanbAI-Web/src/app/features/landing/landing-page/landing-page.component.spec.ts` — updated feature-id assertions.
- `KanbAI-Web/src/app/features/landing/components/hero-section/hero-section.component.spec.ts` — updated headline and subheading assertions; rewrote trust-indicator test to assert the legacy line is absent.
- `KanbAI-Web/src/app/features/landing/components/features-section/features-section.component.spec.ts` — updated header and description assertions.
- `KanbAI-Web/src/app/features/landing/components/feature-card/feature-card.component.spec.ts` — added `'lock'` glyph test and a new `'Coming Soon Badge'` describe block with four cases (undefined, false, true, aria-label/role).

### Files Created
None.

### Build & Test Results
- **Build:** PASS — `npm run build` (Angular production build) completed without errors.
- **Tests:** PASS — 595/595 passed across 38 test files (`npm run test -- --watch=false`).
- **Pre-existing failures:** None.

### AC Coverage Summary
- AC1–AC7 (copy accuracy / hallucinations removed): satisfied by the revised hero, features-section, and feature-card copy; regex gates verified by inspection of the rewritten strings.
- AC8, AC19 (roadmap card + accessibility): `ai-assistance` card renders the accessible `role="status"` badge via the new `@if (feature.comingSoon)` block.
- AC9, AC15 (layout): four cards preserved; existing `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` grid untouched.
- AC11–AC14 (preserved behaviour): CTAs, routing, guards, brand, and heading hierarchy all unchanged.
- AC16 (console): no new bindings or subscriptions introduced; build produced no warnings on the landing-page chunk.
- AC17 (specs updated, not deleted): four spec files updated in place; one new describe block added.
- AC18 (build): see Build & Test Results above.
- AC20 (long-copy safety): all new descriptions are ≤120 characters; card heights equal across the row (roadmap card's title and description stay at full contrast per design-spec decision D5).

### Notes
- `feature-card.component.scss` now `@use`s five token partials (`colors`, `spacing`, `radius`, `typography`, `motion`). The `stylePreprocessorOptions.includePaths: ["."]` entry in `angular.json` allows the `src/styles/variables/...` paths to resolve.
- The existing four Tailwind-era icon gradients (`icon-board`, `icon-ai`, `icon-team`, `icon-automation`) were kept untouched per both specs' "out of scope" clauses.
- No new services, HTTP calls, routing, or guards were introduced.

### Ready for QA
Manual verification checklist remaining (per tech-spec Step 7 and design-spec Section 7):
- Viewport sweep at 375 / 768 / 1280 px.
- NVDA/VoiceOver smoke test of the roadmap card badge announcement.
- `prefers-reduced-motion` DevTools toggle — confirm card hover-lift collapses to instant.
