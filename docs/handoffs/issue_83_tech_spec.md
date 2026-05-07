# Technical Specification: Render the task description (`content`) in the task detail panel

**Context Document:** [issue_83_context.md](./issue_83_context.md)
**GitHub Issue:** [#83](https://github.com/Gulybi/KanbAI-Web/issues/83)
**Scope:** Phase 1 only (read-only description render). Phase 2 (inline editing) is out of scope for this ticket because the backend has no task-update endpoint today — see [Open Questions](#open-questions--assumptions) and the context doc's "Backend Prerequisite" section.

---

## Overview

This is a scoped, drawer-only render fix. The `BoardTask.content` field is already populated in client state by every task-ingestion path (HTTP create, `TaskCreated` SignalR, `TaskMoved` SignalR, HTTP move reconciliation), but `TaskDetailPanelComponent` never reads it. The change introduces a new **Description section** inside the existing `task-detail-panel__body`, rendered above the Attachment section, driven by a single `computed` signal on the existing component. Empty / null / whitespace-only `content` renders an empty-state. The "Placeholder" badge in the header is removed. No new service, no new HTTP call, no new npm dependency, no state-layer change.

---

## Component Architecture

### Routing
No routing changes. The feature lives inside the already-routed `/project/:id` board view; the drawer is already hosted by `BoardPageComponent`.

### Component Hierarchy

The only component touched is the existing **Smart/Self-contained** component `TaskDetailPanelComponent`. It already takes a `BoardTask` input and renders header + body sections; this ticket adds one more section to the body.

**Component to Modify:**

- `TaskDetailPanelComponent`
  - Path: `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.{ts,html,scss,spec.ts}`
  - Role: Reads `task().content` and projects a display value through a new `computed` signal. No new inputs, no new outputs, no new dependencies.
  - Already uses `ChangeDetectionStrategy.OnPush` and `input.required<BoardTask>()`. Preserve both.

**No new components are introduced.** The Description section is a small template block inside the existing panel — introducing a child presentational component would not pay for itself at this scope (no independent reuse, no independent state, no shared behaviour with the attachment section).

### New Files to Create
None.

### Files to Modify

| File | Change summary |
|---|---|
| `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts` | Add one `computed` signal (`descriptionDisplay`) that normalises `task().content` to a `{ mode: 'text' \| 'empty'; text: string }` shape. No other logic changes. |
| `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.html` | Remove the `.task-detail-panel__placeholder-badge` span. Insert a new `<section>` before the existing Attachment `<section>` rendering either the text body (with preserved newlines) or the empty-state copy, keyed off `descriptionDisplay()`. |
| `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.scss` | Remove the `.task-detail-panel__placeholder-badge` rule. Add `.task-detail-panel__description` + `.task-detail-panel__description-empty` styling (section body typography + `white-space: pre-wrap`, muted empty-state colour). Concrete SCSS is delegated to the web-designer phase. |
| `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.spec.ts` | Delete the existing `renders the placeholder badge` test (that behaviour is being removed — this is a deliberate, in-scope test deletion, not a PRE-EXISTING failure). Add new tests described in [QA Guidance](#qa-guidance). |

No changes required to `BoardPageComponent`, `BoardStateService`, `TasksApiService`, `BoardTask` model, or any SignalR handler.

---

## State & Data Layer

### State Management Strategy

**Local, reactive, derived from an already-present signal.** The panel's existing `task` input is already a `Signal<BoardTask>`; this ticket adds one `computed` derivation from it.

### Normalisation Rule

Exactly one rule, applied in one place (the new `computed`):

| `task().content` input | `descriptionDisplay()` output |
|---|---|
| `null` | `{ mode: 'empty', text: '' }` |
| `''` (empty string) | `{ mode: 'empty', text: '' }` |
| String whose `.trim()` is `''` (whitespace-only) | `{ mode: 'empty', text: '' }` |
| Any other string `s` | `{ mode: 'text', text: s }` |

Whitespace-only is treated as empty for **display** only — the underlying `BoardTask.content` is not mutated. The rule mirrors the context doc's AC: *"When the opened task's `content` is `null` OR an empty string OR whitespace-only, the Description section renders an empty-state copy instead of the raw value."*

**Line-break preservation** is a pure styling concern — the template renders `{{ display.text }}` (interpolation escapes by default, no `innerHTML`, no `DomSanitizer`) inside an element that has `white-space: pre-wrap` in its SCSS. No JS-side split/join, no `<br>` injection.

### TypeScript Interfaces

Only one new local type is introduced, and it is a **component-internal** discriminated union. It does not belong in `board-state.model.ts` because it is a presentational projection, not a state shape.

**File:** `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts` (add near the top of the class file, above the `@Component` decorator, or inline as a `type` alias inside the class scope)

```typescript
/**
 * Presentational projection of BoardTask.content for the Description
 * section. `empty` = render the empty-state copy; `text` = render
 * `text` with preserved line breaks.
 */
type TaskDescriptionDisplay =
  | { readonly mode: 'empty'; readonly text: '' }
  | { readonly mode: 'text';  readonly text: string };
```

**Signal shape added to the component:**

```typescript
readonly descriptionDisplay: Signal<TaskDescriptionDisplay> = computed(() => {
  // Signature only — implementation is the developer's job.
  // Rule: null / '' / whitespace-only → 'empty'; otherwise → 'text' carrying the raw string.
});
```

### Existing interfaces (unchanged, referenced for clarity)

- `BoardTask` at `KanbAI-Web/src/app/features/board/state/board-state.model.ts:21-28` — `content: string | null` is already present. Do **not** modify this interface.
- Backend contracts: `TaskResponseDto.content: string | null` (`.claude/backend_api_map.md:284`) and `CreateTaskDto.content: string | null` (`.claude/backend_api_map.md:275`). No client-side contract change.

---

## Service Integration

**None.** No HTTP request is made by this feature. No method is added to `TasksApiService`. No SignalR event handler is added or modified. No change to `BoardStateService`.

The `content` field is already round-tripping correctly into `BoardTask` via the paths enumerated in the context doc ([`board-state.service.ts:216-228`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L216-L228), [`board-state.service.ts:275-283`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L275-L283), [`board-state.service.ts:350-357`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L350-L357), [`board-state.service.ts:536-542`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L536-L542)); this ticket is a pure view-layer fix.

### HTTP Request/Response Contracts
N/A — no HTTP change.

---

## Implementation Steps

Follow in order. The entire change should fit in a single commit.

### 1. Remove the "Placeholder" badge
- [ ] Delete the `<span class="task-detail-panel__placeholder-badge">Placeholder</span>` element at `task-detail-panel.component.html:13-15`.
- [ ] Delete the `.task-detail-panel__placeholder-badge` SCSS rule at `task-detail-panel.component.scss:83-99`.
- [ ] Delete the `renders the placeholder badge so the stub nature is visible` test case at `task-detail-panel.component.spec.ts:128-131`. This is the only intentionally-deleted test; it is covering behaviour that is being removed on purpose.

### 2. Add the `descriptionDisplay` computed signal
- [ ] In `task-detail-panel.component.ts`, declare the `TaskDescriptionDisplay` discriminated-union type as specified in [State & Data Layer](#state--data-layer).
- [ ] Add a `readonly descriptionDisplay: Signal<TaskDescriptionDisplay>` property using `computed(() => ...)` that applies the normalisation rule in the table above.
- [ ] Keep the component's existing `OnPush` change-detection strategy. No new imports other than `Signal` (already imported) and any already-imported Angular primitives.

### 3. Render the Description section in the template
- [ ] In `task-detail-panel.component.html`, add a new `<section class="task-detail-panel__section">` **before** the existing Attachment section (inside `.task-detail-panel__body`, as its first child).
- [ ] The section contains:
  - A heading element (`<h3>`) with the same `.task-detail-panel__section-label` class already used by the Attachment section. The heading text MUST come from the web-designer phase; the tech-spec default is `"Description"` until the design spec overrides it.
  - A content region that switches on `descriptionDisplay().mode`:
    - `mode === 'text'` → render `{{ descriptionDisplay().text }}` inside an element carrying the `.task-detail-panel__description` class (the class must set `white-space: pre-wrap` so embedded `\n` becomes a visible line break).
    - `mode === 'empty'` → render the empty-state copy inside an element carrying `.task-detail-panel__description-empty`. Exact copy is a design-spec decision; the tech-spec default is `"No description yet."`.
- [ ] Use Angular control flow (`@if` / `@switch`) — not `*ngIf` / `*ngSwitch` — to match the codebase convention used elsewhere in this same template (`@if (uploads().length > 0)` etc.).
- [ ] Bind the section's accessible name to the heading via `aria-labelledby` referencing a stable id (e.g. derived from `task().id` the way `titleId` already is) OR attach the heading inside the section such that screen readers announce it naturally. Exact approach is a design-spec decision; the tech-spec requirement is "screen readers must announce the section's heading and its content/empty-state copy".
- [ ] Never use `[innerHTML]` — the description is user/server-authored prose and the codebase's security posture (`CLAUDE.md` → "XSS Prevention") forbids bypassing Angular's default interpolation escaping for untrusted content.

### 4. Add SCSS for the new section
- [ ] Add a `.task-detail-panel__description` rule with, at minimum, `white-space: pre-wrap`, `overflow-wrap: anywhere` (so a pathologically long token cannot overflow the drawer horizontally), and `margin: 0`. Typography / colour tokens are delegated to the web-designer phase.
- [ ] Add a `.task-detail-panel__description-empty` rule that visually distinguishes the empty-state from a real description (typically a muted colour; exact token is a design-spec decision).
- [ ] Keep the existing `.task-detail-panel__section` and `.task-detail-panel__section-label` rules — they already produce the correct rhythm for a multi-section body.

### 5. Update component tests
- [ ] Add the four new test cases enumerated in [QA Guidance](#qa-guidance) under "Unit Tests (Component)".
- [ ] Run `npm run test -- --watch=false` and confirm zero **introduced** failures. Classify any failure per `CLAUDE.md` — in particular, confirm the deletion of the placeholder-badge test is deliberate and does not leave dangling references.

### 6. Build verification
- [ ] `npm run build` must succeed with no new errors or warnings.
- [ ] Manual smoke: load a board containing at least one task with non-empty `content`, open the drawer, confirm the description renders with line breaks preserved. Open a task with `content: null`, confirm the empty-state renders. Close + re-open the drawer on a different task; confirm the description updates (no stale-value bug).

---

## Performance Considerations

- `descriptionDisplay` is a `computed` on a single `Signal<BoardTask>` input — evaluation is O(content.length) for the `.trim()` check, performed only when `task` changes. With `OnPush` already in place, there is no per-frame recomputation risk.
- No `*ngFor`, no virtual scrolling, no new track-by functions needed — a single string render.
- No new bundle-size impact (no new imports, no new npm packages).

---

## Security

- User-authored `content` is rendered via Angular interpolation (`{{ ... }}`) which HTML-escapes by default — XSS-safe.
- `[innerHTML]` is explicitly forbidden for this feature. Line-break preservation is achieved via CSS (`white-space: pre-wrap`), not via `<br>` injection or sanitizer bypass.
- No new route, no new guard, no new localStorage write, no new logging call.

---

## QA Guidance

### Test Strategy

**Unit Tests (Component):** — added to `task-detail-panel.component.spec.ts`

1. **Renders the description text when `content` is non-empty.** Set `task` input to `makeTask({ content: 'Hello world.' })`, assert that a uniquely-classed description element (e.g. `.task-detail-panel__description`) is rendered and its `textContent.trim()` equals `'Hello world.'`.
2. **Preserves line breaks.** Set `task` input to `makeTask({ content: 'line 1\nline 2' })`, assert the rendered element has `white-space: pre-wrap` applied (`getComputedStyle` check — or simply assert the raw text content contains the newline character, since the template does not replace `\n` with anything). Prefer the computed-style check because it guards against a future refactor that accidentally strips the newline upstream.
3. **Renders the empty-state for `null`.** Set `task` input to `makeTask({ content: null })`, assert the empty-state element (e.g. `.task-detail-panel__description-empty`) is rendered and the non-empty description element is **not** present in the DOM.
4. **Renders the empty-state for whitespace-only content.** Set `task` input to `makeTask({ content: '   \n  ' })`, same assertion as #3. Guards the whitespace-trim branch of the normalisation rule.
5. **Placeholder badge is gone.** Assert `fixture.debugElement.query(By.css('.task-detail-panel__placeholder-badge'))` is `null`. (Replaces the deleted "renders the placeholder badge" test; documents the intentional removal.)
6. *(Regression)* **Description updates when `task` input changes to a new task.** Set `task` input to task A with one content, re-call `setInput('task', taskB)` with different content, run change detection, assert the rendered description now reflects task B — guards against the stale-value bug called out in the context doc's ACs.

**Unit Tests (Service):** None — no service changes.

**Integration / E2E:** Not required for this scope. The existing `board-page.component.spec.ts` coverage of `selectedTask` → `<app-task-detail-panel>` binding is unaffected by this change and must continue to pass unmodified.

### Mocking Instructions

No new mocks. The existing `createMockAttachmentsState()` helper and `makeTask()` fixture in `task-detail-panel.component.spec.ts` already cover everything this ticket needs; just pass a `content` value into `makeTask`.

### Edge Cases to Test

- `content: null` → empty state.
- `content: ''` → empty state.
- `content: '   '` → empty state.
- `content: 'x'` → rendered as `'x'`.
- `content: 'a\nb'` → rendered so that `a` and `b` appear on separate visual lines.
- Task switch A → B, where A has content and B is null → drawer reflects B's empty state, not A's stale text.
- Task with pathologically long single-token content (e.g. 500-char URL) → does not horizontally overflow the drawer (guarded by `overflow-wrap: anywhere`).

### Regression Guards (must continue to pass unmodified)

- Every existing `task-detail-panel.component.spec.ts` test **except** the placeholder-badge test.
- Every attachment-related AC in [#49](https://github.com/Gulybi/KanbAI-Web/issues/49), [#50](https://github.com/Gulybi/KanbAI-Web/issues/50), [#51](https://github.com/Gulybi/KanbAI-Web/issues/51), [#55](https://github.com/Gulybi/KanbAI-Web/issues/55): dropzone disabled states, upload rows, completed list, section divider, polite live region, Escape-to-close, OnPush.
- `board-page.component.spec.ts` panel-open / panel-close tests.

### Verification

- [ ] `npm run build` succeeds.
- [ ] `npm run test -- --watch=false` reports zero introduced failures.
- [ ] Manual QA of acceptance-criteria flows 1 (read non-empty), 2 (read empty), 3 (accessibility read-only) from the context doc.

---

## Open Questions / Assumptions

These were assumed in order to keep the spec tight. Flag with the PM / web-designer if any are wrong.

1. **Phase 2 is out of scope for this ticket.** The context doc recommends shipping Phase 1 now and filing Phase 2 as a follow-up pending the backend task-update endpoint. This spec adopts that recommendation. If the PM wants Phase 2 in this ticket, a backend contract must be confirmed first and this spec must be extended with an edit-mode state machine, a new `TasksApiService.updateTaskContent` method, an error-mapper analogous to `mapTaskCreateErrorToUserMessage`, optimistic rollback, and double-submit protection — none of which are designed here.
2. **Description renders above the Attachment section.** Nothing in the context doc mandates order; the context doc explicitly defers ordering to design. Placing Description first follows the natural reading order (title → description → attachments). The web-designer can override.
3. **Empty-state copy is `"No description yet."` as a placeholder.** Final copy is the web-designer's call.
4. **Section heading copy is `"Description"` as a placeholder.** Final copy is the web-designer's call.
5. **Plain-text rendering only; no markdown.** The context doc freezes this at line 156: *"Format decision is frozen as plain text by this document."* No markdown parser is introduced.
6. **Whitespace-only content treated as empty for display.** The context doc AC explicitly calls for this at the bullet covering `content is null OR an empty string OR whitespace-only`.
7. **Accessibility — the exact Tab order between the Description section heading, description body, and the Attachment section** is a design-spec decision. The tech-spec requirement is that the section is keyboard-reachable and screen-reader-announced via its heading.
8. **No new child component** for the description block. Re-evaluate if Phase 2 lands — at that point an `app-task-description` with read-mode / edit-mode internal state may earn its keep.

---

*The technical specification is saved. You can now instruct the web-designer agent to create the design specification.*

---

## Development Status

**Implementation Date:** 2026-05-07
**Developer:** Claude Opus 4.7 (1M context)

### Files Created
None.

### Files Modified
- `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts`
  - Added the `TaskDescriptionDisplay` discriminated-union type (module-scope, above the `@Component` decorator) verbatim from §State & Data Layer.
  - Added `readonly descriptionLabelId = computed(() => 'task-detail-description-' + task().id)` mirroring the existing `titleId` pattern.
  - Added `readonly descriptionDisplay: Signal<TaskDescriptionDisplay>` computed implementing the null / `''` / whitespace-only → `{ mode: 'empty' }` rule; any other string returns `{ mode: 'text', text: raw }`.
  - `ChangeDetectionStrategy.OnPush`, existing inputs/outputs, and all other existing logic preserved. No new imports beyond what was already present.
- `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.html`
  - Removed the `<span class="task-detail-panel__placeholder-badge">Placeholder</span>` element from the header.
  - Inserted a new `<section class="task-detail-panel__section" [attr.aria-labelledby]="descriptionLabelId()">` as the first child of `.task-detail-panel__body`, before the existing Attachment section. Heading copy `Description`, empty-state copy `No description yet.`, both verbatim from §3.1 of the design spec.
  - Rendering switches via `@if (descriptionDisplay().mode === 'text') { … } @else { … }` — no `*ngIf`, no `[innerHTML]`, no `<br>` injection. Line breaks preserved purely via CSS.
- `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.scss`
  - Deleted the entire `.task-detail-panel__placeholder-badge` rule block.
  - Added `.task-detail-panel__description` (14px regular, `line-height: 1.5`, `$text-primary`, `white-space: pre-wrap`, `overflow-wrap: anywhere`, `word-break: normal`, `margin: 0`) and `.task-detail-panel__description-empty` (same metrics, `$text-secondary`, `font-style: normal`) — both verbatim from §3.4 of the design spec, placed after `.task-detail-panel__section-label` and before the `// ---- Attachment section ----` comment.
  - No new `@use` directives; `colors`, `spacing`, and `typography` already imported.
- `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.spec.ts`
  - **Deliberate in-scope deletion:** removed the `renders the placeholder badge so the stub nature is visible` test case. This is not a regression — the behaviour it covered (the `Placeholder` badge in the drawer header) is being removed on purpose as part of this ticket (tech-spec Implementation Step 1 + design-spec Implementation Checklist).
  - Added a new `describe('description section (#83)', …)` block containing seven test cases covering all six QA-guidance scenarios: renders text for non-empty content, preserves line breaks via computed `white-space: pre-wrap`, renders empty-state for `null`, renders empty-state for whitespace-only, placeholder badge is gone, task-switch updates the rendered description (stale-value regression guard), and the Description heading's `id` / `aria-labelledby` accessibility wiring.

### Build & Test Results
- **Build (`npm run build`):** SUCCESS. No new errors, no new warnings — only pre-existing SCSS unary-operator deprecation warnings and pre-existing SCSS budget warnings on unrelated files (`board-page.component.scss`, `column-draft-list.component.scss`, `upload-progress-row.component.scss`) surface in the log; none of them relate to the four files this ticket touches.
- **Tests (`npm run test -- --watch=false`):** 1255 total, 1255 passed, 0 failed, 0 skipped. Zero INTRODUCED failures. Zero PRE-EXISTING failures surfaced. The deliberate deletion of the placeholder-badge test case is neither — it is an in-scope, spec-mandated removal.

### Edge Cases for QA
- `content: null`, `content: ''`, and `content: '   \n  '` all render the identical empty-state DOM shape (`.task-detail-panel__description-empty` present, `.task-detail-panel__description` absent).
- Multi-line content renders with embedded `\n` surviving the DOM round-trip and `white-space: pre-wrap` producing visible line breaks — no `<br>` injection, no markdown parsing, no sanitizer bypass.
- Pathologically long single-token content (e.g. a 500-char URL) is broken mid-token via `overflow-wrap: anywhere` rather than pushing the drawer body into horizontal scroll.
- Switching the panel from task A (with prose) to task B (with `null` content) refreshes both the rendered description and the `aria-labelledby` id — no stale-value bug.
- The Description section's `<h3>` is announced by screen readers via the drawer's heading hierarchy (`h2 title → h3 Description → h3 Attachment`) and is non-focusable; Tab order inside the drawer is unchanged (Close → dropzone → upload-row controls).

### Known Limitations
- Phase 2 (inline editing of the description) remains out of scope, as specified in §Open Questions #1 — the backend has no task-update endpoint today.
- Empty-state copy uses `$text-secondary` (4.29:1 contrast on `$bg-main`), which is 0.21 below WCAG AA 4.5:1 for body text. This is a pre-existing token-level deficit disclosed in design spec §5; fixing it is a separate design-system ticket and was deliberately not adopted here to avoid scope creep.

### Notes
- Zero new files, zero new npm dependencies, zero state-layer / service / HTTP changes. Pure view-layer fix across exactly the four files named in §Files to Modify.
- All six test scenarios from §QA Guidance are present; a seventh test was added to assert the `aria-labelledby` wiring called for by design spec §3.3 and Implementation Checklist.
