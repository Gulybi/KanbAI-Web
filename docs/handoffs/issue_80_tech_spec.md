# Technical Specification: Fix permanently-disabled "Create project" submit button

**Context Document:** [issue_80_context.md](./issue_80_context.md)
**GitHub Issue:** [#80](https://github.com/Gulybi/KanbAI-Web/issues/80)
**Severity:** Blocker (no project can be created through the UI)
**Scope:** Frontend-only; bug fix; single call site

---

## Overview

The defect is **not** the stray-`[disabled]`-binding theory in the issue body. Removing `[disabled]="disabled"` from [`form-button.component.html:3`](../../KanbAI-Web/src/app/features/auth/components/form-button/form-button.component.html#L3) would regress all four `FormButtonComponent` consumers (login, register, add-member, create-project), because that binding is the mechanism by which every consumer drives its button's disabled state. The login and register dialogs are *demonstrably working* today, which proves the binding is correct.

The real defect is in [`create-project-dialog.component.ts:101-103`](../../KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.ts#L101-L103):

```ts
protected readonly canSubmit = computed(
  () => !this.submitting() && !this.form.invalid
);
```

`this.submitting()` is a signal read (tracked). `this.form.invalid` is a **plain getter on `AbstractControl`** — it is not a signal, so the `computed` never registers it as a dependency. After the first evaluation (form starts `INVALID`, submitting starts `false` → `canSubmit()` returns `false` and memoizes), nothing re-invalidates the computed when the form flips to `VALID`. The template re-reads `canSubmit()` on every change-detection cycle but keeps getting the stale memoized `false`. Result: the button stays disabled forever, exactly as the user reports.

The login / register / add-member dialogs do not exhibit this bug because they inline `form.invalid` **directly in the template** ([`login-page.component.html:38-43`](../../KanbAI-Web/src/app/features/auth/login-page/login-page.component.html#L38-L43)). Template bindings are re-evaluated on every CD cycle, so the fresh `form.invalid` value is read each time — there is no memoization trap.

**Fix:** Make `CreateProjectDialogComponent` observe form validity through a signal, so the `computed` is correctly invalidated when validity changes. Use `toSignal(form.statusChanges)` — the codebase already uses `toSignal` (see [`base-state.service.ts`](../../KanbAI-Web/src/app/core/state/base-state.service.ts) and [`column-draft-list.component.ts`](../../KanbAI-Web/src/app/features/projects/components/column-draft-list/column-draft-list.component.ts)), so this introduces no new patterns.

`FormButtonComponent` is **not** modified. All four consumers are audited for regressions but no other call site requires changes.

---

## Key Design Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| **D1** | Where is the defect? | **`CreateProjectDialogComponent.canSubmit`'s reactivity model** — not `FormButtonComponent` | The reporter's "stray `[disabled]` binding" hypothesis is falsifiable: removing it breaks login/register/add-member, which are confirmed working. The true root cause is a non-signal property (`form.invalid`) read inside `computed()`, producing a computed that never invalidates when validity flips. Login/register use inline template binding (no computed wrapper) and are therefore unaffected. |
| **D2** | Fix locus | **Localised to `CreateProjectDialogComponent`** | Narrowest diff that satisfies the ACs. `FormButtonComponent` is shared by four consumers; modifying it carries regression risk with no upside (the component is working correctly — it forwards the `disabled` input, nothing more). Context §"Fix locus is a staff-engineer decision" explicitly permits either layer; we choose the one that only touches the one file that is broken. |
| **D3** | How to make form validity reactive | **Bridge `form.statusChanges` to a signal via `toSignal`** | Three alternatives were considered — see §Alternatives Considered. `toSignal` on `form.statusChanges` with `requireSync: true` (seeded from `form.status`) keeps `canSubmit` as a signal-based `computed`, plays nicely with `ChangeDetectionStrategy.OnPush`, matches the codebase's existing reactive idioms, and correctly handles `PENDING` (async validators) vs. `INVALID` vs. `VALID`. |
| **D4** | Scope of the form-status signal | **`formStatus` signal holds the raw `FormControlStatus` string** (`'VALID' \| 'INVALID' \| 'PENDING' \| 'DISABLED'`) | Lets `canSubmit` be explicit: `formStatus() === 'VALID'` is less ambiguous than `!invalid`, correctly treats `PENDING` as not-submittable (matches current behaviour — `form.invalid` returns false for pending), and survives future introduction of async validators. |
| **D5** | Type contract of `canSubmit` | **Stays `protected readonly canSubmit: Signal<boolean>` (computed)** | No template change required; `[disabled]="!canSubmit()"` in [`create-project-dialog.component.html:73`](../../KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.html#L73) continues to work unchanged. Minimises diff; no SCSS / no markup / no consumer changes. |
| **D6** | `FormButtonComponent` changes | **None** | The component is correct as shipped. `@Input() disabled: boolean = false` → forwarded as `[disabled]="disabled"` to the native `<button>` is the textbook pattern. Modifying it would either (a) break login/register/add-member or (b) require a wider refactor (signal inputs, renaming the input) that context §"Out of scope → Refactoring FormButtonComponent for reasons unrelated to the bug" explicitly forbids. |
| **D7** | Regression test strategy | **Two new tests in `create-project-dialog.component.spec.ts`**: (1) after mounting, setting a valid `name` value flips `canSubmit()` to `true` within the component's CD cycle; (2) clicking submit on a valid form invokes `ProjectCreationService.createProjectWithColumns` exactly once | Context §"Test coverage" ACs require both. The naive revert (putting `form.invalid` back inside `computed` without the signal bridge) must fail test (1). Test (2) is the end-to-end "user can actually create a project" guard. |
| **D8** | Regression-test scope on `FormButtonComponent` | **No new tests; manual verification only** | The component is unchanged; no new tests are warranted. The three sibling consumers (login, register, add-member) are verified by existing tests (if present) + manual QA checklist in §QA Guidance. |
| **D9** | Initial form-status emission | **Seed with `form.status` via `toSignal(stream, { requireSync: true })`** where `stream = form.statusChanges.pipe(startWith(form.status))` | `form.statusChanges` does **not** emit on subscription — only on *changes*. Without a synchronous seed, `formStatus()` would be `undefined` on first read and `canSubmit()` would return `false` even after the form becomes valid if no status *change* occurred (e.g., form starts INVALID, stays INVALID briefly, then flips to VALID — that's fine; but first-read semantics matter for tests and for `OnPush`). `startWith(form.status)` + `requireSync: true` makes the signal always-populated from construction. |
| **D10** | Subscription lifetime | **`takeUntilDestroyed(destroyRef)` is NOT required** — `toSignal` handles teardown automatically | `toSignal` is called in the **field initialiser** (constructor-equivalent injection context) and subscribes internally; Angular unsubscribes when the component is destroyed. This is the documented contract (see Angular docs on `toSignal`). Adding `takeUntilDestroyed` would be redundant. |
| **D11** | Injection context for `toSignal` | **Move `form` construction and the `formStatus` signal into `constructor` OR use field initialiser with explicit `Injector` passed in** | `toSignal` requires an injection context. The current code initialises `form` as a field initialiser (which runs inside the constructor's injection context, so `toSignal` works there). We keep the field-initialiser pattern and add `formStatus` as a second field initialiser below `form`. |

---

## Alternatives Considered

### Alt-A: Replace `computed` with a plain getter

```ts
protected get canSubmit(): boolean {
  return !this.submitting() && !this.form.invalid;
}
```

**Why rejected:** Works, and is the smallest possible diff. But it sacrifices the signal-based programming model the codebase has been migrating toward, and callers that do `effect(() => canSubmit())` (if any are added later) would lose reactivity for the same reason the original `computed` did. It also breaks the pattern seen in [`column-draft-list.component.ts`](../../KanbAI-Web/src/app/features/projects/components/column-draft-list/column-draft-list.component.ts) where `toSignal` is used to bridge `AbstractControl` to signals. Chose D3 instead for consistency.

### Alt-B: Remove `[disabled]="disabled"` from `FormButtonComponent`, let consumers handle disabling with `host` bindings / separate logic

**Why rejected:** This is the reporter's proposed fix and it is **wrong**. Every consumer depends on exactly that input-forwarding behaviour — login, register, and add-member would all stop disabling their submit buttons on invalid forms. The bug is not that the binding exists; the bug is that the value flowing into it (`!canSubmit()`) is stale.

### Alt-C: Inline the expression in the template — `[disabled]="submitting() || form.invalid"`

**Why rejected:** Also works (template bindings are re-evaluated every CD cycle, so `form.invalid` is read fresh). But it splits the submit-gating logic between the component and the template, making it harder to unit-test (the test must render the template and inspect the DOM rather than read a single `canSubmit()` signal). D3's `toSignal` bridge keeps the logic testable as pure signal arithmetic.

### Alt-D: Use `effect()` to sync `form.statusChanges` into a manually-written `WritableSignal`

```ts
protected readonly formStatus = signal<FormControlStatus>('VALID');
constructor() {
  this.form.statusChanges.pipe(takeUntilDestroyed()).subscribe(s => this.formStatus.set(s));
}
```

**Why rejected:** Reinvents `toSignal`. More code, more ways to get the initial-value seeding wrong, no benefit.

---

## Component Architecture

### Routing
**No routing changes.** The dialog is opened via `CDK Dialog` from the dashboard; routes are untouched.

### Component Hierarchy

**Modified (one file):**
- `CreateProjectDialogComponent` ([`KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.ts`](../../KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.ts))
  - Adds one new field `formStatus: Signal<FormControlStatus>` bridging `form.statusChanges`.
  - Modifies one existing field `canSubmit`: the computed body is changed to read `formStatus()` instead of `this.form.invalid`.
  - Adds two imports: `toSignal` from `@angular/core/rxjs-interop`, `FormControlStatus` from `@angular/forms`, `startWith` from `rxjs/operators`.

**Unchanged (explicit — do not touch):**
- [`FormButtonComponent`](../../KanbAI-Web/src/app/features/auth/components/form-button/form-button.component.ts) — no changes. `@Input() disabled` stays. Template `[disabled]="disabled"` stays.
- [`create-project-dialog.component.html`](../../KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.html) — no changes. `[disabled]="!canSubmit()"` on line 73 continues to work (the signal it reads is now correct).
- [`create-project-dialog.component.scss`](../../KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.scss) — no changes (styling is correct; design spec is not required for this fix).
- All four consumers of `FormButtonComponent` — **verified unaffected** because `FormButtonComponent` is unchanged.

### New Files to Create
**None.** This is a one-file code change plus test additions.

### Files to Modify
1. [`KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.ts`](../../KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.ts) — apply the `toSignal` bridge (see §Implementation Steps).
2. [`KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.spec.ts`](../../KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.spec.ts) — add two regression tests (see §QA Guidance).

---

## State & Data Layer

### State Management Strategy

**New signal (component-local):**
```ts
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';
import { FormControlStatus } from '@angular/forms';

protected readonly formStatus: Signal<FormControlStatus> = toSignal(
  this.form.statusChanges.pipe(startWith(this.form.status)),
  { requireSync: true }
);
```

**Modified computed:**
```ts
protected readonly canSubmit = computed(
  () => !this.submitting() && this.formStatus() === 'VALID'
);
```

**Why `=== 'VALID'` rather than `!== 'INVALID'`:**
- `FormControlStatus` values: `'VALID' | 'INVALID' | 'PENDING' | 'DISABLED'`.
- Current behaviour (via `!form.invalid`) would allow submit when status is `'PENDING'` or `'DISABLED'` — accidents of history, not intentional. The dialog has no async validators today so `'PENDING'` never occurs; `'DISABLED'` is unreachable because we never call `form.disable()`. But `=== 'VALID'` is explicit and future-proof.
- If any AC evidence were to surface that the legacy `!form.invalid` semantics are load-bearing, switching to `formStatus() !== 'INVALID'` is a one-word change — but there is no such evidence in the context doc.

### TypeScript Interfaces
**No new interfaces.** `FormControlStatus` is an existing `@angular/forms` string-union type.

---

## Service Integration

**No service changes.** `ProjectCreationService`, `ProjectStateService`, and all HTTP contracts are untouched. The dialog's existing `onSubmit()` → `createProjectWithColumns(...)` pipeline already works correctly once the click can reach it.

---

## Implementation Steps

Follow these in order. Each step is a small, reviewable change.

### 1. Modify `create-project-dialog.component.ts`

- [ ] Open [`KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.ts`](../../KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.ts).
- [ ] **Add imports** at the top:
  - From `@angular/core/rxjs-interop`: `toSignal`
  - From `@angular/forms`: add `FormControlStatus` to the existing named-import line (alongside `FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators`)
  - From `rxjs`: `startWith`
  - From `@angular/core`: add `Signal` to the existing named-import line (alongside `ChangeDetectionStrategy, Component, ...`)
- [ ] **Insert a new field** immediately after the `form` field initialiser (after the closing `});` of the `FormGroup` — currently line 99) and **before** `canSubmit`:
  ```ts
  protected readonly formStatus: Signal<FormControlStatus> = toSignal(
    this.form.statusChanges.pipe(startWith(this.form.status)),
    { requireSync: true }
  );
  ```
  Rationale: must come *after* `form` is constructed (field-init ordering) and *before* `canSubmit` (which will read it).
- [ ] **Modify the `canSubmit` computed body** (currently lines 101–103) from:
  ```ts
  protected readonly canSubmit = computed(
    () => !this.submitting() && !this.form.invalid
  );
  ```
  to:
  ```ts
  protected readonly canSubmit = computed(
    () => !this.submitting() && this.formStatus() === 'VALID'
  );
  ```
- [ ] **Do NOT modify** `onSubmit`, `onCancel`, `buildColumnsArray`, `ngOnInit`, or any other method. They are correct.
- [ ] **Do NOT modify** the HTML template. `[disabled]="!canSubmit()"` is correct.

### 2. Verify no template or SCSS changes are needed

- [ ] `create-project-dialog.component.html` — verify unchanged.
- [ ] `create-project-dialog.component.scss` — verify unchanged.
- [ ] `form-button.component.html` — verify unchanged (the reporter's suggested "stray binding" removal is **rejected**).
- [ ] `form-button.component.ts` — verify unchanged.

### 3. Add regression tests in `create-project-dialog.component.spec.ts`

- [ ] Open [`KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.spec.ts`](../../KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.spec.ts).
- [ ] Add a new `describe('submit-gating reactivity (regression: issue #80)', …)` block containing:
  - **Test 1** — `canSubmit flips to true when a valid name is set after mount`:
    - Mount the component with defaults (three default columns, empty name).
    - Assert `component['canSubmit']()` is `false` (form invalid because `name` is required).
    - Set `component['form'].controls.name.setValue('Website Redesign');`
    - Call `fixture.detectChanges()`.
    - Assert `component['canSubmit']()` is `true`.
    - **This is the exact scenario that fails without the fix.**
  - **Test 2** — `clicking submit on a valid form invokes ProjectCreationService.createProjectWithColumns exactly once`:
    - Mount with a `createProjectWithColumnsImpl` spy returning `of(success)`.
    - Set a valid title.
    - `fixture.detectChanges()`.
    - Query the rendered submit button (`fixture.nativeElement.querySelector('.create-project-dialog__submit button')` or equivalent) — assert its `disabled` attribute is **absent or false**.
    - Trigger `form` submission (either dispatch a `submit` event on the form element, or call `component['onSubmit']()` directly — the latter is acceptable per existing test-file idioms).
    - Assert `projectCreation.createProjectWithColumns` was called exactly once with the trimmed title.
- [ ] **Do NOT** remove or modify existing tests. Pre-existing behaviour must continue to pass.

### 4. Build and test verification

- [ ] Run `npm run build` from the nested `KanbAI-Web/KanbAI-Web/` directory (per memory [repo_layout.md](../../../C:/Users/dgulyban/.claude/projects/c--temp-KanbAI-Web/memory/repo_layout.md)). Must succeed with no new errors or warnings.
- [ ] Run `npm run test -- --watch=false`. Report results classified as PRE-EXISTING vs. INTRODUCED per CLAUDE.md §Failure Classification. Any INTRODUCED failures must be fixed before marking the work complete.

### 5. Manual QA

Follow the §QA Guidance checklist in a real browser before reporting complete.

**Performance / architecture notes:**
- No change to `ChangeDetectionStrategy.OnPush`.
- No change to `ViewEncapsulation.None`.
- No new HTTP requests, no new subscriptions beyond the one `toSignal` manages automatically.
- Bundle impact: ~0 bytes (reuses already-imported modules; `toSignal` is tree-shaken per-component).

---

## QA Guidance

### Test Strategy

**Unit Tests (Component):**
Two new tests in `create-project-dialog.component.spec.ts` (see §Implementation Steps → Step 3). Both must pass with the fix and fail on a naive revert.

**Unit Tests (Service):**
None needed — no services modified.

**Integration / end-to-end:**
Manual browser QA (§Manual Verification Checklist below) — the defect is a reactivity-model bug whose only user-observable artefact is the disabled attribute on a rendered DOM node. A full-dialog integration test is nice-to-have but not required given the unit tests cover the core assertion.

### Mocking Instructions

Existing `mount()` helper in [`create-project-dialog.component.spec.ts:48-80`](../../KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.spec.ts#L48-L80) is sufficient. No new mocks needed.

### Edge Cases to Test (manual + unit where reasonable)

From context doc §Acceptance Criteria — each is QA-testable:

1. **Happy path:** Open dialog, type "Website Redesign" → button enables; click → project is created, dialog closes.
2. **Whitespace-only title:** Type `"   "` → button stays disabled (verifies `whitespaceOnlyValidator` propagates).
3. **Long title:** Type 201 chars → button stays disabled (verifies `Validators.maxLength(200)` propagates).
4. **Empty columns:** Remove all three default columns → button stays disabled (verifies `minColumnsValidator` propagates).
5. **Duplicate columns:** Rename second column to "To Do" → button stays disabled (verifies `duplicateColumnNamesValidator` propagates).
6. **Correction re-enables:** Fix any of 2–5 → button flips to enabled within the next CD cycle.
7. **In-flight:** Click Create on valid form → button disables immediately, label flips to "Creating project…".
8. **Error then retry:** Mock service to throw → error banner renders, button re-enables, second click retries.
9. **Second open:** Close dialog (Cancel), reopen, submit — works identically.
10. **Rapid double-click:** Click submit twice in quick succession → only one HTTP request (existing `if (this.submitting()) return;` guard in `onSubmit` protects this).

### Manual Verification Checklist (browser)

Run the app, log in, navigate to the dashboard. For each consumer of `FormButtonComponent`, confirm no regression:

- [ ] **create-project dialog (the site of the fix):**
  - Open dialog with empty title → Create button disabled.
  - Type valid title → Create button enables within the render cycle.
  - Clear title → Create button disables again.
  - Type valid title, click Create → project is created, dialog closes, new card appears on dashboard.
- [ ] **login page** ([`login-page.component.html:38-43`](../../KanbAI-Web/src/app/features/auth/login-page/login-page.component.html#L38-L43)):
  - Open login. Submit disabled with empty fields.
  - Type valid email + password → Submit enables.
  - Clear email → Submit disables.
- [ ] **register page** ([`register-page.component.html:47-52`](../../KanbAI-Web/src/app/features/auth/register-page/register-page.component.html#L47-L52)):
  - Open register. Submit disabled with empty fields.
  - Fill all required fields validly → Submit enables.
  - Invalidate any field → Submit disables.
- [ ] **add-member form** ([`add-member-form.component.html:46-58`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.html#L46-L58)):
  - Open a project's members dialog. Submit disabled with empty email.
  - Type invalid email (e.g. `"foo"`) → Submit stays disabled.
  - Type valid email → Submit enables.

If any of the three non-create-project forms regresses, stop — the fix has leaked beyond its scope and must be reconsidered.

---

## Design Validation (Self-Check)

**Interface alignment:**
- [x] `FormControlStatus` is the canonical `@angular/forms` union; no custom type introduced.
- [x] `Signal<FormControlStatus>` properly typed; no `any`.
- [x] `toSignal`'s `{ requireSync: true }` option is correctly used because `startWith` makes the source synchronous on subscription.

**Standards compliance (per CLAUDE.md):**
- [x] Using `inject()` (unchanged — already present).
- [x] Using Signals for UI state (`formStatus`, `canSubmit`, `submitting`, `errorMessage`, `creationPhase`, `partialFailureNames`).
- [x] Using RxJS for async operations (`form.statusChanges`) and bridging via `toSignal` (matches CLAUDE.md §State Management → "Bridge: Use toSignal() to convert Observables to Signals").
- [x] `ChangeDetectionStrategy.OnPush` preserved.
- [x] Minimal diff; no invented features (YAGNI).

**Security:**
- [x] No new user input paths; existing validators unchanged.
- [x] No new HTTP endpoints; no new `[innerHTML]` or DOM manipulation.
- [x] No PII / secrets touched.

**Completeness:**
- [x] One file to modify + one test file to extend — both listed above.
- [x] All context-doc ACs mapped to a verification step.
- [x] Out-of-scope items (FormButtonComponent refactor, backend changes, SCSS / design, other consumers' logic) explicitly excluded.

---

## Out of Scope (per context doc, restated here for the developer)

- ❌ Modifying `FormButtonComponent` (template, class, SCSS).
- ❌ Modifying `create-project-dialog.component.html` or `.scss`.
- ❌ Modifying the other three `FormButtonComponent` consumers.
- ❌ Modifying `ProjectCreationService`, `ProjectStateService`, or any backend / API code.
- ❌ Changing validators (`whitespaceOnlyValidator`, `minColumnsValidator`, `duplicateColumnNamesValidator`, `Validators.maxLength`).
- ❌ Adding UX affordances (tooltips, helper text explaining why the button is disabled).
- ❌ Codebase-wide refactor of `computed()` usages.

---

*The technical specification is saved. The scope is narrow enough that a web-designer phase is not required (no new UI, no style changes). You can now instruct the developer agent to implement the feature using this tech spec directly.*

---

## Development Status

**Implemented:** 2026-05-07

### Files Touched

1. `KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.ts`
   - Added imports: `Signal` (from `@angular/core`), `FormControlStatus` (from `@angular/forms`), `toSignal` (from `@angular/core/rxjs-interop`), `startWith` (from `rxjs`).
   - Added `protected readonly formStatus: Signal<FormControlStatus>` field after the `form` field initialiser, bridging `form.statusChanges` (seeded via `startWith(form.status)`) to a signal with `{ requireSync: true }`.
   - Changed the `canSubmit` computed body from `!this.submitting() && !this.form.invalid` to `!this.submitting() && this.formStatus() === 'VALID'`.
   - No other methods or fields modified.

2. `KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.spec.ts`
   - Added `canSubmit: () => boolean` to the `InternalDialog` helper interface so the new tests can assert on the signal.
   - Added new `describe('submit-gating reactivity (regression: issue #80)', …)` block containing:
     - Test 1: `flips canSubmit to true when a valid name is set after mount` — asserts `canSubmit()` transitions from `false` to `true` after a valid name is entered and change detection runs. This is the exact failure mode from issue #80 and fails on a naive revert.
     - Test 2: `invokes ProjectCreationService.createProjectWithColumns exactly once when submitting a valid form` — asserts the end-to-end "user can actually create a project" path: `canSubmit()` is `true`, `onSubmit()` invokes the service once with the trimmed title.
   - No existing tests removed or modified.

**Files NOT touched** (per tech spec §Out of Scope):
- `create-project-dialog.component.html`, `create-project-dialog.component.scss`
- `FormButtonComponent` and any other `FormButtonComponent` consumer
- All services, validators, and backend code

### Build Result

- `npm run build` (from `KanbAI-Web/KanbAI-Web/`): **SUCCESS**.
- Only pre-existing warnings (Sass `strict-unary` deprecation in `board-page.component.scss`, SCSS budget exceeded in three unrelated component stylesheets). No new warnings or errors introduced.

### Test Result

- Command: `npm run test -- --watch=false` (from `KanbAI-Web/KanbAI-Web/`).
- Total: **1249 tests** across **66 test files**.
- **Passed: 1232**
- **Failed: 17** (all PRE-EXISTING)
- **Skipped: 0**

**Failure classification:**
- All 17 failures are in `src/app/core/services/signalr.service.spec.ts` — a file not touched by this fix and last modified in commits `41923af` and `2f3b4de` (SignalR integration). The failures are unrelated to `CreateProjectDialogComponent`, `FormButtonComponent`, `ProjectCreationService`, or any form-validity logic. They are classified as **PRE-EXISTING** per CLAUDE.md §Failure Classification.
- **INTRODUCED: 0**.
- `create-project-dialog.component.spec.ts`: all tests pass, including the two new regression tests for issue #80.

### Deviations from Spec

**None.** The implementation matches the tech spec exactly:
- Signal bridge via `toSignal(form.statusChanges.pipe(startWith(form.status)), { requireSync: true })` — as per §Implementation Steps.
- `canSubmit` body changed to `formStatus() === 'VALID'` — as per D4.
- Only the one component file and its sibling spec file modified — as per §Files to Modify.
- `FormButtonComponent`, template, and SCSS untouched — as per §Out of Scope.

### Next Steps

- Manual QA per tech spec §Manual Verification Checklist in a real browser (happy path + whitespace / long-title / empty-columns / duplicate-columns / correction-re-enables / in-flight / error-retry / second-open / rapid-double-click scenarios from §Edge Cases).
- Verify the three sibling `FormButtonComponent` consumers (login, register, add-member) remain unaffected.
- No commit or PR has been created per the developer handoff contract; the user is expected to review the diff before committing.
