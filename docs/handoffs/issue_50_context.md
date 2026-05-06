# Feature: Implement Async File Upload with Progress Tracking

**GitHub Issue:** #50
**Milestone:** #6 — Asynchronous File Upload UI
**Assignee:** Gulybi

## Business Value

**Who is this for?**
End users of KanbAI (project owners and project members) who have just chosen a file to attach to a task via the dropzone delivered in #49 and now need the file to actually travel across the network, become part of the task's record, and be visible to everyone looking at that task.

**Why is it valuable?**
Issue #49 gave users a surface to *pick* a file and validate it on the client, but the emitted `DropzoneFileSelectedEvent` currently lands in a no-op handler in `KanbAI-Web/src/app/features/board/board-page/board-page.component.ts` (line 210: `handleAttachmentSelected(_event: DropzoneFileSelectedEvent): void { /* No-op in #49. #50 will replace this with an upload call. */ }`). Until that handler is replaced with a real `POST /api/attachment/task/{taskId}` call, a user can drag a PDF onto a task and see "Selected: spec.pdf (1.2 MB)" — and absolutely nothing else happens. No file is saved. No teammate sees anything. The promise the UI makes is a lie. This ticket closes that gap by turning the validated `File` into an actual committed asset on the backend, **visibly** — the user must see that the upload is happening, how far along it is, and whether it succeeded or failed, because the upload is async and can take seconds-to-tens-of-seconds on large files over normal connections.

**What problem does it solve?**
- Delivers the *network half* of the milestone's upload loop: takes the validated `File` emitted by the dropzone (#49) and sends it to the backend via `multipart/form-data`, honoring the exact contract in `.claude/backend_api_map.md` (`POST /api/attachment/task/{taskId}`, single `file` field, JWT auth, 10 MB cap).
- Eliminates the "is it stuck?" anxiety of a silent long upload by showing the user a **percentage-based progress indicator** while bytes are traveling. Large PDFs, screenshot-bundles, and docx-with-images can easily spend 5–20 seconds on the wire on a typical home connection; without visible progress the user will either re-drag the file (double-uploading) or abandon the flow.
- Converts backend upload-rejection responses (`400` wrong type, `400` empty, `400` invalid name, `403` not-a-member, `404` task-missing, `413` too-big, `500` storage failure — all documented in `.claude/backend_api_map.md`) into specific, user-readable messages next to the task, rather than a generic browser error or a stuck progress bar.
- Establishes the FormData + `HttpClient` + `reportProgress: true` + `observe: 'events'` pattern the rest of the app will reuse for any future "upload a thing" feature (user avatar, project cover, board background, imported CSV).

**Business impact:**
- Together with #49 (dropzone) and #51 (attachment list / download), completes Milestone #6 end-to-end: a user can attach a file, watch it upload, and confirm it on the task card / detail surface. Without #50, #49 is a dead surface and #51 has no data to render.
- Unblocks the four SignalR asset events the backend already broadcasts (`AssetUploadStarted`, `AssetProcessing`, `AssetCompleted`, `AssetFailed`) — those events become meaningful to the UI only once this ticket is issuing the HTTP call that triggers them. The current `SignalRService` (`KanbAI-Web/src/app/core/services/signalr.service.ts`) exposes generic `on(eventName, ...)` wiring but has no asset-specific handlers yet.
- Delivers the first **long-running async write** in the app — every other mutation today (move task, create column, add member) completes in one round-trip with no progress affordance. Shipping a credible progress UX here sets the reliability bar for every future async write.

## Current State

