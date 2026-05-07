# Bug: Create Project submit button stays permanently disabled

**GitHub Issue:** [#80](https://github.com/Gulybi/KanbAI-Web/issues/80)
**Milestone:** _none_ (unassigned)
**Labels:** `bug`
**Repository:** Gulybi/KanbAI-Web
**Branch (observed on):** `70-dynamic-column-setup-on-project-creation` (per the issue); also reproducible on any branch carrying the current [`create-project-dialog.component.ts`](../../KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.ts) and [`form-button.component.html`](../../KanbAI-Web/src/app/features/auth/components/form-button/form-button.component.html).
**Severity:** Blocker — users cannot create any new project from the UI.

---

## Business Value

### Who is this for?
- **Authenticated KanbAI users** who reach the dashboard and try to create a new project via the "New Project" dialog. This dialog is the only in-app path to produce a project record; while its submit button is disabled there is no alternative affordance.
- **New users onboarding to the product.** The first meaningful action a new user takes after signing up is clicking "New Project". Today that action has no successful outcome — the dialog opens, they fill in a title, and the "Create project" button refuses to enable, with no error message, no tooltip, and no explanation.
- **The follow-on issue #70 "Dynamic Column Setup on Project Creation" verification effort.** The dynamic-column feature's end-to-end happy path cannot be manually QA'd while this defect is live, because every happy-path AC from #70 ends with "click Create project and observe the new board" — which is unreachable.
- **Anyone demoing the product** (investors, internal stakeholders, early beta testers). The primary call-to-action on the landing dashboard leads into a dead end.

### Why is it valuable?
The create-project dialog is the **single entry point** for all project creation in KanbAI. When its submit button is permanently disabled:

- **Zero new projects can be created through the UI.** There is no secondary affordance (no keyboard-shortcut submit, no CLI, no "create sample project" fallback). The product's primary verb is non-functional.
- **Every downstream feature is silently blocked.** Boards, columns, task cards, comments, attachments, and member management (milestones #4–#6) all require a project to exist before they can be exercised. A user who cannot create a project cannot reach any of those shipped features.
- **First-impression failure for new users.** A new signup lands on an empty dashboard, is invited to click "New Project" (the most prominent affordance), opens the dialog, types a title, and discovers that the only button that matters is greyed out. There is no on-screen guidance explaining what is wrong — because from the user's perspective, nothing *is* wrong: they followed the instructions.
- **Silent failure with no recovery path.** There is no error banner, no field-level error, no toast. A non-technical user has no way to self-diagnose or work around the issue.

Fixing #80:
- **Restores the primary "happy path" of the product** — the ability to create a project.
- **Unblocks end-to-end QA of issue #70.** The dynamic-column feature has already been merged and its code exists on `main`, but users and reviewers cannot verify its behaviour through the dialog while the submit button is locked.
- **Closes a first-impression quality gap** before any broader rollout.
- **Restores confidence in the submit-state contract** across the app. The `FormButtonComponent` is reused in login, register, add-member, and create-project flows (see `grep` for `app-form-button` — five call sites). Users and reviewers need to know that when a form is valid, the primary submit button reflects that reliably.

### What problem does it solve?
From the user's perspective, the dialog is broken in an especially confusing way: the form **looks** valid, accepts input, shows no errors, and yet cannot be submitted.

Concretely:
1. **The user opens the "New Project" dialog** from the dashboard. The dialog renders correctly with a Title input, a Description input, a list of three default columns ("To Do", "In Progress", "Done"), a Cancel button, and a "Create project" button.
2. **The "Create project" button is rendered in a visually-disabled state on mount** (50% opacity, not-allowed cursor) — see the Tailwind `disabled:opacity-50 disabled:cursor-not-allowed` classes on the inner button inside [`FormButtonComponent`](../../KanbAI-Web/src/app/features/auth/components/form-button/form-button.component.html).
3. **The user types a valid title** (e.g. "Q2 Launch Plan"). The Title input reflects the text. No validation error appears on the Title field (correctly, because it is valid).
4. **The "Create project" button does not change.** It remains in the disabled state. Editing the Description, editing column names, reordering columns, adding columns, or removing columns — none of these interactions flip the submit button out of its disabled state.
5. **Clicking the "Create project" button does nothing.** Because the native `disabled` attribute is set on the underlying `<button>`, the click is swallowed before `(ngSubmit)` / `onSubmit()` can fire. No network request is issued. No toast is shown. The dialog stays open. From the user's point of view, nothing happened.
6. **The only escape is Cancel** (which works correctly, closing the dialog) or Escape-key (same). No project is created. The user is returned to the dashboard exactly as they left it.

There is no user-facing clue about what is wrong. The form *is* valid; `ProjectCreationService.createProjectWithColumns` never receives a request; the bug is entirely a submit-gating defect somewhere in the `canSubmit()` / `[disabled]="!canSubmit()"` pipeline inside the dialog + form-button composition.

---

## Current State vs Desired State

### Current State (behaviour today on the affected branches)

- **On dialog open, the "Create project" button is rendered disabled.** This is expected on mount, because the Title input starts empty and `name` has `Validators.required`. See [`create-project-dialog.component.ts:85-99`](../../KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.ts#L85-L99).
- **After the user types a valid Title, the "Create project" button stays disabled.** This is the defect. The user's expectation — and the documented AC for every issue that fed into the current dialog (#5, #27, #70) — is that the button enables as soon as the form is valid and no submission is in flight.
- **No visible error, banner, or hint appears on the Title field, the Description field, any column row, or the form as a whole.** The error-banner region (`create-project-dialog__error-banner`) is bound to the `errorMessage` signal, which is only set by a failed submit — and submit never fires, so the banner is never rendered.
- **No `(ngSubmit)` / `onSubmit()` activation occurs** when the user clicks the "Create project" button, because the native `<button disabled>` swallows the click before Angular's submit handler runs.
- **No HTTP request is observed** to `POST /api/projects` or any downstream column-creation endpoint. `ProjectCreationService.createProjectWithColumns` is never invoked.
- **Cancel and Escape-key dismiss the dialog correctly.** The `type="button"` Cancel (see [`create-project-dialog.component.html:60-68`](../../KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.html#L60-L68)) is unaffected by this bug.
- **The dashboard project list remains unchanged** across the failed submit attempt — no optimistic card, no pending state, nothing.
- **The browser console may or may not emit a warning** depending on Angular version / dev-mode settings. The defining user-facing signal is the disabled submit button; console output is not a user-visible artefact.
- **The bug is 100% deterministic.** Every user, every dialog open, every valid-form state → same disabled button. There is no flakiness, no race, no "sometimes works".
- **Environment where the bug was observed:** Angular 21, branch `70-dynamic-column-setup-on-project-creation`, but the defect is in shared components (`FormButtonComponent`, `CreateProjectDialogComponent`) that also exist on `main`.

### Desired State

- **With a valid Title (non-empty, ≤200 characters, not whitespace-only) and at least one valid non-duplicate column, the "Create project" button is enabled** within a single user-observable render cycle after the form transitions to a valid state. "Enabled" means: no `disabled` attribute on the rendered `<button>`, full opacity (no `disabled:opacity-50`), pointer cursor, and clickability in the DOM.
- **With any invalid state (empty Title, whitespace-only Title, Title >200 chars, empty column list, duplicate column names, whitespace-only column name, column name >100 chars, or a submission already in flight), the "Create project" button remains disabled** and reflects the disabled styling.
- **Clicking the "Create project" button when enabled invokes `onSubmit()`**, which in turn calls `ProjectCreationService.createProjectWithColumns(...)` with the trimmed Title, trimmed/null Description, and trimmed column names. This is already the implemented behaviour of `onSubmit()` — the defect is purely in whether the click can reach it.
- **On a successful submit, the dialog closes and the dashboard shows the new project card** (existing behaviour via `ProjectStateService` cache prepend — unchanged by this ticket).
- **On a failed submit (network error, 4xx, partial column failure), existing error-handling behaviour is preserved** — the error banner renders, the submit button re-enables once `submitting` transitions back to `false`, and `canSubmit()` correctly flips based on the form's current validity.
- **The submit-gating contract applies consistently across every consumer of `FormButtonComponent`.** The login, register, add-member, and create-project dialogs all drive submit state via `[disabled]="<expression>"` on `<app-form-button>`; fixing #80 must not regress any of those call sites (enumerated at the end of the milestone context section).
- **User-observable end-to-end flows (with the fix applied):**
  1. **Happy path.** User opens dialog, types "Website Redesign" → the "Create project" button flips from disabled to enabled as soon as the title is valid; user clicks it → dialog closes; dashboard shows the new project card; board has the three default columns.
  2. **Edit-defaults path.** User opens dialog, types a title, renames "In Progress" to "Working", reorders, adds a fourth column "Review" → submit button stays enabled throughout (no validity violations); clicking Create submits.
  3. **Invalid-title path.** User opens dialog, types "   " (only whitespace) → `whitespaceOnlyValidator` flags it; submit stays disabled; typing a real title flips it to enabled within the next render.
  4. **Duplicate-columns path.** User renames the second column to "To Do" → submit disables and duplicate flagging appears; correcting the name re-enables submit in the next render.
  5. **Empty-columns path.** User removes all three default columns → `minColumnsValidator` flags the array; submit disables; adding one valid column re-enables submit.
  6. **In-flight submit path.** User clicks Create on a valid form → submit immediately disables (because `submitting()` becomes `true`), the label flips to "Creating project…" / "Adding columns…" per existing phase logic; on success the dialog closes; on failure the banner renders and submit re-enables (because `submitting()` becomes `false` and the form is still valid).
  7. **Other forms path (regression check).** Login, register, and add-member dialogs continue to enable/disable their submit buttons exactly according to each form's validity and in-flight state.

---

## Milestone Context

**Milestone:** unassigned on the GitHub issue. This ticket is a pure defect fix against shipped code and does not belong to a feature milestone.

### Prerequisite Issues
- [#5](https://github.com/Gulybi/KanbAI-Web/issues/5) — the original "Create project" dialog (merged, on `main`). Defines the base dialog behaviour that #80 is restoring.
- [#70](https://github.com/Gulybi/KanbAI-Web/issues/70) — "Dynamic Column Setup on Project Creation" (merged into the `70-…` branch where this bug surfaced). Its form topology — `FormGroup<CreateProjectFormShape>` with a `columns` FormArray and array-level validators — is the current shape of `CreateProjectDialogComponent` and must not be modified by this fix.
- [#76](https://github.com/Gulybi/KanbAI-Web/issues/76) — predecessor NG0950 defect fix (closed). #76 fixed a different cause of "submit stays disabled" in the same dialog (a child-component init race); #80 is a distinct defect surfaced *after* #76's fix, affecting the submit-gating pipeline downstream of that init race.

### Downstream Issues
- **Issue #78** — "No way to create a task from the board (Add new task button on each column)" ([`docs/handoffs/issue_78_tech_spec.md`](./issue_78_tech_spec.md), currently open in the IDE). Not directly blocked, but its end-to-end verification (tasks on a newly-created project) is harder to exercise while project creation is broken — QA needs an existing project to demo #78 against.
- **Any future feature that consumes `FormButtonComponent` with a dynamic `[disabled]`** — if the defect is in the `FormButtonComponent` input/binding pathway (as the issue body suggests), every call site listed below inherits the bug and its fix. If the defect is localised to `CreateProjectDialogComponent`'s `canSubmit()` computation, only this one dialog is affected.
- No other filed issues are blocked by #80.

### Related Work / Open Assumptions
- **Scope is narrow.** #80 is a single-defect, frontend-only fix. No backend changes (C#, SignalR, DTOs) are required or permitted. No design / SCSS changes are required.
- **Fix locus is a staff-engineer decision.** The issue reporter has proposed a specific root cause (stray `[disabled]` binding on the inner button inside `FormButtonComponent`). That hypothesis may or may not be the full picture — for example, `canSubmit` is declared as `computed(() => !this.submitting() && !this.form.invalid)` in [`create-project-dialog.component.ts:101-103`](../../KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.ts#L101-L103) where `this.form.invalid` is a non-signal read, which may itself be part of why the computed doesn't re-evaluate when form validity changes. **This document does not prescribe which layer to fix in.** The staff-engineer phase owns the investigation and fix locus decision. What this document requires is that the user-observable ACs below are met.
- **Shared `FormButtonComponent` consumers that MUST NOT regress:**
  1. [`login-page.component.html:38-43`](../../KanbAI-Web/src/app/features/auth/login-page/login-page.component.html#L38-L43) — disables on `loginForm.invalid || isLoading()`.
  2. [`register-page.component.html:47-52`](../../KanbAI-Web/src/app/features/auth/register-page/register-page.component.html#L47-L52) — disables on `registerForm.invalid || isLoading`.
  3. [`add-member-form.component.html:46-58`](../../KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.html#L46-L58) — disables on `disabled || emailControl.invalid`.
  4. [`create-project-dialog.component.html:70-97`](../../KanbAI-Web/src/app/features/projects/components/create-project-dialog/create-project-dialog.component.html#L70-L97) — the site of this bug.
  Any fix to `FormButtonComponent` must be validated across all four call sites. Any fix localised to `CreateProjectDialogComponent` must leave the other three untouched.
- **Test coverage must be added.** A regression test that would catch this bug does not exist today in `create-project-dialog.component.spec.ts` — see Acceptance Criteria.
- **No new dependencies** are introduced by this ticket.

---

## Acceptance Criteria

### Primary bug resolution (user-observable)
- [ ] Opening the create-project dialog and typing a valid non-empty Title causes the "Create project" button to become **enabled** within a single user-observable render cycle of the Title becoming valid. "Enabled" is defined as: the rendered `<button>` has no `disabled` attribute AND the button visually lacks the `disabled:opacity-50 disabled:cursor-not-allowed` styling state. (QA-testable: type a title, observe the button's disabled attribute absent/false in DevTools.)
- [ ] Clicking the enabled "Create project" button invokes `onSubmit()` on `CreateProjectDialogComponent`, which in turn invokes `ProjectCreationService.createProjectWithColumns(...)` exactly once per click. (QA-testable: a `POST /api/projects` request is observable in the Network tab; a unit test can spy on the service method.)
- [ ] On a successful submit, the dialog closes and the dashboard's project list includes the newly-created project card. (End-to-end happy-path verification.)
- [ ] Cancelling the dialog, re-opening it, and submitting again works identically on the second and subsequent opens. The fix is not a "first time only" side-effect.

### Invalid-state gating
- [ ] With an empty Title, the "Create project" button is **disabled**.
- [ ] With a whitespace-only Title (e.g. `"   "`), the "Create project" button is **disabled**. (Verifies `whitespaceOnlyValidator` propagates to submit gating.)
- [ ] With a Title longer than 200 characters, the "Create project" button is **disabled**. (Verifies `Validators.maxLength(200)` propagates to submit gating.)
- [ ] With an empty columns array, the "Create project" button is **disabled**. (Verifies `minColumnsValidator` propagates to submit gating.)
- [ ] With two column rows sharing the same (case-insensitive, trimmed) name, the "Create project" button is **disabled**. (Verifies `duplicateColumnNamesValidator` propagates to submit gating.)
- [ ] Correcting any of the above violations causes the "Create project" button to flip to **enabled** within a single render cycle.

### In-flight and error states
- [ ] While a submission is in flight (`submitting()` is true), the "Create project" button is **disabled** regardless of form validity, and its label reflects the phase ("Creating project…" / "Adding columns…") per existing #70 behaviour.
- [ ] After a failed submit (error thrown by `ProjectCreationService`), the error banner renders with the error message AND the "Create project" button becomes re-enabled (because `submitting()` resets to `false` and the form remains valid). Clicking it again retries the submission.
- [ ] The dialog's Cancel button continues to function correctly — enabled when not submitting, disabled while submitting — and clicking Cancel closes the dialog without creating a project.

### No regressions to other `FormButtonComponent` consumers
- [ ] The login-page submit button (`login-page.component.html:38-43`) continues to enable/disable correctly based on `loginForm.invalid || isLoading()`. (QA-testable: type valid credentials → button enables; clear a required field → button disables.)
- [ ] The register-page submit button (`register-page.component.html:47-52`) continues to enable/disable correctly based on `registerForm.invalid || isLoading`.
- [ ] The add-member-form submit button (`add-member-form.component.html:46-58`) continues to enable/disable correctly based on `disabled || emailControl.invalid`. (QA-testable: in the members dialog, type an invalid email → submit disables; type a valid email → submit enables.)

### Test coverage
- [ ] A new (or updated) unit test in `create-project-dialog.component.spec.ts` asserts that: given a freshly-mounted dialog with the default form shape, setting a valid value on the Title control causes `canSubmit()` to return `true` within the component's standard change-detection cycle. (Regression guard: a naive revert of the fix causes this test to fail.)
- [ ] A new unit test asserts that: given a valid form state, clicking the "Create project" button (via the test harness / triggering `(ngSubmit)`) invokes `ProjectCreationService.createProjectWithColumns(...)` exactly once. (End-to-end verifier: catches the exact symptom the user reported.)
- [ ] Existing `create-project-dialog.component.spec.ts` and `form-button.component.spec.ts` (if present) tests continue to pass with no introduced failures. Pre-existing failures are documented but not blocking.

### Verification
- [ ] `npm run build` succeeds with no new errors or warnings.
- [ ] `npm run test -- --watch=false` passes with no **INTRODUCED** test failures (classification per `CLAUDE.md`).
- [ ] Manual QA of the happy path + at least two invalid-state paths + one failed-submit path confirms the ACs above in a real browser.

---

## Edge Cases & Explicit Out-of-Scope

### In-scope edge cases (must be handled)
- [ ] **Rapid-fire clicking.** The user clicks the enabled "Create project" button twice in quick succession — only one `POST /api/projects` is issued (existing `if (this.submitting()) return;` guard in `onSubmit` protects this; the fix must not break that guard).
- [ ] **Form becomes invalid mid-submission.** If the user's focus moves back to the Title and deletes it *while* a submit is in flight, the button stays disabled (because `submitting()` is true) and the in-flight request is NOT cancelled — existing `runInInjectionContext` behaviour is preserved.
- [ ] **Dialog dismissed mid-submission.** If the user presses Escape or clicks Cancel during an in-flight submit, the Cancel handler's guard (`if (this.submitting()) return;`) continues to prevent close; the user sees the spinner until the request resolves.
- [ ] **Consumer passing a static `[disabled]="false"`.** The existing call sites (login, register, add-member, create-project) all pass dynamic expressions; any fix must not break the case where a consumer passes a literal `false` or omits the input entirely (defaults to `false`).

### Explicitly out of scope for #80
- **Any feature-level change to the create-project dialog** (adding fields, changing validation thresholds, modifying the default column list, altering the submit-sequence behaviour from #70).
- **Refactoring `FormButtonComponent` for reasons unrelated to the bug** (e.g. converting to signal inputs, renaming the `disabled` input, restructuring the SCSS). Keep the diff minimal and focused on restoring correct submit gating.
- **Backend changes.** No C# / API / SignalR / DTO modifications are required or permitted.
- **Changes to `ProjectCreationService` or `ProjectStateService`.** The bug does not originate there and they do not need modification to restore the submit-gating behaviour.
- **Changes to the column-array validators** (`minColumnsValidator`, `duplicateColumnNamesValidator`) or the whitespace validator. These are correct; the bug is in submit gating, not in validity computation.
- **Design / styling changes.** No SCSS modifications are required. The disabled-state styling (`disabled:opacity-50 disabled:cursor-not-allowed`) is correct and must be preserved.
- **Replacing `computed()` with a different reactivity primitive across the codebase.** If the staff-engineer investigation concludes that `canSubmit`'s reactivity model is the fix site, the change is scoped to that one computation — it does not mandate a codebase-wide refactor of other `computed()` usages.
- **Adding new UX affordances** (tooltips explaining "why is this button disabled", inline helper text, etc.). The fix is behavioural, not UX-expanding.

---

*The business context is defined and saved. You can now instruct the staff-engineer agent to read the context note and design the frontend technical specification.*
