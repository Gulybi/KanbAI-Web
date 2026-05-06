# Feature: Create Drag-and-Drop File Dropzone Component

**GitHub Issue:** #49
**Milestone:** #6 — Asynchronous File Upload UI
**Assignee:** Gulybi

## Business Value

**Who is this for?**
End users of KanbAI (project owners and project members) who want to attach supporting material — a screenshot, a PDF brief, a spreadsheet of estimates, a text note — to a Kanban task so the team has all the context in one place instead of scattered across email, chat, and local disks.

**Why is it valuable?**
A Kanban task today can only carry a title and a content note (see `BoardTask` in `KanbAI-Web/src/app/features/board/state/board-state.model.ts`). There is no way to add a file. That forces every team to rely on an out-of-band tool to share the PDF requirements doc or the mockup PNG that the task is actually about, which defeats the product promise of "one place for the work". Milestone #6 closes this gap with a complete asynchronous file upload UI: this ticket delivers **the surface the user interacts with to choose a file** — a visible drop zone plus a click-to-browse fallback — and the **client-side guardrails** that catch the two most common upload failures (wrong file type, file too big) before a byte travels over the network.

**What problem does it solve?**
- Removes the "I can't attach that to this task" limitation by giving users a discoverable, conventional (drag-and-drop + click) surface to pick a file against a task.
- Prevents user frustration from wasted uploads: the backend will reject a `.exe` or a 50 MB file anyway (`.claude/backend_api_map.md` enforces a 10 MB cap and an extension whitelist), but only after the full bytes are transferred. Catching the same violations in the browser gives the user an instant, specific error instead of a slow spinner followed by a generic failure.
- Delivers the *input half* of the milestone's upload loop. The *network half* (actually `POST`-ing the file with progress tracking) is the sibling issue #50; the *display half* (showing uploaded files in a list with download buttons) is #51. This issue hands the next issue a validated `File` object in-hand and a clear contract for where the upload call originates.

**Business impact:**
- First interactive **write** feature on a task card surface — unblocks the milestone demo: a user can now at least *pick* a file against a task. Combined with #50 and #51 the full feature ships.
- Establishes the drag-and-drop + file-picker pattern that future asset surfaces (user avatars, project covers, board backgrounds if they ever exist) will inherit.
- Matches user expectation set by every modern productivity tool (Trello, Asana, Linear, Notion, GitHub issues): files attach via drop.

## Current State

- **The board UI has no file-attachment surface at all.** The task card (`KanbAI-Web/src/app/features/board/components/task-card/task-card.component.ts`) is presentational: it shows the task title plus an "(has notes)" affordance derived from `task.content`. It is a `cdkDrag` source — clicking it is intentionally out-of-scope per `docs/handoffs/issue_47_context.md` — and emits no `taskClick` / `openDetail` events.
- **There is no task-details view yet.** A grep across `KanbAI-Web/src/app` for `task-detail`, `TaskDetail`, `task-dialog`, `taskDialog`, `TaskModal`, `task-modal` returns zero production files. `board-state.model.ts` mentions a "column detail view" only as a speculative comment. So the "task details" phrasing in the issue body refers to a surface that does not exist in production today — see "Open question" below.
- **No Angular component exists for file selection.** Globbing `KanbAI-Web/src/app/features/**/*.component.ts` shows no dropzone, no file-picker, and no upload wrapper. Greping `upload|dropzone|attach|FormData|multipart` across `*.ts` matches only unrelated words (e.g. "drop its task bucket" in `board-state.service.ts`, attribute references in tests, and the `AuthService`/environment files).
- **No attachment service / state.** `src/app/**/*.service.ts` contains `projects-api.service.ts`, `members-api.service.ts`, `columns-api.service.ts`, `tasks-api.service.ts`, `signalr.service.ts`, `board-state.service.ts`, `project-state.service.ts`, `members-state.service.ts`, `auth-state.service.ts`, and `example-user-state.service.ts`. There is no `attachments-api.service.ts` or `attachments-state.service.ts` — this ticket is the *entry point* to that slice of the app. Creating the API service itself is the scope of issue #50.
- **Backend is ready and the contract is fixed.** `.claude/backend_api_map.md` (lines 100–120) documents `POST /api/attachment/task/{taskId}` (multipart/form-data, single `file` field), a **10 MB maximum** file size (10,485,760 bytes), an allowed-extension whitelist of **`.jpg`, `.jpeg`, `.png`, `.gif`, `.pdf`, `.docx`, `.xlsx`, `.txt`**, per-extension MIME validation, and filename sanitization. The server returns `400` for "File type is not allowed." / "File name is invalid." / "File is required." / "File cannot be empty.", `413` for oversize, `403` for non-members, `404` for missing task. These are the exact rules the client-side validation in this ticket must mirror.
- **Design tokens for the dropzone already exist** in `.claude/kanban_board_design.json`: `colors.background.dropzone = "#F4F5F1"` and `colors.border.dropzone = "#8C9B7B"`. The web-designer agent in Phase 3 will extend these into the precise visual states for this component; this context note does not invent new tokens.
- **Net user-visible behavior today:** there is no way — drag, click, or keyboard — to attach a file to a task from the UI. Users who need to share a file with teammates have to do it outside KanbAI.