- **A validated `File` is produced but discarded.** `FileDropzoneComponent` (`KanbAI-Web/src/app/features/attachments/components/file-dropzone/file-dropzone.component.ts` line 48, `readonly fileSelected = output<DropzoneFileSelectedEvent>()`) emits `{ file: File; taskId: string }` on a successful drop/pick. That event propagates through `TaskDetailPanelComponent` (`KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts` line 48) up to `BoardPageComponent.handleAttachmentSelected` — which is an explicit no-op. The underscore prefix on `_event` is the dead giveaway; this ticket is the one that makes the handler meaningful.
- **No `AttachmentService` / `AttachmentsApiService` exists.** A repo-wide grep for `AttachmentService|attachment-api|attachments-api|AttachmentsApi|POST.*attachment` returns zero matches. `KanbAI-Web/src/app/features/attachments/` contains only the component + models + constants + utils delivered by #49 (see `components/`, `constants/attachment-rules.ts`, `models/dropzone.model.ts`, `utils/validate-attachment.ts`, `utils/format-file-size.ts`). No `services/` subfolder exists yet. This ticket creates that slice.
- **No upload progress UI exists anywhere.** Greping `features/` and `shared/` for `progress-bar|progressbar|uploading|HttpEventType|reportProgress` returns zero component-level matches. This is a first-of-its-kind UI surface for the app.
- **The backend contract is fixed and documented.** `.claude/backend_api_map.md` §Attachments specifies:
  - `POST /api/attachment/task/{taskId}` — `multipart/form-data` with a single `file: IFormFile` field, JWT bearer auth, returns `201 Created` with `ApiResponse<AssetResponseDto>`.
  - Synchronous rejections (**before** the file is written to storage) come back as HTTP errors with the exact messages: `400 "File is required."` / `"File cannot be empty."` / `"File name is invalid."` / `"File type is not allowed."`; `403 "You are not a member of this project."`; `404 "Task not found."`; `413 "File size exceeds maximum allowed size."`; `500 "Failed to save file. Please try again."`.
  - Asynchronous lifecycle (**after** the 201 response) is pushed over SignalR as four events on the `project_{projectId}` group: `AssetUploadStarted` (Pending) → `AssetProcessing` (Processing) → either `AssetCompleted` (full `AssetResponseDto`) or `AssetFailed` (`AssetFailedEventDto`). Clients reconcile by `assetId`.
  - Same-extension validation and the same 10 MB cap the client already enforces (`KanbAI-Web/src/app/features/attachments/constants/attachment-rules.ts` — `ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024`, eight-extension whitelist). If the client sends something invalid anyway (e.g. filename mutation in-flight), the backend will still reject — the client-side check is the optimistic pre-flight, the server is authoritative.
- **SignalR plumbing is ready but not asset-aware.** `KanbAI-Web/src/app/core/services/signalr.service.ts` exposes a generic `on(eventName, payloadSchema?)` subscription API (`connection.on(eventName, (payload) => subject.next(payload))` at line 109) and wires reconnect / disconnected states. It does not yet subscribe to `AssetUploadStarted` / `AssetProcessing` / `AssetCompleted` / `AssetFailed`; there is no asset observable, no asset state slice, and no consumer. The board-page already joins the project group via `JoinProjectGroup`, so the events **will** be received by this client once it listens.
- **No attachment state slice exists.** `KanbAI-Web/src/app/features/board/state/board-state.model.ts` and `.../board-state.service.ts` model tasks without any attachment collection on `BoardTask`. There is no `attachments-state.service.ts`. Upload-in-flight state (which task, which local file, what percent, what status) has nowhere to live today — this ticket introduces the first storage of that state.
- **Net user-visible behavior today:** dropping a validated file on the dropzone shows "Selected: filename.pdf · 1.2 MB" and then nothing. No progress indicator. No success. No failure. No attachment on the task. If the user refreshes the page, the selection is gone, and no record of their action exists on the server or in the UI.

## Desired State

After this issue is delivered, dropping a validated file on the task-detail dropzone results in an **immediate, visible, percentage-based upload** that either finishes with the file being recorded against the task (and the selected state clearing, ready for the next upload) or fails with a specific, actionable, user-readable error near the dropzone — never a silent failure, never a stuck spinner, never a generic "something went wrong".

**Expected behaviors (UI-observable):**

*The upload starts automatically on file selection*
- The moment the dropzone emits a validated `fileSelected` event, an upload begins. The user does **not** press a separate "Upload" button. The dropzone's own "selected" state (showing name and size) gives way to (or is replaced alongside by) an in-progress state showing the same file plus a progress indicator.
- The in-progress state renders a **percentage-based progress bar** (0–100%) that advances as bytes are transferred, driven by Angular `HttpClient`'s `reportProgress: true` / `observe: 'events'` upload-progress events (`HttpEventType.UploadProgress`). The percentage is visible as a number, a filled bar, or both (exact visual per the design spec).
- The in-progress state also shows the file name, the file size in human-readable form (reusing the existing `formatFileSize` util from `KanbAI-Web/src/app/features/attachments/utils/format-file-size.ts`), and a cancel affordance (see "Cancelling an upload" below).

*Progress updates while bytes are in flight*
- Progress percentage updates smoothly as the upload proceeds. It must reach **100%** before the HTTP response is parsed; it must never flip to 100% and then report a failure without the user seeing that the bytes-transferred phase completed. (The server may still fail *after* receiving bytes — that goes into the server-processing phase below.)
- On a very fast upload (e.g. a 2 KB `.txt` over a fiber connection completing in one event), the progress bar is still rendered — even if it flashes briefly — so the user sees an unambiguous "upload happened" signal, not a silent instant completion.
- The progress indicator is accessible: its current value is exposed to assistive tech (e.g. `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax` — exact attributes per design spec), and the in-flight status is announced to screen readers in a non-spammy way (one announcement on start, one on completion/failure — not once per percent tick).

