# Feature: Build Attachment List and Download UI

**GitHub Issue:** #51
**Milestone:** #6 — Asynchronous File Upload UI
**Assignee:** Gulybi

## Business Value

**Who is this for?**
End users of KanbAI (project owners and project members) who have already uploaded files against a task via the dropzone (#49) + upload pipeline (#50) and now need to **see** those files listed on the task, understand what they are at a glance (name, type, size, when added), and **get them back out** of the system by downloading. Also teammates opening the same task who need to consume files someone else uploaded.

**Why is it valuable?**
Milestone #6's promise is the complete upload-loop: drop → upload → *see it there* → *open it again later*. #49 and #50 delivered drop and upload. Today, after a successful upload, the `AssetCompleted` event lands in `AttachmentsStateService.completedByTaskId` (`KanbAI-Web/src/app/features/attachments/state/attachments-state.service.ts` line 394 `appendCompleted`) and is read by **nothing** — the task-detail panel renders only the dropzone and the in-flight upload rows (`KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.html` lines 46–64). The completed attachments state slice is an invisible dead-letter box. A user who uploaded `spec.pdf` yesterday, closes the panel, and opens it today, sees an empty task — exactly as empty as one that has never had a file attached. The feature is only half delivered without #51.

The task card on the board (`KanbAI-Web/src/app/features/board/components/task-card/task-card.component.html`) likewise shows nothing about attachments — a task with four PDFs looks identical to a task with zero files. A user browsing a column cannot tell "which of these tickets have supporting material" without opening every one. This ticket fixes that at both levels: a visible attachment list inside the detail panel, and a lightweight indicator on the task card.

**What problem does it solve?**
- Makes uploaded files **visible** on the task they belong to: file name, file-type affordance (icon), human-readable size, upload date. Without a list, the upload pipeline (#50) is write-only from the user's perspective — you can put files in but never verify they're there.
- Makes uploaded files **retrievable** via `GET /api/attachment/{assetId}` (documented in `.claude/backend_api_map.md` line 107). The backend serves the raw file stream with correct `Content-Type` and `Content-Disposition` (`inline` for images, `attachment` otherwise); this ticket wires the request, carries the JWT (via the existing `authInterceptor` at `KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts` line 21 which auto-attaches `Authorization: Bearer <token>` to any URL under `environment.apiUrl`), handles the download failure set (`400` still processing / `400` upload failed / `403` not a member / `404` missing), and surfaces specific, user-readable errors instead of a broken browser tab.
- Gives a teammate who did **not** perform the upload a way to consume the file. Per #50, when tab A uploads, tab B receives `AssetCompleted` over SignalR — #50 records this in `completedByTaskId` but has no surface for it. #51 is that surface: tab B's attachment list gains a row and the download button works.
- Makes **attachment presence discoverable** from the board view (without opening the detail panel), via a small attachment indicator / count badge on the task card. A project lead skimming columns can see "this card has 2 files" at a glance.
- Establishes the download pattern (`HttpClient.get(..., { responseType: 'blob', observe: 'response' })`, filename extraction, blob-URL `<a download>` invocation, object-URL cleanup) that any future "download a thing" feature will reuse.

**Business impact:**
- Together with #49 (dropzone) and #50 (async upload + progress), **closes Milestone #6 end-to-end**. After this ticket, a user can attach a file, watch the upload finish, see the file listed on the task, and download it back — either on the same device/session, on a different device, or as a teammate.
- Unblocks #52 (Document AI File Upload UI Implementation / AI_LOGS.md) which describes the whole upload + list + download surface and cannot be written honestly until the list + download surface exists.
- Eliminates the "did my file actually save?" doubt that's currently only mitigated by the optimistic success toast in #50. Persistent, refresh-surviving visibility of uploaded files is the authoritative answer.
- Delivers the first **persistent-artifact retrieval** surface in the app. Every prior read surface (project list, board columns, members) renders metadata only. The download button is the first UI that ships an *actual user-generated file payload* back to the user.

## Current State

- **Uploaded attachments are stored in state but never rendered.** `AttachmentsStateService` exposes `completedByTaskId: Signal<Record<string, AssetResponseDto[]>>` (`KanbAI-Web/src/app/features/attachments/state/attachments-state.service.ts` line 53). Its `appendCompleted` method (line 394) is called from `onAssetCompleted` (line 284) for both the local client's own uploads and teammate uploads received via SignalR. **No component reads this signal.** A repo-wide search for `completedByTaskId` returns only the state-service internal definition and its spec file — no view consumers.
- **The task-detail panel has no attachment list.** `task-detail-panel.component.html` (lines 42–75) renders exactly three things inside its body: a section label "Attachment" (singular), the `<app-file-dropzone>`, and the stack of `<app-upload-progress-row>` entries for in-flight uploads. There is no attachment-list component, no listing iteration, no per-file row, no download button. A user who drops a file, waits for it to complete, and watches the progress row disappear (per #50's `onAssetCompleted` → `removeRow`), then sees the dropzone return to idle and **nothing else**. The uploaded file is invisible to them.
- **The task card has no attachment indicator.** `task-card.component.html` renders `task.title`, a drag handle, and a "Notes" badge when `task.content` is non-empty. There is no attachment icon, count, or indicator. `BoardTask` (`KanbAI-Web/src/app/features/board/state/board-state.model.ts` line 21) has no `attachmentCount` or `attachments` field. A user scanning a board cannot tell which tasks have files.
- **No download call exists anywhere.** Repo-wide search for `responseType.*blob|attachment.*download|saveAs|Content-Disposition` returns only the unrelated auth-interceptor spec and the attachments-state service spec. `AttachmentsApiService` (`KanbAI-Web/src/app/features/attachments/services/attachments-api.service.ts`) exposes only `uploadAttachment(taskId, file)`; there is no `downloadAttachment(assetId)` method. `GET /api/attachment/{assetId}` is documented in `.claude/backend_api_map.md` line 107 but unused by the frontend.
- **The task backend model does not carry attachments.** `TaskResponseDto` (`.claude/backend_api_map.md` lines 275–286) contains `id`, `title`, `content`, `taskOrder`, `columnId`, `assignedId`, `createdAt`, `updatedAt` — no `attachments` array, no `attachmentCount` field. `BoardTask` mirrors this shape. This means loading a board today does **not** fetch existing attachments for any task — the only way attachment data enters the client is via `AssetCompleted` SignalR events broadcast *during a live session* (or from the 201 response to a local upload started in this session). Files uploaded in a **prior session** are invisible to the client until/unless they are re-broadcast, which they aren't — SignalR emits `AssetCompleted` only at the moment of completion, not on session resume.
- **Consequence of the point above:** With the existing backend surface, the list cannot be reliably "backfilled" on task-detail open. This is a **critical open question** — see "Open questions" in Desired State below. Either (a) a new backend list endpoint is needed (`GET /api/task/{taskId}/attachments` or equivalent — **not documented in `.claude/backend_api_map.md`; would need to be confirmed with the backend team**), or (b) this ticket's list scope is limited to "attachments the client has seen in this session" and the tech spec explicitly documents the limitation.
- **Download failure modes are documented but unhandled.** `.claude/backend_api_map.md` line 120 lists the download failure set — `400 "File is still being processed."`, `400 "File upload failed."`, `403 "You are not authorized to access this file."`, `404 "File not found."` — with no UI path to surface any of them today. The generic browser error or a silent navigation failure is what a user would hit if these were invoked.
- **MIME type and file-type affordance are not represented in UI code.** No icon mapping from MIME (or extension) to a visual affordance exists. The dropzone's allowed-extension list (`KanbAI-Web/src/app/features/attachments/constants/attachment-rules.ts`) is the only inventory of file kinds the client knows about (`.jpg/.jpeg/.png/.gif/.pdf/.docx/.xlsx/.txt`), and it is used for *validation*, not for *presentation*. The list UI will need its own mapping.
- **`formatFileSize` util exists and is already used by the dropzone and upload row** (`KanbAI-Web/src/app/features/attachments/utils/format-file-size.ts`). The list UI reuses it — no duplicate formatter.
- **SignalR wiring for the four asset events is already active** (`AttachmentsStateService` constructor effect, line 73). When `AssetCompleted` arrives, `completedByTaskId` is updated — this ticket does not add new SignalR subscriptions, only new consumers of the existing `completedByTaskId` signal. The `signalRService.connectionState()` guard ensures no events are consumed on disconnect.
- **The auth interceptor already authenticates any request under `environment.apiUrl`** (`KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts` line 21). A `GET /api/attachment/{assetId}` call made via `HttpClient` will automatically carry the JWT — this ticket must NOT attach its own header, and must NOT hit the URL via `window.open` / raw `<a href>` (those would lose the bearer token). Download must go through `HttpClient.get(..., { responseType: 'blob' })`.
- **Net user-visible behavior today:** Drop file → progress bar fills → processing → done → dropzone resets to idle. No list appears. Close the panel. Reopen the panel. Still no list. Upload another file. Progress → done → idle. Still no list. Switch to another tab logged in as a different project member. Upload a file against the same task. Teammate's tab (somewhere in the world) has received `AssetCompleted` — nothing changes visually. The attachment surface is fully functional as a one-way write channel and totally invisible as a read channel.

## Desired State

After this issue is delivered, every task-detail panel that has at least one `Completed` attachment renders a **scrollable list of attachment rows**, each row showing the file's type via an icon, its filename, its human-readable size, its creation date, and a download control that **actually serves the file's bytes** to the user with the correct filename — no new browser tab with a raw binary stream, no blank download, no silent failure. Additionally, every task card on the board renders a small **attachment indicator** when the task has one or more completed attachments, so attachment presence is discoverable without opening the panel. Failure paths (download denied, file still processing, file missing, network loss) each map to a specific, user-readable message — never a generic error.

**Expected behaviors (UI-observable):**

*Attachment list appears below the dropzone on the task-detail panel*
- When the task-detail panel is open for task T, below the dropzone and upload-progress stack, an "Attachments" section renders the list of completed attachments for T from `AttachmentsStateService.completedByTaskId[T]`. The exact section ordering (dropzone above or below the list) is a design-spec decision; the *presence* of the list when there is ≥ 1 completed attachment is the business requirement.
- When the task has zero completed attachments in state, the section either (a) is hidden entirely, or (b) shows an empty-state message like "No attachments yet." — the design spec picks. Either way, nothing scary (no "Error" / no "0 results" wording).
- When a new attachment completes (via the local 201 response from #50 or via an `AssetCompleted` SignalR event from a teammate), the list updates **without a page refresh** — the list is driven by the same `completedByTaskId` signal that #50 already populates.

*Each attachment row shows the required metadata*
- **File-type icon.** Each row shows a visual affordance derived from the attachment's `mimeType` (or `fileName` extension as fallback). The icon set covers at minimum the eight formats the dropzone accepts: images (`image/*` → image icon), PDFs (`application/pdf` → document icon), Word (`.docx` / `application/vnd.openxmlformats-officedocument.wordprocessingml.document` → document icon), Excel (`.xlsx` / `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` → spreadsheet icon), plain text (`text/plain` → text icon). Files whose MIME type does not match the whitelist (unexpected in practice because the dropzone validates) fall back to a generic file icon. Exact icon assets and colours are design-spec decisions; the **mapping from MIME to category** is the business rule.
- **File name.** Rendered from `AssetResponseDto.fileName`. Long names do not break the row layout — they wrap or ellipsize per the design spec. The full name is available to assistive tech regardless of visual truncation (`title` attribute or `aria-label`).
- **File size.** Rendered via the existing `formatFileSize` util (`KanbAI-Web/src/app/features/attachments/utils/format-file-size.ts`) from `AssetResponseDto.fileSize`. No new formatter. No ambiguous "large" / "small" copy.
- **Upload date.** Rendered from `AssetResponseDto.createdAt` (ISO 8601 from backend). The display format is design-spec (relative "2 hours ago" vs absolute "May 3, 2026" vs combined) — the business requirement is that the date is present and unambiguous to a user in any timezone (no pure "2 hours ago" with no absolute fallback in a tooltip, for accessibility).
- **Download control.** Each row has a visible, keyboard-operable download button / icon-button that triggers the download flow (see below). It has a clear accessible name (e.g. `aria-label="Download {fileName}"`).

*Download flow for a single file*
- When the user clicks (or keyboard-activates) the download control for a row, the client issues `GET /api/attachment/{assetId}` via `HttpClient.get` with `responseType: 'blob'` and `observe: 'response'`. The request auto-attaches the JWT via the existing `authInterceptor` — this ticket does **not** add a manual `Authorization` header. The request does **not** go through `window.open` or a plain `<a href>` because those would bypass the interceptor and ship the URL without auth.
- On `200 OK`, the response body is a `Blob` with `Content-Type` matching the stored MIME and `Content-Disposition` indicating the browser behaviour (`inline` for images per `.claude/backend_api_map.md` line 107, `attachment` for everything else). The client creates an object URL via `URL.createObjectURL(blob)` and triggers a programmatic download by clicking a synthetic `<a download="{fileName}" href="{blob-url}">` element. The object URL is revoked via `URL.revokeObjectURL` after the click to avoid memory leaks.
- The filename used for the saved file is the `fileName` from the row's state (which is the sanitized backend name from `AssetResponseDto.fileName`), **not** the value of `Content-Disposition` (which is driven by the backend and is fine if present, but the client has an authoritative `fileName` in state that it can use without parsing the header).
- While the download is in flight (network-bounded), a **busy affordance** is shown on the row's download button (disabled state, spinner, or aria-busy — per design spec). Double-clicking the download button does not trigger two downloads of the same asset.
- On success the busy affordance clears. No toast is strictly required for successful download (the browser's own download indicator is the OS-level confirmation), but the design spec may specify a subtle cue.

*Download failure handling (per-row)*
- `400 "File is still being processed."` → "This file is still being saved. Please try again in a moment." — rendered inline next to the row (not as an ephemeral toast). This is the race between an `AssetCompleted` event arriving and the backend having fully persisted the file (unlikely but documented at `.claude/backend_api_map.md` line 120). Retry is enabled.
- `400 "File upload failed."` → "This file didn't finish uploading and can't be downloaded." — rendered inline next to the row. Retry is disabled because the file is in `Failed` state server-side and won't come back; the row may expose a "Remove" affordance (out of scope if a "delete attachment" endpoint doesn't exist — see open questions).
- `403 "You are not authorized to access this file."` → "You're not allowed to download this file." — same pattern as #50's 403 handling. This indicates the user's project membership has changed; design spec decides whether the whole attachment section disables or just the offending row flags an error.
- `404 "File not found."` → "This file no longer exists." — the row is marked as missing; retry is disabled. Optionally the list auto-removes the row after a brief delay (design spec).
- Network error / status `0` → "Network problem — the file couldn't be downloaded. Try again." with retry enabled.
- Unknown `5xx` → "Download failed — please try again." with retry.
- Exact user-facing copy is deferred to the design spec; the **mapping from status + server message to a specific user outcome** is the business requirement. No response should map to a silent failure or a generic "something went wrong".

*Per-row state during errors*
- A download error on one row must not blank out or break other rows. The list continues to render; only the affected row carries the error state.
- Retrying a failed download re-issues the same `GET /api/attachment/{assetId}`. No backend change is needed for retry.

*Attachment indicator on the task card (board-level)*
- Each task card on the board renders a small attachment indicator when `completedByTaskId[task.id]?.length >= 1`. The indicator is a visual affordance (paperclip icon, "📎 2" count chip — exact visual per design spec) that communicates "this task has N files" at a glance. A count of 0 renders nothing (the card looks identical to today).
- The count updates live: when a new `AssetCompleted` arrives for a task T, the card for T shows the updated count on the next change-detection tick. When the client hasn't yet seen any attachments for T (e.g. fresh page load with no prior session data — see open question Q1), the indicator shows nothing — **not** a zero badge, because a zero badge would falsely imply "we checked and there are zero" when in fact "we haven't checked".
- The indicator is accessible: its count is exposed in the card's accessible name (e.g. `{title} (has notes) (2 attachments)`). Assistive tech users do not have to open the panel to learn attachment presence.
- The indicator does **not** act as a separate click target; the card itself already opens the detail panel on click. Activating the card (click / Enter / Space) brings the user to the attachment list.

*Session-resume data visibility*
- **Critical open question (Q1).** Today, `completedByTaskId` is populated only by (a) the 201 response from a local upload and (b) the `AssetCompleted` SignalR event. When a user opens the board after a page refresh, no `AssetCompleted` events are replayed — the state slice is empty for every task. This means, with the current backend surface, a task that had files uploaded yesterday shows **zero** attachments on today's load, even though the files are on the server.
  - Option A: Backend adds a list endpoint (e.g. `GET /api/task/{taskId}/attachments` or `GET /api/attachment/task/{taskId}`). Frontend calls it on panel-open or on board-load. **This endpoint is not currently documented in `.claude/backend_api_map.md`** — if this is the chosen path, the staff-engineer phase must confirm with the backend team that it exists (or can be added).
  - Option B: The task-load endpoint (`GET /api/project/{id}` or whatever populates the board) is extended to include attachment metadata. **Also not currently documented** — same confirmation needed.
  - Option C: Limit the scope of #51 to "session-local visibility only" — attachments the client has seen via `AssetCompleted` or local upload are listed; historical attachments are **not** listed because the client has no way to fetch them. Document this limitation loudly in the UI copy ("Upload history for this session" or similar) and in the tech spec.
  - Option D: Frontend-only backfill by calling `GET /api/attachment/{assetId}` for known asset ids — **infeasible** because we don't know the ids without a list endpoint. Listed here to be rejected.
  - **Recommendation to staff-engineer:** confirm option A is feasible with the backend team. If it is, wire it; if not, default to option C and document the limitation. Either choice preserves the AC below around "showing what the client knows"; only the definition of "what the client knows" changes.

*Integration with in-flight upload rows (#50)*
- The attachment **list** (this ticket) and the upload **progress row stack** (#50) are two separate UI surfaces. They do not merge into one list. Rationale: the phase vocabulary is different (`uploading`/`processing`/`error` vs. `Completed`), the per-row controls are different (cancel/retry/dismiss vs. download), and the state slices are different (`uploadsByTaskId` vs. `completedByTaskId`).
- When an upload completes, #50 removes the in-flight row (`removeRow` in `onAssetCompleted`) and appends to `completedByTaskId`. The visual transition is "progress row disappears, new attachment row appears in the list" — the user's eye tracks from the progress stack to the list. Design spec decides whether to animate this transition.
- The dropzone, the upload-progress stack, and the attachment list can all render simultaneously on the same panel. The disabled state of the dropzone (from #50's `isUploading` + `UPLOAD_BLOCKED_REASON`) is unchanged.

*Security / privacy*
- Filenames, sizes, MIME types, and `assetId` values are not written to `console.log` or any external telemetry endpoint by code introduced in this ticket. Filename can appear in user-facing error copy (that's the feature), not in debug logs.
- The JWT, SignalR access token, and any auth material are not logged.
- Downloaded blobs are not persisted to `localStorage` / `IndexedDB` / `sessionStorage` by this ticket — they are streamed to the user's OS and the in-memory object URL is revoked.
- No attachment content is rendered inline in the UI beyond what the browser already does with the downloaded blob. No `[innerHTML]` usage introduced.

**Expected user flow (happy path — download):**
1. User opens task "Redesign login" detail panel. The Attachments section lists three rows: `spec.pdf` (1.2 MB, May 4, 2026), `mockup-v4.png` (3.8 MB, May 5, 2026), `notes.docx` (220 KB, May 6, 2026) — each with a document / image / document icon.
2. User clicks the download button on `spec.pdf`. The row's download button flips to a busy affordance.
3. `HttpClient.get('/api/attachment/{assetId}', { responseType: 'blob', observe: 'response' })` returns `200` with `Content-Type: application/pdf` and a blob payload.
4. The client creates an object URL, clicks a synthetic `<a>` with `download="spec.pdf"`, the browser saves `spec.pdf` to the OS download folder. The object URL is revoked.
5. The busy affordance clears. The user sees the browser's native download shelf indicator. The list is unchanged.

**Expected user flow (teammate upload arrives while panel is open):**
1. User A has task T's detail panel open. The list currently shows two attachments.
2. User B (a teammate) uploads `revised-spec.pdf` to task T from another browser.
3. User A's client receives `AssetCompleted` over SignalR. `AttachmentsStateService.appendCompleted(T, dto)` mutates `completedByTaskId` (already wired by #50).
4. The list on user A's screen gains a third row — without a refresh, without any action from user A. The row shows the PDF icon, `revised-spec.pdf`, its size, and "just now" / the current timestamp.
5. The task card on the board (if visible) gains or increments its attachment indicator from 2 → 3.

**Expected user flow (download of a 403):**
1. User A opens a task that has an attachment listed (seen in a prior session, now cached somewhere — or received over SignalR from before the membership change).
2. Between then and now, user A was removed from the project.
3. User A clicks the download button. `GET /api/attachment/{assetId}` returns `403 "You are not authorized to access this file."`.
4. The row renders an inline error: "You're not allowed to download this file." Retry is disabled.
5. Other rows in the list remain unaffected and downloadable (if the user still somehow has them in state — in practice a 403 on one asset usually means 403 on all, but the UI must not cascade the error).

**Expected user flow (download of a 400 "still processing"):**
1. User A uploads a very slow-to-finalize file. The 201 returns and the in-flight row transitions to `processing`. At the same moment, an `AssetCompleted` arrives (race) and the list gains a row.
2. User A clicks download immediately. `GET /api/attachment/{assetId}` returns `400 "File is still being processed."` because the backend's file-write step hasn't committed yet (documented race at `.claude/backend_api_map.md` line 120).
3. The row shows "This file is still being saved. Please try again in a moment." with retry enabled.
4. User A waits a moment, clicks retry, the `GET` returns `200`, the file downloads normally.

**Open questions surfaced to the staff-engineer phase:**
- **Q1: How are attachments populated on cold load / session resume?** As described in "Session-resume data visibility" above. Strong recommendation: confirm a `GET /api/task/{taskId}/attachments` (or equivalent) exists or can be added. If not, constrain #51 to session-local visibility and document it.
- **Q2: Where does the attachment-list component live?** Options: (a) new `AttachmentListComponent` inside `features/attachments/components/attachment-list/`; (b) inlined markup directly in the task-detail panel (simpler for MVP, harder to test); (c) a new `AttachmentRowComponent` for the individual row + a parent list component for orchestration. Recommend (a) + (c) for parity with the dropzone / upload-progress-row split pattern (`features/attachments/components/upload-progress-row/`). Staff-engineer call.
- **Q3: Where does the download call live?** Options: (a) extend `AttachmentsApiService` with `downloadAttachment(assetId): Observable<HttpResponse<Blob>>`; (b) introduce a new `AttachmentDownloadService`. Recommend (a) — the existing service is already the right seam and it's a one-method extension. Staff-engineer decides.
- **Q4: Where does per-row download state live (busy / error)?** Options: (a) extend `AttachmentsState` with a `downloadByAssetId: Record<string, DownloadState>` slice; (b) local signal inside `AttachmentRowComponent`. Recommend (b) — download state is ephemeral, not shared across panels, and does not need to survive navigation. But if the staff-engineer wants "downloads continue in background after panel close" (they probably shouldn't — a blob download that completes while the user is elsewhere is weird) they can lift to service state.
- **Q5: What is the click target on the card for opening the detail panel vs. downloading directly?** Recommend: the card itself opens the panel (existing behavior), and the card-level attachment indicator is **decorative** (not a separate click target). Downloads only happen from inside the panel. Rationale: accidental downloads from the board would be jarring (users are browsing, not retrieving).
- **Q6: Preview / inline-view vs. download-only?** The backend serves images with `Content-Disposition: inline`, implying preview-in-tab is possible. Recommend **download-only** for #51 (simpler, covers the milestone promise, avoids a whole image-viewer surface). A future ticket can layer image preview on top. Staff-engineer / web-designer call if differently.
- **Q7: Delete-attachment affordance?** A "Remove" button per row is a natural ask (especially for a `Failed` row or an accidentally-uploaded file). Backend does not currently document a `DELETE /api/attachment/{assetId}` endpoint (`.claude/backend_api_map.md` §Attachments shows only POST and GET). **Recommend out of scope** for #51 unless the backend has or can add a delete endpoint; this is a user-valuable follow-up ticket.

**Out of scope for this issue (belongs elsewhere):**
- **The dropzone, validation, and in-flight upload UI** — delivered by #49 and #50.
- **Upload retry affordance on progress rows** — delivered by #50.
- **Deleting an attachment** — no backend contract today; future ticket pending backend support. (Q7)
- **Previewing an attachment inline (image viewer, PDF preview pane)** — out of scope per Q6; future ticket.
- **Thumbnail rendering** — `AssetResponseDto.thumbnailKey` is documented as "Reserved for future thumbnail generation" (`.claude/backend_api_map.md` line 304). No thumbnail endpoint exists yet.
- **Sorting / filtering / search inside the attachment list** — not required by the issue; default chronological (ascending or descending, design spec) is acceptable for the current volume (single-digit files per task).
- **Pagination** — not required; the list is small (same reason).
- **Multi-file selection / bulk download as a ZIP** — out of scope.
- **Moving / reassigning attachments to another task** — not in the backend contract; out of scope.
- **Keyboard shortcuts for download (e.g. Enter on the list → download first)** — out of scope; only the per-row button/link is keyboard-operable in this ticket.
- **Virus-scan status badges / content-inspection metadata in the row** — backend does not expose this.
- **Editing task title / description / assignees / comments** — all out of scope for this milestone; the task-detail panel remains a stub host plus the attachment surfaces.
- **The AI_LOGS.md documentation** — #52 (closed; may need a revision note after #51 ships).
- **Reworking any of the four asset SignalR events or the upload endpoint** — backend contract is frozen; any change there is a separate backend ticket.

## Milestone Context

**Milestone:** #6 — Asynchronous File Upload UI

**Prerequisite Issues (all CLOSED):**
- #49 — Create Drag-and-Drop File Dropzone Component — CLOSED. Delivers the dropzone, the validation util, and the shared attachment-rules constants (`KanbAI-Web/src/app/features/attachments/constants/attachment-rules.ts`). Not directly consumed by #51 but defines the feature-slice layout (`features/attachments/`) that #51 extends.
- #50 — Implement Async File Upload with Progress Tracking — CLOSED (merged in `f8b975e`). Delivers `AttachmentsStateService`, `AttachmentsApiService.uploadAttachment`, the upload-progress row, and the `completedByTaskId` state slice that this ticket consumes. The `AssetResponseDto` shape (`KanbAI-Web/src/app/features/attachments/models/attachment.model.ts` line 20) is the row data contract for #51.
- #47 — Implement Visual Drag-and-Drop (Angular CDK) — CLOSED. Delivers the board + task-card UI and the click-to-open-detail plumbing. This ticket extends `TaskCardComponent` with an attachment indicator and extends `TaskDetailPanelComponent` with an attachment-list section.
- #46 — Integrate Real-time Events with State Management — CLOSED. Delivers the generic `SignalRService.on<T>(eventName)` API and the `JoinProjectGroup`/`LeaveProjectGroup` lifecycle; #50 layered the four `Asset*` events on top. This ticket adds no SignalR subscriptions — it consumes the state slice #50 populates.

**Sibling Issues (same milestone):**
- #49 — dropzone — CLOSED. Input surface only.
- #50 — async upload + progress — CLOSED. Produces the `completedByTaskId` data this ticket renders.
- **#51 — this ticket — attachment list + download UI + board-card indicator.**
- #52 — Document AI File Upload UI Implementation (AI_LOGS.md) — CLOSED. Documentation was written against the upload side only; a post-#51 addendum may be needed covering the list + download surface.

**Downstream Issues (likely future work after this milestone):**
- No open issues reference #51 directly in the GitHub tracker at the time of writing. Probable future work enabled by #51: image preview-in-panel (builds on the download pipeline); attachment deletion (needs backend `DELETE /api/attachment/{assetId}`); bulk download / zip; attachment search; thumbnails (when the backend wires `thumbnailKey`); in-app image annotation.

**Related Work:**
- `docs/handoffs/issue_50_context.md` / `_tech_spec.md` / `_design_spec.md` — authoritative on the upload pipeline, the `AssetResponseDto` shape that feeds the list, the `AttachmentsStateService` contract, and the SignalR event handling that populates `completedByTaskId`. #51 is a pure read-consumer of this state + a separate write-consumer of the download endpoint.
- `.claude/backend_api_map.md` §Attachments (lines 100–120) — authoritative on `GET /api/attachment/{assetId}`, the download response shape (`Content-Type`, `Content-Disposition`), and the download failure set. The client-side error mapping in this ticket is the exact mirror; if the backend ever changes these strings the client copy changes too (single-source-of-truth concern flagged in AC).
- `.claude/backend_api_map.md` §AssetResponseDto (lines 295–310) — row data contract. `id`, `fileName`, `mimeType`, `fileSize`, `createdAt`, `processingStatus`, `kanbanTaskId` are all used by #51; `storageKey` and `thumbnailKey` are not used.
- `KanbAI-Web/src/app/features/attachments/utils/format-file-size.ts` — reused for the size display; no duplicate formatter.
- `KanbAI-Web/src/app/features/attachments/constants/attachment-rules.ts` — reuse the allowed-extension enumeration as the basis for the file-type icon mapping (eight categories match the eight accepted extensions + fallback).
- `KanbAI-Web/src/app/features/attachments/state/attachments-state.service.ts` line 53 (`completedByTaskId`) — the read-side signal this ticket binds to.
- `KanbAI-Web/src/app/features/attachments/services/attachments-api.service.ts` — the service to extend with `downloadAttachment`.
- `KanbAI-Web/src/app/features/board/components/task-card/task-card.component.ts` + `.html` — the card to extend with the attachment indicator.
- `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts` + `.html` — the host to extend with the attachment-list section.
- `KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts` line 21 — confirms JWT is auto-attached to any `HttpClient` call under `environment.apiUrl`; no manual header needed for the download call.

## Acceptance Criteria

*List surface exists and renders completed attachments*
- [ ] When the task-detail panel is open for a task T and `AttachmentsStateService.completedByTaskId[T]` contains at least one `AssetResponseDto`, an "Attachments" section is rendered inside the panel with one row per entry. Section position (relative to the dropzone and upload-progress stack) is per the design spec, but the section is always visible whenever rows exist.
- [ ] When `completedByTaskId[T]` is empty for the open task, the section either renders nothing or renders an empty-state copy like "No attachments yet." (per design spec). It does not render "0 results" / "Error" / broken layout.
- [ ] The list is reactive: a new `AssetCompleted` event arriving for task T while the panel is open causes a new row to appear without any user action or page refresh. A removed row (if ever — e.g. on failed 201 post-optimistic add) does not leave a phantom entry.
- [ ] The list component is contained to the attachments feature slice (`KanbAI-Web/src/app/features/attachments/components/…` per the open question Q2 choice) — not placed under `features/board/` — so it can be reused if the attachment surface ever appears outside the board (e.g. a project-level asset library).

*Each row shows required metadata with correct bindings*
- [ ] Each row displays a file-type icon derived from the attachment's `mimeType`, with a fallback derived from the `fileName` extension if the MIME lookup misses. The mapping covers (at least) image / PDF / document (Word) / spreadsheet (Excel) / text / generic-file. The mapping source (MIME → category) is a named, testable constant — not inline branching scattered through the template.
- [ ] Each row displays `AssetResponseDto.fileName` as the primary text label. Long filenames do not break the row layout; the full name remains accessible to screen readers (via `title`, `aria-label`, or equivalent) regardless of visual truncation.
- [ ] Each row displays the file size formatted via the existing `formatFileSize` util at `KanbAI-Web/src/app/features/attachments/utils/format-file-size.ts`. No new formatter, no duplicate util, no inline `(bytes / 1024)` math in the template.
- [ ] Each row displays the upload date derived from `AssetResponseDto.createdAt`. Both an absolute date (local to the user's timezone) and, optionally, a relative phrase ("2 hours ago") are acceptable; a pure relative phrase without an absolute fallback visible to assistive tech is NOT acceptable. Exact format deferred to design spec.
- [ ] Each row has a visible, keyboard-operable download control with an accessible name referencing the filename (e.g. `aria-label="Download {fileName}"`). Space/Enter triggers the download from keyboard focus.

*Download issues the correct authenticated HTTP call*
- [ ] Clicking the download control on a row issues exactly one `GET /api/attachment/{assetId}` request via `HttpClient.get` with `responseType: 'blob'` and `observe: 'response'`. The URL is built from the existing `environment.apiUrl` base — not hardcoded.
- [ ] The request carries `Authorization: Bearer <token>` via the existing auth interceptor; the ticket code does not manually set the header. The request is not issued via `window.open`, `window.location.assign`, or a plain `<a href="{url}">` that would lose the bearer token.
- [ ] The download call lives in `AttachmentsApiService.downloadAttachment(assetId)` (or equivalent per open question Q3) — not inside a component.
- [ ] Double-clicking the download button on the same row does not issue two concurrent `GET` requests for the same asset — the button is disabled / busy while the first is in flight.

*Happy-path download saves the file correctly*
- [ ] On a `200 OK` response, the client creates an object URL via `URL.createObjectURL(blob)`, triggers a download by clicking a synthetic `<a download="{fileName}" href="{objectURL}">` element (or equivalent platform-native trigger), and then revokes the object URL via `URL.revokeObjectURL` after the click to release memory.
- [ ] The saved filename matches `AssetResponseDto.fileName` from the row's state. (The `Content-Disposition` header from the server may be present; the client does not need to parse it because it already has the authoritative filename in state.)
- [ ] After a successful download, the row's busy affordance clears and the row returns to the idle/downloadable state. The user can immediately download the same file again.
- [ ] The download does not navigate the current page away, does not open a new tab that the user has to manually close, and does not leave an object URL dangling after the click.

*Download failure mapping (per `.claude/backend_api_map.md` line 120)*
- [ ] A `400 "File is still being processed."` response surfaces an inline error on the row with user-readable copy equivalent to "This file is still being saved. Please try again in a moment." Retry is enabled.
- [ ] A `400 "File upload failed."` response surfaces "This file didn't finish uploading and can't be downloaded." Retry is disabled (the file will not become available).
- [ ] A `403 "You are not authorized to access this file."` response surfaces "You're not allowed to download this file." and does not crash the rest of the list.
- [ ] A `404 "File not found."` response surfaces "This file no longer exists." Retry is disabled. The row is optionally auto-removed after a short delay per design spec.
- [ ] A network error / status `0` surfaces "Network problem — the file couldn't be downloaded. Try again." with retry enabled.
- [ ] An unclassified `5xx` surfaces "Download failed — please try again." with retry enabled.
- [ ] No HTTP failure results in a generic browser error page, a silent no-op, or a crash of the attachment list / detail panel. Other rows remain functional.
- [ ] Exact copy is deferred to the design spec; the **mapping from status + server-error-message to a specific user outcome** is the AC and must be implemented.

*Task card attachment indicator (board-level)*
- [ ] When a task T has `completedByTaskId[T]?.length >= 1`, the task card for T renders an attachment indicator (paperclip icon + optional count, per design spec).
- [ ] When `completedByTaskId[T]` is empty or undefined, the task card renders no indicator — not a "0" badge, not a grey/empty placeholder.
- [ ] The indicator count updates live on `AssetCompleted` without a page refresh.
- [ ] The attachment count is included in the card's accessible name (e.g. the existing `accessibleName` computed in `TaskCardComponent` is extended to append `({n} attachments)` when `n >= 1`). A screen-reader user hears attachment presence when focusing a card.
- [ ] The indicator is **not** a separate click target; clicking the card opens the detail panel (existing behavior from #47). Downloads happen only from inside the panel.

*Integration with #50 (no regressions)*
- [ ] The existing dropzone, upload-progress row, and upload pipeline continue to work unchanged. Specs at `KanbAI-Web/src/app/features/attachments/components/file-dropzone/file-dropzone.component.spec.ts`, `…/upload-progress-row/upload-progress-row.component.spec.ts`, `…/state/attachments-state.service.spec.ts`, and `…/services/attachments-api.service.spec.ts` continue to pass. If `AttachmentsApiService` is extended with a download method (Q3), its existing spec is extended, not broken.
- [ ] The existing `TaskDetailPanelComponent` spec(s) continue to pass; if extended with list-hosting logic, additional tests are added for the new behavior.
- [ ] The existing `TaskCardComponent` spec(s) continue to pass; if extended with the attachment indicator, additional tests are added for the indicator's presence/absence and its effect on `accessibleName`.
- [ ] The visual transition when a local upload completes ("progress row disappears → list row appears") does not flicker other rows and does not double-count: the same `assetId` must not appear simultaneously as an in-flight upload row and as a completed attachment row in the same panel snapshot.

*Session-resume / cold-load behavior (pending Q1 resolution)*
- [ ] Whatever choice the tech spec makes on Q1 (backend list endpoint vs. session-local only), the behavior is deterministic and documented. If option C (session-local only) is chosen, the empty-state copy must make the limitation explicit, or a follow-up ticket must be linked from the list header so users understand why historical files aren't shown.
- [ ] Option C safeguard: if attachments are shown only for what the client has seen in-session, the ticket does not show a misleading "0 attachments" count or a "No attachments" message on a fresh load of a task known to have files — the design spec handles this unambiguous copy.

*Accessibility*
- [ ] Every interactive control (download button, retry button if present, empty-state action if any) is reachable by Tab, operable by Enter/Space, and has a descriptive accessible name. No download hidden behind a click-only icon with no `aria-label`.
- [ ] The attachment list is announced as a list to assistive tech (e.g. `<ul><li>` or `role="list"` / `role="listitem"`). Row count is discoverable.
- [ ] Per-row error messages are announced to assistive tech without spamming (a single polite live-region announcement when an error first appears; no re-announcement on every render tick).
- [ ] A busy download control exposes busy state to assistive tech (`aria-busy="true"` or an `aria-disabled="true"` with a status label, per design spec).
- [ ] Keyboard focus is preserved across a successful download — after the download click resolves, focus remains on the download button (not lost to `document.body`).
- [ ] Colour is not the only carrier of the "file type" affordance — the icon has a text equivalent (accessible name on the icon, or an adjacent visible file-type label, per design spec).

*Security / privacy*
- [ ] No filename, `assetId`, MIME type, blob, or response payload is written to `console.log` or to any external telemetry endpoint by code introduced in this ticket. Filenames may appear in user-facing error copy (that is the feature), not in debug logs.
- [ ] JWT tokens, SignalR access tokens, and any auth material are not logged.
- [ ] The download request is issued through the existing `HttpClient` + `authInterceptor` pipeline; no bypass of the interceptor, no raw `fetch` call that forgets the header, no URL handed to `window.open` in a way that strips auth.
- [ ] Object URLs (`URL.createObjectURL`) are revoked after the download click resolves. A user who triggers 100 downloads in a row must not leak 100 live object URLs.
- [ ] Downloaded blobs are not cached in `localStorage` / `sessionStorage` / `IndexedDB` by code introduced in this ticket.
- [ ] Logged-out or token-expired states surface the same unauthenticated-user behavior the rest of the app already uses (the existing interceptor / `AuthStateService` flow). A 401 on the download call does not silently fail; it triggers the app-level auth-recovery path.

*Cross-cutting engineering guarantees*
- [ ] `npm run build` succeeds with the new list component(s), extended API service, and card-indicator changes in place.
- [ ] `npm run test -- --watch=false` runs to completion. Test failures tied to code introduced in this ticket are fixed before completion; pre-existing failures unrelated to #51 are documented, not fixed.
- [ ] No new dependency is added to `package.json`. The download pipeline uses existing `HttpClient` + browser-native `URL.createObjectURL` / `URL.revokeObjectURL` / `<a download>` — no third-party file-saver library.
- [ ] The attachments feature slice (`features/attachments/`) remains the home for anything attachment-related; no attachment code leaks into `features/board/` beyond the minimal card-indicator binding that reads `completedByTaskId` (a selector call, not an implementation of attachment logic).
- [ ] `formatFileSize` is the single source of truth for size formatting in this ticket. Any new constants (icon-mapping dictionary, retry timing, etc.) live in their own dedicated files, not mixed into `attachment-rules.ts`.

### Quality Gate Check

Each criterion above has been reviewed against the product-manager spec's four rules:

- **Observable:** Every criterion can be verified in the browser — the list appears when there are ≥ 1 rows in `completedByTaskId`, the download triggers a browser-level file save, error copy renders inline on the row, the card indicator appears/disappears based on count, all checkable in DevTools. Network-level checks (DevTools Network panel) confirm exactly one `GET /api/attachment/{assetId}` with a `Bearer` token per user click, the response is a `Blob` with the expected `Content-Type`, and failure mappings match the documented backend strings. Accessibility tree checks confirm list semantics, accessible names, and busy state.
- **Specific:** Concrete endpoint (`GET /api/attachment/{assetId}`), concrete response handling (`responseType: 'blob'`, `observe: 'response'`, `URL.createObjectURL` + `URL.revokeObjectURL`, synthetic `<a download>`), concrete status-to-copy mappings for `400` / `403` / `404` / `0` / `5xx`, concrete data bindings (`fileName`, `mimeType`, `fileSize`, `createdAt`), concrete state source (`AttachmentsStateService.completedByTaskId`). No vague "looks nice" / "fast" / "intuitive" phrasing.
- **Testable:** QA can drive each scenario — open a task with attachments (happy path list render), click download (happy path file save), simulate 400/403/404/network via mocked `HttpClient` responses, let a SignalR mock event fire `AssetCompleted` and watch the list update, focus a card with an attachment and listen via a screen reader. Each path maps to a Vitest / Playwright case. The "no memory leak on object URLs" guarantee is testable by counting live object URLs after many rapid downloads in a browser harness.
- **Edge cases covered:** cold-load / session-resume (Q1 — deterministic behavior regardless of resolution), race between `AssetCompleted` and immediate download (400 "still processing"), concurrent teammate upload arriving via SignalR, row-level error without breaking the list, long filenames, unknown MIME type (icon fallback), removed-from-project during panel-open (403), double-click on download (no duplicate request), zero-attachments state (no "0 badge" on card), live-region announcement without spam, keyboard-only download, screen-reader disclosure of attachment count on the card, disabled retry for terminal server states (`400 "File upload failed."`, `404`).

---

*"The business context is defined and saved. You can now instruct the staff-engineer agent to read the context note and design the frontend technical specification."*
