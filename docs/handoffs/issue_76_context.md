# Bug: Create Project button is disabled and NG0950 error thrown from ColumnDraftListComponent

**GitHub Issue:** [#76](https://github.com/Gulybi/KanbAI-Web/issues/76)
**Milestone:** _none_ (unassigned)
**Labels:** `bug`
**Repository:** Gulybi/KanbAI-Web
**Branch (observed on):** `70-dynamic-column-setup-on-project-creation`
**Severity:** Blocker — users cannot create any new projects from the UI.

---

## Business Value

### Who is this for?
- **Authenticated KanbAI users** who reach the dashboard and attempt to create a new project via the "New Project" dialog. Today this flow is the only in-app path to produce a project record; while it is broken there is no alternative affordance.
- **The #70 "Dynamic Column Setup on Project Creation" feature**, which is complete on the `70-…` branch but cannot be shipped while the dialog it owns fails to submit. #76 is the last remaining blocker preventing #70 from merging to `main`.
- **Returning users** whose only path to start new work is the create-project dialog — if they cannot create a project they cannot reach any of the downstream board, column, task, or file-upload features the team has already shipped (milestones #4–#6).

### Why is it valuable?
The create-project dialog is the single entry point for all project creation in the product. A bug that leaves its submit button permanently disabled — regardless of what the user types — effectively removes the ability to onboard new work into the app and silently blocks every feature downstream of project creation. From the user's perspective the app is unusable for its primary purpose the moment they try to start something new.

Fixing #76:
- **Unblocks #70 from merging.** The column-setup feature's code is present on the branch and passing its own logic, but a runtime initialization error in `ColumnDraftListComponent` is corrupting the parent form's validity propagation, so `canSubmit` never flips to `true`. Without #76, #70 cannot ship to users regardless of how complete the rest of it is.
- **Restores the primary "happy path" of the product.** A new user signing up today reaches the dashboard and finds that the first button they are asked to click (New Project) is non-functional. That is a first-impression failure mode an early-stage product cannot afford.
- **Removes a console-error regression.** The NG0950 runtime error is emitted on every dialog open — even if a user somehow bypasses the disabled-submit issue, the console noise is a quality signal that the component is incorrectly initialising and will erode trust during any investor or internal demo.
- **Establishes the correct pattern for required signal inputs in the codebase.** Whatever fix is chosen for the microtask-vs-input-binding ordering here will be referenced by future components that need to subscribe to an injected reactive form's `statusChanges` — this is the first place in the repo where that pattern has been exercised.

### What problem does it solve?
The dialog is broken end-to-end in a way that is invisible to the user: they fill in a valid Title, see the default columns pre-populated, see no visible error anywhere on screen, and yet the "Create project" button stays greyed out. There is no copy explaining what is wrong, no field-level error, nothing for the user to "fix" — because from the form's perspective nothing is wrong. The form model is in limbo because the child component crashed before wiring up the validity subscription that informs the parent of the column array's validity state.

Concretely:
1. **NG0950 runtime error fires on every dialog open.** `ColumnDraftListComponent`'s constructor schedules a `queueMicrotask` that reads `this.formArray()` — a `input.required(...)` signal input. Required inputs are not guaranteed to be set before a microtask scheduled in the constructor runs; in practice here the microtask fires first, the input accessor throws NG0950, and the rest of the callback (the `statusChanges.subscribe(...)` that drives `arrayErrorTick`) never executes. See [`column-draft-list.component.ts:94-105`](../../KanbAI-Web/src/app/features/projects/components/column-draft-list/column-draft-list.component.ts#L94-L105).
2. **The array-level validators' error state never reaches the parent.** The parent dialog ([`create-project-dialog.component.ts:101-103`](../../KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.ts#L101-L103)) computes `canSubmit` from `!this.form.invalid`. The FormArray has `minColumnsValidator` and `duplicateColumnNamesValidator` attached ([`create-project-dialog.component.ts:193-198`](../../KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.ts#L193-L198)), which compute correctly on the parent side. **However**, because the child threw during initialisation, the broader Angular forms pipeline may not drive a full status recomputation that propagates up to the root `FormGroup`'s `.invalid` getter — leaving `canSubmit()` perpetually `false`. The user sees a form that "looks valid" but whose submit is locked.
3. **No recovery path exists.** The error is silent to the user (they have no browser devtools open). Clicking Cancel and re-opening the dialog reproduces the same failure on every open. The only workaround is to hard-refresh the app, at which point the same bug fires again the moment they re-open the dialog.

---

## Current State vs Desired State

### Current State (behaviour today on branch `70-dynamic-column-setup-on-project-creation`)
- **Opening the dialog emits `ERROR RuntimeError: NG0950` in the browser console**, pointing at [`column-draft-list.component.ts:98`](../../KanbAI-Web/src/app/features/projects/components/column-draft-list/column-draft-list.component.ts#L98) inside the constructor's `queueMicrotask` callback.
- **The three default column rows (`"To Do"`, `"In Progress"`, `"Done"`) still render**, because the template iterates `columnGroups()` which reads `formArray()` lazily during change detection (by which time the input *has* been bound). The crash happens only on the constructor-microtask path, not on render.
- **The Title input accepts text and shows no validation errors** when filled with a valid value.
- **The Description input accepts text and shows no validation errors.**
- **The column list accepts rename, add, remove, reorder interactions** at the DOM level.
- **Despite all of the above, the "Create project" button is `[disabled]="!canSubmit()"` and `canSubmit()` never returns `true`.** Clicking it is a no-op (the disabled attribute prevents the click from triggering `onSubmit`).
- **No API calls are made** — `ProjectCreationService.createProjectWithColumns` is never invoked because the user cannot submit.
- **The form appears silently broken.** There is no visible error banner, no field-level error on Title or any column row, no toast, nothing that signals to a non-technical user what is wrong or how to proceed.
- **Reproduction is 100% deterministic**: the error fires on every dialog open for every user.
- **Environment where the bug was observed:** Angular 21 (`v21.angular.dev/errors/NG0950`), branch `70-dynamic-column-setup-on-project-creation`.

### Desired State
- **No NG0950 error fires on dialog open.** The browser console is clean of Angular runtime errors attributable to `ColumnDraftListComponent` or the create-project dialog across every open/close cycle.
- **The "Create project" button enables and disables exactly according to the acceptance criteria of #70.** Specifically, with a non-empty valid Title and at least one valid (non-empty, non-duplicate, ≤100 char) column name, the button becomes enabled; with any violation (empty Title, empty column list, duplicate column names, column name >100 chars, whitespace-only column name, submission already in flight), the button is disabled. This is the behaviour the #70 acceptance criteria already document — #76 is the defect preventing that behaviour from being observable.
- **The column array's validity correctly drives the parent form's `.invalid` state.** The array-level `minColumnsValidator` and `duplicateColumnNamesValidator` continue to disable submit when the list is empty or contains duplicates; the `ColumnDraftListComponent` continues to reflect duplicate flagging visually via its `arrayErrorTick` signal.
- **All interactive behaviours of `ColumnDraftListComponent` continue to work unchanged** — add row focus-trap, remove row focus-return, up/down reorder, drag-drop reorder, `aria-live` announcements, duplicate row highlighting. The fix is purely a lifecycle/timing correction; it must not introduce regressions to any #70 behaviour.
- **User-observable end-to-end flows (from the branch as it exists today, with the fix applied):**
  1. **Happy path.** User opens dialog, types "Website Redesign" as Title, leaves the three default columns, clicks Create → the button was enabled the whole time after Title became valid; clicking it submits; on success, the dashboard shows the new project card and the board shows three columns.
  2. **Edit-defaults path.** User opens dialog, renames "In Progress" to "Working", reorders, adds a new column → button enables/disables accurately per the column array's validity in real time.
  3. **Duplicate-names path.** User renames the second column to "To Do" (matching the first) → duplicate flagging appears on the offending rows; the "Create project" button becomes disabled; fixing the name re-enables it.
  4. **Empty-list path.** User removes all three default columns → the dialog surfaces the "add at least one column" state per #70 and submit is disabled; adding a new column re-enables submit once the name is valid.
  5. **Dialog re-open path.** User cancels the dialog (or submits successfully) and re-opens it → no NG0950 error fires on the second open, third open, Nth open; the dialog works identically every time.

---

## Milestone Context

**Milestone:** unassigned on the GitHub issue, but this ticket exists **solely to unblock issue #70** on the `70-dynamic-column-setup-on-project-creation` branch. It inherits #70's context and cannot be shipped independently of that feature (fixing a broken child component that does not exist on `main` would be meaningless).

### Relationship to #70
- [#70](https://github.com/Gulybi/KanbAI-Web/issues/70) — "Dynamic Column Setup on Project Creation" — **OPEN** (in development on the named branch). The `ColumnDraftListComponent` that #76 fixes was introduced as part of #70. #76 is a blocker bug discovered in manual QA of the #70 branch; it must be fixed before #70 can be merged and released.
- Context for #70 already exists at [`docs/handoffs/issue_70_context.md`](./issue_70_context.md). #76 does not redefine any of #70's requirements — it restores them.

### Prerequisite Issues
- All prerequisites of #70 remain prerequisites here (see #70's context doc). None of them are regressed by this bug; the bug is isolated to `ColumnDraftListComponent`'s constructor timing.
- No new prerequisites are introduced by #76.

### Downstream Issues
- **#70 itself is downstream of #76.** Its acceptance criteria cannot be verified end-to-end until #76 is resolved — every AC that reads "the Create button becomes enabled" or "a valid submit creates the project" is currently unobservable.
- No other issues (filed or unfiled) are blocked by #76 beyond #70.

### Related Work / Open Assumptions
- **The backend is not involved.** No API calls are reaching the server at all today; the bug is 100% client-side. No `backend-api-bridge` re-scout is required; no backend changes are permitted by this ticket.
- **The fix direction is constrained to `ColumnDraftListComponent`'s initialisation sequence.** The issue body suggests moving the `statusChanges` subscription out of the constructor's `queueMicrotask` into a lifecycle hook that runs after input binding, or using `effect()` / `toObservable(this.formArray)` to subscribe reactively once the input is bound. **The specific implementation approach is a tech-spec decision** (this document does not prescribe `ngOnInit` vs. `effect()` vs. `afterNextRender` vs. another approach). What this document requires is that the fix eliminates the NG0950 error in all cases and restores the parent form's validity propagation.
- **The parent dialog (`CreateProjectDialogComponent`) should not need modification** to fix this bug in the straightforward case. The required-input contract between parent and child is correct; only the child's *timing* of reading that input is wrong. If the tech-spec investigation reveals that a parent-side change is also needed (e.g. to force an initial `updateValueAndValidity()`), that is acceptable, but the preferred locus of the fix is the child component where the error originates.
- **No new dependencies are introduced by this ticket.** Angular's existing `effect()`, `toObservable()`, `ngOnInit`, and `afterNextRender` primitives are already available.
- **Test coverage must be added** — the existing `column-draft-list.component.spec.ts` does not currently assert the NG0950-free initialisation path; a regression test is required (see Acceptance Criteria).

---

## Acceptance Criteria

### Primary bug resolution
- [ ] Opening the create-project dialog produces **no `NG0950` runtime error** in the browser console. Specifically, the exact error text `RuntimeError: NG0950: Input "formArray" is required but no value is available yet.` must not appear on dialog open, dialog re-open, or any subsequent user interaction with `ColumnDraftListComponent`.
- [ ] Opening the create-project dialog produces **no other Angular runtime error** attributable to `ColumnDraftListComponent` or `CreateProjectDialogComponent` (no `NG01*`, no `NG09*`, no unhandled promise rejection from either component's initialisation).
- [ ] With a valid non-empty Title and the three default columns untouched, the "Create project" button becomes **enabled** within a single user-observable render cycle after the Title becomes valid. (QA-testable: type a title, observe the button's `disabled` attribute flip to absent/false.)
- [ ] Clicking the "Create project" button in the state above successfully invokes `ProjectCreationService.createProjectWithColumns(...)`. (QA-testable: assert a network request is observed, OR assert via spec that the service method is called.)

### Array-level validity propagation
- [ ] Removing all three default columns (leaving an empty column list) causes the "Create project" button to become **disabled** within a single render cycle. (Verifies `minColumnsValidator` reaches the root form.)
- [ ] Renaming a column so that two rows share the same (case-insensitive, trimmed) name causes the "Create project" button to become **disabled** within a single render cycle, and the offending rows visually reflect the duplicate state via `duplicateFlags`. (Verifies `duplicateColumnNamesValidator` reaches the root form AND that `arrayErrorTick` is incrementing.)
- [ ] Correcting the duplicate name so that all column names are unique causes the "Create project" button to become **enabled** again within a single render cycle, and the duplicate visual flagging clears.
- [ ] Typing a column name longer than 100 characters causes the "Create project" button to become **disabled** and the field surfaces its validation error; reducing the name to ≤100 characters re-enables submit.

### Interactive behaviours preserved (no regressions from #70)
- [ ] Clicking "Add column" appends a new empty row, moves focus to the new row's name input, and announces the addition via the component's `aria-live` region — exactly as specified in #70.
- [ ] Clicking "Remove" on a row deletes that row from the form state, moves focus to a predictable sibling (previous row's input, or the Add button if the list becomes empty), and announces the removal via the `aria-live` region.
- [ ] Clicking "Move up" / "Move down" reorders the rows and announces the move via the `aria-live` region; focus stays on the moved row's input.
- [ ] Drag-and-drop reorder via the CDK drag handle continues to work and announces the move.
- [ ] None of the above interactions produce a new `NG0950` (or any other) runtime error.

### Re-open resilience
- [ ] Cancelling the dialog and re-opening it produces no runtime error on the second open. The dialog renders with the three default columns fresh (per #70) and all interactive behaviours work identically to the first open.
- [ ] Submitting the dialog successfully (either happy-path or partial-failure path from #70), then re-opening it, produces no runtime error on the re-open. The dialog renders with the three default columns fresh.
- [ ] Opening and closing the dialog five times in succession produces zero runtime errors in the browser console.

### Error handling (unchanged from #70)
- [ ] The #70 error-banner, partial-failure, and network-error behaviours are preserved. The fix for #76 must not alter the `errorMessage` / `partialFailureNames` / `creationPhase` signals' behaviour in `CreateProjectDialogComponent`.
- [ ] On 401 during any call in the sequence, the existing global `authInterceptor` continues to handle redirect; the dialog component does not crash on unmount mid-flight.

### Test coverage
- [ ] A new unit test in `column-draft-list.component.spec.ts` (or equivalent) asserts that the component initialises **without throwing** when provided a valid `FormArray` input via the standard Angular test harness. (Regression guard: a naive revert of the fix would cause this test to throw NG0950.)
- [ ] A new unit test asserts that `duplicateFlags` correctly reflects the `duplicateColumnNamesValidator`'s output after the component has initialised and the array's status has been recomputed. (Regression guard: confirms the `statusChanges` subscription is actually wired up.)
- [ ] A new unit or integration test on `CreateProjectDialogComponent` asserts that, given a valid Title and the default column list, `canSubmit()` returns `true` within the component's standard change-detection cycle. (End-to-end verifier: catches the exact symptom the user reported.)
- [ ] Existing `create-project-dialog.component.spec.ts` and `column-draft-list.component.spec.ts` tests continue to pass with no introduced failures.

### Verification
- [ ] `npm run build` succeeds with no new errors or warnings.
- [ ] `npm run test -- --watch=false` passes with no **INTRODUCED** test failures. Pre-existing failures are documented but not blocking per CLAUDE.md.
- [ ] Manual QA of the #70 flow (happy path, edit-defaults path, duplicate-names path, empty-list path, dialog re-open) completes without hitting the NG0950 error.
- [ ] The browser console is free of Angular runtime errors across a five-open-and-close cycle of the dialog.

---

## Edge Cases & Explicit Out-of-Scope

### In-scope edge cases (must be handled)
- [ ] **Rapid open/close.** Opening the dialog, immediately pressing Escape before Angular's first tick completes, and re-opening does not leak subscriptions or duplicate `statusChanges` handlers.
- [ ] **Dialog destroyed mid-initialisation.** If the user dismisses the dialog (Escape, backdrop) within the same microtask window in which the fix's initialisation path runs, no error fires and no orphaned subscription remains.
- [ ] **Multiple concurrent dialog instances.** Although the product only opens one dialog at a time today, the fix must not rely on process-global state — each `ColumnDraftListComponent` instance must independently subscribe and tear down cleanly.
- [ ] **Validators firing before the subscription is wired.** If `duplicateColumnNamesValidator` flags a duplicate at initial render (e.g. hypothetically via a seeded form with duplicates), `duplicateFlags` eventually reflects it once the subscription is established — the fix must not drop the initial tick (the current code does an explicit initial `arrayErrorTick.update(...)` for this; preserve that intent).

### Explicitly out of scope for #76
- **Any feature-level change to #70.** #76 is a pure defect fix; it does not add columns, change validation rules, modify the default column set, or alter the UX of the dialog.
- **Refactoring `ColumnDraftListComponent` for reasons unrelated to the bug.** Cosmetic restructuring, renaming, or extraction of helpers is out of scope; keep the diff minimal and focused on the initialisation path.
- **Backend changes.** No modifications to any C# backend code, DTOs, or SignalR events are required or permitted.
- **Changes to `ProjectCreationService` or `ProjectStateService`.** The bug does not originate there; modifications to those services are out of scope.
- **Altering `CreateProjectDialogComponent`'s form topology** (the shape of `FormGroup<CreateProjectFormShape>`, the validators attached to the FormArray, the structure of `buildColumnsArray`). These are correct; the bug is downstream of them.
- **Design / styling changes.** No SCSS modifications are required. If the tech-spec discovery reveals a design-adjacent tweak is needed (e.g. an error banner becomes visible where it wasn't before), that is surfaced for the web-designer phase; this ticket does not pre-authorise design work.
- **Migration away from `input.required(...)`.** The required signal input contract is the correct modern Angular pattern; downgrading it to a classic `@Input()` or optional input is not an acceptable fix.

---

*The business context is defined and saved. You can now instruct the staff-engineer agent to read the context note and design the frontend technical specification.*