*After bytes finish — server processing phase*
- Once bytes reach the server, the HTTP response returns `201 Created` with the `AssetResponseDto` (per `.claude/backend_api_map.md`). The upload row exists in the database; status is `Pending`. At roughly the same time the `AssetUploadStarted` SignalR event arrives for this `assetId`.
- The UI transitions from "uploading X%" to "processing…" (or equivalent copy per design spec). This phase is typically short (milliseconds-to-seconds) and reflects the backend's internal file-write step. A determinate percentage is no longer possible here — the design spec defines whether this is shown as an indeterminate spinner, a pulse on the bar, or a simple status label.
- When `AssetCompleted` arrives over SignalR for this `assetId`, the upload row is finalized. The dropzone's in-progress state clears and returns to idle — the user can immediately drop another file. A success signal (toast, inline checkmark, or the file appearing in the attachment list once #51 ships — per design spec) confirms the upload landed.
- When `AssetFailed` arrives, the upload row transitions to an error state carrying the failure reason from the `AssetFailedEventDto`. The dropzone surfaces the failure message near itself (not as an ephemeral toast that disappears before the user can read it), **keeps the local file reference visible**, and offers a retry. No row is created / is shown as created — matching the backend behavior that the DB row is rolled back on `AssetFailed`.

*HTTP failure before the upload completes (pre-201)*
- If the `POST` returns a 4xx or 5xx **before** the 201, the upload is over — no SignalR events will follow for this attempt. The UI translates the HTTP status + server message into user copy:
  - `400 "File type is not allowed."` → "{filename} isn't an allowed file type." (should be rare because #49 pre-validated, but can happen on racey backend-config changes).
  - `400 "File cannot be empty."` → "{filename} is empty."
  - `400 "File name is invalid."` → "{filename} has characters we can't accept — rename the file and try again."
  - `400 "File is required."` → "We didn't receive the file. Try again." (indicates a client bug or lost multipart boundary.)
  - `403 "You are not a member of this project."` → "You're no longer a member of this project." plus disables the dropzone (see #49 disabled state).
  - `404 "Task not found."` → "This task no longer exists." plus clears the detail panel / navigates away per design spec.
  - `413 "File size exceeds maximum allowed size."` → "{filename} is larger than 10 MB." (again, #49 pre-validates — this is the racey-backend fallback.)
  - `500 "Failed to save file. Please try again."` → "Upload failed — please try again." with retry affordance.
  - Network error / request timeout / offline / `0` status → "Network problem — the upload didn't reach the server. Try again." with retry.
  - Exact wording is deferred to the design spec; the **mapping** from server status to a specific, user-readable reason is the business requirement.
- A failed HTTP upload does **not** leave a phantom in-progress row. The error is anchored near the dropzone, names the file, and offers a "Try again" / "Choose a different file" path.

*Cancelling an upload*
- While the progress bar is showing (either during bytes-in-flight or during the processing phase), the user can press a visible cancel control. Cancelling during bytes-in-flight aborts the HTTP request client-side (no SignalR completion/failure will arrive for this attempt because the server never finished the write). Cancelling during the processing phase is not supported — once the server has accepted the bytes the upload will complete or fail server-side; the UI may hide the row on user-initiated dismiss once `AssetCompleted` / `AssetFailed` has been acknowledged, but may not stop a write that is already finalizing. (Design spec defines which affordances are shown in which phase.)
- A cancelled upload returns the dropzone to idle. No error is shown — the user caused it. The local file reference is cleared.

*Multiple concurrent uploads on the same task*
- **Not required by this ticket.** The dropzone (#49) already enforces single-file-at-a-time selection, and the task-detail panel hosts one dropzone per task. Sequential uploads are the expected flow: the user drops a file, watches it finish or fail, then drops the next file. If a user attempts to drop a second file while an upload is in flight, the behaviour (queue / block / replace-with-confirmation) is a product question — see "Open question" below.

*Cross-device / cross-tab reconciliation*
- A user on tab A who uploads a file to task T, and a user on tab B (or device B) looking at the same task T, both receive the four `Asset*` SignalR events for that upload. Tab B sees no local progress bar (its `HttpClient` isn't uploading anything) but **does** see the server-side lifecycle: an entry appears for the asset when `AssetUploadStarted` fires, it transitions when `AssetProcessing` fires, and it resolves on `AssetCompleted` / `AssetFailed`. How this is rendered on tab B — a subtle "new attachment uploading…" marker vs. nothing until `AssetCompleted` — is a design decision. The **business requirement** is that a teammate watching the same task sees the new attachment land once the upload completes on the original tab, without a page refresh.

*Integration with the task / board state*
- When `AssetCompleted` arrives, the completed asset is recorded in the task's local state so it is available to #51's attachment-list UI. The authoritative source is the `AssetResponseDto` carried in the event (or in the 201 response — both contain the same DTO per the backend map). The exact shape of the state slice (attached to `BoardTask`, standalone `AttachmentsStateService`, etc.) is a staff-engineer call — see the open questions.
- Navigating between boards / tasks does not leave orphan uploads that silently finish and do not update the UI. If a user drops a file, then navigates away before the upload completes, either (a) the upload continues in background and state is updated on return (preferred), or (b) the upload is cancelled — staff-engineer chooses based on what is cheap and correct. Either way, the user never sees a "zombie" progress bar persist after the page it belonged to has closed.

*Privacy / logging*
- File names, sizes, content, or any multipart payload body must never be written to `console.log` or to a client-side telemetry endpoint by code introduced in this ticket. Errors may reference the file name in user-facing copy (that is the whole point of specific errors) but must not be shipped to external logs beyond the existing app logger (if any).

**Expected user flow (happy path):**
1. User A has opened the task-detail panel for "Redesign login" and drops `mockup-v4.png` (3.8 MB) on the dropzone.
2. The dropzone replaces its "Selected" state with an in-progress state showing the file name, "3.8 MB", and a progress bar at 0%. A screen reader announces "Uploading mockup-v4.png, 3.8 MB".
3. Over ~6 seconds, the progress bar fills to 100%. The percentage is visible.
4. The bar reaches 100%. The UI transitions to "Processing…" for ~300 ms.
5. `AssetCompleted` arrives. The dropzone returns to idle ("Drop a file here or click to browse…"). A success cue (e.g. an inline checkmark or a toast — design spec) confirms the upload. User A can drop another file immediately.

**Expected user flow (network failure):**
1. User A drops `report.docx` (2.1 MB). Progress bar starts advancing.
2. At 40% the user's WiFi drops. The HTTP request fails with a network error (`status: 0`, no body).
3. The dropzone stops showing "uploading" and shows "Network problem — the upload didn't reach the server. Try again." alongside the local file (still in memory), with a "Retry" button.
4. User A's WiFi returns. They click "Retry". A fresh upload begins from 0% — the previous attempt is abandoned, not resumed. (Resume-after-loss is out of scope.)

**Expected user flow (server 413):**
1. Between #49 and #50 landing, suppose the backend admin drops the cap to 5 MB without updating the frontend constant (pathological case; this is the defence-in-depth case). User A drops a 7 MB file. Client-side validation in #49 says "OK, within 10 MB", emits `fileSelected`, upload begins.
2. The server returns `413 "File size exceeds maximum allowed size."` immediately.
3. The progress bar terminates without reaching 100% (or, depending on timing, reaches 100% and then immediately errors). The dropzone shows "report.pdf is larger than what the server accepts." plus a retry-with-a-smaller-file cue.

**Expected user flow (concurrent teammate):**
1. User A drops `brief.pdf` on task T. Upload begins in their tab.
2. User B has the same task T open in another tab. User B's tab receives `AssetUploadStarted`, `AssetProcessing`, and eventually `AssetCompleted` for this asset.
3. In tab B, the attachment appears (or its arrival indicator does) without any page refresh. In tab A, after `AssetCompleted`, the upload row clears. Both tabs now see the same task state.

**Open questions surfaced to the staff-engineer phase:**
- **Q1: Where does the upload call originate?** The validated `File` is currently plumbed from `FileDropzoneComponent` → `TaskDetailPanelComponent` → `BoardPageComponent.handleAttachmentSelected` (the no-op). Three plausible choices: (a) keep the handler in `BoardPageComponent` and have it call `AttachmentService`; (b) have `TaskDetailPanelComponent` own the upload call, keeping the board page ignorant of attachments; (c) introduce an `AttachmentsFacadeService` / `AttachmentsStateService` that both the panel and the board can dispatch to. This is an architecture call, not a business one — the AC below only requires that the call happens when a validated file is emitted.
- **Q2: What happens if the user drops a second file while the first is still uploading on the same task?** Options: (a) queue — the second upload starts when the first finishes; (b) block — the dropzone shows a disabled state with "Upload in progress" until the first completes; (c) replace — a confirm prompt lets the user cancel the first and start the second; (d) parallel — both run at once. Recommend (b) for the MVP because it's the simplest to implement and the most forgiving (no data loss risk), but the product/design call belongs in the spec. The AC below specifies behavior for this scenario against whichever choice is made in the tech/design specs.
- **Q3: Is there an in-UI retry on HTTP failure, or does the user re-drop?** Retry is cheaper on the user but introduces state (kept local `File` reference). Re-drop is stateless but more friction. Recommend retry (keep the `File` in memory and re-invoke the upload) for the happy-common-case recovery (transient network blip). Final wording and affordance placement belongs to the design spec.
- **Q4: Where does upload-in-flight state live?** `BoardTask` today has no `attachments` or `uploads` field; the board state service doesn't know about assets. Options: (a) add `uploads: AttachmentUpload[]` to `BoardTask`; (b) introduce an `AttachmentsStateService` keyed by `taskId`; (c) signal-based local state inside the dropzone-host component. Staff-engineer call. #51 will also need a home for `AttachmentResponseDto[]` — the choice should serve both tickets.

**Out of scope for this issue (belongs elsewhere):**
- **The drop surface and client-side format/size/name validation** — delivered by #49.
- **Listing already-uploaded attachments on the task (icons, size, date, download)** — explicitly the scope of #51 ("Build Attachment List and Download UI"). This ticket leaves the completed asset in the app's state for #51 to render, but does not render the list itself.
- **Secure download of an uploaded attachment (`GET /api/attachment/{assetId}`)** — #51.
- **Thumbnail generation** — backend-side future work, not in this milestone (`thumbnailKey` is documented as "Reserved for future thumbnail generation" in `.claude/backend_api_map.md` line 304).
- **Resume-after-network-loss / chunked upload** — not in the backend contract. The endpoint is single-request multipart. A lost request is a full restart.
- **Parallel / batched multi-file upload** — #49 constrained selection to one file; this ticket follows. A future ticket can layer multi-file on top if needed.
- **Virus scanning feedback / content-inspection result reporting** — backend does not expose it. If the backend rejects content later, it surfaces via `AssetFailed` which this ticket already handles.
- **AI tool-usage documentation (`AI_LOGS.md`)** — #52.
- **Expanding the task-detail surface (comments, activity log, assignees, editing title/description)** — all out of scope for this milestone; `TaskDetailPanelComponent` remains a stub host.
- **Reworking the upload endpoint contract** — the backend is frozen; any change there is a separate backend ticket.

## Milestone Context

**Milestone:** #6 — Asynchronous File Upload UI

**Prerequisite Issues:**
- #49 — Create Drag-and-Drop File Dropzone Component — **CLOSED (merged in `9c8072b`)**. Produces the validated `File` this ticket consumes. The `DropzoneFileSelectedEvent` shape (`{ file: File; taskId: string }`) and the `FileDropzoneComponent` contract are the input contract of #50. If the two ever drift, this ticket adjusts to the dropzone, not the other way round, because the dropzone is already shipped.
- #47 — Implement Visual Drag-and-Drop (Angular CDK) — **CLOSED**. Delivers the board + task-card UI and the click-to-open-detail plumbing that gets the user to a task-detail surface where the dropzone lives.
- #46 — Integrate Real-time Events with State Management — **CLOSED**. Delivers the `SignalRService` generic `on(eventName, ...)` subscription API at `KanbAI-Web/src/app/core/services/signalr.service.ts`. This ticket extends it with the four asset-specific events (`AssetUploadStarted`, `AssetProcessing`, `AssetCompleted`, `AssetFailed`) by adding targeted subscribers — no changes to the core hub plumbing.
- Authentication (#60-era) — **CLOSED**. The upload call requires a JWT bearer; the existing HTTP interceptor / `AuthStateService` flow already attaches the token to outbound requests. This ticket should reuse that pipeline, not bypass it.

**Sibling Issues (same milestone, same feature, but different slices):**
- #49 — the dropzone surface + client-side validation — **CLOSED**. Produces the input to this ticket.
- **#50 — this ticket — the upload service, the `POST` call, the progress UI, the SignalR lifecycle reconciliation, and the error mapping.**
- #51 — Build Attachment List and Download UI — **OPEN**. Consumes the completed `AssetResponseDto` that this ticket hands off to state, and wires `GET /api/attachment/{assetId}` for downloads. The two tickets must agree on how a completed attachment is stored (see open question Q4); this ticket proposes the shape, #51 may extend it with list-specific fields (sort order, display grouping).
- #52 — Document AI File Upload UI Implementation (AI_LOGS.md) — **OPEN**. Cross-cutting documentation ticket, depends on #49/#50/#51 all landing. Not a blocker for this ticket, but this ticket's implementation choices will be described in the AI log.

**Downstream Issues (likely built on this foundation after the milestone):**
- No open issues reference #50 directly. Future asset-surface features (user avatars, project covers, CSV imports) will reuse the `AttachmentService` + progress UI pattern established here.

**Related Work:**
- `docs/handoffs/issue_49_context.md` / `_tech_spec.md` / `_design_spec.md` — authoritative on the dropzone surface, the emitted `DropzoneFileSelectedEvent` contract, the single-source-of-truth validation constants (`KanbAI-Web/src/app/features/attachments/constants/attachment-rules.ts`), and the dropzone's visual phases (idle / dragover / selected / error / disabled). This ticket extends the set of visual phases with an **uploading** / **processing** / **upload-error** phase — the web-designer agent in Phase 3 will decide whether those are additions to the dropzone's own phase enum or separate overlaid components.
- `.claude/backend_api_map.md` §Attachments (lines 100–120) and §Server-sent events (the four `Asset*` entries at lines 151–154) — authoritative on the HTTP contract, the response DTO (`AssetResponseDto`), the event payloads (`AssetStatusEventDto`, `AssetFailedEventDto`), and the exact error strings the server returns. The client-side error mapping in this ticket's acceptance criteria is the exact mirror of the backend message set; if the backend changes a string, the client copy changes too (flagged in AC below as a single-source-of-truth concern).
- `KanbAI-Web/src/app/features/attachments/utils/format-file-size.ts` — reuse for the in-progress size display.
- `KanbAI-Web/src/app/core/services/signalr.service.ts` — the generic `on(eventName, payloadSchema?)` API this ticket calls for each of the four asset events.
- `.claude/kanban_board_design.json` — existing `background.dropzone` / `border.dropzone` tokens. The design spec will extend the dropzone's visual phase set with progress / processing / upload-error states.

## Acceptance Criteria

*Upload triggers automatically on a validated selection*
- [ ] When `FileDropzoneComponent` emits a `DropzoneFileSelectedEvent` containing a validated `File` and a `taskId`, a `POST /api/attachment/task/{taskId}` request is issued without the user pressing any additional button. The existing `BoardPageComponent.handleAttachmentSelected` no-op at line 210 of `KanbAI-Web/src/app/features/board/board-page/board-page.component.ts` (or an equivalent consumer chosen per open question Q1) is replaced with this behaviour.
- [ ] The request body is `multipart/form-data` with exactly one field named `file` carrying the selected `File` (matching `IFormFile` expected by the backend per `.claude/backend_api_map.md` line 106). No other fields are sent.
- [ ] The request carries a valid JWT in `Authorization: Bearer <token>`, via the existing auth interceptor / `AuthStateService` pipeline — not via a manually added header on this call. The upload must not bypass auth.
- [ ] `reportProgress: true` and `observe: 'events'` are set on the `HttpClient` call so that upload-progress events are observed.

*Progress indicator during bytes-in-flight*
- [ ] While bytes are being transferred, a progress indicator is rendered next to (or in place of) the dropzone showing the file name, a human-readable size, and a determinate percentage (0–100) driven by `HttpEventType.UploadProgress`. The percentage is displayed numerically (e.g. "47%") and/or as a filled bar per the design spec.
- [ ] The progress indicator advances monotonically from 0% toward 100% as upload-progress events arrive. It reaches **100%** before any success/failure transition is rendered. The percentage never regresses during a single upload attempt.
- [ ] The progress indicator is exposed to assistive tech with progressbar semantics (exact ARIA attributes per design spec) and its current value is readable in the accessibility tree.
- [ ] On a very fast upload (under ~100 ms total), the progress indicator is still mounted so that a user can observe that the upload started — it does not pop straight from "selected" to "complete" with no intermediate state.

*Server processing phase (post-bytes, pre-completion)*
- [ ] After bytes reach 100% and the `201 Created` response is received, the UI transitions to a "processing" visual state (indeterminate spinner, pulse on the bar, "Processing…" status label — exact treatment per design spec) until one of `AssetCompleted` / `AssetFailed` SignalR events arrives for the same `assetId`.
- [ ] The `assetId` returned in the 201 `AssetResponseDto` is used to reconcile incoming SignalR events — the UI must not merge events from unrelated uploads with this local upload row.

*Success (AssetCompleted)*
- [ ] When `AssetCompleted` arrives over SignalR for this `assetId` (payload: full `AssetResponseDto`), the local upload row clears — the dropzone returns to its idle state, ready for another file.
- [ ] The completed `AssetResponseDto` is recorded in application state (shape / location per staff-engineer decision Q4) such that #51 can render it in the attachment list without making an additional HTTP call to list attachments.
- [ ] A success signal visible to the user (inline confirmation, toast, dropzone flash, or the attachment appearing in the list once #51 ships — per design spec) makes the completion unambiguous; the user does not have to refresh or navigate to confirm the file is saved.

*Failure after HTTP success but during server processing (AssetFailed)*
- [ ] When `AssetFailed` arrives for this `assetId`, the progress/processing indicator is replaced by an error indicator near the dropzone carrying a user-readable reason derived from the `AssetFailedEventDto`. The file name is shown so the user knows which attempt failed.
- [ ] The local file reference is preserved (user's `File` object stays in memory) to support retry. Retry re-issues the same `POST` from 0% — no attempt at chunked resume.
- [ ] No asset row appears in the application state after `AssetFailed` — the UI matches the backend's behaviour of rolling back the DB row on failure.

*Failure of the HTTP call itself (pre-201)*
- [ ] A `4xx` / `5xx` response from the `POST` is mapped to a specific user-readable message per the mapping in the Desired State §"HTTP failure before the upload completes" table (exact copy deferred to design spec; the **mapping from status+server message to a user outcome** is the AC).
- [ ] A network error / offline / status `0` response is mapped to a "network problem" message with retry.
- [ ] After any HTTP failure the progress indicator is removed, the dropzone is returned to a usable state (idle or retry-prompt per design spec), and **no** SignalR events are awaited or reconciled for this failed attempt.
- [ ] `403 "You are not a member of this project."` from the server additionally triggers the dropzone's disabled state (same mechanism #49 uses for locally-known membership loss), not just an inline error — the user's overall project permission has changed and should be reflected consistently.

*Cancelling an in-flight upload*
- [ ] While bytes are being transferred, a visible cancel affordance (button, icon — per design spec) allows the user to abort the upload. Cancelling aborts the `HttpClient` subscription / request; no further progress events are consumed for this attempt.
- [ ] After cancellation, the dropzone returns to idle with no error shown. The `File` reference is cleared. The backend either never received the request body (early cancel) or received it and will proceed; either way the client does not display a row. If `AssetCompleted` later arrives for the cancelled attempt, the UI treats it as the normal background-completion case for #51 (the attachment appears in the list once #51 ships). If `AssetFailed` arrives, it is silently ignored — the user chose to cancel.

*Second file dropped while an upload is in flight (see open question Q2)*
- [ ] Whichever choice the tech/design specs make (queue / block / replace-with-confirm / parallel), the behaviour is deterministic and documented — no accidental silent loss of either file. The happy-path MVP recommendation is **block**: the dropzone enters a disabled-with-reason state ("Upload in progress — one moment") until the current upload either completes or fails, then returns to idle. The AC here is: whichever choice is made, no file is lost, and the user is told what happened.

*Cross-tab / cross-device reconciliation via SignalR*
- [ ] When a teammate uploads a file to the same task on another tab / device, this client receives `AssetUploadStarted` / `AssetProcessing` / `AssetCompleted` / `AssetFailed` for that upload and updates local state accordingly. Specifically: on `AssetCompleted` from *someone else's* upload, this client's application state gains the new attachment so that #51's list (once shipped) renders it without refresh.
- [ ] This client's own in-flight upload rows are distinguishable from "someone else's upload arriving via SignalR" so the UI does not render a progress bar for an upload it is not performing. (A teammate's upload has no local progress — we did not send its bytes — it only appears once `AssetCompleted` fires.)

*Navigation / teardown*
- [ ] Navigating away from the board page while an upload is in flight does not crash the app. Either the upload continues and its completion updates state (preferred) or it is cancelled cleanly — no "zombie" progress bar persists after its host UI is gone, no memory leak on the `HttpClient` subscription.
- [ ] Mounting and unmounting the host component that owns the upload does not double-subscribe to the four SignalR asset events. Re-mounting after an unmount restores functionality.
- [ ] `LeaveProjectGroup` is still called when the user navigates off the board (pre-existing behaviour from #46) so that a user off the board does not keep receiving asset events they can't act on.

*Validation still wins on the client for clearly-invalid files*
- [ ] The dropzone's existing client-side validation (#49) remains in effect — oversize / wrong-type / empty / bad-name files never reach the upload call; they are rejected in the dropzone with the existing `DropzoneValidationError` path. This ticket does not loosen or duplicate that validation.
- [ ] The validation constants in `KanbAI-Web/src/app/features/attachments/constants/attachment-rules.ts` remain the single source of truth for client-side rules. This ticket adds no parallel constant for size/type; any new values it introduces (retry delays, progress debounce, etc.) live in their own dedicated constant file, not mixed into attachment-rules.

*Privacy / logging*
- [ ] No file names, sizes, MIME types, multipart bodies, or response DTO fields are written to `console.log` or to any external telemetry endpoint by code introduced in this ticket. User-facing error copy may reference the file name (that's the feature); debug logging may not.
- [ ] JWT tokens, SignalR access tokens, and any auth material are not logged.

*Security / auth*
- [ ] The upload request uses the existing authenticated `HttpClient` pipeline; there is no bypass of the auth interceptor. Logged-out or token-expired states surface the same unauthenticated-user behaviour the rest of the app already implements (redirect to login, or whatever `AuthStateService` prescribes).
- [ ] The request URL is constructed via the existing API base URL config (environment file), not hardcoded.

*Cross-cutting guarantees*
- [ ] The existing no-op `BoardPageComponent.handleAttachmentSelected` is replaced (or re-plumbed) — no code path remains in which a validated `fileSelected` event is silently swallowed.
- [ ] The existing dropzone test suite (`KanbAI-Web/src/app/features/attachments/components/file-dropzone/file-dropzone.component.spec.ts`) continues to pass without modification — this ticket must not change the dropzone's contract. Any additions to the dropzone's visible phase set for upload/processing/upload-error states go to *separate* components or are layered on outside the dropzone, unless the tech/design specs justify extending the dropzone itself, in which case the existing tests are updated carefully to preserve intent.
- [ ] The existing `TaskDetailPanelComponent` specs continue to pass. If the upload call is relocated to the panel (open question Q1 option b), the specs are extended — not broken — to cover the new behaviour.
- [ ] `npm run build` succeeds with the new service, state, and progress UI in place.
- [ ] `npm run test -- --watch=false` runs to completion. Test failures tied to the newly introduced upload service, progress component, or state changes are fixed before completion; pre-existing failures unrelated to #50 are documented, not fixed, per project policy.
- [ ] No new dependency is added to `package.json` for this ticket. `HttpClient` + `@microsoft/signalr` (both already present per `KanbAI-Web/package.json`) cover all needs.

### Quality Gate Check

Each criterion above has been reviewed against the product-manager spec's four rules:

- **Observable:** Every criterion can be verified in the browser (visible progress bar with percentage, visible success/error states, visible cancel affordance), via the DevTools Network panel (confirming exactly one `POST /api/attachment/task/{taskId}` with a `multipart/form-data` body and a single `file` field, carrying a `Bearer` token, receiving a 201 + `AssetResponseDto`), via DevTools WebSockets tab (confirming the four `Asset*` SignalR events arrive and are consumed), via the accessibility tree (progressbar semantics), via simulated network conditions in DevTools (offline / throttled / 413 / 403), or via build/test command exit. No criterion depends on internal framework state invisible to QA.
- **Specific:** Concrete numeric behaviour (`0%` to `100%`, monotonic advance, `HttpEventType.UploadProgress`), concrete event names (`AssetUploadStarted`, `AssetProcessing`, `AssetCompleted`, `AssetFailed`), concrete status codes (`201`, `400`, `403`, `404`, `413`, `500`, `0`), concrete reconciliation key (`assetId` from the `AssetResponseDto`), and concrete copy-mapping rules are named. No vague "responsive" / "fast" / "smooth" phrasing.
- **Testable:** QA can drive each scenario deterministically — a happy-path upload, a network-drop mid-upload, a server 413, a server 403, a 500, a cancel, a second-file-during-upload attempt, a cross-tab reconcile (two browsers against the same task), and a not-a-member scenario are all reproducible by hand or in Playwright / Vitest with `HttpTestingController` + SignalR event mocks. The "no stuck progress bar" guarantee is testable by inspecting whether the UI transitions correctly in each failure branch.
- **Edge cases covered:** pre-201 HTTP failure (4xx/5xx/network/0), post-201 `AssetFailed`, cancel during bytes, cancel during processing, concurrent-second-drop (handled by open question Q2 + deterministic behaviour), teammate upload arriving via SignalR, navigation-away-with-upload-in-flight, unmount/remount of the host, sub-100-ms "instant" upload, racey 413 despite client pre-validation, double-subscription to SignalR on remount, and the single-source-of-truth concern for validation constants.

---

*"The business context is defined and saved. You can now instruct the staff-engineer agent to read the context note and design the frontend technical specification."*