## Desired State

After this issue is delivered, a user viewing a specific task has a clearly visible **file dropzone** as part of the task's UI. The user can drag a file onto that zone **or** click the zone to open the operating-system file picker; in both cases the selected file is validated against the backend's format and size rules immediately, and the result of validation is shown in-place. A validated file is handed off to the upload pipeline introduced by the sibling ticket #50; an invalid file is rejected with a specific, user-readable reason and no upload is attempted.

**Expected behaviors (UI-observable):**

*The dropzone surface*
- The task-detail surface renders a visually distinct dropzone region that is obviously a "drop files here" affordance (per the `background.dropzone` / `border.dropzone` design tokens and whatever iconography the design spec layers on top). Idle copy states, at minimum, the **two** ways to add a file: drag-and-drop, or click/activate to browse. A screen-reader user reaches the same affordance with a keyboard-focusable control that announces the same two options plus the accepted formats and max size.
- The dropzone lists, in its idle state, the allowed formats and the max size in human terms ("JPG, JPEG, PNG, GIF, PDF, DOCX, XLSX, TXT — up to 10 MB"). These values must match the backend whitelist byte-for-byte; a mismatch is a bug.

*Dragging a file over the dropzone*
- When the user drags a file from their OS over the dropzone, the dropzone enters a **hover** state (distinct background / border per design spec) that tells the user "release here to add this file". The state applies regardless of whether the file is valid — validation happens on drop, not on hover, because the browser's dragover event does not reliably expose file content on all browsers.
- When the dragged file leaves the dropzone area (dragleave) or the drag is cancelled (Esc / drag out of window), the dropzone returns to idle. No file is accepted.
- Dragging a file over *other* parts of the page (outside the dropzone) does not trigger browser-default behaviour (opening the file in a new tab, replacing the current page). The app must suppress the default drop so that a mis-aimed drop does not nuke the user's session.

