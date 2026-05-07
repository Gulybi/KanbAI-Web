# Technical Specification: Add "New Column" from Board View (#77)

**Context Document:** [issue_77_context.md](./issue_77_context.md)
**GitHub Issue:** [#77](https://github.com/Gulybi/KanbAI-Web/issues/77)
**Depends on:** #70 (column-create pipeline + validators), #46 (`BoardStateService.onColumnCreated` reconcile), #47 (board page + `cdkDropListGroup`).

---

## Overview

Extend the existing `BoardPageComponent` to host a board-scope column-create flow. Introduce **one** new presentational component — `BoardAddColumnComponent` — that owns a single-field reactive form (`name` control) with the same validators as `ColumnDraftListComponent` (required / whitespace / max-100 / case-insensitive-trim duplicate). `BoardPageComponent` orchestrates two rendering surfaces (empty-state panel when `columns().length === 0 && columnLoadError() === null`; trailing "+ Add column" affordance when `columns().length > 0`), drives open/close state via a local signal, invokes the existing `ColumnsApiService.createColumn`, and routes the returned DTO into a **new public** `BoardStateService.applyCreatedColumn` reconciler (mirror of the private `onColumnCreated`) so HTTP-success and SignalR-echo share the same id-dedupe path. No changes to existing task-move, drag-drop, or load-error branches. No new npm packages. Backend contracts already exist.

---

## Component Architecture

### Routing

**No new routes.** The feature is hosted inside the existing `/board/:projectId` route served by [`BoardPageComponent`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts). The existing auth guard chain on the parent route stays in place.

### Component Hierarchy

**Smart Components (Containers):**
- `BoardPageComponent` (existing) — [`src/app/features/board/board-page/board-page.component.ts`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts)
  - **New responsibilities:**
    - Owns `addColumnMode: WritableSignal<'closed' | 'open'>`, `createColumnSubmitting: WritableSignal<boolean>`, `createColumnError: WritableSignal<string | null>`
    - Renders the empty-state panel OR the trailing "+ Add column" affordance based on `columns().length`
    - Handles `openAddColumnFlow()`, `handleAddColumnSubmit(name: string)`, `handleAddColumnCancel()`
    - Manages post-submit focus via `@ViewChild` refs to the trigger buttons

**Dumb Components (Presentational):**
- `BoardAddColumnComponent` (**new**) — [`src/app/features/board/components/board-add-column/board-add-column.component.ts`](../../KanbAI-Web/src/app/features/board/components/board-add-column/board-add-column.component.ts)
  - **Inputs:**
    - `existingColumnNames: InputSignal<readonly string[]>` — used by the duplicate validator; parent passes `columns().map(c => c.name)`
    - `submitting: InputSignal<boolean>` — disables the form + shows "Adding…" pending state; mirrors `BoardPageComponent.createColumnSubmitting()`
    - `submitError: InputSignal<string | null>` — inline error copy surfaced below the input, driven by parent's `createColumnError()`
  - **Outputs:**
    - `submitted = output<string>()` — emits the **trimmed** validated name; parent performs the HTTP call
    - `cancelled = output<void>()` — emits on Escape / cancel button / form reset; parent closes the surface
  - Owns its own `FormControl<string>` with `[Validators.required, Validators.maxLength(100), whitespaceOnlyValidator, duplicateExistingColumnNameValidator(existingColumnNames)]`
  - Renders a `<form>` hosting `FormInputComponent` (label "Column name"), a primary "Add" button, a secondary "Cancel" button
  - Auto-focuses the input on first render via `afterNextRender` (pattern from [`column-draft-list.component.ts:125-131`](../../KanbAI-Web/src/app/features/projects/components/column-draft-list/column-draft-list.component.ts#L125-L131))
  - Listens for Enter (submit) and Escape (cancel) on the input via native `(keydown)` bindings
  - Clears the control value and marks pristine when the parent resets it via input change (see "Form lifecycle on close/re-open")
  - Pure presentational: **NO** HTTP, **NO** state-service injection, **NO** router
  - `ChangeDetectionStrategy.OnPush`

**Validator (new utility):**
- `duplicateExistingColumnNameValidator` — [`src/app/features/board/validators/duplicate-existing-column-name.validator.ts`](../../KanbAI-Web/src/app/features/board/validators/duplicate-existing-column-name.validator.ts)
  - Factory: `(existingNames: Signal<readonly string[]>) => ValidatorFn`
  - Returns `{ duplicateExisting: true }` when the control's trimmed-lowercase value matches any trimmed-lowercase value in `existingNames()`.
  - Skip when value is whitespace-only (already covered by `whitespaceOnlyValidator`).
  - Reads `existingNames()` inside the `ValidatorFn` so the validator re-evaluates when the list signal changes (e.g. SignalR `ColumnCreated` arrives mid-typing). The component MUST call `control.updateValueAndValidity({ emitEvent: false })` in an `effect()` watching `existingColumnNames()` to make this retrigger fire without a user edit.

**State service mutation (new public method):**
- `BoardStateService.applyCreatedColumn(projectId: string, dto: ColumnResponseDto): void` — [`src/app/features/board/state/board-state.service.ts`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts)
  - Public entry point for HTTP-driven column creates. Behaviour identical to the existing private `onColumnCreated` at [`board-state.service.ts:151-170`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts#L151-L170):
    1. Project-id guard (silently no-op if `currentProjectId !== projectId`)
    2. Dedupe by id (silently no-op if the column is already present — this is what makes the SignalR echo safe on the client's own create)
    3. Append and sort by `columnOrder` ascending
  - **Refactor recommendation:** factor the shared logic into a `private appendColumnIfNew(projectId, BoardColumn): void` helper and have both `onColumnCreated` (from the `ColumnCreatedEvent`) and the new public `applyCreatedColumn` (from the `ColumnResponseDto`) delegate to it. Keep the current public surface unchanged otherwise.

### New Files to Create

- `KanbAI-Web/src/app/features/board/components/board-add-column/board-add-column.component.ts`
- `KanbAI-Web/src/app/features/board/components/board-add-column/board-add-column.component.html`
- `KanbAI-Web/src/app/features/board/components/board-add-column/board-add-column.component.scss` (styling spec comes from web-designer)
- `KanbAI-Web/src/app/features/board/components/board-add-column/board-add-column.component.spec.ts`
- `KanbAI-Web/src/app/features/board/validators/duplicate-existing-column-name.validator.ts`
- `KanbAI-Web/src/app/features/board/validators/duplicate-existing-column-name.validator.spec.ts`

### Files to Modify

- `KanbAI-Web/src/app/features/board/board-page/board-page.component.ts` — add signals, handlers, `@ViewChild` refs, focus logic; import `BoardAddColumnComponent`
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.html` — add empty-state panel branch; add trailing "+ Add column" slot + conditional form render inside the `cdkDropListGroup`
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.scss` — add empty-state panel, trailing-affordance, and form-slot selectors (web-designer delivers exact rules; reserve the class names per "Class Naming" below)
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.spec.ts` — add coverage for new branches (see QA Guidance)
- `KanbAI-Web/src/app/features/board/state/board-state.service.ts` — add public `applyCreatedColumn`; optionally refactor shared append helper
- `KanbAI-Web/src/app/features/board/state/board-state.service.spec.ts` — add coverage for `applyCreatedColumn` (project-guard, dedupe, sort-insert)

---

## State & Data Layer

### State Management Strategy

**Signals on `BoardPageComponent` (new):**
```typescript
/** 'closed' = show trigger affordance; 'open' = show BoardAddColumnComponent inline. */
readonly addColumnMode = signal<'closed' | 'open'>('closed');

/** True while an HTTP create is in flight. Blocks re-submit + drives the "Adding…" affordance. */
readonly createColumnSubmitting = signal<boolean>(false);

/** Inline error copy from mapColumnErrorToUserMessage(err, 'create'). null when no error is pending. */
readonly createColumnError = signal<string | null>(null);

/** Derived input for BoardAddColumnComponent — just the names. */
readonly existingColumnNames = computed<readonly string[]>(() =>
  this.columns().map(c => c.name)
);
```

**ViewChild refs (new):**
```typescript
/** Button inside the empty-state panel. Receives focus after a cancel from the empty-board flow. */
@ViewChild('emptyStateAddButton', { read: ElementRef })
private readonly emptyStateAddButton?: ElementRef<HTMLButtonElement>;

/** Trailing "+ Add column" trigger button. Receives focus after a cancel OR success from the populated-board flow. */
@ViewChild('trailingAddButton', { read: ElementRef })
private readonly trailingAddButton?: ElementRef<HTMLButtonElement>;
```

**Why Signals (not RxJS Subjects) for this:** This is transient, synchronous UI state that belongs to the component. It participates in `OnPush` change detection via signal-read in the template. The only async edge is the HTTP call itself (still RxJS), and its result feeds the signal via a `.subscribe`-then-`.set` bridge — matching the pattern already in `loadColumns` (lines 217-230) and `handleTaskDropped` (lines 170-189).

**No service-level state.** The create flow is transient. If the user navigates away mid-submit, `takeUntilDestroyed(this.destroyRef)` cancels the subscription. No `BoardStateService` persistence of form state is required or acceptable.

### TypeScript Interfaces

**Reuse existing:**
- `ColumnResponseDto` — [`column.model.ts:12-20`](../../KanbAI-Web/src/app/features/board/models/column.model.ts#L12-L20)
- `CreateColumnDto` — [`column.model.ts:34-38`](../../KanbAI-Web/src/app/features/board/models/column.model.ts#L34-L38)
- `BoardColumn` — [`board-state.model.ts:8-14`](../../KanbAI-Web/src/app/features/board/state/board-state.model.ts#L8-L14)

**No new interfaces required.** `BoardAddColumnComponent` emits a plain `string` (the trimmed validated name); `BoardPageComponent` builds the DTO inline at the call site. Keeps the dumb component decoupled from the DTO shape.

### Validator Factory Signature

**File:** `KanbAI-Web/src/app/features/board/validators/duplicate-existing-column-name.validator.ts`

```typescript
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { Signal } from '@angular/core';

/**
 * Rejects a control whose trimmed-lowercase value matches any entry in `existingNames()`
 * after identical normalisation. Case-insensitive-trim duplicate detection matches
 * #70's `duplicateColumnNamesValidator` normalisation semantics.
 *
 * Returns `{ duplicateExisting: true }` on failure, `null` on success.
 * Whitespace-only / empty values are skipped (covered by `whitespaceOnlyValidator`).
 *
 * The signal is read on every invocation so CDK-level changes to the column list
 * (HTTP echo, SignalR echo) cause the validator to re-flag correctly once the
 * owning component calls `control.updateValueAndValidity()` in response.
 */
export function duplicateExistingColumnNameValidator(
  existingNames: Signal<readonly string[]>
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = control.value;
    const asString = raw == null ? '' : String(raw);
    const normalised = asString.trim().toLowerCase();
    if (normalised.length === 0) {
      return null;
    }
    const collisions = existingNames().some(
      n => n.trim().toLowerCase() === normalised
    );
    return collisions ? { duplicateExisting: true } : null;
  };
}
```

---

## Service Integration

### Reused Services

**`ColumnsApiService.createColumn(projectId, dto)`** — existing; see [`columns-api.service.ts:65-80`](../../KanbAI-Web/src/app/features/board/services/columns-api.service.ts#L65-L80). No modifications.

**`mapColumnErrorToUserMessage(err, 'create')`** — existing; see [`columns-api.service.ts:91-121`](../../KanbAI-Web/src/app/features/board/services/columns-api.service.ts#L91-L121). No modifications. `BoardPageComponent` is the **only** new caller.

**`BoardStateService.applyCreatedColumn(projectId, dto)`** — **new public method** (see "State service mutation" above).

### HTTP Request/Response Contracts

| Method | Endpoint | Request Body | Response Body | Error Handling |
|--------|----------|--------------|---------------|-----------------|
| POST | `/api/column/project/{projectId}` | `CreateColumnDto { name, columnOrder }` | `ApiResponse<ColumnResponseDto>` | `mapColumnErrorToUserMessage(err, 'create')` |

**Request construction (inside `handleAddColumnSubmit`):**
```typescript
const currentColumns = this.columns();
const nextOrder = currentColumns.length === 0
  ? 0
  : Math.max(...currentColumns.map(c => c.columnOrder)) + 1;
const dto: CreateColumnDto = { name: trimmedName, columnOrder: nextOrder };
```

**Why explicit `columnOrder`:** matches #70's deterministic 0..N-1 pattern ([`project-creation.service.ts:114`](../../KanbAI-Web/src/app/features/projects/services/project-creation.service.ts#L114)). Guarantees the new column lands at the visual end, independent of backend tie-breaking behaviour. `colorCode` is omitted (matches #70's "no color picker" decision, context line 205).

**Success path (HTTP 201):**
```typescript
next: (dto) => {
  this.boardState.applyCreatedColumn(projectId, dto);  // id-dedupe safe
  this.createColumnSubmitting.set(false);
  this.createColumnError.set(null);
  this.addColumnMode.set('closed');
  this.announce(`Column '${dto.name}' added.`);
  queueMicrotask(() => this.focusTrailingAddButton());  // post-render focus
}
```

**Error path:**
```typescript
error: (err) => {
  this.createColumnSubmitting.set(false);
  this.createColumnError.set(mapColumnErrorToUserMessage(err, 'create'));
  // Stay open, preserve typed value (the component owns the FormControl — no reset).
}
```

**Subscription cleanup:** `.pipe(takeUntilDestroyed(this.destroyRef))` on the POST — identical to existing `loadColumns` and `handleTaskDropped` usage.

---

## Implementation Steps

Follow these steps in order. Do **not** begin step N+1 until step N passes its per-step verification.

### 1. Add the validator
- [ ] Create `KanbAI-Web/src/app/features/board/validators/duplicate-existing-column-name.validator.ts` per the factory signature above.
- [ ] Create `duplicate-existing-column-name.validator.spec.ts` covering:
  - empty-names list → valid for any input
  - exact-match → `{ duplicateExisting: true }`
  - trimmed + mixed-case match → `{ duplicateExisting: true }` (e.g. names `['DONE']`, control value `'  done  '`)
  - whitespace-only control value → valid (defer to `whitespaceOnlyValidator`)
  - non-collision → valid
  - signal change reflects on next invocation (mutate the underlying signal, call validator again → different result)
- [ ] **Per-step verification:** `ng test --watch=false --testPathPattern duplicate-existing-column-name` passes.

### 2. Extend `BoardStateService` with `applyCreatedColumn`
- [ ] In [`board-state.service.ts`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts), factor the append-if-new body of `onColumnCreated` into a private helper `appendBoardColumnIfNew(projectId: string, column: BoardColumn): void`. Keep signature-compatible behaviour.
- [ ] Have `onColumnCreated` call the helper with the projected `BoardColumn`.
- [ ] Add public `applyCreatedColumn(projectId: string, dto: ColumnResponseDto): void` that projects `dto → BoardColumn` (drop `createdAt`/`updatedAt` — match `BoardPageComponent.projectColumnDtos`) and calls the helper.
- [ ] Extend `board-state.service.spec.ts`:
  - `applyCreatedColumn` is a no-op when `currentProjectId !== projectId`
  - `applyCreatedColumn` appends and sorts by `columnOrder` ascending
  - `applyCreatedColumn` is idempotent: calling it twice with the same dto leaves a single column in state
  - `applyCreatedColumn` + subsequent `onColumnCreated` with the same id does not double-insert (the shared-helper dedupe guarantee)
- [ ] **Per-step verification:** `ng test --watch=false --testPathPattern board-state.service` passes; pre-existing tests still green.

### 3. Create `BoardAddColumnComponent`
- [ ] Generate skeleton files: `board-add-column.component.ts/.html/.scss/.spec.ts` in the path specified above.
- [ ] Declare the component standalone with `imports: [CommonModule, ReactiveFormsModule, FormInputComponent]`, `ChangeDetectionStrategy.OnPush`.
- [ ] Declare inputs using the new signal-based `input()` API:
  ```typescript
  readonly existingColumnNames = input.required<readonly string[]>();
  readonly submitting = input<boolean>(false);
  readonly submitError = input<string | null>(null);
  ```
  NOTE: convert to `Signal` at instantiation using `computed()` if the validator factory needs a `Signal<readonly string[]>` — `input()` already returns a `Signal`, so pass `this.existingColumnNames` directly.
- [ ] Declare outputs:
  ```typescript
  readonly submitted = output<string>();
  readonly cancelled = output<void>();
  ```
- [ ] Construct the `FormControl<string>`:
  ```typescript
  readonly nameControl = new FormControl<string>('', {
    nonNullable: true,
    validators: [
      Validators.required,
      Validators.maxLength(100),
      whitespaceOnlyValidator,
      duplicateExistingColumnNameValidator(this.existingColumnNames)
    ]
  });
  ```
- [ ] In the constructor, register an `effect()` that reads `this.existingColumnNames()` and calls `this.nameControl.updateValueAndValidity({ emitEvent: false })` so the duplicate validator re-fires when the list changes under the user's feet.
- [ ] Implement `onSubmit()`:
  - Mark the control touched/dirty if not already (to surface required/whitespace errors the user hasn't interacted with)
  - Early-return if `nameControl.invalid || submitting()`
  - Emit `submitted.emit(nameControl.value.trim())`
- [ ] Implement `onCancel()`:
  - Emit `cancelled.emit()`
  - Parent will close; the component's destroy via `@if` will discard the `FormControl` — no explicit reset needed.
  - If inline re-use is chosen (design-spec may decide the form stays mounted and only the wrapper toggles), expose a public `reset()` method that calls `this.nameControl.reset('')` and clears the control's `touched`/`dirty` flags.
- [ ] Implement `onKeydown(event: KeyboardEvent)`:
  - `event.key === 'Escape'` → `onCancel()` (call `event.preventDefault()` so the input's own dismiss doesn't bubble to e.g. a parent dialog)
  - `event.key === 'Enter'` inside the form → allow the form's `(ngSubmit)` to fire; do not call `preventDefault` here (reactive form handles it)
- [ ] Implement auto-focus using `afterNextRender(() => input?.focus(), { injector })` where `input` is obtained from a `@ViewChild` on the hosting element or from a `ViewChild` of the `FormInputComponent` wrapper — mirror [`column-draft-list.component.ts:125-131`](../../KanbAI-Web/src/app/features/projects/components/column-draft-list/column-draft-list.component.ts#L125-L131). Because `FormInputComponent` wraps the native input, query the `ElementRef` and call `querySelector<HTMLInputElement>('input')`.
- [ ] Template structure:
  ```html
  <form class="board-add-column" (ngSubmit)="onSubmit()" (keydown)="onKeydown($event)" [attr.aria-label]="'Add column'">
    <div #nameWrap>
      <app-form-input
        label="Column name"
        placeholder="e.g. Blocked"
        [required]="true"
        [control]="nameControl"
      />
    </div>
    @if (submitError()) {
      <p class="board-add-column__error" role="alert">{{ submitError() }}</p>
    }
    <div class="board-add-column__actions">
      <button type="submit" class="board-add-column__submit"
              [disabled]="nameControl.invalid || submitting()">
        {{ submitting() ? 'Adding…' : 'Add' }}
      </button>
      <button type="button" class="board-add-column__cancel"
              [disabled]="submitting()" (click)="onCancel()">
        Cancel
      </button>
    </div>
  </form>
  ```
  Class names are reserved for web-designer — developer may not rename without design approval. The outer element is a `<form>` so native `ngSubmit` + Enter-to-submit work for free.
- [ ] **Per-step verification:** `ng test --watch=false --testPathPattern board-add-column` passes (see QA Guidance for minimum cases).

### 4. Wire `BoardPageComponent`
- [ ] Add the three new signals declared above (`addColumnMode`, `createColumnSubmitting`, `createColumnError`) and the `existingColumnNames` computed. Keep existing signals unchanged.
- [ ] Add `@ViewChild` refs for `emptyStateAddButton` and `trailingAddButton`.
- [ ] Add `BoardAddColumnComponent` to the component's `imports` array.
- [ ] Add handlers:
  ```typescript
  openAddColumnFlow(): void {
    this.createColumnError.set(null);
    this.addColumnMode.set('open');
    // Focus will land on the form's input via BoardAddColumnComponent's afterNextRender.
  }

  handleAddColumnSubmit(trimmedName: string): void {
    const projectId = this.boardState.currentProjectId();
    if (projectId === null || this.createColumnSubmitting()) {
      return;  // Guard double-submit + stale view.
    }
    const nextOrder = this.columns().length === 0
      ? 0
      : Math.max(...this.columns().map(c => c.columnOrder)) + 1;
    const dto: CreateColumnDto = { name: trimmedName, columnOrder: nextOrder };

    this.createColumnSubmitting.set(true);
    this.createColumnError.set(null);

    this.columnsApi.createColumn(projectId, dto)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: created => {
          this.boardState.applyCreatedColumn(projectId, created);
          this.createColumnSubmitting.set(false);
          this.addColumnMode.set('closed');
          this.announce(`Column '${created.name}' added.`);
          queueMicrotask(() => this.focusTrailingAddButton());
        },
        error: err => {
          this.createColumnSubmitting.set(false);
          this.createColumnError.set(mapColumnErrorToUserMessage(err, 'create'));
          // Stay open; component preserves the typed value.
        }
      });
  }

  handleAddColumnCancel(): void {
    const wasEmpty = this.columns().length === 0;
    this.addColumnMode.set('closed');
    this.createColumnError.set(null);
    queueMicrotask(() =>
      wasEmpty ? this.focusEmptyStateAddButton() : this.focusTrailingAddButton()
    );
  }

  private focusEmptyStateAddButton(): void {
    this.emptyStateAddButton?.nativeElement.focus();
  }
  private focusTrailingAddButton(): void {
    this.trailingAddButton?.nativeElement.focus();
  }
  ```
- [ ] Reuse `this.announce(text)` (line 264-266) for screen-reader announcements — the existing `dragAnnouncement` live region at [`board-page.component.html:32-38`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.html#L32-L38) is a polite region semantically suitable for "column added" announcements.
- [ ] **Per-step verification:** build still green; no existing test regressions.

### 5. Template: empty-state panel
- [ ] In `board-page.component.html`, replace the current bare `@else { <div class="board-page__columns" cdkDropListGroup> ... </div> }` branch with a nested conditional:
  ```html
  } @else if (columns().length === 0) {
    <div class="board-page__empty">
      <div class="board-page__empty-panel" role="region" aria-label="Empty board">
        <h2 class="board-page__empty-heading">This board has no columns yet</h2>
        <p class="board-page__empty-body">
          Add your first column to start planning tasks.
        </p>
        @if (addColumnMode() === 'closed') {
          <button
            #emptyStateAddButton
            type="button"
            class="board-page__empty-add"
            (click)="openAddColumnFlow()"
          >
            Add column
          </button>
        } @else {
          <app-board-add-column
            [existingColumnNames]="existingColumnNames()"
            [submitting]="createColumnSubmitting()"
            [submitError]="createColumnError()"
            (submitted)="handleAddColumnSubmit($event)"
            (cancelled)="handleAddColumnCancel()"
          />
        }
      </div>
    </div>
  } @else {
    <div class="board-page__columns" cdkDropListGroup>
      @for (column of columns(); track column.id) {
        <app-board-column ... />
      }
      <!-- Trailing slot — see step 6 -->
    </div>
  }
  ```
- [ ] **Per-step verification:** `ng build` succeeds; manual verification (dev server) shows the empty-state panel with a focusable "Add column" button when the board has zero columns.

### 6. Template: trailing "+ Add column" affordance
- [ ] Inside the populated-board `<div class="board-page__columns" cdkDropListGroup>` (after the `@for` closes), add:
  ```html
  <div class="board-page__trailing-slot">
    @if (addColumnMode() === 'closed') {
      <button
        #trailingAddButton
        type="button"
        class="board-page__trailing-add"
        aria-label="Add column"
        (click)="openAddColumnFlow()"
      >
        <!-- plus icon -->
        <span>Add column</span>
      </button>
    } @else {
      <app-board-add-column
        [existingColumnNames]="existingColumnNames()"
        [submitting]="createColumnSubmitting()"
        [submitError]="createColumnError()"
        (submitted)="handleAddColumnSubmit($event)"
        (cancelled)="handleAddColumnCancel()"
      />
    }
  </div>
  ```
  The trailing slot lives inside the `cdkDropListGroup` strip so horizontal scroll carries it with the columns (context line 105 "must remain reachable even when the column strip is horizontally scrollable"). It is NOT a `cdkDropList` target.
- [ ] **Per-step verification:** `ng build` succeeds; manual verification shows the trailing button after the last column, keyboard-reachable via Tab.

### 7. Reserve SCSS selectors
Add empty rule-sets (or rules per design spec — web-designer owns visual values) for:
- `.board-page__empty` (centers the panel, matches existing `.board-page__load-error` pattern at [`board-page.component.scss:148-154`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.scss#L148-L154))
- `.board-page__empty-panel`, `.board-page__empty-heading`, `.board-page__empty-body`, `.board-page__empty-add`
- `.board-page__trailing-slot` — inline-flex, aligns with column start, scroll-snap-aligns like other column children
- `.board-page__trailing-add` — button styling (design-spec owns exact values)
- (Component-level) `.board-add-column`, `.board-add-column__error`, `.board-add-column__actions`, `.board-add-column__submit`, `.board-add-column__cancel`

### 8. Form lifecycle on close/re-open
- [ ] Template uses `@if (addColumnMode() === 'open') { <app-board-add-column ... /> }` so the component is **destroyed on cancel/success and re-created on next open**. This guarantees:
  - Cancel-then-reopen shows an empty field (AC: "Re-opening the input after a cancel shows an empty field").
  - No stale validation / error state leaks between attempts.
- [ ] The error signal (`createColumnError()`) MUST be cleared by `openAddColumnFlow()` before the component re-mounts (otherwise the child shows the previous error). Handler above already does this.

### 9. Double-submit defence
- [ ] `BoardAddColumnComponent.onSubmit` checks `submitting()` and short-circuits. The submit button is also `[disabled]="nameControl.invalid || submitting()"`. These two guards together eliminate the double-POST path (rapid-click on button, rapid-Enter on input, simultaneous click + Enter).

### 10. Add tests (see QA Guidance)
- [ ] Developer MUST write all cases listed in QA Guidance § "Test Strategy" before considering work complete.

### 11. Verification
- [ ] `cd KanbAI-Web && npm run build` — must succeed with no new warnings/errors.
- [ ] `cd KanbAI-Web && npm run test -- --watch=false` — no INTRODUCED failures (per CLAUDE.md classification).
- [ ] Manual smoke test (dev server) of the seven flows from context lines 64-75.

### Performance Considerations
- `BoardAddColumnComponent` uses `OnPush`; template reads through signals only — no manual CD cycling needed.
- The trailing slot adds one element to the `cdkDropListGroup`; it is NOT a CDK drop target (no `cdkDropList` directive), so it does not expand the cross-list drop matrix for tasks.
- `existingColumnNames` is a `computed` signal; CD only propagates when the column *names* actually change.
- The duplicate validator is O(N) in column count — negligible.

---

## QA Guidance

### Test Strategy

**Unit tests — `duplicate-existing-column-name.validator.spec.ts`:**
- Empty names list + non-empty control value → `null`
- Exact-match names list + matching value → `{ duplicateExisting: true }`
- Trimmed + mixed-case match → `{ duplicateExisting: true }` (verify case-insensitive + whitespace-trim semantics match #70)
- Whitespace-only control value → `null` (defer to `whitespaceOnlyValidator`)
- Non-collision → `null`
- Signal change + manual `updateValueAndValidity` → different result

**Unit tests — `board-add-column.component.spec.ts`:**
- Renders with empty `nameControl` on first mount.
- Auto-focuses the input on first render (use `afterNextRender` stub or a `fakeAsync` tick).
- Typing a valid name + clicking Submit → `submitted` emits the **trimmed** value.
- Typing and pressing **Enter** in the input → `submitted` emits once.
- Pressing **Escape** → `cancelled` emits once, no `submitted`.
- Clicking Cancel → `cancelled` emits, no `submitted`.
- Empty-string submit → submit button disabled; no emission; no blur-dependent error race.
- Whitespace-only submit → submit disabled; `whitespaceOnly` error surfaces on touch.
- Name >100 chars → submit disabled; `maxlength` error surfaces (per `FormInputComponent` standard error rendering).
- Duplicate name (case-insensitive, trimmed) in `existingColumnNames` input → submit disabled; `duplicateExisting` error surfaces.
- Changing the `existingColumnNames` input under the control → validator re-fires on next tick.
- `submitting = true` → both buttons disabled; submit shows "Adding…".
- `submitError = 'oops'` → error paragraph rendered with `role="alert"`.
- Rapid double-submit (click click) → `submitted` emits **once** (short-circuit on `submitting()`).
- Destroyed during in-flight submit → no error, no lingering subscribers (the component owns no subscriptions outside the effect; the parent owns the HTTP sub).

**Unit tests — `board-state.service.spec.ts` additions:**
- `applyCreatedColumn` called with mismatched `projectId` → state unchanged.
- `applyCreatedColumn` with a new column → appended in sorted order.
- `applyCreatedColumn` with a column id already in state → state unchanged (idempotence; proves HTTP-then-SignalR-echo does not double-insert).
- Concurrent `applyCreatedColumn` + `onColumnCreated` for the same id (either order) → single column in final state.

**Unit tests — `board-page.component.spec.ts` additions:**
- **Empty-state render:** `columns()` is empty, `columnLoadError()` is null → empty-state panel renders with an accessible heading, body, and "Add column" button. Trailing affordance is NOT rendered. Columns container (`.board-page__columns`) is NOT rendered.
- **Empty-state hidden on load error:** `columnLoadError()` is set → existing load-error branch wins; empty-state panel is NOT rendered.
- **Trailing affordance render:** `columns()` has ≥1 column → trailing "+ Add column" button renders inside `cdkDropListGroup`, after the last column; empty-state is NOT rendered.
- **Trailing affordance absent on empty:** `columns()` empty → trailing affordance is absent (empty-state button is the sole CTA).
- **Open from empty-state:** click "Add column" in empty state → `addColumnMode()` becomes `'open'`; `app-board-add-column` renders inside the empty panel.
- **Open from trailing:** click "+ Add column" in populated board → `addColumnMode()` becomes `'open'`; `app-board-add-column` renders inside the trailing slot.
- **Submit success:** user submits a valid name → `ColumnsApiService.createColumn` invoked **once** with `{ name, columnOrder: max+1 }`; on next emission, `BoardStateService.applyCreatedColumn` invoked with the DTO; `addColumnMode` returns to `'closed'`; `dragAnnouncement()` contains "Column '…' added.".
- **Submit success with empty board:** user submits in empty state → `columnOrder: 0` is passed.
- **Submit error (e.g. 500):** mock service errors → `createColumnError()` populated via `mapColumnErrorToUserMessage(err, 'create')`; `addColumnMode` stays `'open'`; `createColumnSubmitting()` false.
- **Submit error preserves typed value:** because the child component is NOT destroyed on error (`addColumnMode` stays `'open'`), the `FormControl` keeps its value. Verify by checking the child's control value after a simulated error.
- **Cancel from empty-state:** cancel → `addColumnMode` back to `'closed'`, focus returns to `emptyStateAddButton`.
- **Cancel from trailing:** cancel → `addColumnMode` back to `'closed'`, focus returns to `trailingAddButton`.
- **Cancel then reopen:** reopen after cancel shows an empty `FormControl` (proves `@if`-gated remount).
- **SignalR echo dedupe (no regression to #46):** simulate `ColumnCreated` event for a column already added via `applyCreatedColumn` → state shows a single instance (extends the existing `onColumnCreated` dedupe test).
- **Two tabs / concurrent echo:** `applyCreatedColumn` then an out-of-order `ColumnCreated` with a DIFFERENT id → both appear, sorted by `columnOrder`.
- **Unmount during in-flight submit:** component destroyed → `takeUntilDestroyed` cancels subscription; no `setState` errors; subsequent HTTP response is a no-op.
- **Double-submit defence:** `createColumnSubmitting()` true → `handleAddColumnSubmit` short-circuits; only one POST in the mock.
- **Empty-to-populated transition:** state flips from 0 to 1 columns → empty-state panel disappears, column + trailing affordance both render on next tick.
- **Populated-to-empty transition:** state flips from 1 to 0 columns (via `ColumnDeleted` stub) → trailing affordance disappears, empty-state panel renders.

### Mocking Instructions

```typescript
// Board-page test augmentation — add to existing mocks from board-page.component.spec.ts.
const columnsApiMock: ColumnsApiMock = {
  getColumnsForProject: vi.fn().mockReturnValue(of([])),
  createColumn: vi.fn().mockReturnValue(of({
    id: 'new-col',
    name: 'Blocked',
    colorCode: null,
    columnOrder: 3,
    projectId: 'project-1',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z'
  } as ColumnResponseDto))
};

// Extend BoardStateMock:
applyCreatedColumn: vi.fn((projectId: string, dto: ColumnResponseDto) => {
  // Lightweight stub — just append to the signal for assertion convenience.
  if (currentProjectId() !== projectId) return;
  const next = [...columns(), {
    id: dto.id, name: dto.name, colorCode: dto.colorCode,
    columnOrder: dto.columnOrder, projectId: dto.projectId
  }].sort((a, b) => a.columnOrder - b.columnOrder);
  columns.set(next);
})
```

### Edge Cases to Test

- Column name with leading/trailing whitespace → trimmed before duplicate check and emit.
- Column name with exactly 100 characters → accepted.
- Column name with exactly 101 characters → rejected, error surfaced.
- Name matches a column that currently exists **only because a SignalR echo fired mid-typing** → validator re-flags once `existingColumnNames` changes (covered by the validator spec + the effect in the component).
- Rapid open/cancel cycling → no memory leaks, no double-listeners (`@if` remounts guarantee).
- Submit while `currentProjectId()` is null (extreme: user raced navigate-away) → handler short-circuits; no POST; component stays open harmlessly (unmount happens via ngOnDestroy).
- HTTP 401 mid-submit → global `authInterceptor` redirects to login. The board page must NOT crash when the component is torn down mid-response. `takeUntilDestroyed` covers this.

---

## Self-Check

### Interface Alignment
- [x] `ColumnResponseDto` / `CreateColumnDto` unchanged — no re-scout needed.
- [x] `BoardColumn` projection reused verbatim.
- [x] Validator factory signature is standard `ValidatorFn`-compatible.

### Standards Compliance
- [x] `inject()` used in the new component (no constructor injection).
- [x] Signals for all transient UI state; RxJS only for the HTTP call.
- [x] `ChangeDetectionStrategy.OnPush` on the new component; existing `OnPush` on `BoardPageComponent` preserved.
- [x] `takeUntilDestroyed(this.destroyRef)` on the POST subscription.
- [x] New file paths match the existing `features/board/{components,validators,services,state}` convention.
- [x] Reuses `FormInputComponent` per #70 precedent; does NOT introduce a new input primitive.

### Security
- [x] Route guards unchanged (same `/board/:projectId` surface; auth is handled by interceptor + project-level auth already in place).
- [x] Name input validated client-side (required, max-100, whitespace, duplicate); backend remains the authoritative gatekeeper.
- [x] No PII logged; error copy routed through `mapColumnErrorToUserMessage` which already strips backend detail.
- [x] No `[innerHTML]` anywhere; all copy interpolated as text.

### Completeness
- [x] All new files listed under "New Files to Create".
- [x] All modified files listed under "Files to Modify".
- [x] Implementation steps are ordered so each step leaves the app in a building state.
- [x] All 40+ acceptance criteria in [issue_77_context.md](./issue_77_context.md#acceptance-criteria) addressed by the component split + the signals on `BoardPageComponent` + the `applyCreatedColumn` path + the validator + the test plan.

---

*The technical specification is saved. You can now instruct the web-designer agent to create the design specification.*

---

## Development Status

**Implemented on:** 2026-05-07
**Implemented by:** developer agent (per CLAUDE.md §Phase 4 workflow)

### Files Created

- `KanbAI-Web/src/app/features/board/validators/duplicate-existing-column-name.validator.ts`
- `KanbAI-Web/src/app/features/board/validators/duplicate-existing-column-name.validator.spec.ts`
- `KanbAI-Web/src/app/features/board/components/board-add-column/board-add-column.component.ts`
- `KanbAI-Web/src/app/features/board/components/board-add-column/board-add-column.component.html`
- `KanbAI-Web/src/app/features/board/components/board-add-column/board-add-column.component.scss`
- `KanbAI-Web/src/app/features/board/components/board-add-column/board-add-column.component.spec.ts`

### Files Modified

- `KanbAI-Web/src/app/features/board/state/board-state.service.ts` — new public `applyCreatedColumn(projectId, dto)`; `onColumnCreated` refactored to share the private `appendBoardColumnIfNew(projectId, column)` helper (dedupe-by-id, sort-by-`columnOrder` ascending, silent no-op on project mismatch).
- `KanbAI-Web/src/app/features/board/state/board-state.service.spec.ts` — added `applyCreatedColumn` describe block covering project-guard, dedupe, sort-insert, idempotence, HTTP-then-echo ordering, echo-then-HTTP ordering, and defensive null/undefined handling.
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.ts` — added `addColumnMode`, `createColumnSubmitting`, `createColumnError` signals; `existingColumnNames` computed; `@ViewChild` refs for both trigger buttons; `openAddColumnFlow`, `handleAddColumnSubmit`, `handleAddColumnCancel`, `focusEmptyStateAddButton`, `focusTrailingAddButton` handlers; `takeUntilDestroyed` on the POST subscription.
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.html` — new `@else if (columns().length === 0)` empty-state branch with `role="region"` panel, heading, body, and `#emptyStateAddButton` CTA; trailing `.board-page__trailing-slot` inside the existing `cdkDropListGroup` with the `#trailingAddButton` trigger.
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.scss` — appended `.board-page__empty*` and `.board-page__trailing*` selector groups verbatim from design spec §Per-Component Styling. Existing rules untouched.
- `KanbAI-Web/src/app/features/board/board-page/board-page.component.spec.ts` — added `Add-column flow (issue #77)` describe group covering empty-state rendering, trailing affordance, open/cancel lifecycle, submit success (empty + populated boards), submit error (500 + 404), double-submit defence, `@if`-gated remount, `existingColumnNames` computed, empty ↔ populated transitions, and unmount-during-in-flight-submit. Updated one pre-existing test (`renders the cdkDropListGroup container when no columnLoadError is set`) to seed at least one column — the populated-board branch is now gated on `columns().length > 0`.

### Implementation Notes & Deviations

- **`(ngSubmit)` → `(submit)`:** `BoardAddColumnComponent`'s `<form>` has no enclosing `FormGroup` / `NgForm` directive (only an individual `[formControl]`-bound input), so the `(ngSubmit)` output never fires. Switched the template to the native `(submit)` event and added `event.preventDefault()` inside `onSubmit` to suppress the default form action. Behaviour unchanged — Enter still submits, double-click defence + disabled-while-submitting still fire.
- **Duplicate-error rendering:** `FormInputComponent` only surfaces `required` / `whitespaceOnly` / `maxlength` / `email` errors from its standard template. The new `duplicateExisting` error required a component-local paragraph (`.board-add-column__field-error` under the input wrap, `role="alert"`). Styling is minimal and reuses `$status-high` and `$font-size-sm` — no new tokens. If the design team prefers this error to render through `FormInputComponent`'s native error surface, that's a follow-up to extend the shared component with a `duplicateExisting` branch.
- **Budget warning:** `board-page.component.scss` final CSS is 5.75 kB; the component-style *warning* budget is 4 kB, the *error* budget is 8 kB. The SCSS block is copied verbatim from design spec §Per-Component Styling so no unauthorised trims were applied. Build SUCCEEDS (no errors). Two other files already exceed the same warning budget (`column-draft-list.component.scss`, `upload-progress-row.component.scss`) — this is consistent with existing project practice.
- **Fixture for pre-existing `signalr.service.spec.ts`:** observed a flaky `TypeError: Cannot read properties of undefined (reading 'trim')` from the `vi.mock('@microsoft/signalr')` factory during a subset of runs (appears to be a Node 25 + Vitest interaction unrelated to #77). Re-runs pass. No modifications made to that file.

### Verification Results

- **`npm run build`:** PASS. Output bundle written to `dist/KanbAI-Web`. Only pre-existing warnings (sass unary-operator deprecations on `board-page__move-error-dismiss` rules; budget warnings on `column-draft-list` and `upload-progress-row`). One introduced budget WARNING on `board-page.component.scss` (5.75 kB vs 4 kB warn threshold) — inside the 8 kB error threshold; does not fail the build.
- **`npm run test -- --watch=false`:** PASS. **1180 / 1180 tests pass across 65 test files.**
  - New coverage breakdown:
    - `duplicate-existing-column-name.validator.spec.ts` — 9 tests
    - `board-add-column.component.spec.ts` — 23 tests
    - `board-state.service.spec.ts` (added `applyCreatedColumn` block) — 7 new tests
    - `board-page.component.spec.ts` (added `Add-column flow (issue #77)` block) — 19 new tests
  - No INTRODUCED failures. No pre-existing failures remain at the final run.

### Acceptance Criteria Coverage

All acceptance criteria from [issue_77_context.md](./issue_77_context.md#acceptance-criteria) are addressed:

- Empty-state panel (role + heading + body + CTA) — `board-page.component.html` empty-branch + SCSS.
- Empty-state suppressed on load-error — template nested `@if` preserves load-error precedence.
- Trailing "+ Add column" affordance on populated boards — inside `cdkDropListGroup`, keyboard-reachable.
- Add-column input flow (inline, labelled, Enter-submit, Escape-cancel, explicit buttons, autofocus) — `BoardAddColumnComponent` + `(submit)` / `(keydown)` bindings + `afterNextRender` focus.
- Validation parity with #70 (required / whitespace / max-100 / case-insensitive-trim duplicate) — `FormControl` validator stack + new `duplicateExistingColumnNameValidator`.
- Single POST per submit + pending / disabled / "Adding…" state — `createColumnSubmitting` signal + double-submit guard in `handleAddColumnSubmit`.
- Success appends column + announces via `aria-live` + focus moves to trailing trigger — `applyCreatedColumn` + `announce(...)` + `queueMicrotask(focusTrailingAddButton)`.
- Error keeps form open + preserves value + surfaces `mapColumnErrorToUserMessage` copy — error branch in `handleAddColumnSubmit`, child component not destroyed on error, control never reset.
- 401 / subscription cleanup on unmount — `takeUntilDestroyed(this.destroyRef)`.
- SignalR echo idempotence — shared `appendBoardColumnIfNew` helper used by both `onColumnCreated` and `applyCreatedColumn`.
- Cancel-then-reopen shows empty field — `@if (addColumnMode() === 'open') { ... }` gates remount.
- Accessible names on all new interactive controls, `role="region"` on empty-state, `role="alert"` on error paragraphs.

*Development is complete and files are saved. You can now instruct QA to review the implementation and write automated tests.*
