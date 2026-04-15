Filename: .ai/.junie/rules/acceptance-criteria-quality.md
Activation: By file patterns: docs/handoffs/*.md

# Acceptance Criteria Quality (@skill_ac_quality)

## When to Use
Read this rule when writing acceptance criteria in `docs/handoffs/issue_{N}_context.md` files. Apply the validation checklist before finalizing any context note.

## The Five Checks
Every acceptance criterion must pass ALL five checks:

| # | Check | Pass (Good Example) | Fail (Bad Example) |
|---|---|---|---|
| 1 | **Testable** | A QA engineer can write a Cypress/Playwright assertion. | "The UI should be user-friendly." |
| 2 | **Specific** | References a concrete UI behaviour or visual output. | "The table should load fast." |
| 3 | **Independent** | Describes one verifiable outcome. | "User registers, gets an email, and sees the dashboard." |
| 4 | **Implementation-Free** | Describes *what*, not *how*. | "Fetch data using RxJS `switchMap` and bind with `@Select`." |
| 5 | **Complete** | Covers the happy path, UI edge cases, and failure modes. | Only testing the sunny-day scenario. |

## Angular/Frontend Examples (Bad → Good)

**Compound criterion (Too many actions):**
- *Bad:* "The user fills the Angular Reactive Form, clicks Submit, a Modal opens, and saving is successful."
- *Good (Split into three):*
  - "The Save button remains disabled until all required form fields are filled."
  - "Clicking the Save button opens a confirmation Modal."
  - "Upon confirmation, the system saves the data and displays a success toast notification."

**Missing failure mode (UI States):**
- *Bad:* "A user can log in."
- *Good:*
  - "A user successfully logs in with valid credentials."
  - "If the backend returns a 401 error, a red error message is displayed above the login form."
  - "While the login network request is pending, the login button displays a 'Loading...' spinner and the form is disabled."

## Checklist Template
Copy this into the context note and verify each criterion. Only finalize the note when every cell is ✅.

```markdown
### AC Validation
| # | Criterion Summary | Testable | Specific | Independent | Impl-Free | Complete |
|---|---|---|---|---|---|---|
| 1 | ... | ✅/❌ | ✅/❌ | ✅/❌ | ✅/❌ | ✅/❌ |
