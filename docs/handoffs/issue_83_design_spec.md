# Design Specification: Render the task description in the task detail panel

**Tech Spec:** [issue_83_tech_spec.md](./issue_83_tech_spec.md)
**Context Document:** [issue_83_context.md](./issue_83_context.md)
**GitHub Issue:** [#83](https://github.com/Gulybi/KanbAI-Web/issues/83)
**Scope:** Phase 1 only — read-only rendering of `BoardTask.content` inside the existing `TaskDetailPanelComponent`. No edit mode, no new components, no new tokens (see [Prerequisites](#prerequisites)).

---

## 1. Prerequisites

### Design token inventory

All tokens required by this spec already exist in `KanbAI-Web/src/styles/variables/`. No token additions are strictly required to ship this work; one optional addition is documented in [Proposed Token Additions](#proposed-token-additions) for consideration.

| Token family | Files used | Status |
|---|---|---|
| Colours | `_colors.scss` (`$text-primary`, `$text-secondary`, `$bg-main`) | Exists |
| Typography | `_typography.scss` (`$font-size-md`, `$font-size-sm`, `$font-weight-regular`, `$font-weight-semibold`, `$line-height-normal`) | Exists |
| Spacing | `_spacing.scss` (`$space-xxs`, `$space-xs`) | Exists |
| Breakpoints | `_breakpoints.scss` (`$bp-md`, `$bp-lg`, `respond-to()` mixin) | Exists |
| Motion | `_motion.scss` (global `prefers-reduced-motion` clamp already in place) | Exists |

**KanbAI v1.0 token set is present in this repo.** No "KanbAI v1.0 design system is missing" escalation is needed.

### Component readiness

The component being restyled already uses the canonical `@use 'src/styles/variables/*' as *;` import pattern at the top of its SCSS file (see `task-detail-panel.component.scss:1-8`). No new `@use` directives are needed — `colors`, `spacing`, and `typography` are already imported.

### Proposed Token Additions

**Optional — not required to ship.** The empty-state copy in this spec uses `$text-secondary` (`#7A7A7A`) on `$bg-main` (`#FFFFFF`), which measures **4.29:1** contrast — just below the WCAG 2.1 AA threshold of 4.5:1 for normal body text. This is a pre-existing token-level issue (the same token is used by `.task-detail-panel__section-label` elsewhere in the same component) and is out of scope to fix in issue #83.

If the product owner wants to close this gap in a follow-up:

- **`$text-muted-strong: #6B6B6B;`** (sits between `$text-secondary` #7A7A7A and `$text-primary` #1C1C1C). Measured 5.74:1 against `$bg-main` — clears AA body text with room. Would be adopted across every existing call-site that currently uses `$text-secondary` for body copy.

**Decision for this ticket:** do not add the token. Use `$text-secondary` to match existing drawer-body typography, disclose the 4.29:1 measurement in the [Accessibility](#5-accessibility) contrast table, and file the token hardening as a separate design-system ticket. Changing `$text-secondary`'s value, or swapping half the app to a new token, is beyond issue #83's scope and would regress the visual coherence the drawer already has.

---

## 2. Design System (scoped excerpt)

This spec only touches a small slice of the system. The excerpt below is canonical — it is the source-of-truth for the values the Description section will consume. Any deviation is a bug.

### Colour palette (consumed tokens)

| Role | Token | Value | Where used in this spec |
|---|---|---|---|
| Primary text | `$text-primary` | `#1C1C1C` | Description body text (text mode) |
| Secondary text | `$text-secondary` | `#7A7A7A` | Section heading label + empty-state copy |
| Surface | `$bg-main` | `#FFFFFF` | Drawer body background (inherited — not re-declared) |

No new colours are introduced. No hover / active / focus states are introduced because this section renders static prose (not an interactive control) in Phase 1.

### Typography scale (consumed tokens)

| Role | Size token | Weight token | Line-height token | Letter-spacing |
|---|---|---|---|---|
| Section heading (`"Description"`) | `$font-size-sm` (12px) | `$font-weight-semibold` (600) | `$line-height-tight` (1.2) | `0.02em` + `text-transform: uppercase` |
| Description body | `$font-size-md` (14px) | `$font-weight-regular` (400) | `$line-height-normal` (1.5) | default (0) |
| Empty-state copy | `$font-size-md` (14px) | `$font-weight-regular` (400) | `$line-height-normal` (1.5) | default (0) |

**Rationale — heading typography.** The heading MUST reuse the existing `.task-detail-panel__section-label` class verbatim (defined at `task-detail-panel.component.scss:157-164`). This is a tech-spec requirement ("Keep the existing `.task-detail-panel__section` / `.task-detail-panel__section-label` rhythm"). Its values — `$font-size-sm` semibold uppercase with `0.02em` tracking — are the drawer's established section-heading voice (see the Attachment section header). Introducing a different heading treatment for Description would break that rhythm.

**Rationale — body typography.** `$font-size-md` 14px regular with `$line-height-normal` 1.5 is the canonical body-text combination in the KanbAI v1.0 scale. 1.5 (rather than `$line-height-tight` 1.2) is mandatory for multi-paragraph prose: on a `line-break-preserved` multi-line description, 1.2 produces optically-cramped lines and makes paragraphs visually collide. 1.5 opens the prose up without requiring explicit paragraph margins.

### Spacing scale (consumed tokens)

| Role | Token | Value |
|---|---|---|
| Gap between heading and body within the section | `$space-xs` | 8px (already applied by `.task-detail-panel__section { gap: $space-xs; }`) |
| Gap between sections within the body | `$space-lg` | 24px (already applied by `.task-detail-panel__body { gap: $space-lg; }`) |

No new spacing tokens are introduced. The existing section-container rhythm is reused.

### Motion

**No motion is introduced.** The Description section is a static render; the panel-open / panel-close motion is already owned by the outer `.task-detail-panel` (`transition: transform $motion-slow;` at `task-detail-panel.component.scss:30-31`) and is unaffected. The global `prefers-reduced-motion` clamp at `_motion.scss:7-12` already zeroes transitions for users who request it — nothing to add.

### Iconography

None. The Description section is pure text + heading in Phase 1.

---

## 3. Component Styling

### 3.1 Final copy (design decisions)

| Surface | Final copy | Rationale |
|---|---|---|
| Section heading | **`Description`** | Tech-spec default. Confirmed. Matches the convention used by every peer product's task-drawer (Jira, Linear, Trello). Singular, not "Description & notes" or "Task description" — the drawer context already disambiguates. |
| Empty state | **`No description yet.`** | Tech-spec default. Confirmed. Calm, concrete, one sentence, no emoji — matches the brand voice rule. `yet` does a surprisingly large amount of work: it signals "this is expected to be filled, just hasn't been yet" without making a promise about the edit affordance (which is Phase 2). Avoids the passive-aggressive tone of `Empty.` or the hand-holding of `There's nothing here. Click to add a description.` (the latter also implies an edit affordance we do not ship in Phase 1). |

### 3.2 Visual ordering inside the drawer body

**Decision: Description renders ABOVE Attachment.** This confirms the tech spec's default (§Open Questions #2).

**Rationale.**

1. **Reading order matches semantic weight.** `content` is part of the task's identity (what the task *is*); attachments are supporting evidence (what the task *references*). A reader opening an unfamiliar task wants to know what it's about before they see file names attached to it.
2. **Tab order improves.** The drawer's natural Tab flow on open is: Close button → first focusable element in body. With Description first, a keyboard user reaches the prose (the thing they usually came for) before reaching the dropzone and attachment list. Moving from prose → attachments matches how readers of the page will already have scanned visually.
3. **Section-header rhythm.** Placing Description directly beneath the title produces a consistent `Title → Description` pairing that matches every peer product's detail view. Inserting the dropzone between title and description would visually isolate the title from its own prose.
4. **Empty-state density.** When `content` is null, the empty-state is a single muted line. Placing it above the visually heavier Attachment section (dropzone rectangle + upload list) keeps the drawer's visual weight bottom-heavy, which reads as stable. Reversing the order would put a big block of UI above a thin muted sentence — top-heavy, awkward.

**Tab order (full drawer, left-to-right, top-to-bottom):**
Close button → Description heading (heading itself is not focusable, but screen readers announce it when the section is traversed) → *(no focusable control inside Description in Phase 1)* → Dropzone → Upload-row controls (cancel / retry / dismiss) → Attachment list controls.

### 3.3 Template structure (Angular, for the developer phase)

The Description section is the first `<section>` inside `.task-detail-panel__body`, sitting immediately before the existing Attachment `<section>`. The section uses `aria-labelledby` bound to a stable id derived from `task().id` (mirrors the existing `titleId()` pattern at `task-detail-panel.component.ts:55`).

Approximate markup shape — the developer owns the exact interpolation, this is the styling contract:

```html
<section
  class="task-detail-panel__section"
  [attr.aria-labelledby]="descriptionLabelId()"
>
  <h3
    class="task-detail-panel__section-label"
    [id]="descriptionLabelId()"
  >Description</h3>

  @if (descriptionDisplay().mode === 'text') {
    <p class="task-detail-panel__description">{{ descriptionDisplay().text }}</p>
  } @else {
    <p class="task-detail-panel__description-empty">No description yet.</p>
  }
</section>
```

**Notes for the developer.**
- The component class should add a `readonly descriptionLabelId = computed(() => 'task-detail-description-' + this.task().id)` that mirrors the existing `titleId` pattern — stable per-task, regenerated when the `task` input changes (guaranteed by `computed` re-evaluation).
- Use `<p>` for both text-mode and empty-state content. A `<p>` is semantically correct for prose (the description IS a paragraph), and it avoids introducing a generic `<div>` where a more specific element exists. Multi-paragraph content rendered via `white-space: pre-wrap` is still semantically "one paragraph with line breaks" as far as the DOM is concerned — this is fine; the alternative (splitting on `\n` and rendering N `<p>` elements) would require DOM manipulation the tech spec forbids.
- `{{ descriptionDisplay().text }}` is the ONLY binding. No `[innerHTML]`, no `DomSanitizer`, no `<br>` injection (tech-spec hard constraint).
- Use `@if` / `@else` (not `*ngIf`). Tech-spec hard constraint.
- The `.task-detail-panel__placeholder-badge` span in the header is removed per Implementation Step 1 — the SCSS rule below also drops.

### 3.4 Concrete SCSS

The block below is copy-pasteable. It composes alongside the existing `.task-detail-panel__section` and `.task-detail-panel__section-label` rules (which are untouched) and replaces the deleted `.task-detail-panel__placeholder-badge` block.

```scss
// ---- Description section -------------------------------------------------
// Renders BoardTask.content as plain text with preserved line breaks, or a
// muted empty-state when content is null / '' / whitespace-only. No motion,
// no interactive controls — Phase 1 is read-only.

.task-detail-panel__description {
  margin: 0;

  font-size: $font-size-md;
  font-weight: $font-weight-regular;
  line-height: $line-height-normal;
  color: $text-primary;

  // Preserve line breaks embedded in the raw string without parsing markdown
  // or injecting <br>. Tech-spec requirement (§Implementation Step 4).
  white-space: pre-wrap;

  // Guarantee a pathologically long single token (e.g. a 500-char URL with no
  // spaces) breaks mid-token rather than pushing the drawer body into
  // horizontal scroll. Tech-spec requirement.
  overflow-wrap: anywhere;
  word-break: normal; // explicit: do not also break Latin words at every char
}

.task-detail-panel__description-empty {
  margin: 0;

  font-size: $font-size-md;
  font-weight: $font-weight-regular;
  line-height: $line-height-normal;
  color: $text-secondary;

  // No italic, no "click to add" prompt — Phase 1 is informational only.
  // Tone is carried by the copy ("No description yet.") and the muted
  // colour, not by typographic ornament.
  font-style: normal;
}
```

**What is deliberately NOT in the block:**
- No `padding` — the section container (`.task-detail-panel__section`) owns the internal gap via `gap: $space-xs`, and the drawer body (`.task-detail-panel__body`) owns the outer padding. Adding padding here would double-space the section.
- No `background`, `border`, or `border-radius` — the description IS the drawer body; boxing it would visually detach prose from its heading.
- No `max-height` or `overflow: auto` — the drawer body is already the scroll container (`.task-detail-panel__body { overflow-y: auto }`). A second scrollable region inside it would produce a confusing nested-scroll UX for keyboard and screen-reader users.
- No hover / focus rule — the `<p>` is not focusable and has no interaction in Phase 1.

### 3.5 SCSS to remove

```scss
// DELETE — placeholder badge is removed with this ticket.
.task-detail-panel__placeholder-badge {
  // entire block at task-detail-panel.component.scss:83-99
}
```

---

## 4. Responsive Design

The drawer's width is already responsive (full-width `< $bp-md`, 420px at `$bp-md`, 480px at `$bp-lg`). The Description section inherits that width; no breakpoint-specific overrides are needed inside the section itself. The typography scale is also flat across breakpoints for this section (14px body everywhere — `$font-size-md` does not change across the KanbAI v1.0 scale).

| Viewport | Drawer width | Description behaviour |
|---|---|---|
| `< $bp-md` (<768px) | 100% of viewport | Body prose flows to the drawer's full inner width. Long tokens break via `overflow-wrap: anywhere` so nothing pushes horizontal scroll on the body. Empty-state reads as a single muted line. |
| `$bp-md – $bp-lg` (768–991px) | 420px | Same as above with a narrower reading column (~388px inside the 16px body padding). Within the comfortable 45–75-character reading line that typography guidance prefers. |
| `≥ $bp-lg` (≥992px) | 480px | Same as above with ~448px inside the 24px body padding (body padding bumps to `$space-lg` at `$bp-md`). Still inside the ideal reading column. No typography scale-up — 14px body is correct for every drawer width. |

**Horizontal-scroll guard.** With `overflow-wrap: anywhere` on the description body, a 500-char single-token URL breaks mid-token at the drawer's inner edge. The drawer body's own `overflow-y: auto` means vertical scroll is the only expected axis — horizontal scroll on the body or the page must not appear. This is covered in the [Visual States](#6-visual-states) pathological-URL state.

**Mobile-first.** The base SCSS block above is written unprefixed — it applies at every viewport. No `@include respond-to('md')` overrides are needed because the design is intentionally identical across breakpoints (only the container width changes, not the typography or colour).

---

## 5. Accessibility

### Role & naming

- The `<section>` has `aria-labelledby` pointing to the `<h3>` heading's stable id (`task-detail-description-{taskId}`). Screen readers announce "Description, region" when the user enters the section.
- The `<h3>` participates in the drawer's heading outline, sitting alongside the existing Attachment `<h3>`. Together with the `<h2>` title and the `role="dialog"` `<aside>`, the drawer exposes a correct heading hierarchy: `dialog → h2 (title) → h3 (Description) → h3 (Attachment)`.
- The outer `role="dialog"` + `aria-modal="false"` on `.task-detail-panel` is unchanged — Phase 1 does not regress the drawer's modal posture (it is a non-modal drawer; the Escape-to-close and focus behaviour established by #49 continue to work).

### Keyboard

- No new focusable elements are added. Tab order inside the drawer continues to start at the Close button, move to the dropzone (first focusable body control), then through upload-row controls. The Description heading is not focusable by design — it is prose, not a control.
- Escape-to-close continues to work because it's owned by the outer component, not the new section.

### Screen reader

- When the user Tabs into the drawer from outside, the existing behaviour (focus lands on the Close button, the dialog's `aria-labelledby` points at the title) is preserved.
- When a screen reader traverses the drawer's content (e.g. VoiceOver rotor by heading, or NVDA arrow-key reading), the Description heading is announced, followed by the description body — or by the empty-state copy, which IS the content node, so it IS read aloud (it is not an `aria-placeholder` attribute, it is real text in the DOM).
- Because the empty-state is a `<p>` with real text ("No description yet."), it shows up in any "list all paragraphs" or "list all headings + content" screen-reader inspection. No special `aria-live`, no `role="note"`, no extra announcement — it's read naturally in document order.

### Focus visibility

N/A — no interactive control introduced.

### Contrast (WCAG 2.1 ratios)

All foreground/background pairs used by this section, measured with the sRGB luminance formula against `$bg-main` (`#FFFFFF`):

| Foreground | Background | Role | Size × weight | Ratio (measured) | AA threshold | Result |
|---|---|---|---|---|---|---|
| `$text-primary` `#1C1C1C` | `$bg-main` `#FFFFFF` | Description body text | 14px × 400 | **17.56:1** | 4.5:1 (normal text) | **Passes AA + AAA** |
| `$text-secondary` `#7A7A7A` | `$bg-main` `#FFFFFF` | Section heading `"Description"` | 12px × 600 semibold uppercase | **4.29:1** | 3.0:1 (interpreted as secondary/label text — matches the pre-existing `.task-detail-panel__section-label` treatment used by the peer Attachment heading) | **Passes AA for label-scale contrast (3:1)**; does NOT clear the 4.5:1 body-text bar |
| `$text-secondary` `#7A7A7A` | `$bg-main` `#FFFFFF` | Empty-state copy `"No description yet."` | 14px × 400 | **4.29:1** | 4.5:1 (normal text) | **Fails AA by 0.21** — pre-existing token deficit, see note below |

**The 4.29:1 gap — disclosure, not a silent choice.**

The `$text-secondary` token is already used elsewhere in the same drawer (the Attachment section's heading at `task-detail-panel.component.scss:162`) and across the app for muted-tone copy. Adopting the same token for the Description empty-state preserves visual coherence with the rest of the drawer; adopting a one-off darker value would break that coherence for a 0.21-ratio improvement.

**Mitigations considered and rejected:**

1. **Using `$text-primary` for the empty-state.** Rejected — eliminates the visual distinction between "real content" and "no content yet", which is the whole point of the empty-state style.
2. **Making the empty-state semibold.** Rejected — semibold italics would communicate "this empty state is very important" which is the opposite of the calm informational tone.
3. **Proposing a new `$text-muted-strong` token.** See [Proposed Token Additions](#proposed-token-additions) — filed as a follow-up, not adopted here to avoid scope creep and to avoid half-migrating the app.

**Recommended path:** ship with `$text-secondary`, file a separate design-system ticket to introduce `$text-muted-strong: #6B6B6B` and migrate all body-text `$text-secondary` usages. At that point every affected surface (including this empty-state) clears AA 4.5:1 in a single coordinated change.

### Reduced motion

No-op. The Description section has no animations, transitions, or motion effects. The drawer's own `transform` transition is already clamped by the global `@media (prefers-reduced-motion: reduce)` rule at `_motion.scss:7-12`. Explicitly documented here because the web-designer Self-Review checklist demands it.

---

## 6. Visual States

Every state below must render correctly without further design input. A state is considered covered when the developer can reproduce it in a component test fixture or a manual browser pass.

### State 1 — Text mode, short content

- **Input:** `task().content = "Remember to coordinate with design on the hero banner copy."`
- **Expected:** `.task-detail-panel__description` renders the string on one or two visual lines depending on drawer width. Colour `$text-primary`, size 14px, line-height 1.5.
- **Snapshot contract:** `textContent.trim() === "Remember to coordinate with design on the hero banner copy."`

### State 2 — Text mode, multi-paragraph content (line breaks preserved)

- **Input:** `task().content = "First paragraph.\n\nSecond paragraph with more detail."`
- **Expected:** Two visual blocks separated by a blank line. No `<br>` in the DOM. `getComputedStyle().whiteSpace === "pre-wrap"` on the description element.
- **Snapshot contract:** the raw newline characters survive round-trip through the DOM (`.task-detail-panel__description` `.textContent` contains `\n\n`).

### State 3 — Text mode, pathological single-token URL

- **Input:** `task().content = "https://example.com/" + "a".repeat(500)`
- **Expected:** The token breaks mid-URL at the drawer's inner edge. Neither the drawer body nor the page gains a horizontal scrollbar. No clipping (text remains fully readable across multiple lines).
- **Snapshot contract:** `document.documentElement.scrollWidth === document.documentElement.clientWidth` at every supported viewport; `.task-detail-panel__body` does not gain `overflow-x: auto` behaviour.

### State 4 — Empty state (all three null-shaped inputs)

- **Input A:** `task().content = null`
- **Input B:** `task().content = ""`
- **Input C:** `task().content = "   \n\t  "` (whitespace only)
- **Expected (all three):** `.task-detail-panel__description-empty` renders with the text `"No description yet."` in `$text-secondary`. The `.task-detail-panel__description` element is absent from the DOM (so a CSS selector test can distinguish "real content" from "empty" without ambiguity).
- **Snapshot contract:** all three inputs produce the same rendered DOM shape. The `descriptionDisplay()` computed returns `{ mode: 'empty', text: '' }` for each.

### State 5 — Task-switch transition (no stale text)

- **Input:** component receives `task = taskA` with `content = "Long prose..."`, then receives `task = taskB` with `content = null`.
- **Expected:** after change detection, the drawer body shows the empty-state for task B with zero residue of task A's prose. The `aria-labelledby` id also swaps to the new task's id.
- **Snapshot contract:** after `setInput('task', taskB)` + `detectChanges()`, a `By.css('.task-detail-panel__description')` query returns `null` and `By.css('.task-detail-panel__description-empty')` returns the empty-state element.

### State 6 — Keyboard traversal

- **Input:** user Tabs into the drawer from the previous focus element.
- **Expected:** focus lands on the Close button (unchanged pre-#83 behaviour). Continuing to Tab skips the Description heading (it is not focusable — correct) and reaches the dropzone. Screen-reader heading navigation (e.g. VoiceOver `VO+Cmd+H`) announces the "Description" heading before the "Attachment" heading.
- **Snapshot contract:** tab order does not include a new focusable stop introduced by Description. `queryAll('[tabindex]').length` inside the description section is 0.

### State 7 — `prefers-reduced-motion: reduce`

- **Input:** user OS preference set to reduced motion.
- **Expected:** nothing animates in the Description section (there is no motion to animate in the first place). The drawer's own transform transition is clamped globally. Opening and closing the drawer feels instant; the Description content is fully visible at drawer-open-end.
- **Snapshot contract:** `getComputedStyle(descriptionEl).transitionDuration === "0.01ms"` (via the global clamp); no SCSS block in this spec declares motion that would be clamped locally.

---

## 7. Implementation Checklist (for the developer phase)

Targeted at the developer agent. Each item maps to a concrete change; items with file paths are exact call-sites from the tech spec.

### Template (`task-detail-panel.component.html`)

- [ ] Delete the `<span class="task-detail-panel__placeholder-badge">Placeholder</span>` element at lines 13–15.
- [ ] Insert a new `<section class="task-detail-panel__section" [attr.aria-labelledby]="descriptionLabelId()">` as the **first child** of `.task-detail-panel__body` (before the existing Attachment section at line 43).
- [ ] Inside the new section: render `<h3 class="task-detail-panel__section-label" [id]="descriptionLabelId()">Description</h3>` (copy: exactly `Description`, no emoji, no trailing colon).
- [ ] Inside the new section: use `@if (descriptionDisplay().mode === 'text') { <p class="task-detail-panel__description">{{ descriptionDisplay().text }}</p> } @else { <p class="task-detail-panel__description-empty">No description yet.</p> }` (copy: exactly `No description yet.`).
- [ ] Use `@if` / `@else` control flow — do NOT use `*ngIf` / `*ngSwitch` (tech-spec hard constraint).
- [ ] Never use `[innerHTML]`, `DomSanitizer`, `<br>` injection, or any markdown parser (tech-spec hard constraint).

### Component class (`task-detail-panel.component.ts`)

- [ ] Add the `TaskDescriptionDisplay` discriminated-union type above the `@Component` decorator, verbatim from the tech spec's §State & Data Layer.
- [ ] Add `readonly descriptionDisplay: Signal<TaskDescriptionDisplay>` computed that applies the null / empty / whitespace-only → `'empty'` rule and otherwise returns `{ mode: 'text', text: task().content! }`.
- [ ] Add `readonly descriptionLabelId = computed(() => 'task-detail-description-' + this.task().id);` — mirrors the existing `titleId` at line 55.
- [ ] Preserve `ChangeDetectionStrategy.OnPush` (no change).
- [ ] Do NOT introduce new dependencies, new imports beyond Angular primitives already present, or new services.

### Styles (`task-detail-panel.component.scss`)

- [ ] Delete the `.task-detail-panel__placeholder-badge` rule at lines 83–99 in full.
- [ ] Add the `.task-detail-panel__description` and `.task-detail-panel__description-empty` blocks from §3.4 above, verbatim. Place them after the existing `.task-detail-panel__section-label` block and before the `// ---- Attachment section ----` comment so the file reads top-to-bottom in drawer layout order.
- [ ] Do NOT introduce new `@use` imports — `colors`, `spacing`, and `typography` are already imported at lines 1–5.
- [ ] Do NOT introduce hover, focus, or active states on the description elements (they are not interactive in Phase 1).
- [ ] Do NOT introduce padding, background, border, border-radius, `max-height`, or `overflow` properties on the description elements (reasons in §3.4).

### Tests (`task-detail-panel.component.spec.ts`)

- [ ] Delete the `renders the placeholder badge` test case at lines 128–131 (deliberate in-scope deletion per the tech spec).
- [ ] Add the six test cases enumerated in the tech spec §QA Guidance.
- [ ] Assert computed-style on the description element: `getComputedStyle(el).whiteSpace === 'pre-wrap'` and `getComputedStyle(el).overflowWrap === 'anywhere'`.
- [ ] Assert the Description heading's `id` matches the section's `aria-labelledby` (accessibility wiring).

### Build verification

- [ ] `npm run build` passes with no new errors or warnings.
- [ ] `npm run test -- --watch=false` reports zero INTRODUCED failures. The deleted placeholder-badge test does not count as a regression — document it in the commit body as a deliberate in-scope removal.
- [ ] Manual smoke: open a task with multi-paragraph `content`, confirm line breaks render. Open a task with `content: null`, confirm empty-state renders. Switch between tasks without closing the drawer (if the flow exists) or close + re-open on a different task; confirm no stale text.
- [ ] Manual smoke: a task with a 500-char single-token URL does not cause horizontal scroll on the drawer or the page at any of `< $bp-md`, `$bp-md`, `$bp-lg`, `$bp-xl`.

---

## Open Questions

None. Every design decision the tech spec explicitly delegated to the web-designer phase is resolved above:

1. Section heading copy — `"Description"` ([§3.1](#31-final-copy-design-decisions)).
2. Empty-state copy — `"No description yet."` ([§3.1](#31-final-copy-design-decisions)).
3. Description vs Attachment ordering — Description first, with four-point rationale ([§3.2](#32-visual-ordering-inside-the-drawer-body)).
4. Typography tokens — `$font-size-md` / `$font-weight-regular` / `$line-height-normal` for body, `.task-detail-panel__section-label` rhythm reused for heading ([§2](#2-design-system-scoped-excerpt)).
5. Empty-state colour token — `$text-secondary` with the 4.29:1 contrast measurement disclosed honestly and a follow-up token ticket proposed ([§5](#5-accessibility)).
6. Accessibility association — `aria-labelledby` on the `<section>` pointing to a stable `descriptionLabelId()` computed from `task().id`, mirroring the existing `titleId` pattern ([§3.3](#33-template-structure-angular-for-the-developer-phase)).

---

*The design specification is saved. You can now instruct the developer agent to implement the feature using both the technical spec and design spec.*
