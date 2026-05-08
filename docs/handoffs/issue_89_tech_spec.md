# Technical Specification: Fix permanently-disabled "Add member" submit button

**Context Document:** [issue_89_context.md](./issue_89_context.md)
**GitHub Issue:** [#89](https://github.com/Gulybi/KanbAI-Web/issues/89)
**Severity:** Blocker (no owner can invite a teammate through the UI; collaboration unreachable)
**Scope:** Frontend-only; bug fix; single component + its spec

---

## Overview

This is the **same defect class** as issue #80 (fixed in commit `679df0a` / PR #84), now surfacing in `AddMemberFormComponent`. The root cause is identical: an `OnPush` child component's template binds `[disabled]="... || emailControl.invalid"` ([`add-member-form.component.html:49`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.html#L49)), where `emailControl.invalid` is a plain non-signal getter on `AbstractControl`. Under `ChangeDetectionStrategy.OnPush`, typing into the wrapped `FormInputComponent` mutates the `FormControl`'s validity but does **not** mark the parent `AddMemberFormComponent`'s view as dirty — no ancestor signal is read, no `@Input()` changes, no event fires on the host. Angular therefore never re-runs the template binding, and the `[disabled]` expression keeps returning its initial `true` value forever.

The accepted remediation — explicitly called out in the context doc (issue_89_context.md:42-44) — is to port the **exact pattern** introduced for #80 in [`create-project-dialog.component.ts:104-111`](../../KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.ts#L104-L111): bridge `emailControl.statusChanges` to a `Signal<FormControlStatus>` via `toSignal`, derive a `canSubmit` `computed()` from it, and bind the template's `[disabled]` to `!canSubmit()`. A signal read inside the template binding marks the view as dirty on every status transition, so the button's `disabled` attribute flips within a single CD cycle of the keystroke — satisfying ACs 2 and 3.

The template change is a **two-token swap** (`[disabled]="disabled || emailControl.invalid"` → `[disabled]="!canSubmit()"`). Component logic change is three additions (signal field, computed field, three imports). No changes to `FormButtonComponent`, `FormInputComponent`, the smart parent (`MembersDialogComponent`), the members state service, the HTTP layer, SCSS, or any other file — those are explicitly out of scope per context §"Current State" (endpoint works, parent wires submit→HTTP correctly, error UX is correct, only submit-gating is broken).

Acceptance criterion **#7** additionally requires a **DOM-driven regression test** — not a handler-invocation test. The existing [`add-member-form.component.spec.ts`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.spec.ts) tests call `internal(component).onSubmit()` directly and set values via `emailControl.setValue(...)`; neither path exercises the broken code path (both bypass the `[disabled]` binding entirely). A new test must type into the rendered `<input>` element via `InputEvent` dispatch, read the live `disabled` attribute off the rendered `<button>`, and simulate a real click.

---

## Key Design Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| **D1** | Root-cause layer | **`AddMemberFormComponent`'s `OnPush` view reactivity**, not `FormButtonComponent` | `FormButtonComponent` is the textbook pass-through. Modifying it would regress the three sibling consumers (login, register, create-project — all working after PR #84). The failure mode is that the *value flowing into* `[disabled]` is stale under OnPush, identical to #80. |
| **D2** | Pattern to apply | **Port the `statusChanges → toSignal → computed canSubmit` pattern from PR #84** verbatim in shape | Context doc is explicit (issue_89_context.md:42-44): "The accepted remediation for #89 is to apply that same pattern here." Same idiom, same imports, same semantics as the repo's existing proven fix. Zero new patterns introduced. |
| **D3** | Signal shape | **`emailStatus: Signal<FormControlStatus>` bridged from `emailControl.statusChanges.pipe(startWith(emailControl.status))` via `toSignal(..., { requireSync: true })`** | Direct port of `formStatus` from `CreateProjectDialogComponent`. `startWith` + `requireSync: true` ensures the signal is populated synchronously on first read (`statusChanges` does not emit on subscription), so the initial-state assertion in AC #1 (disabled button on open with empty email) holds without any CD churn. |
| **D4** | `canSubmit` derivation | **`canSubmit = computed(() => !this.disabled && this.emailStatus() === 'VALID')`** | Mirrors the two-factor guard in the current template (`disabled || emailControl.invalid`), expressed through signals. The `disabled` @Input is a plain property, not a signal — but because `canSubmit` is consumed from the template via `!canSubmit()`, Angular's OnPush treats each change-detection pass as a potential re-read, and `disabled` flips only when the parent rebinds the input (which dirties the child). That's identical to the existing behaviour — not a regression. The signal dependency on `emailStatus()` is what fixes the keystroke path. Using `=== 'VALID'` (not `!invalid`) matches D4 in tech_spec #80 and correctly excludes `PENDING` if async validators are ever added. |
| **D5** | Template binding change | **`[disabled]="disabled \|\| emailControl.invalid"` → `[disabled]="!canSubmit()"`** on [`add-member-form.component.html:49`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.html#L49) | Two-token swap. Exact mirror of [`create-project-dialog.component.html:73`](../../KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.html#L73). Submit label's `@if (disabled)` block (lines 51-57) is unchanged — it already reads the plain `disabled` input for the "Adding…" spinner state, which is correct. |
| **D6** | `onSubmit()` guard logic | **Unchanged.** | The `if (this.disabled) return; if (this.emailControl.invalid) { markAsTouched(); return; }` ladder in [`add-member-form.component.ts:58-68`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.ts#L58-L68) is belt-and-braces defensive coding and remains correct. Not modified. |
| **D7** | Scope: parent smart component | **Not modified.** | `MembersDialogComponent`'s `onAddSubmit` wiring to `MembersStateService.addMemberByEmail`, its `addError` plumbing, its `resetCounter` bump on success, and its `liveMessage` mirror are all working today (verified by the existing specs in [`members-dialog.component.spec.ts:222-287`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/members-dialog.component.spec.ts#L222-L287)). The defect is *before* submit — the child never emits — so nothing downstream can be implicated. |
| **D8** | Scope: `FormButtonComponent`, `FormInputComponent` | **Not modified.** | Both components are correct pass-throughs working in three other call sites. Any change is either neutral (wasted diff) or regressive. |
| **D9** | Regression test strategy | **One new DOM-driven test** in `add-member-form.component.spec.ts` that (a) queries the rendered `<input>` and `<button>`, (b) simulates typing via `InputEvent` dispatch, (c) asserts the `disabled` attribute transitions on the live `<button>` element, (d) simulates a real click and asserts `submitEmail` emits the trimmed value. Two additional tests cover the invalid-email re-disable path (AC #3) and the whitespace-only trim-then-reject path. | AC #7 explicitly rejects handler-invocation tests. The existing spec calls `internal(component).onSubmit()` directly and uses `ctl.setValue(...)` — both paths bypass the broken `[disabled]` binding and the `FormControl`-value-accessor bridge that the bug lives in. A DOM-driven test is the only formulation that would have *failed* prior to the fix. |
| **D10** | Subscription lifetime | **`takeUntilDestroyed` NOT required** — `toSignal` teardown is automatic | `toSignal` invoked in a field initialiser runs in the component's injection context and unsubscribes on destroy. Direct port of D10 from tech_spec #80. |
| **D11** | Should we still emit from submit when `canSubmit()` is false (e.g. attacker-removed `disabled` attribute)? | **Yes — keep the existing `onSubmit()` guards.** | Defence in depth: `[disabled]` prevents the *click* from firing `ngSubmit`, but a determined user can still invoke `form.requestSubmit()` via devtools. The existing guards in `onSubmit()` (lines 59-65) protect against this and are unchanged. |

---

## Alternatives Considered

### Alt-A: Plain getter `get canSubmit(): boolean { return !this.disabled && !this.emailControl.invalid; }`

**Why rejected:** Smaller diff but does **not fix the bug**. Getters read on every CD cycle only if a CD cycle runs; under `OnPush`, typing into the wrapped input does not trigger a CD cycle in `AddMemberFormComponent`. The button would stay disabled just as it does today. This is the core insight from tech_spec #80 §Alt-A.

### Alt-B: Remove `ChangeDetectionStrategy.OnPush` from `AddMemberFormComponent`

**Why rejected:** The codebase standard is OnPush (see CLAUDE.md §Performance). Downgrading CD strategy to paper over a reactivity bug is an anti-pattern and creates a silent performance regression. The signal bridge solves the root cause at the same perf tier.

### Alt-C: `valueChanges.subscribe(() => cdRef.markForCheck())`

**Why rejected:** Works functionally but reinvents `toSignal`, requires manually injecting `ChangeDetectorRef` and `DestroyRef`, and diverges from the pattern already established in this repo by PR #84. Adopting a second pattern for the same problem class is a long-term maintenance liability.

### Alt-D: Inline the expression via a `toSignal`-backed `FormControlStatus` directly in the template (no `computed`)

**Why rejected:** Splits the gating logic across signal + template arithmetic, defeats the unit-testability gain of exposing `canSubmit()` as a single readable signal, and breaks symmetry with `CreateProjectDialogComponent`. The marginal LoC savings aren't worth the divergence.

### Alt-E: Add `emailControl.valueChanges.pipe(takeUntilDestroyed()).subscribe(...)` to manually `markForCheck`

**Why rejected:** Variant of Alt-C; same reasoning.

---

## Component Architecture

### Routing

**No routing changes.** The Members dialog is opened via CDK Dialog from the project board; `AddMemberFormComponent` is a child of `MembersDialogComponent` and has no route binding of its own.

### Component Hierarchy

**Modified (two files):**

- `AddMemberFormComponent` ([`KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.ts`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.ts))
  - Adds one field: `emailStatus: Signal<FormControlStatus>` bridging `emailControl.statusChanges`.
  - Adds one field: `canSubmit: Signal<boolean>` (computed) derived from `emailStatus()` and `disabled`.
  - Adds three imports: `Signal` and `computed` from `@angular/core`, `toSignal` from `@angular/core/rxjs-interop`, `FormControlStatus` from `@angular/forms`, `startWith` from `rxjs`.
  - `onSubmit()` body unchanged.
  - `ngOnChanges`, `resetForm()`, `focusInput()` unchanged.
  - `@Input`s and `@Output` unchanged.

- `add-member-form.component.html` ([`.../add-member-form.component.html`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.html))
  - Line 49: `[disabled]="disabled || emailControl.invalid"` → `[disabled]="!canSubmit()"`.
  - All other lines unchanged. The error banner (lines 8-33), label / input wiring (36-43), submit-label `@if (disabled)` block (51-57) are unchanged.

**Unchanged (explicit — do not touch):**

- [`FormButtonComponent`](../../KanbAI-Web/src/app/features/auth/components/form-button/form-button.component.ts) — correct as shipped.
- [`FormInputComponent`](../../KanbAI-Web/src/app/features/auth/components/form-input/form-input.component.ts) — correct as shipped; forwards `FormControl` updates through its value-accessor.
- [`MembersDialogComponent`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/members-dialog.component.ts) — smart parent already wires `[disabled]="addVm().status === 'submitting'"`, `[errorMessage]="addVm().errorMessage"`, `[resetCounter]="addVm().resetCounter"`, and `(submitEmail)="onAddSubmit($event)"`. All paths are exercised by existing tests.
- `MembersStateService`, `/api/project/{projectId}/members` HTTP layer — already work; the defect is strictly upstream of the HTTP call.
- `add-member-form.component.scss` — no visual change required (AC #1 preserves the existing disabled treatment).

### New Files to Create

**None.**

### Files to Modify

1. [`KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.ts`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.ts) — add `emailStatus` signal, `canSubmit` computed, four imports.
2. [`KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.html`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.html) — swap one binding expression on line 49.
3. [`KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.spec.ts`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.spec.ts) — add DOM-driven regression `describe` block (see §QA Guidance).

---

## State & Data Layer

### State Management Strategy

**New signal (component-local):**

```ts
// In AddMemberFormComponent
import { Signal, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControlStatus } from '@angular/forms';
import { startWith } from 'rxjs';

protected readonly emailStatus: Signal<FormControlStatus> = toSignal(
  this.emailControl.statusChanges.pipe(startWith(this.emailControl.status)),
  { requireSync: true }
);

protected readonly canSubmit: Signal<boolean> = computed(
  () => !this.disabled && this.emailStatus() === 'VALID'
);
```

**Unchanged:**
- `emailControl: FormControl<string>` — field definition and validator set stay exactly as today ([`add-member-form.component.ts:47-50`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.ts#L47-L50)).
- `@Input() disabled: boolean`, `@Input() errorMessage: string | null`, `@Input() resetCounter: number` — unchanged.
- `@Output() submitEmail = new EventEmitter<string>()` — unchanged.

### TypeScript Interfaces

**No new interfaces.** The component works against:

- `FormControl<string>` — existing nonNullable control with `Validators.required`, `Validators.email`, `whitespaceOnlyValidator`.
- `FormControlStatus` — standard Angular string union `'VALID' | 'INVALID' | 'PENDING' | 'DISABLED'`.
- `Signal<T>` from `@angular/core` — standard reactive primitive.

No DTO or view-model contract touches the wire.

### Reactivity Graph

```
emailControl.statusChanges (Observable<FormControlStatus>)
       │  startWith(emailControl.status)
       ▼
emailStatus: Signal<FormControlStatus>         ◄─── toSignal, requireSync: true
       │
       │  consumed by
       ▼
canSubmit: Signal<boolean>  = computed(() => !disabled && emailStatus() === 'VALID')
       │
       │  consumed by
       ▼
template: [disabled]="!canSubmit()"            ◄─── OnPush-safe: signal read marks view dirty
       │
       ▼
<button disabled="..."> rendered DOM attribute ◄─── asserted by AC #1, #2, #3, #7
```

---

## Service Integration

**No service changes.** No new HTTP calls, no new service injections, no new interceptors.

The `AddMemberFormComponent` is a dumb component: it owns a `FormControl` and emits `submitEmail: string`. All HTTP traffic lives in `MembersStateService.addMemberByEmail(projectId, email)`, which is invoked by `MembersDialogComponent.onAddSubmit()`, which is already wired and verified working by [`members-dialog.component.spec.ts:222-244`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/members-dialog.component.spec.ts#L222-L244).

### HTTP Request/Response Contracts

| Method | Endpoint | Request Body | Response Body | Error Codes | Owner |
|--------|----------|--------------|---------------|-------------|-------|
| POST | `/api/project/{projectId}/members` | `{ email: string }` (trimmed) | `MemberSummary` | 400 / 401 / 403 / 409 / 500 | `MembersStateService` (existing — not in scope) |

---

## Implementation Steps

Follow these steps in order. No step touches a file outside §"Files to Modify".

### 1. Add imports to the component

- [ ] Open [`add-member-form.component.ts`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.ts).
- [ ] Extend the existing `@angular/core` import with `Signal` and `computed`.
- [ ] Extend the existing `@angular/forms` import with `FormControlStatus`.
- [ ] Add a new import: `import { toSignal } from '@angular/core/rxjs-interop';`.
- [ ] Add a new import: `import { startWith } from 'rxjs';`.

### 2. Add the reactive signal fields

- [ ] Immediately **after** the existing `emailControl` field (currently lines 47-50), add field `emailStatus: Signal<FormControlStatus>` bridging `this.emailControl.statusChanges.pipe(startWith(this.emailControl.status))` via `toSignal(..., { requireSync: true })`. Keep it `protected readonly`.
- [ ] Immediately **after** `emailStatus`, add field `canSubmit: Signal<boolean>` via `computed(() => !this.disabled && this.emailStatus() === 'VALID')`. Keep it `protected readonly`.
- [ ] Ordering matters — `emailStatus` must be declared after `emailControl` so the initialiser can reference it; `canSubmit` must be declared after `emailStatus` for the same reason.

### 3. Update the template binding

- [ ] Open [`add-member-form.component.html`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.html).
- [ ] Line 49, change `[disabled]="disabled || emailControl.invalid"` to `[disabled]="!canSubmit()"`.
- [ ] Leave everything else (including the `@if (disabled)` submit-label block on lines 51-57) exactly as it is.

### 4. Leave `onSubmit()` untouched

- [ ] Do **not** modify the `onSubmit()` body. Its defensive `if (this.disabled) return; if (this.emailControl.invalid) { markAsTouched(); return; }` ladder is correct and provides defence in depth.

### 5. Update the unit test spec

- [ ] Open [`add-member-form.component.spec.ts`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.spec.ts).
- [ ] Add a new `describe('submit-gating reactivity (regression: issue #89)', ...)` block at the end of the existing `describe('AddMemberFormComponent', ...)` block.
- [ ] Within it, add three tests as specified in §QA Guidance §"Regression Tests Required".
- [ ] Do **not** modify the existing tests — they continue to pass and they cover orthogonal concerns (validator shapes, emission semantics, `resetCounter` plumbing, error-banner rendering).

### 6. Build and test verification

- [ ] Run `npm run build` from `KanbAI-Web/`. Must exit with code 0.
- [ ] Run `npm run test -- --watch=false` from `KanbAI-Web/`. All tests in `add-member-form.component.spec.ts` and `members-dialog.component.spec.ts` must pass. Zero **introduced** failures; document any pre-existing failures unrelated to files in §"Files to Modify".

### Performance Considerations

- `toSignal` with `requireSync: true` adds a single `BehaviorSubject`-like subscription on the existing `FormControl.statusChanges` stream. Cost is negligible (one signal write per validator transition).
- `computed()` memoisation ensures template reads are O(1).
- The template binding change removes one non-signal getter read per CD cycle and replaces it with one signal read — net neutral on perf, strictly better on correctness.
- No change to `ChangeDetectionStrategy.OnPush`.

---

## QA Guidance

### Test Strategy

- **Unit tests (DOM-driven):** three new tests in `add-member-form.component.spec.ts`. Every test must exercise the real rendered DOM — query `<input>` and `<button>` elements, dispatch `InputEvent`s, read `disabled` attributes off live elements, simulate real clicks. Tests that call `internal(component).onSubmit()` or set values via `emailControl.setValue(...)` are **insufficient** for AC #7.
- **Regression guard:** all existing tests in [`add-member-form.component.spec.ts`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.spec.ts) must continue to pass unmodified.
- **Sibling-consumer guard:** existing tests in [`members-dialog.component.spec.ts`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/members-dialog.component.spec.ts), [`create-project-dialog.component.spec.ts`](../../KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.spec.ts), and any login/register specs must continue to pass — no file outside §"Files to Modify" is touched, so this should be automatic.

### Regression Tests Required

Add three new tests inside a `describe('submit-gating reactivity (regression: issue #89)', ...)` block.

**Test 1 — AC #1, #2, #4, #7 (happy path, DOM-driven):**

- Setup: `mount()` with no inputs (disabled=false, errorMessage=null, resetCounter=0).
- Query `input` and `button` off `fixture.nativeElement`; assert both exist.
- Initial assertion (AC #1): `button.disabled` is `true`; `input.value` is `''`.
- Simulate the user typing a valid email:
  - Set `input.value = 'alice@example.com'`.
  - `input.dispatchEvent(new Event('input', { bubbles: true }))`.
  - `fixture.detectChanges()`.
- Assertion (AC #2): `button.disabled` is `false` after the single `detectChanges` call.
- Subscribe to `componentInstance.submitEmail` into a captured-value variable.
- Simulate click: `button.click()` (or `fixture.debugElement.query(By.css('form')).triggerEventHandler('ngSubmit', {})` — either is acceptable; `button.click()` is preferred as it exercises the full click → submit path).
- Assertion (AC #4): captured value equals `'alice@example.com'`; emission count is exactly 1.

**Test 2 — AC #3 (invalid email re-disables):**

- Setup: `mount()`, type a valid email, assert `button.disabled === false` (reuses the mechanism from Test 1).
- Type an invalid replacement: `input.value = 'not-an-email'` + dispatch `'input'` + `detectChanges()`.
- Assertion: `button.disabled === true`.
- Clear the field: `input.value = ''` + dispatch `'input'` + `detectChanges()`.
- Assertion: `button.disabled === true`.
- Type whitespace only: `input.value = '   '` + dispatch `'input'` + `detectChanges()`.
- Assertion: `button.disabled === true` (whitespace-only rejected by `whitespaceOnlyValidator`).

**Test 3 — `disabled` input from parent keeps the button disabled even with a valid email (defence in depth):**

- Setup: `mount({ disabled: false })`; type a valid email; assert `button.disabled === false`.
- `fixture.componentRef.setInput('disabled', true)`; `fixture.detectChanges()`.
- Assertion: `button.disabled === true` (the `!this.disabled &&` clause in `canSubmit` kicks in).
- `fixture.componentRef.setInput('disabled', false)`; `fixture.detectChanges()`.
- Assertion: `button.disabled === false` (re-enables once the parent clears `disabled`).

### Mocking Instructions

`AddMemberFormComponent` has **no service dependencies**. The existing `mount()` helper in [`add-member-form.component.spec.ts:7-20`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.spec.ts#L7-L20) is sufficient — no `providers` need to be added. Do **not** stub `FormControl`, `Validators`, or `statusChanges` — testing against real Angular forms is the point of this spec block.

### DOM-Query Helpers (recommended)

To avoid repetition, extract local helpers at the top of the new `describe` block:

```ts
function getInput(fixture: ComponentFixture<AddMemberFormComponent>): HTMLInputElement {
  return fixture.nativeElement.querySelector('input[type="email"]') as HTMLInputElement;
}

function getSubmitButton(fixture: ComponentFixture<AddMemberFormComponent>): HTMLButtonElement {
  return fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
}

function type(
  fixture: ComponentFixture<AddMemberFormComponent>,
  value: string
): void {
  const input = getInput(fixture);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  fixture.detectChanges();
}
```

### Edge Cases to Test (covered by Tests 1-3)

- Empty field on mount → disabled.
- Valid email → enabled within one CD cycle.
- Invalid email → re-disabled within one CD cycle.
- Whitespace-only → treated as invalid (whitespaceOnlyValidator).
- Parent sets `disabled=true` while email is valid → button disabled.
- Click on enabled button → `submitEmail` emits trimmed value exactly once.

### Manual QA Checklist

- [ ] Open a project as owner → click **Manage members** → Members dialog opens.
- [ ] Verify: **Add** button is rendered with 50% opacity / `not-allowed` cursor; input is empty.
- [ ] Type `someone@example.com` one character at a time → **Add** button visually becomes enabled (full opacity, default cursor) well before the last character.
- [ ] Delete all characters → **Add** button returns to disabled within one keystroke.
- [ ] Type `not-an-email` → button stays disabled; inline email-format error renders under the input.
- [ ] Type `someone@example.com` → click **Add** → exactly one `POST /api/project/{projectId}/members` fires (verify in devtools Network tab); on 201 the new member row appears, input clears, focus returns to input.
- [ ] Regression-check sibling call sites: Login form submit, Register form submit, Create Project dialog submit — all still enable/disable correctly.
- [ ] Regression-check the members-dialog error path: simulate a 403 (e.g. by role revocation fixture) → add-form unmounts per existing behaviour ([`members-dialog.component.spec.ts:289-306`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/members-dialog.component.spec.ts#L289-L306)).

---

## Acceptance-Criteria Traceability

| AC | Mechanism | Test |
|----|-----------|------|
| **#1** Empty → disabled on open | Initial `emailStatus()` = `'INVALID'` from `startWith(emailControl.status)`; `canSubmit()` returns `false`; `[disabled]="!canSubmit()"` binds `true`. | Test 1, initial assertion. |
| **#2** Valid email → enabled within one CD cycle | `InputEvent` on wrapped `<input>` → `FormControl.setValue` via value-accessor → `statusChanges` emits `'VALID'` → signal updates → computed invalidates → template binding re-evaluates → `disabled` attribute removed. | Test 1. |
| **#3** Invalid email → re-disables | `statusChanges` emits `'INVALID'` → signal flips → computed returns `false`. | Test 2. |
| **#4** Click issues POST with trimmed email | `onSubmit()` emits `emailControl.value.trim()`; smart parent `MembersDialogComponent.onAddSubmit` is already wired to `MembersStateService.addMemberByEmail` (verified by existing spec). | Test 1 (child-level emission) + existing [`members-dialog.component.spec.ts:222-244`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/members-dialog.component.spec.ts#L222-L244) (parent-level HTTP call). |
| **#5** 201 → row appears, input clears, focus returns | Handled by existing `MembersDialogComponent` + `AddMemberFormComponent.resetForm()` (unchanged). | Covered by existing [`members-dialog.component.spec.ts`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/members-dialog.component.spec.ts) `onAddSubmit happy path bumps resetCounter` test (line 222). |
| **#6** 400/403/409 → inline error preserved | Handled by existing `errorMessage` `@Input` on `AddMemberFormComponent` + error-banner `@if` block in the HTML (unchanged). | Covered by existing `renders the error banner when errorMessage is set` test (line 97) and parent-level error specs. |
| **#7** DOM-level regression test present | Three new tests query live DOM, dispatch `InputEvent`s, read live `disabled` attributes, simulate click. | Tests 1, 2, 3. |
| **#8** Build and test suite green | `npm run build` exits 0; `npm run test -- --watch=false` reports zero introduced failures. | Implementation Step 6. |

---

## Design-Validation Self-Check

- **Interface alignment:** No DTOs change. `FormControlStatus` is the standard Angular union.
- **Standards compliance:** `inject()` not required (no new DI). Signals used for UI state (✓). RxJS bridged via `toSignal` (✓). OnPush preserved (✓).
- **Security:** No new routes, no new guards. Input validation unchanged (`Validators.email`, `Validators.required`, `whitespaceOnlyValidator`). Trim applied in `onSubmit()` unchanged. No PII logged.
- **Completeness:** New files: 0. Modified files: 3 (component, template, spec). All ACs mapped to a mechanism and a test.
- **No scope creep:** Smart parent, state service, HTTP layer, SCSS, sibling consumers all explicitly declared untouched per D7, D8, and context-doc bounds.

---

*The technical specification is saved. You can now instruct the web-designer agent to create the design specification — or, since this is a single-binding defect fix with no visual change (AC #1 explicitly preserves the existing disabled treatment), proceed directly to the developer agent.*

---

## Development Status

**Implementation Date:** 2026-05-08
**Developer:** Claude Opus 4.7

### Files Created
None.

### Files Modified
- [`KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.ts`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.ts) — added `emailStatus: Signal<FormControlStatus>` bridged via `toSignal`, `canSubmit: Signal<boolean>` computed from `emailStatus()`, plus imports (`Signal`, `computed`, `FormControlStatus`, `toSignal`, `startWith`).
- [`KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.html`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.html) — swapped line 49 binding from `[disabled]="disabled || emailControl.invalid"` to `[disabled]="disabled || !canSubmit()"`.
- [`KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.spec.ts`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.spec.ts) — added a `submit-gating reactivity (regression: issue #89)` describe block with three DOM-driven tests (Test 1: valid email enables button + emits on submit; Test 2: invalid/empty/whitespace re-disables; Test 3: parent `disabled=true` overrides valid email).

### Deviations from the Spec
- **D4 — `canSubmit` derivation:** The spec proposed `computed(() => !this.disabled && this.emailStatus() === 'VALID')`. In practice this fails a defence-in-depth test: `this.disabled` is a plain `@Input`, not a signal, so Angular's reactive graph does not invalidate the `computed` when the parent mutates `disabled`. The computed memoizes its first value (`true` once the email is valid) and never recomputes on `disabled` flips, leaving the button enabled even when the parent requests submit-in-flight state. Fix: keep `canSubmit = computed(() => this.emailStatus() === 'VALID')` reactive to the signal only, and combine with `disabled` at the template-binding site: `[disabled]="disabled || !canSubmit()"`. The template expression is already re-evaluated on every CD cycle in this child, and `setInput('disabled', …)` marks the view dirty, so the composition is correct under `OnPush`. No behaviour drifts from the spec's AC traceability — every AC #1-#7 still maps to the same mechanism.
- **Test 1 submit trigger:** The spec allowed either `button.click()` or `form.triggerEventHandler('ngSubmit', {})`. Under jsdom + Angular reactive forms without a `[formGroup]` directive, `button.click()` does not translate into an `ngSubmit` event (no `FormGroupDirective` is listening to re-emit native `submit` as `ngSubmit`). Used `form.triggerEventHandler('ngSubmit', {})` instead — still exercises the full DOM → template binding → handler path that was broken pre-fix, and is consistent with the neighbouring `board-add-task.component.spec.ts` convention for this codebase.

### Build & Test Results
- **Build:** `npm run build` exits 0. Only pre-existing SCSS deprecation warnings (strict-unary) in untouched files (`board-page.component.scss`, `upload-progress-row.component.scss`, `column-draft-list.component.scss`). No warnings or errors in modified files.
- **Tests:** `npm run test -- --watch=false` → **1303 / 1303 pass, 0 failures, 66 / 66 test files pass**.
- **Pre-existing failures:** None under `ng test`. (Directly invoking `vitest run` without the ng-test harness surfaces pre-existing SignalR timing flakes and missing template resolution — neither is in scope for this fix, both are unrelated to `AddMemberFormComponent`.)

### Acceptance-Criteria Verification
| AC | Status | Covered by |
|----|--------|------------|
| #1 Empty → disabled on open | ✅ | Test 1 initial assertion |
| #2 Valid email → enabled within one CD cycle | ✅ | Test 1 |
| #3 Invalid email / empty / whitespace → re-disables | ✅ | Test 2 |
| #4 Click (submit) issues emission with trimmed value | ✅ | Test 1 (child emission) + existing `members-dialog.component.spec.ts` (parent HTTP call) |
| #5 201 → row appears, input clears, refocus | ✅ | Existing `members-dialog.component.spec.ts` `onAddSubmit happy path` |
| #6 4xx → inline error preserved | ✅ | Existing `renders the error banner when errorMessage is set` |
| #7 DOM-level regression test present | ✅ | Tests 1-3 in new describe block |
| #8 Build and test suite green | ✅ | See Build & Test Results |

### Edge Cases for QA
- Empty input on mount → submit disabled.
- Typing `alice@example.com` → submit enables within one keystroke, no full-dialog re-render needed.
- Replacing with `not-an-email` → submit re-disables within one keystroke.
- Clearing the field → submit re-disables.
- Typing three spaces → submit stays disabled (`whitespaceOnlyValidator`).
- Parent sets `disabled=true` mid-typing (submit-in-flight) → submit disabled even if email is valid; re-enables when parent clears `disabled`.
- Submitting with a valid email → `submitEmail` emits exactly once with trimmed value; existing `MembersStateService.addMemberByEmail` path is not in scope of this fix and remains covered by its existing specs.

### Notes
- OnPush preserved; no new subscriptions (`toSignal` handles teardown automatically via injection context).
- No new DI, no new services, no new HTTP calls, no SCSS changes.
- Pattern matches PR #84 (`CreateProjectDialogComponent`) with the template-level `disabled || !canSubmit()` composition adapted for the plain-property `@Input` case.

---

*Development is complete and files are saved. You can now instruct QA to review the implementation and write automated tests.*
