# Issue #89 — Business Context

## Title

**"Add member" submit button stays permanently disabled — project owners cannot invite anyone by email**

## Business Value

Inviting teammates by email is the **only in-app path** a project owner has to bring collaborators into a project. While this defect is present, KanbAI behaves, from an owner's perspective, as a single-user tool: projects cannot grow past their creator, boards cannot be shared, and the collaborative value proposition of a Kanban product is unreachable.

The bug affects **every owner on every project** and has **no workaround** — the owner sees a field they can type into and a button that never responds, with no toast, no inline error, and no network request. This produces a silent dead-end that most users will interpret as either a broken product or a locked feature, eroding trust at a moment (team setup) when the owner is actively committing to the tool.

This is the **same defect class** as issues #80 / #84 (parent-owned `FormControl` + OnPush child view + `[disabled]` binding that never re-evaluates). Shipping the fix here also confirms the pattern-level regression captured in #84 has been applied consistently across submit-gating forms in the app.

## Current State vs Desired State

### Current State

- On opening the Members dialog as a project owner, the **Add** button renders in its disabled visual state (50% opacity, `not-allowed` cursor) and stays there for the lifetime of the dialog.
- Typing a syntactically valid email into the adjacent **Email** field produces no visible change to the button's enabled/disabled state.
- Clicking the button issues no HTTP request, emits no event, shows no toast, and shows no inline error — the click is swallowed by the native `disabled` attribute.
- Field-level validation (required, email-format) renders correctly inside the input itself; only the **submit-gating** is broken.
- Relevant file paths:
  - `KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.ts` — owns the parent `FormControl<string>` and uses `ChangeDetectionStrategy.OnPush`.
  - `KanbAI-Web/src/app/features/projects/components/members-dialog/add-member-form/add-member-form.component.html` line 49 — binds `[disabled]="disabled || emailControl.invalid"` on `app-form-button`.
  - `KanbAI-Web/src/app/features/projects/components/members-dialog/members-dialog.component.spec.ts` — the existing spec calls the submit handler directly rather than driving the DOM, which is why this regression slipped through CI.

### Desired State

- On opening the Members dialog with an empty email, the **Add** button is visibly disabled (current visual treatment preserved).
- As soon as the owner types a syntactically valid email, the **Add** button becomes visibly enabled within a single change-detection cycle.
- If the owner then clears the field or leaves a syntactically invalid value, the button returns to disabled.
- Clicking the enabled button issues `POST /api/project/{projectId}/members` with the trimmed email value; on 201 the member appears in the list and the input is cleared + refocused; on 400 / 403 / 409 the existing inline error copy renders unchanged.
- A DOM-level regression test guarantees this path does not silently break again.

## Milestone Context

- **Milestone:** none attached to the issue.
- **Prerequisites:** none — the fix is self-contained to `AddMemberFormComponent` and its template; the `/members` endpoints already exist and work (verified via the same smart-parent that today never gets a submit event).
- **Downstream impact:** unblocks all team-collaboration flows that depend on a project having more than one member — task assignment to teammates, per-member activity, permission gating beyond "owner only".
- **Related issues:**
  - **#80** — original "create project" submit button permanently disabled (same root cause class).
  - **#84 / commit `679df0a`** — fix for #80 that introduced the `statusChanges → toSignal → computed canSubmit` pattern. The accepted remediation for #89 is to apply that same pattern here.

## Acceptance Criteria

1. **Empty-field initial state:** When an owner opens the Members dialog with the email field empty, the **Add** button is rendered with the `disabled` attribute present on the underlying `<button>` element and with the existing disabled visual treatment (50% opacity, `not-allowed` cursor).
2. **Valid email enables submit:** After the owner types a syntactically valid email (e.g. `someone@example.com`) into the **Email** field, the **Add** button's underlying `<button>` no longer has the `disabled` attribute within one change-detection cycle of the keystroke (no additional click, blur, or dialog re-open required).
3. **Invalid email re-disables submit:** After the owner clears the field or replaces the value with a syntactically invalid string (e.g. `not-an-email`, or whitespace only), the **Add** button's underlying `<button>` regains the `disabled` attribute within one change-detection cycle.
4. **Click issues the invite request:** Clicking the enabled **Add** button results in exactly one `POST` request to `/api/project/{projectId}/members` whose body contains the trimmed email the owner typed.
5. **Happy-path UX preserved:** On a 201 response, the invited email appears as a new row in the members list rendered by the Members dialog, the email input is cleared to empty, and keyboard focus returns to the email input.
6. **Error-path UX preserved:** On a 400, 403, or 409 response, the current inline error message (rendered inside the form's error region above the input row) displays the existing error copy for that status code; no toast is shown in place of the inline error; the email input retains the value the owner submitted.
7. **DOM-level regression test present:** A test exercises the component through its rendered DOM — types a valid email into the input element, asserts the submit button's `disabled` attribute is absent, simulates a click, and asserts `submitEmail` emits the trimmed value. A test that only invokes the component's submit handler method directly does **not** satisfy this criterion.
8. **Build and test suite green:** `npm run build` exits with code 0, and `npm run test -- --watch=false` reports zero failures introduced by this change.

---

The business context is defined and saved. You can now instruct the staff-engineer agent to read the context note and design the frontend technical specification.
