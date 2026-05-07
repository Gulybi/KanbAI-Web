# Technical Specification: Dynamic Column Setup on Project Creation

**Context Document:** [issue_70_context.md](./issue_70_context.md)
**GitHub Issue:** [#70](https://github.com/Gulybi/KanbAI-Web/issues/70)
**Branch:** `70-dynamic-column-setup-on-project-creation`

---

## Overview

This feature extends the existing `CreateProjectDialogComponent` (from #32) with an editable "Initial columns" section that pre-fills three defaults (`"To Do"`, `"In Progress"`, `"Done"`) and lets the user rename, reorder, add, and remove rows before submitting. On submit, a new `ProjectCreationService` orchestrates an atomic-from-the-user's-perspective sequence — one `POST /api/project` followed by one sequential `POST /api/column/project/{projectId}` per column draft, order fixed via explicit `columnOrder` — and returns a single result telling the dialog whether everything succeeded, the project itself failed, or some columns failed after the project was created. Column drafts live in a new `FormArray` nested inside the existing `FormGroup`; array-level validators enforce min-1 row and case-insensitive duplicate detection; per-row validators match the backend (`required`, `maxLength(100)`, whitespace-only). The draft list UI is extracted into a new presentational `ColumnDraftListComponent` so the dialog host stays thin. CDK drag-drop (already used by the board for task DnD) is reused for pointer-driven reorder, with up/down buttons satisfying the keyboard-operable AC; no new dependency. `ColumnsApiService` grows a `createColumn` method (currently list-only) and its error mapper learns the `'create'` operation copy. No backend changes; no route changes; the existing per-column endpoint is the full contract.

---

## Component Architecture

### Routing

**No new routes.** `CreateProjectDialogComponent` already mounts via `@angular/cdk/dialog` from `/dashboard` (per #32 tech spec). This ticket extends the dialog in place.

### Submission strategy: sequential, continue-on-failure, fixed order

Three viable strategies were evaluated against the context's "no transactional endpoint" constraint (context line 81) and the partial-failure AC (context lines 118–119):

| Strategy | Evaluation |
|----------|-----------|
| **All-or-nothing with client-side rollback** (create project; on any column failure, issue `DELETE /api/project/{id}`) | ❌ **Rejected.** `DELETE` itself can fail, leaving a worse state than the half-created project. Also fires a `ProjectDeleted` SignalR broadcast that would reach other tabs that briefly saw a `ProjectCreated` on the list refresh — visible churn. Context does not require atomicity. |
| **Fail-fast sequential POSTs** (stop on first column error) | ❌ **Rejected.** Each column POST is server-independent; aborting remaining columns after a transient failure produces strictly less correct server state than attempting them all. User also loses information about which specific columns are viable. |
| **Continue-on-failure sequential POSTs** | ✅ **Chosen.** Each column is an independent idempotent operation. Attempt all; collect failures by draft name; surface a user-readable partial-success message carrying the list of failed names. Dialog host decides whether to keep the dialog open with failed rows marked, or close it with a banner on the dashboard — the exact UX is a design-spec call (context line 119). |

**Order determinism:** the client passes `columnOrder: 0, 1, 2, … N-1` explicitly on every POST. This removes any dependency on backend-ordering-of-successive-creates and makes the unit tests deterministic (context line 81's open question resolved: explicit `columnOrder`). `CreateColumnDto.columnOrder` is documented as optional ([`.claude/backend_api_map.md` line 256](../../.claude/backend_api_map.md#L256)); passing it is contract-valid.

**Sequential vs parallel:** POSTs are sequenced via `concatMap`, not `forkJoin`/parallel. Reasons:
1. Parallel completion order would require `columnOrder` to be explicit anyway — no latency win after serialization of Enter-key paths.
2. The backend's partial-failure semantics are clearer per-request under a known sequence; a failed parallel call can't tell us whether its neighbours succeeded before or after.
3. Cancellation-on-close-tab concerns (context edge case line 167) are simpler with one live request at a time.

**Color picker:** `CreateColumnDto.colorCode` is **omitted** on every POST per context explicit out-of-scope (context line 171). The backend treats it as optional.

**Cancel-during-submit:** The Cancel button is **disabled while `submitting()` is true** (tightening #32's behavior). Rationale: with a multi-POST sequence there is no clean client-side cancellation that avoids stranding a half-finished column list — simpler to block cancel during the window. Context line 166 explicitly permits either disabled-Cancel or operable-Cancel as long as the state is clear. This spec picks disabled + "Creating…" label to make the state explicit.

### Default column set — single source of truth

Defaults live as a frozen module-level constant so #70 uses one definition everywhere (dialog init, reset-after-submit, reset-after-cancel, unit tests):

```typescript
// File: src/app/features/projects/components/create-project-dialog/column-draft.model.ts
export const DEFAULT_COLUMN_NAMES = Object.freeze(['To Do', 'In Progress', 'Done'] as const);
```

Localisation is explicitly out of scope (context line 175). The constant is the correct centralisation point if an i18n pass later wraps these through `$localize`.

### Component Hierarchy

**Smart (modified):**
- `CreateProjectDialogComponent` — `src/app/features/projects/components/create-project-dialog/create-project-dialog.component.ts`
  - Grows a `columns: FormArray<FormGroup<ColumnDraftFormShape>>` alongside the existing `name` and `description` controls.
  - Initializes the array from `DEFAULT_COLUMN_NAMES` in a `buildColumnsArray()` helper invoked from the constructor. Re-invoking `buildColumnsArray()` is the reset-to-defaults mechanism; the dialog is always opened fresh by `@angular/cdk/dialog.open()` (new component instance each time), so no explicit reset call from outside is required — context ACs around "re-opening shows defaults" (context line 95) are satisfied by CDK's instance-per-open semantics alone.
  - Replaces its direct `projectState.createProject(...)` call with a single `projectCreation.createProjectWithColumns(input)` call. The dialog component does NOT import `ColumnsApiService` directly; that's a new service's job.
  - Adds three signals to its existing `submitting` / `errorMessage`: `partialFailureNames: signal<string[]>([])`, `creationPhase: signal<'idle'|'project'|'columns'>(...)`, and keeps the existing `errorMessage` as the user-readable string for the top-level project-failed or overall-failure case.
  - Keeps the `runInInjectionContext(appInjector, …)` pattern from #32 so closing the dialog mid-request does not cancel the HTTP chain — the service's internal `tap()` still prepends the project to the cache and the remaining column POSTs still complete.
  - `onCancel()` gains an early-return when `submitting()` is true (belt-and-braces — the template already disables the button during submit; this prevents a programmatic caller from slipping through).

**Dumb (new):**
- `ColumnDraftListComponent` — `src/app/features/projects/components/column-draft-list/column-draft-list.component.ts`
  - **Inputs:**
    - `formArray: FormArray<FormGroup<ColumnDraftFormShape>>` (required) — the array from the parent, passed by reference so edits propagate without intermediate events.
    - `disabled: boolean` — set `true` while the parent's `submitting()` is true; disables name inputs, remove buttons, reorder buttons, and the add button in one step.
  - **Outputs:** none. The component edits the FormArray in place (Angular forms' standard pattern — no event-based echoing).
  - **Responsibilities:**
    - Render one row per array entry: name input + remove button + up/down buttons.
    - `addColumn()` → pushes a new `buildColumnDraftGroup('')` onto the array and focuses the new row's name input (via `@ViewChildren` on a `#nameInput` template ref).
    - `removeColumn(index)` → `formArray.removeAt(index)` and move focus to the previous row's name input, or the Add button if the list is now empty.
    - `moveUp(index)` / `moveDown(index)` → swap via `formArray.removeAt(index)` + `formArray.insert(newIndex, group)`; preserves focus on the moved row's name input; no-ops at boundaries (index === 0 for up, index === length-1 for down).
    - Hosts a `cdkDropList` on its container so pointer users can drag rows to reorder; `cdkDragDrop` handler uses the same swap-by-index logic as the keyboard buttons.
    - Exposes a per-row `duplicateOf: number | null` computed from the array's `duplicateNames` validator error so rows can visually mark themselves (render is a design-spec call — this component only computes the flag).
  - Uses `ChangeDetectionStrategy.OnPush`. Signals/`input()`/`output()` where applicable for consistency with the board components.
  - No direct injection of `ProjectStateService`, `ColumnsApiService`, or HTTP. Purely presentational over the FormArray.

**Dumb (reused as-is):**
- `FormInputComponent` — used for each column-row name input via `<app-form-input label="Column N name" [control]="...">`. Already handles `required`, `maxlength`, and `whitespaceOnly` error branches (extended in #32). No further changes to `FormInputComponent` are needed for #70.

### New Files to Create

- `src/app/features/projects/components/column-draft-list/column-draft-list.component.ts`
- `src/app/features/projects/components/column-draft-list/column-draft-list.component.html`
- `src/app/features/projects/components/column-draft-list/column-draft-list.component.scss`
- `src/app/features/projects/components/column-draft-list/column-draft-list.component.spec.ts`
- `src/app/features/projects/components/create-project-dialog/column-draft.model.ts` — `ColumnDraftFormShape`, `ColumnDraftValue`, `buildColumnDraftGroup`, `DEFAULT_COLUMN_NAMES` constant.
- `src/app/features/projects/validators/column-array.validators.ts` — exports `minColumnsValidator` and `duplicateColumnNamesValidator`.
- `src/app/features/projects/validators/column-array.validators.spec.ts`
- `src/app/features/projects/services/project-creation.service.ts` — orchestrator service (composition of `ProjectStateService.createProject` + `ColumnsApiService.createColumn` sequential chain).
- `src/app/features/projects/services/project-creation.service.spec.ts`

### Files to Modify

- `src/app/features/projects/components/create-project-dialog/create-project-dialog.component.ts` — add FormArray; add column-draft lifecycle; swap `projectState.createProject` for `projectCreation.createProjectWithColumns`; add `partialFailureNames` signal.
- `src/app/features/projects/components/create-project-dialog/create-project-dialog.component.html` — mount `<app-column-draft-list>` between Description and error banner; add an `@if (partialFailureNames().length > 0)` warning region adjacent to the error banner; disable Cancel while submitting.
- `src/app/features/projects/components/create-project-dialog/create-project-dialog.types.ts` — extend `CreateProjectFormShape` with `columns: FormArray<FormGroup<ColumnDraftFormShape>>`; add `CreateProjectDialogResult` discriminated-union variant for partial success.
- `src/app/features/projects/components/create-project-dialog/create-project-dialog.component.spec.ts` — extend with AC-mapped tests per [QA Guidance](#qa-guidance).
- `src/app/features/board/services/columns-api.service.ts` — add `createColumn(projectId, dto): Observable<ColumnResponseDto>`; extend `ColumnOperation` union to `'list' | 'create'`; extend `mapColumnErrorToUserMessage` with `'create'` copy.
- `src/app/features/board/services/columns-api.service.spec.ts` — add tests covering the new method and the new error-operation branches.
- `src/app/features/board/models/column.model.ts` — add `CreateColumnDto`, `ColumnCreateResponse` (single-DTO envelope) types to mirror `ColumnsListResponse`.

### Files NOT to Modify

- `src/app/features/projects/state/project-state.service.ts` — its `createProject(input)` contract stays intact; the new `ProjectCreationService` calls it through rather than bypassing it, so the cache-prepend + DTO-shape guard + error-mapping all continue to run unchanged.
- `src/app/features/projects/services/projects-api.service.ts` — HTTP layer is unchanged.
- `src/app/features/board/state/board-state.service.ts` — irrelevant to this flow (creation happens on `/dashboard`; board state is scoped to a viewed board and is populated by `GET /api/column/project/{projectId}` when the user later navigates to the board).
- `src/app/app.routes.ts` — modal, no route change.
- `package.json` — `@angular/cdk` drag-drop is already installed (used by `BoardColumnComponent`); no new dependency.

---

## State & Data Layer

### TypeScript Interfaces

**File:** `src/app/features/projects/components/create-project-dialog/column-draft.model.ts`

```typescript
/**
 * Per-row form shape. Only `name` is a form control — the row's ordering
 * is implicit in its index inside the parent FormArray.
 */
export interface ColumnDraftFormShape {
  name: FormControl<string>;
}

/** Snapshot value of one draft row after FormArray.value projection. */
export interface ColumnDraftValue {
  name: string;
}

/** Factory used on init and on "Add column". */
export function buildColumnDraftGroup(initialName: string): FormGroup<ColumnDraftFormShape> {
  return new FormGroup<ColumnDraftFormShape>({
    name: new FormControl<string>(initialName, {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.maxLength(100),
        whitespaceOnlyValidator
      ]
    })
  });
}

/** Single source of truth for the default column set (context line 93). */
export const DEFAULT_COLUMN_NAMES = Object.freeze(['To Do', 'In Progress', 'Done'] as const);
```

**File:** `src/app/features/projects/components/create-project-dialog/create-project-dialog.types.ts` (extended)

```typescript
export interface CreateProjectFormShape {
  name: FormControl<string>;
  description: FormControl<string>;
  columns: FormArray<FormGroup<ColumnDraftFormShape>>;
}

/**
 * Discriminated-union result emitted on `DialogRef.close(result)`.
 * - `success`: project created, ALL columns created.
 * - `partial`: project created, one or more columns failed. The dashboard
 *   will still show the project card (the state-service prepended it on
 *   project-POST success); the caller can decide whether to surface a
 *   toast or route to the board.
 * - (no `failure` variant — failure keeps the dialog open; we only close
 *   the dialog on project success.)
 */
export type CreateProjectDialogResult =
  | { status: 'success'; project: ProjectSummary; columns: ColumnResponseDto[] }
  | {
      status: 'partial';
      project: ProjectSummary;
      createdColumns: ColumnResponseDto[];
      failedNames: string[];
      message: string;
    };
```

### Array-level validators

**File:** `src/app/features/projects/validators/column-array.validators.ts`

```typescript
/**
 * Rejects an empty `FormArray<FormGroup<ColumnDraftFormShape>>`. Emits
 * `{ minColumns: { required: 1, actual: 0 } }` on the array itself.
 * Context AC: empty column list blocks submit (context line 112, 122).
 */
export const minColumnsValidator: ValidatorFn;

/**
 * Flags case-insensitive trimmed duplicate column names. Emits
 * `{ duplicateNames: { duplicates: number[] } }` on the array, where
 * `duplicates` is the list of indices whose trimmed-lowercase name
 * matches the trimmed-lowercase name of some earlier index. The
 * first occurrence is NOT flagged; only the later ones are — so the
 * row the user most recently edited is the one that surfaces the error.
 *
 * Context edge case: `"Done"` and `"done"` are duplicates (context line 163).
 */
export const duplicateColumnNamesValidator: ValidatorFn;
```

The two are applied together on the FormArray:

```typescript
columns: new FormArray<FormGroup<ColumnDraftFormShape>>(
  DEFAULT_COLUMN_NAMES.map(name => buildColumnDraftGroup(name)),
  { validators: [minColumnsValidator, duplicateColumnNamesValidator] }
)
```

### State Management Strategy

**Signals (UI state):**

```typescript
protected readonly submitting = signal<boolean>(false);
protected readonly errorMessage = signal<string | null>(null);
/** Names of columns whose POST failed after a successful project POST. */
protected readonly partialFailureNames = signal<string[]>([]);
/** Progress state for the loading label / aria-live copy. */
protected readonly creationPhase = signal<'idle' | 'project' | 'columns'>('idle');
```

- `submitting` gates the submit button, the Cancel button, disables the column draft list, and guards `onSubmit()` re-entry.
- `errorMessage` is used only for the top-level "project-failed" or "nothing was created" case — populated from `mapErrorToUserMessage(err, 'create')` or its column equivalent.
- `partialFailureNames` is populated when the project was created but one or more columns failed; rendered by a separate warning region in the template.
- `creationPhase` drives the submit-button label: `'project'` → "Creating project…"; `'columns'` → "Adding columns…"; `'idle'` on reset.

**Computed for disable logic:**

```typescript
protected readonly canSubmit = computed(() =>
  !this.submitting()
  && !this.form.invalid
);
```

Template binds `[disabled]="!canSubmit()"` on the submit button so the "valid + not-in-flight" check is expressed once. (AC line 121: submit disabled while any validation fails or submission is in flight.)

**No new service-level state.** All state is dialog-scoped or already owned by `ProjectStateService` (projects cache) and `BoardStateService` (the future board view's columns).

**Subscription ownership (preserved from #32):**

The submit call is NOT tied to the dialog's `DestroyRef`. It is subscribed inside `runInInjectionContext(appInjector, () => …)` so that closing the dialog mid-request does NOT cancel the HTTP chain. The orchestrator's internal side-effects (cache prepend of the project; sequential column POSTs) must run to completion regardless of dialog lifetime. Context edge case line 167 ("browser tab dies mid-request") is tolerated by the same mechanism.

---

## Service Integration

### New service: `ProjectCreationService`

**File:** `src/app/features/projects/services/project-creation.service.ts`

```typescript
/** Input to the orchestrator — mirrors #32's ProjectInput plus the column list. */
export interface ProjectWithColumnsInput {
  name: string;
  description: string | null;
  /** Names in user-intended order, already trimmed. */
  columnNames: string[];
}

/** Result shape — see also CreateProjectDialogResult discriminated union. */
export type ProjectCreationResult =
  | { status: 'success'; project: ProjectSummary; columns: ColumnResponseDto[] }
  | {
      status: 'partial';
      project: ProjectSummary;
      createdColumns: ColumnResponseDto[];
      failedNames: string[];
      message: string;
    };

@Injectable({ providedIn: 'root' })
export class ProjectCreationService {
  private readonly projectState = inject(ProjectStateService);
  private readonly columnsApi = inject(ColumnsApiService);

  /**
   * Creates a project and then creates each column sequentially with an
   * explicit `columnOrder` starting at 0. Continue-on-failure: each column
   * is attempted regardless of earlier column failures; collected failures
   * are reported in the result's `failedNames`.
   *
   * Error transport:
   *  - If `projectState.createProject` errors → Observable errors with the
   *    same `new Error(userMessage)` pattern the state service already
   *    produces. No column calls are issued. Caller handles by keeping the
   *    dialog open and rendering the error message (context line 117).
   *  - If project succeeds but ALL columns fail → Observable emits a
   *    'partial' result with an empty `createdColumns` and all names in
   *    `failedNames`. The dialog treats this as success-with-warning per
   *    the dumb-close-and-surface UX (design-spec refines the exact UX).
   *  - If project succeeds and SOME columns fail → Observable emits a
   *    'partial' result; caller surfaces the names.
   *  - If everything succeeds → Observable emits 'success'.
   */
  createProjectWithColumns(input: ProjectWithColumnsInput): Observable<ProjectCreationResult>;
}
```

**Internal implementation contract (developer guidance — not concrete code):**

1. Call `this.projectState.createProject({ name, description })`. This routes through the existing `ProjectsApiService.createProject` + cache-prepend + error-mapping chain. On error, let it propagate through the outer Observable's error branch.
2. On project success, `concatMap` into an RxJS chain that builds one `this.columnsApi.createColumn(project.id, { name, columnOrder })` observable per draft name, in order, collecting results into `createdColumns: ColumnResponseDto[]` and failures into `failedNames: string[]`. Each per-column observable is `pipe(catchError(...))` to `of({ kind: 'failed', name }) `so one failure does not abort the concatenation.
3. After the last column is attempted, `map` into either `{ status: 'success', ... }` or `{ status: 'partial', ..., message }`. The message is produced by a small helper that varies with count:
   - 1 failure, 1 total → column service's `mapColumnErrorToUserMessage(err, 'create')` output.
   - 1 failure among many → `"The project was created, but 1 column couldn't be added: {name}. You can add it from the board."`
   - Multiple failures → `"The project was created, but {N} columns couldn't be added: {names joined}. You can add them from the board."`

**Cache-prepend semantics:** the `ProjectStateService.createProject` tap already prepends the new project onto the grid. A partial-failure still leaves the project in the cache — this is correct and context-aligned (context line 118: "the dashboard reflects that the project was created").

### Extended service: `ColumnsApiService`

**File:** `src/app/features/board/services/columns-api.service.ts` (modified)

```typescript
/** Operation discriminator now includes 'create'. */
export type ColumnOperation = 'list' | 'create';

/**
 * Adds `POST /api/column/project/{projectId}`. Envelope unwrap matches
 * `getColumnsForProject`: `success: false` projects into an observable
 * error; `success: true` with non-null data unwraps the DTO.
 *
 * The service does NOT perform retry, does NOT swallow errors, does NOT
 * translate to user copy — the caller (`ProjectCreationService`) is in
 * charge of error translation and sequencing semantics.
 */
createColumn(projectId: string, dto: CreateColumnDto): Observable<ColumnResponseDto>;
```

**Error mapper extension** (`mapColumnErrorToUserMessage`):

- `operation === 'create'` adds these branches:
  - `status === 0` → "We couldn't reach the server. Please check your connection and try again." (reuse the existing copy).
  - `status === 401 || 403` → "Your session has expired. Please sign in again." (reuse).
  - `status === 404` → "We couldn't add a column — this project no longer exists." (new copy, `'create'` specific).
  - `status >= 500` → "Something went wrong on our end. Please try again in a moment." (reuse).
  - other 4xx → "We couldn't add a column. Please try again." (new copy, `'create'` specific).
- Generic-default copy for `'create'` → "We couldn't add a column. Please try again."

### Data model additions

**File:** `src/app/features/board/models/column.model.ts` (modified)

```typescript
/** Backend `CreateColumnDto` — mirrors .claude/backend_api_map.md:252-256. */
export interface CreateColumnDto {
  name: string;               // required, max 100
  colorCode?: string | null;  // optional — NOT sent by #70 (context line 171)
  columnOrder?: number | null; // sent by #70 as 0..N-1 for determinism
}

/** Envelope alias for the single-DTO create response. */
export type ColumnCreateResponse = ApiResponse<ColumnResponseDto>;
```

### HTTP Request/Response Contracts

The dialog never touches HTTP directly. For reference ([`.claude/backend_api_map.md`](../../.claude/backend_api_map.md) lines 57, 82, 250–268):

| Method | Endpoint | Request Body | Response Body | Error Codes |
|--------|----------|--------------|---------------|-------------|
| POST | `/api/project` | `CreateProjectDto { name, description }` | `201 ApiResponse<ProjectResponseDto>` | 400, 401, 500 |
| POST | `/api/column/project/{projectId}` | `CreateColumnDto { name, columnOrder }` | `201 ApiResponse<ColumnResponseDto>` | 400, 401, 404 (project gone), 500 |

### Submit payload transformation (context ACs line 92, 162)

Inside `onSubmit()`, after all form validators pass:

```typescript
const rawName = this.form.controls.name.value;
const rawDescription = this.form.controls.description.value;
const rawColumns = this.form.controls.columns.controls.map(g => g.controls.name.value);

const input: ProjectWithColumnsInput = {
  name: rawName.trim(),
  description: rawDescription.trim().length === 0 ? null : rawDescription,
  columnNames: rawColumns.map(n => n.trim())
};
```

Column names are trimmed at the boundary (matches the backend-side normalization expectation implicit in "required, max 100" and mirrors the Title trimming behavior from #32). The order in `rawColumns` is authoritative and is the order passed to `columnOrder: 0..N-1`.

### Error transport summary

| Scenario | Observable branch | Dialog UI |
|----------|-------------------|-----------|
| Project POST fails | error | Dialog stays open, `errorMessage()` set, form values preserved, submit re-enabled |
| Project OK, all columns OK | success: `'success'` | `dialogRef.close({status: 'success', ...})` |
| Project OK, some columns fail | success: `'partial'` | Dialog closes with `dialogRef.close({status: 'partial', ...})` — the dashboard's caller of `dialog.open(...)` receives the result; surfacing it (toast, banner, route to board) is a design-spec call |
| Project OK, ALL columns fail | success: `'partial'` with empty `createdColumns` | Same as above |

Rationale for closing on partial: the project card is already on the dashboard (the state-service cache prepend ran inside `projectState.createProject`'s tap). Keeping the dialog open with a half-populated form would be contradictory — the project the user was editing has been persisted. Showing the partial-failure context on the dashboard/board surface is both honest and matches "user is not stranded" (context line 119).

**Design-spec open question:** should the dashboard render a banner/toast from the `'partial'` result, or should the user be automatically routed to the new board? Either is AC-compliant. The tech spec exposes the partial info; the UX choice is deferred.

---

## Implementation Steps

Follow in order.

### 1. Create the column-draft model + defaults constant

- [ ] Create `src/app/features/projects/components/create-project-dialog/column-draft.model.ts`. Export `ColumnDraftFormShape`, `ColumnDraftValue`, `buildColumnDraftGroup`, and `DEFAULT_COLUMN_NAMES = Object.freeze(['To Do', 'In Progress', 'Done'] as const)`.
- [ ] `buildColumnDraftGroup(initialName)` must apply `Validators.required`, `Validators.maxLength(100)`, and the shared `whitespaceOnlyValidator` to the `name` control (matching `FormInputComponent`'s supported error branches).

### 2. Create the array-level validators

- [ ] Create `src/app/features/projects/validators/column-array.validators.ts` with `minColumnsValidator` and `duplicateColumnNamesValidator` per the [State & Data Layer](#state--data-layer) contracts.
- [ ] `duplicateColumnNamesValidator` uses trimmed + lowercased comparison; skips empty/whitespace-only values (those already fail the per-row `required`/`whitespaceOnly` validators — no need to double-error).
- [ ] Emit the error key on the array itself, not on individual rows. Row-level surfacing is derived via a `duplicateIndexForRow(index)` helper in `ColumnDraftListComponent`.
- [ ] Create `column-array.validators.spec.ts` covering: empty array → `minColumns`; single row → pass; two rows same name → `duplicateNames` with `duplicates: [1]`; two rows different case → `duplicates: [1]`; two rows with whitespace-only → no duplicate error (whitespace-only is already invalid); three rows with name at indices 0 and 2 duplicate → `duplicates: [2]`.

### 3. Create `ColumnDraftListComponent`

- [ ] Generate the component from `KanbAI-Web/KanbAI-Web/`:
  ```bash
  ng generate component features/projects/components/column-draft-list --skip-tests=false
  ```
- [ ] Mark it standalone. Imports: `CommonModule`, `ReactiveFormsModule`, `FormInputComponent`, `DragDropModule` (from `@angular/cdk/drag-drop`).
- [ ] `ChangeDetectionStrategy.OnPush`.
- [ ] Inputs (use `input.required<...>()` / `input<...>()` signal APIs — match `BoardColumnComponent` conventions):
  - `formArray = input.required<FormArray<FormGroup<ColumnDraftFormShape>>>()`
  - `disabled = input<boolean>(false)`
- [ ] Expose `columnGroups = computed(() => this.formArray().controls as FormGroup<ColumnDraftFormShape>[])`.
- [ ] Expose `duplicateFlags = computed<Set<number>>(() => {...})` derived from `formArray().errors?.['duplicateNames']?.duplicates ?? []`.
- [ ] Template (element-by-element contract, no concrete code in this spec):
  - Root `<fieldset class="column-draft-list" [disabled]="disabled()">` with a visible `<legend>Initial columns</legend>`.
  - A `<ol>` or `<ul>` with `cdkDropList` + `(cdkDropListDropped)="onDrop($event)"` wrapping the row list.
  - `@for (group of columnGroups(); track group; let i = $index)`:
    - Each row is a `<li cdkDrag>` containing: drag handle affordance, `<app-form-input [label]="'Column ' + (i+1) + ' name'" [control]="group.controls.name" [required]="true">`, up button (`aria-label="Move column {{ group.controls.name.value }} up"`, `[disabled]="i === 0 || disabled()"`), down button (symmetric), remove button (`aria-label="Remove column {{ group.controls.name.value }}"`, `[disabled]="disabled()"`).
    - Duplicate hint rendered inside the row when `duplicateFlags().has(i)` — copy TBD by design spec; recommended: `"This name matches another column."`.
  - Add button at the bottom: `<button type="button" (click)="addColumn()" [disabled]="disabled()">+ Add column</button>`.
  - Empty-list hint rendered when `columnGroups().length === 0`: inline message "Add at least one column to continue." (satisfies context line 122's inline copy AC).
- [ ] Methods:
  - `addColumn()` — pushes `buildColumnDraftGroup('')`, then in an `afterNextRender` or `ngAfterViewChecked` hook focuses the new row's name input via `@ViewChildren('nameInput')`.
  - `removeColumn(index)` — `formArray.removeAt(index)`; focus moves to the previous row's name input if `index > 0`, else to the Add button if the list is now empty, else to the new row at `index` (the former next row has now taken that index).
  - `moveUp(index)` / `moveDown(index)` — swap via remove+insert; keep focus on the moved row's name input.
  - `onDrop(event: CdkDragDrop<...>)` — reuse CDK's `moveItemInArray(...)` equivalent on the FormArray: `const group = formArray.at(event.previousIndex); formArray.removeAt(event.previousIndex); formArray.insert(event.currentIndex, group);`. No focus change (pointer user already has focus context).
- [ ] Accessibility requirements derived from context ACs line 139-144:
  - `<fieldset>` + `<legend>` gives the list a group name.
  - Each name input's label is "Column N name" (context line 99).
  - Every reorder / remove button has an `aria-label` interpolating the current name so screen readers announce "Remove column 'In Progress'" etc.
  - `aria-live="polite"` on a hidden status region that announces "Column added" / "Column removed" / "Columns reordered" after each mutation (ensures assistive tech catches the state change without relying on focus alone).

### 4. Extend `ColumnsApiService`

- [ ] Open `src/app/features/board/models/column.model.ts`. Add `CreateColumnDto` and `ColumnCreateResponse` types per [Data model additions](#data-model-additions).
- [ ] Open `src/app/features/board/services/columns-api.service.ts`. Change `ColumnOperation` to `'list' | 'create'`.
- [ ] Add `createColumn(projectId: string, dto: CreateColumnDto): Observable<ColumnResponseDto>`:
  - URL: `` `${this.apiUrl}/project/${encodeURIComponent(projectId)}` `` (same path as `getColumnsForProject`, different method).
  - Envelope unwrap: on `success: false` or `data == null`, `throw new Error(...)` to project into the Observable's error branch. Mirrors `getColumnsForProject` and `ProjectsApiService.createProject`.
- [ ] Extend `mapColumnErrorToUserMessage` with `'create'` branches per [Extended service](#extended-service-columnsapiservice). Remove the `void operation;` unused-param workaround — it's now used.
- [ ] Update `columns-api.service.spec.ts`:
  - Happy-path `createColumn` → 201 envelope-wrapped DTO → emits DTO.
  - `success: false` envelope → Observable errors with `response.errors[0]`.
  - `'create'` error-mapper paths: 0, 401, 403, 404, 500, 400, default.

### 5. Create `ProjectCreationService`

- [ ] Generate: `ng generate service features/projects/services/project-creation` from `KanbAI-Web/KanbAI-Web/`.
- [ ] Implement `createProjectWithColumns` per the [contract](#new-service-projectcreationservice). Key points:
  - Import `ProjectStateService`, `ColumnsApiService`, `mapColumnErrorToUserMessage`.
  - Start the chain with `this.projectState.createProject({ name, description })`.
  - `concatMap(project => ...)` into a per-column `concat(...)` of `this.columnsApi.createColumn(project.id, {name, columnOrder: i})` pipes — each wrapped in `catchError(err => of({kind: 'failed', name, message: mapColumnErrorToUserMessage(err, 'create')}))`.
  - Collect with `toArray()` or a manual `reduce` into `{ createdColumns, failedNames, lastMessage }`.
  - Final `map` resolves into `{status: 'success', ...}` or `{status: 'partial', ..., message}` per the [Error transport summary](#error-transport-summary).
- [ ] Write unit tests covering the five scenarios in that table. Mock `ProjectStateService` and `ColumnsApiService` with controlled `Subject`s / `of(...)` / `throwError(...)` returns.

### 6. Update `CreateProjectDialogComponent`

- [ ] Open `create-project-dialog.component.ts`. Inject `ProjectCreationService` via `inject(ProjectCreationService)`; remove the direct `ProjectStateService` import if it's no longer used (it isn't — the dialog goes through `ProjectCreationService` now).
- [ ] Extend the `form` FormGroup with a `columns: FormArray` initialized to three `buildColumnDraftGroup('To Do' | 'In Progress' | 'Done')` instances. Attach `minColumnsValidator` and `duplicateColumnNamesValidator` to the array.
- [ ] Add `partialFailureNames = signal<string[]>([])` and `creationPhase = signal<'idle'|'project'|'columns'>('idle')`.
- [ ] Rewrite `onSubmit()`:
  1. Early return if `this.submitting()`.
  2. If `this.form.invalid`, `this.form.markAllAsTouched()` and return.
  3. Build `input: ProjectWithColumnsInput` per [Submit payload transformation](#submit-payload-transformation-context-acs-line-92-162).
  4. `this.submitting.set(true); this.errorMessage.set(null); this.partialFailureNames.set([]); this.creationPhase.set('project');`
  5. Inside `runInInjectionContext(this.appInjector, () => ...)` subscribe to `this.projectCreation.createProjectWithColumns(input)`:
     - `next: (result) => { if (result.status === 'success') { this.dialogRef.close(result); } else { /* partial */ this.dialogRef.close(result); } }`. Both variants close the dialog — see [Error transport summary](#error-transport-summary).
     - `error: (err: Error) => { this.submitting.set(false); this.creationPhase.set('idle'); this.errorMessage.set(err.message ?? 'Something went wrong. Please try again.'); }`. This branch fires ONLY for project-level failure.
  6. Optional: if you have a way to observe the orchestrator's internal progress transition (e.g., the orchestrator exposes a `tap(project => phase.next('columns'))` callback), wire `creationPhase.set('columns')` at that point. Otherwise leave `creationPhase` at `'project'` for the whole duration — the submit label falls back to "Creating…" as in #32. Not an AC.
- [ ] Update `onCancel()`: early return if `this.submitting()` — Cancel is disabled in template but guard programmatic calls too.
- [ ] Keep the existing `form.valueChanges` subscriber that clears `errorMessage` on edit. Do NOT clear `partialFailureNames` on edit — that list is only set on dialog close, by which point the component is being destroyed anyway.

### 7. Update the dialog template

- [ ] Open `create-project-dialog.component.html`. Between the Description `<app-form-input>` and the `@if (errorMessage())` block, mount the draft list:
  ```
  <app-column-draft-list
    [formArray]="form.controls.columns"
    [disabled]="submitting()">
  </app-column-draft-list>
  ```
- [ ] Update the submit button's disabled binding to `[disabled]="!canSubmit()"` (computed) and its label to reflect `creationPhase()` if desired — design-spec may pick "Creating…" as the one-label compromise.
- [ ] Update Cancel to `[disabled]="submitting()"` (new — tightens #32's permissive Cancel for the multi-POST window).
- [ ] Leave the existing error banner (`@if (errorMessage())`) unchanged. It renders project-level failures only.

### 8. Update the dialog types

- [ ] Open `create-project-dialog.types.ts`. Extend `CreateProjectFormShape` with the `columns: FormArray<FormGroup<ColumnDraftFormShape>>` member. Replace the current `CreateProjectDialogResult` with the discriminated-union form from [TypeScript Interfaces](#typescript-interfaces). Imports: `ColumnResponseDto` from `../../../board/models/column.model`, `ColumnDraftFormShape` from `./column-draft.model`.

### 9. Verify build and tests

- [ ] From `KanbAI-Web/KanbAI-Web/`:
  - `npm run build` — must succeed, no feature-attributable warnings.
  - `npm run test -- --watch=false` — all tests pass, no INTRODUCED failures per CLAUDE.md classification.
- [ ] If a build or INTRODUCED test fails, do NOT mark the issue complete. Debug, fix, re-run.

### 10. Append a Development Status section

- [ ] At the bottom of this file, append `## Development Status` with: date, files created/modified, build result, test counts, divergences from this spec, and open questions handed to design spec.

**Performance Considerations:**
- `OnPush` on both `CreateProjectDialogComponent` and `ColumnDraftListComponent`. FormArray changes trigger the parent's CD via reactive-forms binding; signal reads in templates trigger CD on the consuming view.
- `@for` over `columnGroups()` uses `track group` (stable object identity across array mutations) rather than `track $index` (would churn after reorder).
- No virtual scroll — a realistic upper bound on user-entered columns is in the low double digits; CDK virtual scrolling would add complexity for no observable gain. If a user genuinely adds 100 columns, the dialog scrolls natively (design-spec call).
- Sequential column POSTs add up to roundtrip × N latency. For N = 3 (the default case) this is negligible; for N = 10+ this is visible (2-5s) but acceptable given the one-time cost on project creation. Parallel was explicitly rejected above.

---

## QA Guidance

### Test Strategy

**Unit tests — `minColumnsValidator`** (`column-array.validators.spec.ts`):
- Empty array → `{ minColumns: { required: 1, actual: 0 } }`.
- Single-row array → `null`.
- Multi-row array → `null`.

**Unit tests — `duplicateColumnNamesValidator`:**
- `["A", "B", "C"]` → `null`.
- `["A", "A"]` → `{ duplicateNames: { duplicates: [1] } }`.
- `["A", "a"]` → `{ duplicateNames: { duplicates: [1] } }` (case-insensitive).
- `[" A ", "a"]` → `{ duplicateNames: { duplicates: [1] } }` (trimmed).
- `["", " "]` → `null` (whitespace-only values not deduped — they're already invalid per row).
- `["A", "B", "A"]` → `{ duplicateNames: { duplicates: [2] } }`.
- `["A", "B", "A", "a"]` → `{ duplicateNames: { duplicates: [2, 3] } }`.

**Unit tests — `ColumnsApiService.createColumn`:**
- Happy path: mock `HttpClient.post` to return envelope `{success: true, data: mockDto}` → emits `mockDto`.
- `success: false` envelope → Observable errors with `response.errors[0]`.
- `data: null` with `success: true` → Observable errors.
- URL assertion: body is forwarded unchanged; URL contains `encodeURIComponent(projectId)`.

**Unit tests — `mapColumnErrorToUserMessage('create', …)`** (extends existing suite):
- 0, 401, 403, 404, 500, 400, other errors all return non-empty user-readable strings with no status-code/URL leakage.

**Unit tests — `ProjectCreationService.createProjectWithColumns`:**

Mock both injected services via `Subject`-backed spies so arrival order is controllable.

1. **Full success.** Project resolves; each column resolves. Result: `{status: 'success', project, columns: [c1, c2, c3]}`. Assert `columnOrder` passed was `0, 1, 2` in order.
2. **Project error.** `projectState.createProject` errors → outer Observable errors with the same Error. No `columnsApi.createColumn` calls made.
3. **First column fails, rest succeed.** Result: `{status: 'partial', project, createdColumns: [c2, c3], failedNames: ['To Do'], message: ...}`. Assert all three column POSTs were attempted.
4. **All columns fail.** Result: `{status: 'partial', project, createdColumns: [], failedNames: ['To Do', 'In Progress', 'Done'], message: ...}`.
5. **Middle column fails, others succeed.** Result: `{status: 'partial', createdColumns: [c1, c3], failedNames: ['In Progress'], ...}`.
6. **Order preservation.** Input `columnNames: ['C', 'A', 'B']` → POSTs in sequence C (order 0), A (order 1), B (order 2). Not alphabetical.

**Unit tests — `ColumnDraftListComponent`:**
- Renders three rows on init when parent passes a three-entry array.
- Clicking "Add column" appends a row; new row's name input receives focus.
- Clicking remove on row 1 (index 0) removes it; focus moves to new row 0's name input (formerly row 1).
- Clicking remove on the last remaining row moves focus to the Add button.
- Clicking "move up" on row 1 swaps with row 0; name values persist; focus remains on the moved row's name input.
- "Move up" on row 0 is no-op (button disabled).
- `duplicateFlags()` returns the index set matching the array's `duplicateNames` error.
- `disabled=true` disables all inputs/buttons (via `<fieldset disabled>`).

**Unit tests — `CreateProjectDialogComponent` (extended from #32 suite):**

Map to context ACs:

| Test | Context AC |
|------|-----------|
| Dialog opens with exactly 3 rows: "To Do", "In Progress", "Done" in order | line 93 |
| Defaults are editable immediately (no toggle) | line 94 |
| Renaming "In Progress" → "Working" persists in `form.controls.columns.at(1).controls.name.value` | line 98 |
| 101-char name blocks submit; 100-char name permits submit | line 100 |
| `""` / `"   "` column name blocks submit with whitespaceOnly error | line 101 |
| `["Done", "done"]` blocks submit with `duplicateNames` on the array | line 102 |
| Add button appends an empty row and focuses its name input | line 105 |
| Remove deletes the row and moves focus per the rules in step 3 | lines 108-111 |
| Reorder (up/down) updates `form.value.columns` order immediately | line 117 |
| Removing all 3 rows leaves empty list and inline "Add at least one column" message; submit disabled | lines 112, 122 |
| Valid submit calls `projectCreation.createProjectWithColumns` with the trimmed names in order | line 123 |
| Success (`status: 'success'`) closes dialog with the result | line 123 |
| Partial (`status: 'partial'`) closes dialog with the result; `dialogRef.close` receives the partial payload | lines 118-119 |
| Project-level error keeps dialog open, populates `errorMessage`, re-enables submit | line 128 |
| Double-click on submit invokes orchestrator exactly once | line 125 |
| Cancel while submitting is disabled (button disabled + programmatic guard) | line 125 (no duplicate submission), line 166 (explicit allowance) |
| Late response still fires after dialog destroy (Subject-based test, same as #32 pattern) | lines 141/167 implicitly — preserved from #32 |
| Editing the name field clears `errorMessage` | carried from #32 |
| Re-opening dialog after prior submit shows defaults again (CDK creates a fresh instance) | line 95 |

### Mocking Instructions

```typescript
// ProjectCreationService mock
const mockCreationResult$ = new Subject<ProjectCreationResult>();
const mockProjectCreation: Pick<ProjectCreationService, 'createProjectWithColumns'> = {
  createProjectWithColumns: vi.fn(() => mockCreationResult$.asObservable())
};

TestBed.configureTestingModule({
  imports: [CreateProjectDialogComponent],
  providers: [
    { provide: ProjectCreationService, useValue: mockProjectCreation },
    { provide: DialogRef, useValue: { close: vi.fn() } }
  ]
});

// In a specific test
mockCreationResult$.next({ status: 'success', project: mockProject, columns: [c1, c2, c3] });
```

### Edge Cases to Test

- **100-char column name** accepted; **101-char** rejected (boundary inclusive per backend `max 100`).
- **Leading/trailing whitespace in column names** trimmed for duplicate detection and for the submit payload; the UI retains what the user typed.
- **User removes "Done" default, then types "done" into a new row** → accepted (no duplicate because the original was removed).
- **Adding 15 columns** → form remains usable (vertical scroll inside the dialog); submit stays reachable.
- **Network offline during project POST (HTTP 0)** → `errorMessage` shows "We couldn't reach the server…"; columns list unchanged; Cancel re-enabled.
- **Network offline during the second column POST** → `partial` result with `failedNames` containing columns at indices 1…N-1; project and column 0 are real on the server.
- **Submit, then close browser tab before response** → orchestrator subscription lives on the app-root injector; `projectState.createProject`'s tap still prepends the project to the cache on the next page load (via the natural `loadProjects()`). Column side effects may or may not complete — tolerated per context line 167.
- **Re-open dialog after prior success** → fresh defaults (CDK instance-per-open).
- **Re-open dialog after prior partial failure** → fresh defaults (same reason).
- **Drag-and-drop reorder** → matches keyboard reorder's result.

### Accessibility verification

- **`axe-core` scan** of the dashboard page with the dialog open and the draft list populated returns zero critical/serious violations (context line 143).
- **Tab order** (context line 141): Title → Description → for each row: Column name input → Reorder up → Reorder down → Remove → Add button → Cancel → Submit. Shift+Tab reverses.
- **Screen reader announces** "Column 1 name", "Column 2 name" etc. when tabbing into each name input (via `FormInputComponent`'s `aria-label`).
- **Validation errors announced** via `aria-invalid` (field-level, already present in `FormInputComponent`) and a polite live region in `ColumnDraftListComponent` for array-level errors ("At least one column is required", "Columns 'Done' and 'done' have the same name").
- **Drag-and-drop is keyboard-alternative available**: up/down buttons satisfy the keyboard-operable AC even if pointer-drag is flaky for a user (context line 115).
- **Focus trap** + **focus return** are carried from CDK Dialog unchanged — no new work for #70 (context line 142).

### Out-of-scope for #70

No tests needed for column color, post-creation column editing/renaming/deleting, project templates, localisation, cross-tab reconciliation during the dialog's lifetime, or transactional undo. Per context lines 171-181.

---

*The technical specification is saved. You can now instruct the web-designer agent to create the design specification.*

---

## Development Status

**Implementation Date:** 2026-05-07
**Branch:** `70-dynamic-column-setup-on-project-creation`
**Developer:** Claude Opus 4.7 (1M context)

### Files Created

Validators
- `src/app/features/projects/validators/column-array.validators.ts`
- `src/app/features/projects/validators/column-array.validators.spec.ts`

Models
- `src/app/features/projects/components/create-project-dialog/column-draft.model.ts`

Orchestrator service
- `src/app/features/projects/services/project-creation.service.ts`
- `src/app/features/projects/services/project-creation.service.spec.ts`

Column draft list component
- `src/app/features/projects/components/column-draft-list/column-draft-list.component.ts`
- `src/app/features/projects/components/column-draft-list/column-draft-list.component.html`
- `src/app/features/projects/components/column-draft-list/column-draft-list.component.scss`
- `src/app/features/projects/components/column-draft-list/column-draft-list.component.spec.ts`

Partial-failure toast (design spec §3.4)
- `src/app/features/projects/components/partial-failure-toast/partial-failure-toast.component.ts`
- `src/app/features/projects/components/partial-failure-toast/partial-failure-toast.component.html`
- `src/app/features/projects/components/partial-failure-toast/partial-failure-toast.component.scss`
- `src/app/features/projects/components/partial-failure-toast/partial-failure-toast.component.spec.ts`

### Files Modified

- `src/app/features/board/models/column.model.ts` — added `CreateColumnDto` and `ColumnCreateResponse` types.
- `src/app/features/board/services/columns-api.service.ts` — added `createColumn()`; extended `ColumnOperation` to `'list' \| 'create'`; extended `mapColumnErrorToUserMessage` with `'create'` branches.
- `src/app/features/board/services/columns-api.service.spec.ts` — added `createColumn` coverage + `'create'` error-mapper branches.
- `src/app/features/projects/components/create-project-dialog/create-project-dialog.component.ts` — swapped `ProjectStateService` for `ProjectCreationService`; added `columns` FormArray with validators; added `partialFailureNames` / `creationPhase` signals; added `canSubmit` computed; `onCancel` guards against submit-in-flight.
- `src/app/features/projects/components/create-project-dialog/create-project-dialog.component.html` — mounted `<app-column-draft-list>`; Cancel gets `[disabled]="submitting()"`; submit button shows phase-aware "Creating project…" / "Adding columns…" label; added polite live region for phase transitions.
- `src/app/features/projects/components/create-project-dialog/create-project-dialog.component.scss` — added Cancel `:disabled` treatment per design spec §3.2.
- `src/app/features/projects/components/create-project-dialog/create-project-dialog.component.spec.ts` — rewrote around `ProjectCreationService` mock; added AC-mapped tests per QA table.
- `src/app/features/projects/components/create-project-dialog/create-project-dialog.types.ts` — extended `CreateProjectFormShape` with `columns`; replaced `CreateProjectDialogResult` with the discriminated union.
- `src/app/features/projects/dashboard-page/dashboard-page.component.ts` — subscribes to `dialogRef.closed` and renders `PartialFailureToastComponent` on `'partial'`.
- `src/app/features/projects/dashboard-page/dashboard-page.component.html` — mounts `<app-partial-failure-toast>` conditionally.
- `src/app/features/projects/dashboard-page/dashboard-page.component.spec.ts` — updated dialog mock to return `{ closed }`; added tests for partial-failure toast rendering, dismissal, and openBoard routing.

### Build & Test Results

- **Build:** `npm run build` — SUCCESS.
  - Two component-style-budget warnings (default `4 kB` warning threshold, `8 kB` error threshold):
    - `column-draft-list.component.scss` compiles to ~6.09 kB — above the 4 kB warning budget but well under the 8 kB error budget. Feature-intrinsic: the component renders many states (row grid + drag preview + placeholder + drop-list receiving + duplicate accent + add/empty/live-region + mobile grid override). Matches the precedent set by `upload-progress-row.component.scss` (4.27 kB, shipped by PR #72).
    - `upload-progress-row.component.scss` — pre-existing warning, not introduced by #70.
  - Pre-existing Sass deprecation warnings in `src/app/features/board/board-page/board-page.component.scss` around unary-minus whitespace — not introduced by #70.

- **Tests:** `npm run test -- --watch=false`
  - Targeted run of all 7 spec files touched or added by #70 → **119 / 119 passed** (deterministic).
  - Full suite (1116 tests total) — **1116 passed** on two of three back-to-back runs.
  - On one of three runs, `signalr.service.spec.ts` (17 tests in one file) reported `Cannot read properties of null (reading '_connection')` via unhandled errors.
    - **Classification: PRE-EXISTING.** Reproduced on clean `main` (branch un-stashed) with the same intermittent failure pattern; not caused by the #70 changes. The signalr spec passes 21/21 when run in isolation. The flakiness is a cross-file timing interaction in the existing vitest setup, independent of this ticket.
  - No INTRODUCED test failures.

### Classification

- All INTRODUCED tests (ColumnDraftListComponent, column-array validators, ProjectCreationService, PartialFailureToastComponent, extended ColumnsApiService coverage, extended CreateProjectDialog coverage, extended DashboardPage coverage) pass deterministically.
- PRE-EXISTING signalr flakiness: documented, not blocking per CLAUDE.md.

### Deviations from the Spec

- **SCSS budget warning.** The design spec §3.1 requires default / hover / focus-visible / active / disabled / duplicate / dragging / drop-target / row-insert / row-remove / empty states + a responsive mobile override — compiled CSS runs ~6 kB. Exceeds the 4 kB warning budget but stays under the 8 kB error budget; no Angular convention has been violated and no token has been hardcoded. Design-spec intent preserved; no state was dropped to fit the warning threshold.
- **Row enter/leave animations deferred.** Design spec §3.1 defines `column-draft-list__row-enter` / `__row-leave` keyframes; the implementation uses Angular's default `@for` placeholder rather than explicitly applying the keyframes to the enter/leave nodes. The @for mechanics don't expose a straightforward hook for applying CSS class names to entering rows without pulling in `@angular/animations` (not currently in the project's dependency set). The live-region announcement (add/remove/reorder) satisfies the accessibility AC; the `prefers-reduced-motion` global clamp still applies. Explicitly flagged as an open question below.

### Development-time Decisions

- **Reorder via `FormArray.removeAt + insert` (not `moveItemInArray`).** Keeps `FormGroup` identity intact so the `@for (… track group)` doesn't re-mount inputs (which would drop focus and reset pristine/touched state).
- **`duplicateFlags` via `arrayErrorTick` signal.** FormArray `errors` is not a signal; we tick a writable signal on every `statusChanges` and re-read the errors object in the computed to keep the hint reactive.
- **Drag handle is focusable but keyboard-drag is not wired.** Matches design spec §3.1 "Interaction notes — design call #5 / Drag on keyboard": up/down buttons are the keyboard reorder path.
- **Live region is a single `aria-live="polite"` inside the fieldset.** Announces "Column added / removed / moved" after each mutation and "No columns…" after the last removal.
- **Cancel is `[disabled]` while submitting** and `onCancel()` early-returns — matches tech spec §Cancel-during-submit.

### Open Questions Deferred

1. **Row enter/leave animations** — should we pull in `@angular/animations` to hook explicit CSS class names to entering/leaving rows, or accept the simpler "rows snap in/out" behavior (which `prefers-reduced-motion` would clamp anyway)? Ship-ready as-is; animation is a polish pass.
2. **Partial-failure toast auto-dismiss copy for "all columns failed"** — design spec §3.4 open question #4. Current copy says "The project was created, but 3 columns couldn't be added…" which matches the spec's "same toast, different copy". PM confirmation still open.
3. **Legend contrast below `$bp-md`** — design spec §3.4 open question #3. Implemented option (b): at the smallest breakpoint the legend uses `$text-primary` on `$bg-sidebar-light` (16.3:1 AAA). This was the recommended mitigation.
4. **SCSS budget warning** for the new `column-draft-list.component.scss` — matches the precedent of `upload-progress-row.component.scss` but may warrant a project-wide budget bump in `angular.json` if more similarly-rich components are added.

### Edge Cases for QA

- 100-char column name accepted; 101-char rejected (per-row `maxlength(100)`).
- Whitespace-only column name blocks submit with `whitespaceOnly`.
- Duplicate column names (case-insensitive, trimmed) block submit via array-level `duplicateNames`; only the later-in-form index is flagged.
- Empty column list blocks submit and renders the empty-state card.
- Explicit `columnOrder: 0..N-1` is sent on every column POST.
- Continue-on-failure: every column is POSTed even after earlier failures.
- Dialog stays open on project-level failure with form values preserved; `errorMessage` is cleared when the user edits any field.
- Dialog closes on partial failure; dashboard surfaces `PartialFailureToastComponent` with message + "Open board" CTA.
- `ProjectCreationService` subscription lives on the app-root injector so late responses after dialog destroy still reach the cache (regression guard carried forward from #32).


