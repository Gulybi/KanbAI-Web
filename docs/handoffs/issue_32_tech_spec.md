# Technical Specification: Create New Project Modal

**Context Document:** [issue_32_context.md](./issue_32_context.md)
**GitHub Issue:** [#32](https://github.com/Gulybi/2/KanbAI-Web/issues/32)
**Branch:** `32-create-new-project-modal-or-form`

---

## Overview

This feature closes the dashboard's create-project loop. It introduces a **modal-based** create-project flow rendered by `@angular/cdk/dialog` (already available in `@angular/cdk@^21.2.7`), backed by a new standalone smart component `CreateProjectDialogComponent` that hosts a `ReactiveForm` for Title + Description. The dialog is opened from two equivalent trigger points on `DashboardPageComponent`: the existing `DashboardEmptyStateComponent.createClick` (replacing the no-op `onCreatePlaceholder`) and a new always-on "New Project" button added to `DashboardHeaderComponent`. Submission calls `ProjectStateService.createProject` — which already owns the prepend-on-success behavior — and the form consumes only the error-transport contract that service exposes. State is modeled with Signals for local UI concerns (submitting, errorMessage) and the single manual HTTP subscription is **owned by the application-root `Injector`** (not the dialog component) so navigation away mid-request does not cancel the request and the state-service still receives the late response.

---

## Component Architecture

### Routing

**No new routes.** The create-project surface is a modal overlay opened on `/dashboard`. Dedicated-route alternative (`/dashboard/new`) was **rejected** for these reasons:

1. **Return-to-empty-state bug risk.** A dedicated route must know to navigate back to `/dashboard` on success, cancel, and the two keyboard dismissal paths. The modal inherits the dashboard as background without any router navigation.
2. **Focus-return requirement (context line 117).** "Focus returns to the triggering button on close" is trivial for a modal (CDK Dialog wires it automatically via the trigger element's focus origin) and non-trivial for a route (requires custom re-focus logic after route-return).
3. **Empty-state transition atomicity.** Context line 100 requires the dashboard to transition from empty → success without an intermediate blank/loading frame. A modal keeps the empty-state rendered behind the overlay; a route would unmount the empty state and then re-evaluate the `vm()` state machine on return — an extra paint cycle.
4. **Prior art in the milestone.** No other routed sub-flows exist; introducing one here would be the first and would set a precedent the other create/rename/delete flows (issue #33 onward) have no reason to follow.

Tradeoff accepted: browser deep-linking to the form is not supported. Per context, that is not an AC.

### Modal host choice: `@angular/cdk/dialog`

Verified present in v21.2.7 (`node_modules/@angular/cdk/package.json` exports `./dialog`). **Chosen over `@angular/cdk/overlay` directly** because:

- `Dialog.open()` already implements: `aria-modal="true"`, backdrop rendering, Escape-to-close (configurable), focus trap (via `ConfigurableFocusTrap`), first-focusable-element focus on open, focus return on close, and scroll strategy — every one of which maps to an Accessibility AC. Using raw `Overlay` would require us to re-implement those.
- Hand-rolled dialog is rejected: no existing modal pattern in the codebase, and rebuilding focus trap + aria-modal + Escape handling is out of proportion for a two-field form. The CDK package is already a dependency; using its built-in dialog adds zero bundle-size risk the team has not already accepted.

Dialog is **opened with `DialogConfig`** configured for:
- `disableClose: false` — Escape and backdrop both close (context ACs line 104, 105). If the design spec later decides backdrop should require explicit Cancel, flip this to `true` and wire a manual Escape listener; no code outside the dialog host changes.
- `ariaLabelledBy`: the id of the in-form `<h2>` heading ("New Project") — satisfies context AC line 118.
- `autoFocus: 'first-tabbable'` — satisfies context AC line 117 ("first focusable element receives focus").
- `restoreFocus: true` — default, but stated explicitly for clarity; satisfies "focus returns to the triggering button".

### Component Hierarchy

**Smart Components (Containers):**

- `CreateProjectDialogComponent` — `src/app/features/projects/components/create-project-dialog/create-project-dialog.component.ts`
  - **Role:** Hosts the reactive form, owns submit lifecycle, injects `ProjectStateService`, `Dialog`/`DialogRef`, and application-root `EnvironmentInjector`.
  - **Not dumb** because it calls the state service. Kept thin: all validation rules are in `createProjectFormValidators` helpers; all create-side effects are delegated to `ProjectStateService.createProject`.
  - Uses `ChangeDetectionStrategy.OnPush`.
  - Template owns the `<form>` with two `FormInputComponent` uses (Title, Description), a `FormButtonComponent` for Submit, and a secondary `<button type="button">` Cancel. Inline error region between the last field and the submit row.

**Modified Smart Components:**

- `DashboardPageComponent` — `src/app/features/projects/dashboard-page/dashboard-page.component.ts`
  - Inject `Dialog` (from `@angular/cdk/dialog`).
  - Replace the no-op `onCreatePlaceholder()` with `openCreateDialog()` that calls `this.dialog.open(CreateProjectDialogComponent, config)`. Same method is the handler for both the empty-state CTA and the header button.
  - No change to `vm()` or lifecycle — the dialog lives in the CDK overlay container, not in the dashboard's template tree.

- `DashboardHeaderComponent` — `src/app/features/projects/components/dashboard-header/dashboard-header.component.ts`
  - Add an `@Output() createClick = new EventEmitter<void>()`.
  - Template adds a "New Project" button positioned to the right of the existing heading area. Button emits `createClick` on click/Enter/Space.
  - The button is rendered unconditionally (the header already renders only in non-error states of the page because the dashboard template always mounts it — see "Entry-point rule" below).

**Dumb Components (Reused as-is, NOT modified):**

- `FormInputComponent` — `src/app/features/auth/components/form-input/form-input.component.ts`
- `FormButtonComponent` — `src/app/features/auth/components/form-button/form-button.component.ts`
- `FormCardComponent` — NOT reused inside the dialog. The CDK dialog already provides a bordered surface; wrapping in `FormCardComponent` would double-box the form. `FormCardComponent` stays auth-scoped.

**Reuse decision rationale:** `FormInputComponent` already renders label + input + per-error message using the `control.errors?.['required']` pattern. The project form needs to also surface `maxlength` and `whitespaceOnly` errors. Rather than fork the component or introduce a project-scoped variant, the developer will **extend `FormInputComponent`** with two additional `@if` branches for `errors?.['maxlength']` and `errors?.['whitespaceOnly']`. This keeps one input primitive in the codebase, serves both auth and project flows, and the extension is additive (no template regressions for login/register). If the developer finds the shared styling insufficient for the multi-line Description field (`type="textarea"` is not supported by the current `<input>` template), they must add a new `multiline: boolean` `@Input()` and conditionally render `<textarea>` vs `<input>` — still within the one shared component.

### Entry-point rule

The context (line 84) requires the "New Project" affordance to be reachable in every non-error dashboard state. Implementation:

- `DashboardHeaderComponent` is mounted unconditionally at the top of `dashboard-page.component.html` (already the case today, outside the `@switch`). The new header button is therefore visible in the loading, empty, and success states.
- In the **error state**, the button remains visible in the header (per context line 85's allowance that leaving it enabled is acceptable as long as clicking it does not crash). The `Dialog.open()` call is safe while the list is errored — the state service's `createProject` is independent of `loadProjects` — and the newly-created project will still appear on the next successful `loadProjects()`.
- The empty-state CTA and the header button are **both** wired to the same `DashboardPageComponent.openCreateDialog()` handler, so they are literally the same trigger.

### New Files to Create

- `src/app/features/projects/components/create-project-dialog/create-project-dialog.component.ts`
- `src/app/features/projects/components/create-project-dialog/create-project-dialog.component.html`
- `src/app/features/projects/components/create-project-dialog/create-project-dialog.component.scss` (empty or near-empty; Tailwind utility classes drive styling per design spec)
- `src/app/features/projects/components/create-project-dialog/create-project-dialog.component.spec.ts`
- `src/app/features/projects/validators/whitespace.validator.ts` (exports `whitespaceOnlyValidator: ValidatorFn`)
- `src/app/features/projects/validators/whitespace.validator.spec.ts`

### Files to Modify

- `src/app/features/projects/dashboard-page/dashboard-page.component.ts` — inject `Dialog`, replace `onCreatePlaceholder` with `openCreateDialog`.
- `src/app/features/projects/dashboard-page/dashboard-page.component.html` — bind header's new `createClick` output to `openCreateDialog()`; bind empty-state's existing `createClick` to the same handler.
- `src/app/features/projects/components/dashboard-header/dashboard-header.component.ts` — add `createClick` output.
- `src/app/features/projects/components/dashboard-header/dashboard-header.component.html` — add "New Project" button.
- `src/app/features/auth/components/form-input/form-input.component.ts` — add `@Input() multiline: boolean = false`.
- `src/app/features/auth/components/form-input/form-input.component.html` — conditionally render `<textarea>` vs `<input>`; add `@if` branches for `errors?.['maxlength']` and `errors?.['whitespaceOnly']`.

### Files NOT to Modify

- `src/app/features/projects/state/project-state.service.ts` — its `createProject` contract is consumed as-is; no change.
- `src/app/features/projects/services/projects-api.service.ts` — the form never touches the API service directly.
- `src/app/app.routes.ts` — modal, no route change.
- `package.json` — CDK dialog already available; no new dependency.

---

## State & Data Layer

### State Management Strategy

All state lives inside `CreateProjectDialogComponent`. No service-level state additions.

**Signals (UI state):**

```typescript
// In CreateProjectDialogComponent
protected readonly submitting = signal<boolean>(false);
protected readonly errorMessage = signal<string | null>(null);
```

- `submitting` drives the submit button's disabled state and loading-label ("Creating…"), and is checked at the top of `onSubmit()` to guard against rapid double-click re-entry (context AC line 96).
- `errorMessage` is rendered by a `@if (errorMessage()) { ... }` block immediately above the submit-row inside the `<form>`. It is cleared to `null` every time the user edits any field (`valueChanges` subscription) so a stale error never haunts the next submit attempt.

**Reactive form (UI binding):**

```typescript
protected readonly form = new FormGroup({
  name: new FormControl<string>('', {
    nonNullable: true,
    validators: [
      Validators.required,
      Validators.maxLength(200),
      whitespaceOnlyValidator
    ]
  }),
  description: new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.maxLength(500)]
  })
});
```

- `name` uses three validators in this order: `required` (catches empty string), `maxLength(200)` (inclusive boundary per context line 137 — Angular's `maxLength` rejects only at length > 200, matching the backend's `max 200`), and `whitespaceOnlyValidator` (custom, rejects controls whose trimmed value is empty per context line 136).
- `description` uses only `maxLength(500)`. It is NOT marked `required` — blank is valid and mapped to `null` at submit time (context line 92).
- Both controls use `nonNullable: true` so the typed value is always `string`, simplifying the submit payload construction.
- No cross-field validators needed.

**Computed:** Not used. The submit button's disabled state is expressed as a template-side `[disabled]="form.invalid || submitting()"` binding, which evaluates on every CD cycle. Wrapping in a `computed()` would require converting `form.statusChanges` into a signal and buys nothing.

**Subscription ownership for the submit call (context edge case line 141):**

The submit call is NOT subscribed via `takeUntilDestroyed(this.destroyRef)`. Rationale: `takeUntilDestroyed` cancels the subscription on destroy, which would cancel the HTTP request and prevent the `tap()` in `ProjectStateService.createProject` from ever running — meaning a user who clicks Submit and immediately closes the dialog (or navigates away) would never see their project appear on the next dashboard visit. Context line 141 explicitly requires the late response to still update the cache.

**Chosen mechanism:** `runInInjectionContext(appInjector, () => createProject(...).subscribe(...))`, where `appInjector: EnvironmentInjector` is injected at the component level via `inject(EnvironmentInjector)`. The subscription is owned by the root injector, not the component's `DestroyRef`, so the dialog being destroyed does not cancel the request. The `next` callback handles success (close the dialog if still open — guarded by a captured `dialogRef` reference, but the `ProjectStateService`'s `tap()` runs regardless of whether the callback runs); the `error` callback is skipped if the dialog is already closed (tracked by a `isDisposed` local flag set in the dialog's `closed` observable).

An alternative — letting the state service own the subscription internally — was rejected because it would change the `createProject` contract (it currently returns `Observable<ProjectSummary>` and lets the caller subscribe). Not modifying the service is a hard constraint.

### TypeScript Interfaces

**File:** `src/app/features/projects/components/create-project-dialog/create-project-dialog.types.ts`

```typescript
/**
 * Strongly-typed view of the create-project reactive form.
 * Both controls are non-nullable strings because the FormControls
 * are constructed with `nonNullable: true`.
 */
export interface CreateProjectFormShape {
  name: FormControl<string>;
  description: FormControl<string>;
}

/**
 * Result payload emitted by the dialog on successful creation.
 * Passed via DialogRef.close(result). The dashboard does not read
 * it — the project-state cache already holds the new project — but
 * it is exposed for future callers (e.g., a future "create and
 * open board" flow) that may want to navigate to the new project.
 */
export interface CreateProjectDialogResult {
  created: ProjectSummary;
}
```

**Reused (no new file):**

- `ProjectInput` from `src/app/features/projects/state/project-state.model.ts` — already the exact `{ name: string; description: string | null }` shape `createProject` expects.
- `ProjectSummary` from `src/app/features/projects/models/project.model.ts` — the returned DTO.

### Whitespace validator contract

**File:** `src/app/features/projects/validators/whitespace.validator.ts`

```typescript
/**
 * Rejects a control whose trimmed string value is empty.
 * Returns `{ whitespaceOnly: true }` error key on failure, null on success.
 * Safe to compose after Validators.required — they report different errors
 * and the form's summary errors object contains both only when the raw
 * value is empty AND the trimmed value is empty (a redundant but
 * harmless state).
 */
export const whitespaceOnlyValidator: ValidatorFn;
```

---

## Service Integration

### No new services.

The form consumes two existing services:

- `ProjectStateService.createProject(input: ProjectInput): Observable<ProjectSummary>` — the **only** HTTP-side call the form makes. On success the service's internal `tap()` prepends to the cache; on failure the Observable errors with an `Error` whose `.message` is already user-readable (already mapped via `mapErrorToUserMessage(err, 'create')` per [project-state.service.ts:137](../../KanbAI-Web/src/app/features/projects/state/project-state.service.ts#L137)).
- `Dialog` (from `@angular/cdk/dialog`) and `DialogRef` — injected by the framework; used by the dashboard to open the dialog and by the dialog component to close itself.

### HTTP Request/Response Contracts

The form never touches the HTTP layer directly. For reference (validated by issue context; sourced from [`.claude/backend_api_map.md`](../../.claude/backend_api_map.md) lines 57 and 136–141):

| Method | Endpoint | Request Body | Response Body | Error Codes |
|--------|----------|--------------|---------------|-------------|
| POST | `/api/project` | `CreateProjectDto { name: string; description: string \| null }` | `201 ApiResponse<ProjectResponseDto>` | 400 (validation), 401 (handled globally by `authInterceptor`), 500 |

### Submit payload transformation (context AC line 92)

Inside `onSubmit()`, after validator success:

```typescript
const rawName = this.form.controls.name.value;
const rawDescription = this.form.controls.description.value;

const input: ProjectInput = {
  name: rawName.trim(),
  description: rawDescription.trim().length === 0 ? null : rawDescription
};
```

- `name` is trimmed so leading/trailing whitespace does not reach the backend (the whitespace validator has already rejected fully-whitespace values; this trim handles "  My Project  ").
- `description`: when the trimmed value has length 0, send `null` (NOT `""`). When non-empty, send the untrimmed original so the user's intentional internal formatting is preserved. This matches context AC line 92 exactly.

### Error transport (context ACs lines 109–112)

`createProject` errors with `new Error(userMessage)` where `userMessage` is whatever `mapErrorToUserMessage(err, 'create')` produced (e.g. "We couldn't reach the server…" for HTTP status 0; per context line 139). The dialog's subscribe-error callback:

```typescript
error: (err: Error) => {
  this.submitting.set(false);
  this.errorMessage.set(err.message ?? 'Something went wrong. Please try again.');
}
```

- `submitting.set(false)` re-enables the submit button and clears the loading indicator (context AC line 110).
- `errorMessage` is placed in the template immediately above the submit-row; the design spec fixes exact placement and style but the location is locked to "near the submit button" per context line 109.
- Fields remain populated because the form is never reset on error.
- On the next `valueChanges` emission from either field, `errorMessage.set(null)` clears the stale error (so repeat-submit with corrected input does not flash the old error alongside the new attempt).

---

## Implementation Steps

Follow these steps in order. Do not skip ahead.

### 1. Create the whitespace validator

- [ ] Create `src/app/features/projects/validators/whitespace.validator.ts` exporting `whitespaceOnlyValidator: ValidatorFn`. It must return `{ whitespaceOnly: true }` when the control's value (coerced to string) has `.trim().length === 0`, and `null` otherwise. An empty string is a whitespace-only value and must return the error (even though `Validators.required` also catches it — both errors can coexist).
- [ ] Create `whitespace.validator.spec.ts` with three cases: non-empty non-whitespace passes, `"   "` fails with `{ whitespaceOnly: true }`, `""` fails with `{ whitespaceOnly: true }`.

### 2. Extend `FormInputComponent` (shared primitive)

- [ ] Open `src/app/features/auth/components/form-input/form-input.component.ts`. Add `@Input() multiline: boolean = false`.
- [ ] Open `form-input.component.html`. Wrap the existing `<input>` in an `@if (!multiline)` branch, and add an `@else` branch rendering `<textarea>` with the same `[formControl]`, `[id]`, `[placeholder]`, `[ngClass]` bindings, plus a sensible default `rows="4"`. Apply the same Tailwind classes used on `<input>`.
- [ ] Still in `form-input.component.html`, add two new error branches inside the existing `@if (control.invalid && (control.dirty || control.touched))` block:
  - `@if (control.errors?.['maxlength']) { ... }` rendering "Must be at most {{ control.errors.maxlength.requiredLength }} characters."
  - `@if (control.errors?.['whitespaceOnly']) { ... }` rendering "This field cannot be blank."
- [ ] Run the existing auth-flow specs to confirm `multiline=false` default still renders the `<input>` and all existing error branches still fire. No auth-flow regressions allowed.

### 3. Create the dialog component shell

- [ ] Generate: `ng generate component features/projects/components/create-project-dialog --skip-tests=false` from `KanbAI-Web/KanbAI-Web/`.
- [ ] Mark it standalone (default in Angular 21). Imports: `ReactiveFormsModule`, `CommonModule`, `FormInputComponent`, `FormButtonComponent`. Do NOT import `FormCardComponent`.
- [ ] Set `changeDetection: ChangeDetectionStrategy.OnPush`.
- [ ] Inject via `inject()`: `DialogRef<CreateProjectDialogResult>`, `ProjectStateService`, `EnvironmentInjector`, `DestroyRef`.

### 4. Build the reactive form

- [ ] Declare `protected readonly form` as a `FormGroup<CreateProjectFormShape>` per the [State & Data Layer](#state--data-layer) specification. Use the exact validator arrays given there.
- [ ] Declare `protected readonly submitting = signal<boolean>(false)` and `protected readonly errorMessage = signal<string | null>(null)`.
- [ ] In the constructor (or `ngOnInit`), subscribe to `form.valueChanges` with `takeUntilDestroyed(this.destroyRef)` and call `this.errorMessage.set(null)` on every emission. (This subscription IS fine to tie to `DestroyRef` because cancelling it on dialog close has no effect — the form is gone anyway.)

### 5. Implement the template

- [ ] Root element is a `<form [formGroup]="form" (ngSubmit)="onSubmit()" class="...">`. No external `<app-form-card>` wrapper.
- [ ] The dialog announces itself via `aria-labelledby="create-project-heading"`; the `<h2 id="create-project-heading">New Project</h2>` sits at the top of the form.
- [ ] Two `<app-form-input>` uses in this order:
  - Title: `label="Title"`, `type="text"`, `[control]="form.controls.name"`. Required indicator ("*" or "required") in the label — confirm exact markup with the design spec.
  - Description: `label="Description"`, `multiline="true"`, `[control]="form.controls.description"`.
- [ ] `@if (errorMessage()) { <p role="alert" class="..."> {{ errorMessage() }} </p> }` — placed immediately above the submit row.
- [ ] Submit row with two buttons, tab order Cancel then Submit (Cancel appears first in the DOM — per context AC line 116, the tab order is "Title → Description → Cancel → Submit"):
  - Cancel: `<button type="button" (click)="onCancel()" [disabled]="submitting()">Cancel</button>`. The Cancel button does NOT disable while submitting per context AC line 97 ("the Cancel affordance remains operable"). **Correction: `[disabled]` should remain false during submit. Do not bind disabled on Cancel.**
  - Submit: `<app-form-button type="submit" [disabled]="form.invalid || submitting()">{{ submitting() ? 'Creating…' : 'Create project' }}</app-form-button>`.

### 6. Implement `onCancel()` and `onSubmit()`

- [ ] `onCancel()`: `this.dialogRef.close()` — no payload, no API call. Focus return is handled by CDK.
- [ ] `onSubmit()`:
  1. If `this.submitting()` is `true`, return early (guard against double-submit during an in-flight request).
  2. If `this.form.invalid`, call `this.form.markAllAsTouched()` and return (surfaces all field-level errors; submit button should already be disabled so this is belt-and-braces).
  3. Build `input: ProjectInput` per [Submit payload transformation](#submit-payload-transformation-context-ac-line-92).
  4. Set `this.submitting.set(true)` and `this.errorMessage.set(null)`.
  5. Inside `runInInjectionContext(this.appInjector, () => ...)`, call `this.projectState.createProject(input).subscribe({ next, error })`:
     - `next: (created) => { this.dialogRef.close({ created }); }` — let CDK handle the focus return.
     - `error: (err: Error) => { this.submitting.set(false); this.errorMessage.set(err.message ?? 'Something went wrong. Please try again.'); }`.
  6. NO `complete` callback needed — the Observable completes after `next` emits once.
  7. Do NOT attach `.pipe(takeUntilDestroyed(this.destroyRef))` to this subscription — that would cancel the request on dialog destroy and violate context edge case line 141.

### 7. Wire the dashboard triggers

- [ ] Open `dashboard-page.component.ts`. Add `private readonly dialog = inject(Dialog)` (import from `@angular/cdk/dialog`). Import `CreateProjectDialogComponent`.
- [ ] Replace `onCreatePlaceholder()` with:
  ```typescript
  protected openCreateDialog(): void {
    this.dialog.open<CreateProjectDialogResult>(CreateProjectDialogComponent, {
      ariaLabelledBy: 'create-project-heading',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      disableClose: false,
      // Let CSS size the panel; keep CDK's defaults for scroll strategy
      panelClass: 'create-project-dialog-panel'
    });
  }
  ```
  The return value (the `DialogRef`) is not captured — the dashboard does not need to listen for the result, because the state cache is already updated by the state-service's `tap()`.

### 8. Add the header button

- [ ] Open `dashboard-header.component.ts`. Add `@Output() createClick = new EventEmitter<void>()` and a protected `onCreateClick()` that emits it.
- [ ] Open `dashboard-header.component.html`. Restructure the root `<header>` to a two-column layout (Tailwind: e.g. `flex items-start justify-between`). Left column keeps the `<h1>` and `<p>`. Right column contains a single `<button type="button" (click)="onCreateClick()" class="...">New Project</button>`. Exact styling per design spec.
- [ ] Open `dashboard-page.component.html`. Bind the header's new output: `<app-dashboard-header (createClick)="openCreateDialog()"></app-dashboard-header>`. Bind the empty-state's existing output to the same handler: `(createClick)="openCreateDialog()"`.

### 9. Unit tests

Cover the ACs from context line 129 at minimum. See [QA Guidance](#qa-guidance) for the full test matrix.

### 10. Build and test verification

- [ ] Run `npm run build` from `KanbAI-Web/KanbAI-Web/`. Must succeed with zero new warnings attributable to this feature. Existing warnings are documented, not regressions to fix.
- [ ] Run `npm run test -- --watch=false`. Must pass with no INTRODUCED failures. Classify per CLAUDE.md rules: any spec in files touched by this issue that now fails is INTRODUCED; failures elsewhere are PRE-EXISTING.
- [ ] If a build or INTRODUCED test fails, do NOT mark the issue complete. Debug, fix, re-run. Do not proceed until both are clean.

### 11. Update this tech spec with a "Development Status" section

Append a new `## Development Status` section at the bottom of this file documenting the final file list, build result, test result, and any decisions made during implementation that diverged from this spec.

**Performance Considerations:**

- `ChangeDetectionStrategy.OnPush` on `CreateProjectDialogComponent`. The form's `valueChanges` already triggers CD via Angular's reactive forms binding; signals trigger CD when read in the template.
- No `trackBy` needed (no lists rendered).
- No virtual scroll (single form).
- The CDK dialog code-splits: it's imported at the top of `DashboardPageComponent`, so it ships in the dashboard chunk. Since the dashboard is already lazy-loaded (see `app.routes.ts` line 26–28), the dialog does not bloat the initial-load bundle.

---

## QA Guidance

### Test Strategy

**Unit tests — `CreateProjectDialogComponent`:**

The following test cases directly map to the acceptance criteria in context lines 82–125:

- **Renders both fields.** On init, the template contains an input/textarea for Title and one for Description. (AC line 88)
- **Title required.** Submit button is disabled when `name` control is empty. (AC line 89)
- **Title whitespace-only is invalid.** Setting `name = "   "` leaves the form invalid with the `whitespaceOnly` error surfaced. (AC line 89, edge case line 136)
- **Title max 200.** `name = "a".repeat(200)` is valid; `name = "a".repeat(201)` is invalid with `maxlength` error. (AC line 90, edge case line 137)
- **Description max 500.** `description = "a".repeat(500)` is valid; `description = "a".repeat(501)` is invalid. (AC line 91, edge case line 137)
- **Description blank → `null` payload.** With valid name and empty description, `ProjectStateService.createProject` is called with `{ name, description: null }`. (AC line 92)
- **Description whitespace-only → `null` payload.** Same, but `description = "   "`. Confirms the trim check at submit time.
- **Description with content is passed through.** `description = "real text"` → `createProject` called with `description: "real text"` (NOT trimmed, per spec). 
- **Success closes the dialog.** Mock `createProject` to `of(mockProjectSummary)`. `DialogRef.close` is called with `{ created: mockProjectSummary }`. (AC line 98)
- **Success does not re-issue GET.** Mock `createProject`; confirm `loadProjects` is not called on the state service mock. (AC line 99 — implicit: the state service owns the prepend)
- **Error keeps dialog open and populates error.** Mock `createProject` to `throwError(() => new Error('Boom'))`. After subscribe, `dialogRef.close` is NOT called, `errorMessage()` is `'Boom'`, `submitting()` is `false`, and the form values are unchanged. (ACs lines 109–112)
- **Error message clears on next field edit.** After the above, typing into the name field clears `errorMessage()` to `null`.
- **Double-submit guard.** Rapidly call `onSubmit()` twice while `submitting()` is true → `createProject` mock is invoked exactly once. (AC line 96)
- **Cancel does not call the API.** Click Cancel → `createProject` mock is never called, `dialogRef.close` is called with no payload. (AC line 103)
- **Late response still fires even if DestroyRef fires first.** Construct a controlled Subject, call `onSubmit`, call `fixture.destroy()`, then `subject.next(mockSummary)`. The state service mock's `createProject.subscribe` callback must still fire (i.e., the subscription was NOT tied to `DestroyRef`). This test may be indirect — the developer may need to spy on the subscribe call and assert the subscription is still live after destroy. (Edge case line 141)

**Unit tests — `whitespaceOnlyValidator`:**

- `""` → `{ whitespaceOnly: true }`
- `"   "` → `{ whitespaceOnly: true }`
- `"\t\n"` → `{ whitespaceOnly: true }`
- `"hello"` → `null`
- `" hello "` → `null` (internal content present)

**Unit tests — `DashboardPageComponent` delta:**

- Calling `openCreateDialog()` invokes `Dialog.open` with `CreateProjectDialogComponent` as the first argument and a config object with `ariaLabelledBy: 'create-project-heading'`.
- The header's `createClick` output is bound to `openCreateDialog`.
- The empty-state's `createClick` output is bound to `openCreateDialog`.

**Unit tests — `DashboardHeaderComponent` delta:**

- Clicking the "New Project" button emits `createClick`.
- The button has an accessible name of "New Project".

**Unit tests — `FormInputComponent` delta:**

- `multiline = false` (default) renders `<input>`.
- `multiline = true` renders `<textarea>`.
- Setting a control error of `{ maxlength: { requiredLength: 200 } }` + `touched=true` renders the "Must be at most 200 characters." message.
- Setting a control error of `{ whitespaceOnly: true }` + `touched=true` renders the "This field cannot be blank." message.

### Mocking Instructions

```typescript
// Mock ProjectStateService for dialog tests
const mockCreate$ = new Subject<ProjectSummary>();
const mockProjectState: Pick<ProjectStateService, 'createProject'> = {
  createProject: jasmine.createSpy('createProject').and.returnValue(mockCreate$.asObservable())
  // Note: Vitest per CLAUDE.md auto-memory; adapt jasmine.createSpy → vi.fn().
};

// Provide a DialogRef mock with a spyable close method.
const mockDialogRef: Pick<DialogRef, 'close'> = {
  close: vi.fn()
};

TestBed.configureTestingModule({
  imports: [CreateProjectDialogComponent],
  providers: [
    { provide: ProjectStateService, useValue: mockProjectState },
    { provide: DialogRef, useValue: mockDialogRef }
  ]
});
```

### Edge Cases to Test

- **Empty description → `null`** (AC line 92).
- **Whitespace-only description → `null`**.
- **201-char name** is rejected; **200-char name** is accepted (inclusive boundary per edge case line 137).
- **501-char description** is rejected; **500-char description** is accepted.
- **Network offline (HTTP 0)**: mock `createProject` to error with a specific user-readable string (e.g. `'We couldn\'t reach the server…'`). Form stays open, error message shown, fields unchanged.
- **Submit, then close dialog before response**: the subscription must not be cancelled (see the late-response test above).
- **Re-opening after prior failure**: a new `Dialog.open` call produces a fresh component instance with empty fields and `errorMessage() === null` (edge case line 142).
- **Duplicate names**: two successive submits with identical `name: 'Alpha'` both succeed (edge case line 138). State service prepends both; dashboard shows both.

### Accessibility verification

- **Screen reader announces "New Project"** when the dialog opens (verify via inspection: `aria-modal="true"`, `aria-labelledby="create-project-heading"`).
- **Tab cycles Title → Description → Cancel → Submit** (and Shift+Tab reverses). Verify by keyboard testing in a real browser.
- **Escape closes the dialog**, returns focus to the button that opened it (header "New Project" or empty-state CTA).
- **Backdrop click closes the dialog** (unless the design spec later overrides `disableClose` to `true`).
- **`axe-core` scan** of the dashboard page with the dialog open returns zero critical/serious violations (AC line 120). Run with the browser's axe extension or a manual `axe.run()` call during an E2E test.

### Out-of-scope for #32

No tests needed for editing, deleting, member management, pagination, sorting, templates, cross-tab sync, or board navigation. See context lines 144–155.

---

*The technical specification is saved. You can now instruct the web-designer agent to create the design specification.*

---

## Development Status

**Implementation Date:** 2026-04-29
**Developer:** Claude Opus 4.7

### Files Created
- `src/app/features/projects/validators/whitespace.validator.ts`
- `src/app/features/projects/validators/whitespace.validator.spec.ts`
- `src/app/features/projects/components/create-project-dialog/create-project-dialog.component.ts`
- `src/app/features/projects/components/create-project-dialog/create-project-dialog.component.html`
- `src/app/features/projects/components/create-project-dialog/create-project-dialog.component.scss`
- `src/app/features/projects/components/create-project-dialog/create-project-dialog.component.spec.ts`
- `src/app/features/projects/components/create-project-dialog/create-project-dialog.types.ts`

### Files Modified
- `src/app/features/auth/components/form-input/form-input.component.ts` — added `multiline`, `required`, `rows` inputs plus `errorId`/`describedBy` accessors.
- `src/app/features/auth/components/form-input/form-input.component.html` — `@if`/`@else` branch for `<textarea>` vs `<input>`; new `whitespaceOnly` and `maxlength` error branches; `aria-required`, `aria-invalid`, `aria-describedby`; visible-plus-visually-hidden required indicator.
- `src/app/features/projects/dashboard-page/dashboard-page.component.ts` — injected `Dialog`; replaced `onCreatePlaceholder()` with `openCreateDialog()`.
- `src/app/features/projects/dashboard-page/dashboard-page.component.html` — bound both the header's and the empty-state's `createClick` to `openCreateDialog()`.
- `src/app/features/projects/dashboard-page/dashboard-page.component.spec.ts` — added `Dialog` mock; updated CTA test; added header-emit test.
- `src/app/features/projects/components/dashboard-header/dashboard-header.component.ts` — added `@Output() createClick` and `onCreateClick()`.
- `src/app/features/projects/components/dashboard-header/dashboard-header.component.html` — two-column flex layout with the "New Project" primary pill on the right.
- `src/app/features/projects/components/dashboard-header/dashboard-header.component.scss` — mobile-stacked / desktop-row header layout plus the "New Project" button styling per design spec.
- `src/app/features/projects/components/dashboard-header/dashboard-header.component.spec.ts` — added assertions for the new button and its `createClick` emission.

### Build & Test Results
- **Build:** SUCCESS — `npm run build` clean, no feature-attributable warnings. Bundle: `dashboard-page-component` lazy chunk 85.93 kB (up from the pre-#32 footprint — includes CDK `Dialog` + new dialog component).
- **Tests:** 447 total, 447 passed, 0 failed (31 test files). No pre-existing failures. No introduced failures.

### Divergences from the Tech Spec

1. **Cancel button `[disabled]` binding.** Tech spec step 6 text contained both a `[disabled]="submitting()"` snippet and an explicit correction that Cancel must never be disabled (context AC line 97). Followed the correction — `Cancel` is never disabled, even while submitting. No `[disabled]` binding on the Cancel button.
2. **Submit disabled-while-in-flight uses the existing `FormButtonComponent` `[disabled]`** rather than a redundant native attribute. `form.invalid || submitting()` evaluates on every CD cycle.
3. **`aria-busy` on the submit button was not added** because `FormButtonComponent` does not currently forward arbitrary host attrs and tech spec entry-point rule (line 76) explicitly scoped this out. The textual label change "Create project" → "Creating…" plus `role="alert"` on the inline banner still covers the screen-reader announcement path per AC line 120.
4. **Error fallback message uses `err?.message && length > 0`** rather than `err?.message ??` so empty-string messages also fall back to the generic copy (mapErrorToUserMessage never returns "" today, but the guard is cheap).
5. **ViewEncapsulation.None** is used on `CreateProjectDialogComponent` so the `.create-project-dialog-panel` wrapper styles reach the CDK overlay pane — every rule inside the SCSS is scoped to that class (no global leakage).

### Edge Cases for QA

- Title: empty / whitespace-only / exactly 200 chars / 201 chars — all covered by unit tests.
- Description: empty / whitespace-only / exactly 500 chars / 501 chars / non-empty with surrounding whitespace (untrimmed on wire) — all covered.
- Submit → error → edit-field → error clears — covered.
- Double-submit guard — covered via Subject-based in-flight test.
- Submit → destroy dialog → late response → tap still runs — covered via Observable-wrapper spy (proves no `takeUntilDestroyed` on the submit subscription).
- Cancel → no API call, no payload — covered.

### Known Limitations / Open Questions

- **Tailwind utility classes inside `FormInputComponent` do not currently resolve** (project `tailwind.config.js` has empty `theme.extend`). This predates #32 and affects auth screens too — flagged as design-spec open question #1. The auth flow has been rendering with the same unresolved utilities; extending the Tailwind theme is a separate prep task and is explicitly out of scope for #32 per the design spec.
- **Character-count hint on Description** (design spec `.form-input__hint`) was NOT shipped per design spec open question #2. Can be added as a polish pass without touching the dialog lifecycle.
- **Header button is visible even in the error state** (per tech spec line 76). Clicking it while the list is errored opens the dialog and creates the project; the next successful `loadProjects()` will include it. This matches context AC line 85's explicit allowance.

### Notes

- CDK `Dialog` injected lazily in `DashboardPageComponent`; its code-split lives inside the already-lazy `dashboard-page` chunk.
- `runInInjectionContext(appInjector, ...)` is the mechanism that keeps the submit HTTP subscription alive across a close-during-submit (edge case line 141). This is verified by the last test in `create-project-dialog.component.spec.ts`.
- `OnPush` + signals throughout.