*Dropping a file on the dropzone — client-side validation*
- On drop, the first (or, if multiple, the only accepted) file is read and validated. The acceptance criteria below enumerate the exact rules.
- **Single-file scope.** If the user drops several files at once, only the first is considered in this ticket; the remaining files are ignored and the user is informed ("Only one file may be attached at a time — {firstFileName} was selected"). The underlying backend endpoint is single-file per call and queued multi-file uploads are not part of this milestone.
- **Format check.** The file's extension (case-insensitive) must be one of `.jpg`, `.jpeg`, `.png`, `.gif`, `.pdf`, `.docx`, `.xlsx`, `.txt`. A file that fails this check is rejected in-place with a message along the lines of "File type not supported. Allowed: JPG, JPEG, PNG, GIF, PDF, DOCX, XLSX, TXT." The dropzone returns to idle; no upload begins.
- **Size check.** The file's byte length must be `> 0` and `<= 10,485,760`. An empty file is rejected with "File is empty." An oversize file is rejected with "File is larger than 10 MB (was: {formatted size})." The dropzone returns to idle; no upload begins.
- **Name check.** An obviously invalid name (zero-length, path-separator characters `/` `\`, null bytes, or anything the browser flags unreadable) is rejected with "File name is invalid." This mirrors the backend's own sanitization so the user understands the cause client-side.
- A file that **passes** all three checks is handed off to the upload pipeline introduced in #50 — in product terms, the dropzone enters a "selected file" state showing the file name and size, and the caller component is told "here is a valid file to upload". Whether that caller then spins a progress bar, enqueues, or fires the HTTP call is explicitly the scope of #50, not this ticket.

*Click / keyboard fallback*
- Clicking the dropzone (or activating it with `Enter` / `Space` while it has keyboard focus) opens the native OS file picker, pre-filtered to the accepted extensions via the `accept` attribute. Selecting a file from the picker runs the **same** validation pipeline as a drop, producing the same outcomes (selected state, or in-place error).
- Cancelling the native file picker returns the dropzone to idle with no change.
- A user navigating with keyboard only can `Tab` to the dropzone, activate the picker with `Enter`/`Space`, and receive the identical experience. A user using a screen reader hears the dropzone announced as an interactive region (button-like, or role=button per design spec) with accepted-format / max-size text in the accessible name or description.

*Error display*
- Any validation rejection (format, size, empty, bad name, multi-file attempt) produces a **visible, specific** message near the dropzone — not a generic "upload failed" — naming the rule that was broken. The message persists until the user either drops/selects a different file (replacing the message with a new outcome) or dismisses it per the design spec. The dropzone remains usable throughout — a bad drop must not wedge the UI.
- Errors are **not** sent as telemetry, analytics, or `console.log` calls that expose the file name (which can itself be PII), beyond whatever the standard app logger already does.

*Integration with the rest of the task surface*
- The dropzone is a **self-contained, reusable Angular component**. It receives as input at minimum the `taskId` it relates to (needed by #50's upload call) and optionally a "disabled" flag (e.g. the user is not a project member, so they cannot upload). It emits a "validated file selected" event carrying the `File` and the `taskId` for the parent to consume. Any parent surface — the eventual task-detail view built downstream, a standalone test harness, a Storybook-style demo — can host it without modification.
- The dropzone **does not** talk to HTTP, does not import `HttpClient`, does not touch `BoardStateService` or `SignalRService`. Its entire job is: render a surface, accept a file gesture, validate, emit. This matches the issue body ("build a visual zone … implementing client-side validation for format and size") and leaves the upload pipeline entirely to #50.

**Expected user flow:**
1. User A is looking at a task and wants to attach the PDF spec for it. They see the dropzone labelled "Drop a file here or click to browse — up to 10 MB; JPG, PNG, PDF, DOCX, XLSX, TXT".
2. They drag `spec-v3.pdf` (1.2 MB) from their desktop onto the zone. The zone turns the hover colour while the cursor is over it. They release. The zone shows "Selected: spec-v3.pdf (1.2 MB)". The upload pipeline (out of scope here, delivered by #50) takes it from there.
3. User A drags a second file, `finance.xlsx` (2 MB), onto the zone — replacing the first selection. The zone now shows "Selected: finance.xlsx (2.0 MB)". Only one file is under consideration at a time.
4. User A drags `video.mp4` (4 MB) onto the zone. On drop the zone snaps to an error state: "File type not supported. Allowed: JPG, JPEG, PNG, GIF, PDF, DOCX, XLSX, TXT." No file is selected. No upload occurs. The zone remains ready for the next attempt.
5. User A drags a 25 MB installer onto the zone. On drop: "File is larger than 10 MB (was: 25.0 MB)." No selection. No upload.
6. User A clicks the zone instead. The OS file picker opens filtered to the allowed extensions. They pick `notes.txt` (2 KB). The zone shows "Selected: notes.txt (2.0 KB)". Identical downstream handoff as the drag path.
7. User A, using only a keyboard, `Tab`s to the dropzone, presses `Enter`, picks a file. Same outcome.
8. User A drags three files at once — `a.png`, `b.png`, `c.png`. The zone accepts `a.png` (valid) and shows "Selected: a.png (…). Only one file may be attached at a time — a.png was selected." No upload for `b.png` / `c.png`.
9. User A is not a member of this project (was removed by the owner moments ago, dashboard state caught up). The dropzone is rendered in a disabled state and explains why ("You are not a member of this project."). Drag and click do nothing.

**Open question surfaced to the staff-engineer phase:**
- **Where does the dropzone live?** The issue body says *"within the task details"*, but no task-details view exists in the codebase today (no modal, no side panel, no detail route). Three plausible answers, in order of simplicity: (a) a dedicated **"Task Details" modal / side panel** is created alongside this component in this ticket; (b) a minimal **stub detail surface** is created just to host the dropzone and is later replaced; (c) a **temporary harness route** is used until the real detail view lands in a future ticket. This ticket's business scope is **only the dropzone component and its validation**; the hosting surface is a technical-architecture decision that belongs to the staff-engineer phase. The acceptance criteria below are therefore written in terms of the dropzone itself, not its host, so the tech spec can decide (a), (b), or (c) without the context doc rotting.

**Out of scope for this issue (belongs elsewhere):**
- **The actual `POST /api/attachment/task/{taskId}` HTTP call, FormData construction, progress reporting, and `AttachmentService` wiring** — explicitly the scope of issue #50 ("Implement Async File Upload with Progress Tracking"). This ticket produces a validated `File` and emits it; #50 consumes it.
- **The progress bar UI during upload** — #50.
- **Listing, thumbnailing, or downloading already-uploaded attachments on the task** — explicitly the scope of issue #51 ("Build Attachment List and Download UI").
- **Reconciling the four SignalR asset events (`AssetUploadStarted`, `AssetProcessing`, `AssetCompleted`, `AssetFailed`) into local state** — naturally falls to #50 / #51 since this ticket produces no state to reconcile against.
- **AI tool-usage documentation (`AI_LOGS.md`)** — #52.
- **Multi-file / batch upload, resume after network loss, or drag-in-progress cancellation of an already-accepted file** — not required by the issue body; future enhancement.
- **Camera / clipboard paste as input methods** — not required; drag and click are the spec.
- **Building the task-details surface itself as a *feature*** — see "Open question" above; the staff-engineer decides the minimum surface needed to host the dropzone in this milestone. Any richer detail view (comments, activity log, assignee picker, etc.) is out of scope regardless.
- **Virus scanning / content inspection on the client** — impossible and not required; the backend owns that side of trust.
- **Changes to the existing task-card drag behaviour** — the task card stays a `cdkDrag` source as delivered in #47. Adding a dropzone must not regress the task move flow.

## Milestone Context

**Milestone:** #6 — Asynchronous File Upload UI

**Prerequisite Issues:**
- #47 — Implement Visual Drag-and-Drop (Angular CDK) — **CLOSED (merged in `ed47bae`)**. Delivers the board UI that renders tasks in the first place; without it there is no "task" surface for the dropzone to attach to.
- #46 — Integrate Real-time Events with State Management — **CLOSED**. Delivers the SignalR event pipeline the sibling ticket #50 will hook into for asset status events. Not directly consumed by this ticket but part of the milestone's foundation.
- Authentication / project membership (#60 era) — **CLOSED**. The dropzone's "disabled when not a member" state depends on membership info that `ProjectStateService` already exposes.

**Sibling Issues (same milestone, same feature, but different slices):**
- **#49 — this ticket — the dropzone surface + client-side validation.**
- #50 — Implement Async File Upload with Progress Tracking — **OPEN**. Consumes the validated `File` this ticket emits. Builds `AttachmentService`, constructs the `FormData`, calls `POST /api/attachment/task/{taskId}` with `reportProgress: true`, and drives a progress bar. The two tickets must agree on the emission contract (event shape: `{ file: File; taskId: string }` is the proposed minimum); the exact emitter signature is the staff-engineer's call.
- #51 — Build Attachment List and Download UI — **OPEN**. Displays uploaded files on the task card/detail surface with icons, size, and date, and wires `GET /api/attachment/{assetId}` for downloads. Lives on the same task-detail surface as this ticket's dropzone; the shared host was the "open question" raised above.
- #52 — Document AI File Upload UI Implementation (AI_LOGS.md) — **OPEN**. Cross-cutting documentation ticket, depends on #49/#50/#51 all landing so the implementation can be written up.

**Downstream Issues (not in this milestone, likely built on this foundation):**
- No open issues reference #49 at time of writing. Future asset-surface features (user avatars, project covers) will be able to reuse the dropzone component if it is built generically.

**Related Work:**
- `docs/handoffs/issue_47_context.md` / `_tech_spec.md` / `_design_spec.md` — authoritative on the current board / task-card surface this ticket layers onto, and on the design-system token usage pattern.
- `.claude/backend_api_map.md` — authoritative on the 10 MB limit, the eight-extension whitelist, the multipart/form-data contract, the per-extension MIME check, and the four asset-lifecycle SignalR events (`AssetUploadStarted` / `AssetProcessing` / `AssetCompleted` / `AssetFailed`). **The client-side validation rules in this ticket's acceptance criteria are the exact mirror of the backend rules**; if the backend changes, this ticket's copy must change too (flagged in the acceptance criteria below as a single-source-of-truth concern).
- `.claude/kanban_board_design.json` — contains the existing `background.dropzone` / `border.dropzone` tokens. The web-designer agent in Phase 3 will extend them into hover / error / disabled / selected states for the exact SCSS.

## Acceptance Criteria

*Rendering — idle state*
- [ ] The dropzone component renders a visually distinct region whose purpose (drop files here or click to browse) is readable without hovering, matching the design spec's idle-state tokens (based on `background.dropzone: #F4F5F1`, `border.dropzone: #8C9B7B`).
- [ ] The idle-state label states both input methods ("drag-and-drop" and "click to browse" — exact wording deferred to design spec) and the accepted file rules. The rules shown must match exactly: the eight extensions JPG, JPEG, PNG, GIF, PDF, DOCX, XLSX, TXT, and the 10 MB max size.
- [ ] The dropzone is keyboard-focusable. Its accessible name (as read by a screen reader / visible in DevTools accessibility tree) conveys the same two input methods plus the accepted-format and max-size constraints.

*Drag interaction (mouse)*
- [ ] Dragging any OS file onto the dropzone region changes the dropzone's visual state to a distinct "hover / ready to drop" look as defined in the design spec. Dragging it back out, cancelling the drag (Esc), or leaving the window returns the dropzone to idle.
- [ ] A browser-level drop of a file outside the dropzone (anywhere else on the page) does not cause the browser to navigate away, open the file in a new tab, or replace the current page. In other words, the component suppresses the browser default for drops outside its region on pages where the component is mounted.

*Drop — format validation*
- [ ] Dropping a file whose extension (case-insensitive) is *not* one of `.jpg`, `.jpeg`, `.png`, `.gif`, `.pdf`, `.docx`, `.xlsx`, `.txt` produces a visible error near the dropzone explicitly naming the unsupported type and listing the allowed set. No upload is attempted.
- [ ] Dropping a file whose extension is in the whitelist does not trigger the format error.

*Drop — size validation*
- [ ] Dropping a file whose byte length is strictly greater than 10,485,760 bytes (10 MB) produces a visible error naming the limit and the actual size. No upload is attempted.
- [ ] Dropping a file whose byte length is zero produces a visible error ("file is empty" — exact wording deferred to design spec). No upload is attempted.
- [ ] Dropping a file whose byte length is between 1 and 10,485,760 bytes inclusive does not trigger either size-related error (on its own — format errors may still apply).

*Drop — filename validation*
- [ ] Dropping a file whose name contains path-separator characters (`/` or `\`), null bytes, or is zero-length produces a visible "file name is invalid" error. No upload is attempted. (Implementation may rely on the browser's filename normalization, but the acceptance behaviour — user-facing rejection with a specific reason — must hold.)

*Drop — happy path*
- [ ] Dropping a single file that passes all three checks puts the dropzone into a "selected file" state that displays the file's name and a human-readable size (e.g. "spec.pdf · 1.2 MB"). The component emits a "validated file selected" event carrying the validated `File` and the task id to its parent. No HTTP call is made from the dropzone itself.
- [ ] Dropping a second valid file onto the dropzone replaces the prior selection. The new file is shown; a new "validated file selected" event is emitted.
- [ ] Dropping multiple files at once accepts only the first file (in the order the browser surfaces them) if it is valid, emits the same event, and shows a visible message stating that only one file is accepted at a time and which file was kept.

*Click / keyboard fallback*
- [ ] Clicking the dropzone opens the native OS file picker, filtered to the eight accepted extensions via the input's `accept` attribute.
- [ ] Pressing `Enter` or `Space` on the dropzone while it has keyboard focus opens the same OS file picker.
- [ ] A file selected via the file picker runs through the identical format / size / name validation as a dropped file and produces the identical outcomes (selected-state event OR in-place error).
- [ ] Cancelling / dismissing the OS file picker without picking a file leaves the dropzone in its prior state (idle or previous selection) — no error is shown.

*Disabled state*
- [ ] When the component is rendered with the "disabled" flag set (e.g. the user is not a project member), it renders in a visually distinct disabled state and a drop or click / key activation has no effect — no file picker opens, no event emits, no error shows. The reason for disablement is conveyed (in the accessible name / visible copy — exact wording deferred to design spec).

*Accessibility*
- [ ] The dropzone's accessible name / role combination, verified in browser devtools or with a screen-reader pass, announces the zone as an interactive region for adding a file plus the accepted-format and size constraints. (Specific WAI-ARIA pattern — `role="button"` vs labelled region vs live-region error — is deferred to the design spec.)
- [ ] The validation error text, when shown, is announced to assistive tech (visible to the accessibility tree, associated with the dropzone via the appropriate ARIA attribute such as `aria-describedby` or a polite live region — exact mechanism per design spec).
- [ ] Keyboard focus indicators on the dropzone are visible and meet the design spec's focus-visible token (consistent with the existing form-input / form-button components).

*Privacy / logging*
- [ ] No dropped or picked file name, size, MIME type, or byte content is written to `console.log` or to any telemetry endpoint by code introduced in this ticket. (Standard app logger output, if any, is unaffected — the guardrail is only against hand-written debug logs.)

*Cross-cutting guarantees*
- [ ] Mounting or unmounting the dropzone component does not leak drag event listeners on `window` / `document`. Specifically: navigating away and back to the host surface does not cause repeated hover-state flicker on unrelated drags, nor does it suppress browser-default drop behaviour on pages the component is not mounted on.
- [ ] Mounting the dropzone does not regress task-card drag-and-drop delivered in #47 — a user can still drag a task card between columns while the dropzone exists on a separate surface.
- [ ] `npm run build` succeeds with the new component in place.
- [ ] `npm run test -- --watch=false` runs to completion. Test failures tied to the newly introduced dropzone code or its host surface are fixed before completion; pre-existing failures unrelated to #49 are documented, not fixed, per project policy.
- [ ] The three validation constants in use by the client (max size in bytes, allowed-extension list, human-readable list shown in copy) are single-sourced within the implementation — changing the backend limit in a follow-up issue should require editing one place in the frontend, not three. (Staff-engineer to pick the mechanism.)

### Quality Gate Check

Each criterion above has been reviewed against the product-manager spec's four rules:

- **Observable:** Every criterion can be verified in the browser (visible idle / hover / error / selected / disabled visual state, visible error text, DevTools accessibility tree inspection, OS file-picker opening, DevTools Network panel confirming that *no* `POST /api/attachment/task/...` is issued on a rejected drop, event emission visible in a test harness or parent component) or via build/test command exit. No criterion depends on internal framework state invisible to QA.
- **Specific:** Concrete numeric limits (`10,485,760` bytes, `10 MB`), concrete extension lists (the eight whitelisted extensions, named), concrete interaction triggers (drop, click, Enter, Space, Esc), and concrete failure outcomes ("visible error", "no upload attempted", "no event emitted") are named. No vague "intuitive" / "smooth" / "user-friendly" phrasing.
- **Testable:** QA can drive each scenario deterministically — a valid file, an oversize file, an empty file, a `.exe`, a multi-file drop, a cancelled picker, a keyboard activation, a disabled-state render are all reproducible by hand or in Playwright / Vitest with constructed `File` objects. The "no HTTP call on rejection" guarantee is testable by mocking or by inspecting the Network panel.
- **Edge cases covered:** format mismatch, size over / size zero / size at boundary, invalid filename, multi-file drop, replacement drop, click-cancel, keyboard path, disabled state, browser-default-drop suppression, listener leak on unmount, coexistence with #47's CDK drag on task cards, and the single-source-of-truth concern for the validation constants vs. the backend contract.

---

*"The business context is defined and saved. You can now instruct the staff-engineer agent to read the context note and design the frontend technical specification."*
