# Feature: Task detail panel re-fetches attachment list on every task signal emission, flooding backend with SQL

**GitHub Issue:** [#95](https://github.com/Gulybi/KanbAI-Web/issues/95)
**Milestone:** _none_ (unassigned)
**Labels:** `bug`
**Repository:** Gulybi/KanbAI-Web
**Assignee:** @Gulybi
**Severity:** Major — every unrelated board-state update (a teammate drags a card, renames another task, uploads an attachment elsewhere) while a task detail panel is open causes **one redundant `GET /api/task/{taskId}/assets`** against the currently-open task. On a moderately active board this turns the attachment list fetch from a per-panel-open event into a per-SignalR-event storm, saturating the backend with duplicate `SELECT`s against the asset table. The bug is invisible to the user in the happy path (the rendered list does not flicker often enough on a fast link to be noticed), but is load-bearing for backend cost, rate-limit safety, and DB-log signal-to-noise. On a slow link it is also user-visible as the list toggling between `loading` and `ready` on every echo.

---

## Business Value

### Who is this for?
- **Every user with a task detail panel open on a board where any other user is active** — which in practice is every collaborative session. Today, the moment any `TaskUpdated` / `AssetCompleted` / move / rename event arrives for any task on the board, the open task's attachment list is re-fetched, despite nothing about that task having changed. On a board with N active teammates, the panel fires a cascade of identical `GET /api/task/{taskId}/assets` requests for the one task the user is actually looking at.
- **The backend team** — particularly anyone looking at database query volumes, attachment-service logs, or rate-limit budgets. Today, an open task-detail panel on a moderately active board fans one user action (panel open) into N SQL `SELECT`s over the panel's lifetime, where N is *the count of unrelated board-state emissions*. This noise drowns out real traffic in query logs and wastes compute.
- **Future in-panel lists / hydrations that follow the same panel-open pattern.** [#51](https://github.com/Gulybi/KanbAI-Web/issues/51) established the "fetch once on panel open, merge with SignalR-origin entries" contract for attachments. Any future list built on the same chassis (comments, activity log, linked tickets) will replicate this same "effect re-runs on every task emission" bug unless the fix here locks it down correctly.
- **Users on lossy / mobile / low-bandwidth connections.** Each redundant `GET` is extra bandwidth they do not pay for and do not need. The network-panel storm also makes it harder for a user (or developer on their behalf) to tell what real traffic is happening.
- **Anyone reading DevTools → Network.** The `assets` filter today lights up with a duplicate row for every unrelated board event. Real issues on the attachments path are harder to spot under the noise.

### Why is it valuable?
- **Restores the intended [#51](https://github.com/Gulybi/KanbAI-Web/issues/51) contract.** [#51](https://github.com/Gulybi/KanbAI-Web/issues/51) specifies that the attachment list is fetched *once* on panel open and kept fresh thereafter via `AssetCompleted` SignalR events — not re-fetched on every board-state tick. The tech spec for [#51](https://github.com/Gulybi/KanbAI-Web/issues/51) explicitly calls out that `hydrateCompletedForTask` is idempotent on `phase === 'loading'` and that SignalR is the live-update path. The current behaviour violates the spirit of that contract.
- **Eliminates avoidable backend load.** One panel-open should cost one `SELECT` on the asset table — not N. On a ten-member team actively editing a board, the duplicate-request count per open panel is easily in the tens or hundreds over a single work session.
- **Removes Network-panel noise.** Developers debugging anything else on the attachments path (upload, download, 403s) can filter by `assets` and see only the traffic *they* caused, not a per-event SignalR shadow.
- **Removes a latent UX bug on lossy connections.** When the backend is slow, each redundant `GET` toggles the list's `fetchState` between `loading` and `ready`, which — given the `attachment-list.component` design — may hide the error banner or flash a loading state even when the user has taken no action. Clients on a lossy tab can experience a visible flicker today.
- **Sets the correct pattern for future in-panel hydrations.** Fixing the trigger rule once (*"fetch when the task id actually changes, not when the task signal re-emits"*) is the template that future features (inline comments, activity feed) will inherit.
- **Closes a small but persistent wasted-work loop** that will only grow as collaboration activity grows — the more teammates on a board, the more events emit, the more redundant fetches fire per open panel.

### What problem does it solve?

**Reproduction on `main` today:**

1. Sign in, open a project with ≥ 2 tasks; the currently-opened task (call it `X`) has at least one attachment already persisted (so the initial list fetch returns a non-empty body).
2. Open task `X` in the detail panel. In DevTools → Network, filter by `assets` (or the attachment-list endpoint path).
3. Observe exactly one `GET /api/task/X/assets` firing as the panel opens. ✅ Expected.
4. Without closing the panel, have a teammate (or a second browser) perform **any** board-state action that broadcasts a `TaskUpdated` event: drag a *different* task to a different column, rename a *different* task, add an attachment on a *different* task, edit the description of a *different* task — anything at all that mutates the board.
5. Each such event causes the originating client's `BoardStateService` to reconcile board state, which replaces the `BoardTask` reference for task `X` *even though nothing about `X` changed*. The `app-task-detail-panel` `[task]` input binding therefore emits a new value. The `effect` inside the panel re-reads `this.task().id` and calls `hydrateCompletedForTask('X')` again.
6. **Observed:** Network tab shows a new `GET .../assets` for task `X` after each emission. Backend SQL logs show a matching `SELECT` for each. The request count grows in lockstep with unrelated board activity.
7. **Expected:** Exactly one `GET .../assets` for the panel-open lifetime of task `X`. Subsequent, unrelated board events must not cause new fetches.

**Root-cause observations (verified against `main`):**

- [`task-detail-panel.component.ts:143-152`](../../KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts) — the constructor contains an Angular `effect(...)` that reads `this.task().id` on every task signal emission. Angular's effect tracking is granular to the *signal* being read, and `this.task()` itself re-emits whenever its parent reference changes. The effect therefore re-runs on every `task` input emission, including ones where `task().id` is identical to the previous value.
- [`attachments-state.service.ts:212-240`](../../KanbAI-Web/src/app/features/attachments/state/attachments-state.service.ts) — `hydrateCompletedForTask` only dedupes if `current?.phase === 'loading'`. Once a fetch resolves to `ready` (which happens in the ~100-300ms after panel open on a healthy connection), every subsequent call for the same taskId bypasses the dedupe check and issues a new GET. The dedupe was deliberately narrow in [#51](https://github.com/Gulybi/KanbAI-Web/issues/51) to allow explicit `Retry` to work after an `error` phase; it was not designed to prevent effect-driven re-calls for an already-hydrated task.
- The inline comment on [`task-detail-panel.component.ts:144-145`](../../KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts) says *"Hydrate the completed-attachments list whenever the open task changes. `hydrateCompletedForTask` is idempotent and dedupes on `phase === 'loading'`"*. The first half (the intent) is correct; the second half (the guarantee) is only true during the narrow `loading` window. Outside that window, the effect + state service combination is **not** idempotent.
- [`board-state.service.ts`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts) `onTaskUpdated` — whenever ANY task on the board is updated, the handler rebuilds the `tasksByColumnId` map. Because `BoardTask` objects are rebuilt (not mutated in place), and because the board page projects the currently-open task from that map (see [`board-page.component.ts`](../../KanbAI-Web/src/app/features/board/board-page/board-page.component.ts) — the `[task]` binding on `<app-task-detail-panel>` reads off the projected board state), the task signal driving the panel gets a new `BoardTask` object reference **even when the task the user is viewing is not the one that changed**. The `id` is identical; the object reference is not.
- The fix is **client-side only**. No backend change, no SignalR change, no state-service contract change for callers who do want a refetch (the `Retry` button, the initial panel open, and a close-and-reopen onto a different task).

**In short:** The effect re-runs whenever the `task` input emits a new object, the state service does not dedupe once the fetch is `ready`, and the two combined turn the attachment list into a per-SignalR-event shadow fetch. The fix gates the hydrate trigger so that it fires on genuine `taskId` transitions (panel open for a new task, or explicit retry), not on same-`taskId` re-emissions from board-state churn.

---

## Current State vs Desired State

### Current State (behaviour today on `main`)

- **Initial panel open (`X`).** Panel opens → `effect` fires → `hydrateCompletedForTask('X')` → `GET /api/task/X/assets` → list renders. ✅ Correct single fetch.
- **Any unrelated board-state emission while panel is open on `X`.** `TaskUpdated` for task `Y` (`Y !== X`), remote card move, remote rename, remote description edit, teammate adds an attachment on a *different* task — each of these re-runs `onTaskUpdated` in `BoardStateService`, rebuilds the board state map, causes the `<app-task-detail-panel>` `[task]` binding to project a new `BoardTask` reference for `X`, the `task` input signal emits, the `effect` re-runs, and `hydrateCompletedForTask('X')` is called **again**. Because the list fetch from the initial open has already resolved to `ready`, the `loading` dedupe does not apply. A new `GET /api/task/X/assets` fires. ❌ Redundant fetch.
- **One redundant fetch per emission.** On a board where N teammates are actively editing, the user with the panel open on `X` sees N duplicate `GET`s over the session, one per event. Backend `SELECT`s against the asset table follow the same count.
- **Close and re-open the same task.** Panel closes → panel opens on `X` again → `effect` fires → `hydrateCompletedForTask('X')` → `GET`. The re-open case happens to be indistinguishable from the bug case in the current codebase (both issue a `GET`), which is part of why the bug has been latent — the correctness contract for close+reopen has never been tightened.
- **Close and open a different task `Y`.** Panel closes → panel opens on `Y` → `effect` fires with `id === 'Y'` (a genuine transition) → `hydrateCompletedForTask('Y')` → `GET /api/task/Y/assets`. ✅ Correct single fetch for the new task.
- **Explicit Retry.** [`handleRetryListFetch`](../../KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts) on the error banner calls `hydrateCompletedForTask(this.task().id)`. Today this also issues exactly one fetch per click because the state service's `loading` dedupe catches any overlap. ✅ Correct single fetch per click.
- **Flicker on slow connections.** Because `fetchState` flips to `loading` on every redundant `hydrateCompletedForTask`, a slow backend will flip the list UI's phase between `loading` and `ready` on every board-state tick. In [`attachment-list.component.ts`](../../KanbAI-Web/src/app/features/attachments/components/attachment-list/attachment-list.component.ts), `showLoadingSkeleton` is guarded with `attachments().length === 0`, so the skeleton does not flash for a task with existing attachments — but any error banner (in the `error` phase) will be replaced with a fresh `loading` state on the next redundant call, effectively hiding errors from the user if traffic is noisy enough. On a lossy tab, the user may lose the chance to click Retry because the banner keeps being cleared.
- **SignalR pathway is correct.** `AssetCompleted` events continue to flow into `completedByTaskId` via `AttachmentsStateService.onAssetCompleted`. This is the intended live-update path for attachment changes and it works. This ticket does not change SignalR behaviour.
- **No backend flicker on the DB side.** The backend happily serves the redundant `SELECT`s — there is no error, no user-visible failure, no functional bug in the contract. The cost is purely wasted DB / CPU / bandwidth.
- **Conflict with [#94](https://github.com/Gulybi/KanbAI-Web/issues/94)'s pattern.** [#94](https://github.com/Gulybi/KanbAI-Web/issues/94) fixed an adjacent class of bug: *"apply the authoritative update on the originating client rather than wait for the echo"*. This ticket is its dual: *"do not re-fetch merely because the echo landed — the local state is already authoritative and the list has not changed."*

### Desired State

After this ticket, the attachment list is fetched **exactly once per panel-open per task id**, and thereafter only in response to explicit user actions (Retry button) or a task-id transition (close + open a different task). Unrelated board-state emissions do not cause a re-fetch.

#### Panel open for task `X` (initial)
- Panel opens with `task().id === 'X'`. The attachment list is fetched **exactly once**: one `GET /api/task/X/assets` hits the backend. ✅ Unchanged from today.

#### Panel remains open on `X`, board state emits events for other tasks
- Any SignalR event that mutates board state without changing `X`'s identity — `TaskUpdated` for a different task, move of a different task, rename of a different task, description edit on a different task, `AssetCompleted` for a different task, `AssetFailed` for a different task — produces **zero** additional `GET /api/task/X/assets` calls for as long as the panel remains open on `X`. The backend asset-table `SELECT` count for task `X` does not increase from these events.
- Live updates that matter to `X` (e.g. an `AssetCompleted` for `X` itself) continue to arrive via SignalR and update `completedByTaskId[X]` exactly as today. The list re-renders in-place. No HTTP `GET` is needed for this; SignalR is the authoritative live channel.

#### Panel remains open on `X`, task `X`'s own metadata is updated by a teammate
- A `TaskUpdated` for task `X` itself (e.g. a teammate renames `X` or edits its description) does **not** trigger an attachment-list re-fetch. The attachments on `X` have not changed — only its title/content has. The assertion holds even though the `BoardTask` object reference for `X` changes. Live attachment changes continue to arrive via SignalR as above.

#### Close and re-open **the same** task `X`
- Two possible acceptable behaviours; the tech spec picks one and the ticket is resolved as long as it is chosen deliberately and does not regress the other correctness clauses:
  - **Option A — gate on taskId transition only.** Re-opening the same task without any intervening task id change issues **zero** `GET`s; the list renders from cached `completedByTaskId[X]`. The user receives the already-fresh list instantly.
  - **Option B — gate on taskId transition with a "panel-open session" marker.** Each panel-open lifecycle counts as one permit to fetch; rapidly opening → closing → opening the same task fires **at most one** `GET` per such cycle (and no more than one per ~500ms to defend against double-click / rapid re-open).
- Whichever option is chosen, rapidly opening and closing the panel on the same task **must not stack duplicate in-flight requests** — the `loading` dedupe continues to catch overlap.

#### Close and open a **different** task `Y`
- The attachment list for `Y` is fetched **exactly once**: one `GET /api/task/Y/assets`. The previous list for `X` is not re-fetched; it is simply no longer rendered (the panel's `completedAttachments` computed now reads from `completedByTaskId[Y]`). ✅ Unchanged from today.

#### Retry after a list-fetch error
- The explicit **Retry** button on the list error banner continues to issue **exactly one** `GET /api/task/{currentTaskId}/assets` per click. Multiple rapid clicks are deduped by the existing `loading` guard in `AttachmentsStateService`. The Retry flow is the only code path that forces a re-fetch for the same taskId without a transition.

#### Live-update path (unchanged)
- `AssetCompleted` for the currently-open task continues to append the new asset row via `completedByTaskId[taskId]`. No HTTP fetch is issued — the SignalR payload is authoritative.
- `AssetFailed` for the currently-open task's upload rows continues to flip the row to error state. No HTTP fetch is issued.
- Upload from the local client (the 201 on `POST /api/task/{taskId}/assets`) continues to flow through the upload pipeline in [`attachments-state.service.ts`](../../KanbAI-Web/src/app/features/attachments/state/attachments-state.service.ts). No list re-fetch is triggered by a successful upload.

#### Error paths (unchanged)
- List-fetch failure (`403`, `404`, `5xx`, network) continues to surface in `completedFetchByTaskId[taskId]` with the existing `mapListFetchHttpErrorToUserMessage` mapping. The error banner is unchanged. Retryability of each mapped code is unchanged.
- Merging of SignalR-origin entries with the server response continues to work exactly as today (preserved entries, newer-updatedAt wins, DESC by createdAt sort). This ticket does not touch `mergeCompletedAssets`.

#### User flows (desired)

1. **Panel opens on `X`, user watches list load, then scrolls.**
   - `GET /api/task/X/assets` fires once, list renders. Scroll, read, click download on a row — all work as today.

2. **Panel stays open on `X`, teammate drags a different task across the board.**
   - Board re-renders the column where the dragged task moved. The detail panel's rendered content does not visually change. **Zero** new `GET /api/task/X/assets` fires. Backend logs show no new `SELECT` against the asset table for task `X`.

3. **Panel stays open on `X`, teammate uploads an attachment on a different task `Z`.**
   - `AssetCompleted` for `Z` lands in `completedByTaskId[Z]`. The user's panel does not visually change (they are viewing `X`, not `Z`). **Zero** new `GET /api/task/X/assets`. `completedByTaskId[Z]` is updated for when the user next opens `Z`.

4. **Panel stays open on `X`, teammate uploads an attachment on `X` itself.**
   - `AssetCompleted` for `X` lands in `completedByTaskId[X]`. The attachment list renders the new row (via the existing SignalR → state → computed pathway). **Zero** new `GET /api/task/X/assets`. The list is up to date via SignalR, as designed in [#51](https://github.com/Gulybi/KanbAI-Web/issues/51).

5. **User closes panel, opens task `Y`.**
   - `GET /api/task/Y/assets` fires once. `Y`'s list renders. This is the normal path for cross-task navigation.

6. **User closes panel, immediately re-opens `X`.**
   - Tech-spec choice (Option A or Option B above). Either **zero** additional fetches (cache served) or **one** fetch. Not two or more. The cheap choice is cache-served; the safer-refresh choice is single-fetch. Both are acceptable answers to the bug.

7. **Initial panel-open fetch returns a 5xx; user clicks Retry.**
   - Error banner renders. One retry click → one `GET`. Banner dismisses on success.

8. **Initial panel-open fetch is in flight; the same-task hydrate is somehow called again (defensive).**
   - The `loading` dedupe in `hydrateCompletedForTask` continues to catch overlaps — **exactly one** in-flight `GET` at any moment for a given taskId.

### Out of scope for this ticket

- **Backend changes.** Zero. The endpoint, response shape, rate-limit headers, pagination (if any), and SQL query plan are all stable. No payload change.
- **SignalR changes.** The `AssetCompleted` / `AssetFailed` / `TaskUpdated` event wiring is correct. This ticket does not add, remove, or filter SignalR subscriptions.
- **Attachment REST contract.** `GET /api/task/{taskId}/assets` is unchanged in method, path, query parameters, and body shape.
- **Caching beyond in-memory state.** The existing in-memory `completedByTaskId` map is the only cache. No `localStorage`, no `sessionStorage`, no `IndexedDB`. A hard refresh of the page still starts from an empty in-memory cache, which is correct.
- **Freshness policies for long-open panels.** This ticket does **not** introduce a time-based re-fetch (e.g. "if the panel has been open for > 5 min, refresh on next focus"). If such a policy is wanted later, it is a follow-up ticket.
- **Task-card attachment count badges or board-level attachment summaries.** Out of scope. This ticket is strictly about the panel-open fetch trigger.
- **The upload pipeline.** No changes to `POST /api/task/{taskId}/assets`, no changes to the progress-row component, no changes to `AttachmentsApiService.uploadAttachment`.
- **The download pipeline.** No changes to `GET /api/attachment/{assetId}` or the blob-download path.
- **Cancellation of stale fetches on panel close.** Existing `listSubs` teardown in `AttachmentsStateService` already handles this. No new cancellation logic is required by the AC.
- **Description edit behaviour from [#94](https://github.com/Gulybi/KanbAI-Web/issues/94).** Independent; both tickets can ship in any order.

---

## Milestone Context

**Milestone:** unassigned on the GitHub issue. This is a follow-up bug on the [#51](https://github.com/Gulybi/KanbAI-Web/issues/51) attachment-list feature. The feature shipped correctly for the initial-fetch case; the bug is in the *re-fetch gating* when the panel stays open through unrelated board churn.

### Prerequisites — already shipped
- **[#51](https://github.com/Gulybi/KanbAI-Web/issues/51)** — *"Build Attachment List and Download UI"*. Introduced `AttachmentsStateService.completedByTaskId`, `hydrateCompletedForTask`, `completedFetchByTaskId`, `AttachmentListComponent`, `AttachmentRowComponent`, the list-fetch error model, and the panel-open hydration effect in `TaskDetailPanelComponent`. This ticket adjusts the **trigger rule** of that effect and tightens the dedupe contract of `hydrateCompletedForTask`; it does not re-specify any other behaviour.
- **[#49](https://github.com/Gulybi/KanbAI-Web/issues/49) / [#50](https://github.com/Gulybi/KanbAI-Web/issues/50)** — dropzone + async upload pipeline. Still drive the SignalR `AssetCompleted` / `AssetFailed` events that feed `completedByTaskId` and the upload progress rows. Unchanged by this ticket.
- **`TaskUpdated` SignalR plumbing** — [`board-state.service.ts`](../../KanbAI-Web/src/app/features/board/state/board-state.service.ts) `onTaskUpdated`. The handler correctly reconciles board state on remote edits. It is not the bug; the bug is downstream of it (the panel's effect re-runs off the task signal change that this handler produces). No change to `onTaskUpdated` semantics.
- **Backend endpoint** — `GET /api/task/{taskId}/assets` per [`backend_api_map.md`](../../.claude/backend_api_map.md). Stable response shape; no change.

### Related / adjacent
- **[#94](https://github.com/Gulybi/KanbAI-Web/issues/94)** — *"Edited description does not render the freshest value"*. Same class of bug (one side of a feature over-delegates to echo, the other side over-reacts to echo) but opposite polarity — [#94](https://github.com/Gulybi/KanbAI-Web/issues/94) adds an apply-on-success; this ticket removes a spurious re-fetch-on-echo. The two tickets are independent and can ship in either order.
- **[#87](https://github.com/Gulybi/KanbAI-Web/issues/87)** — task hydration on board entry. Ensures a realistic reproduction surface (tasks + attachments are populated before the panel opens). No code overlap.
- **Future in-panel hydrations** (comments, activity log, linked tickets, if/when they ship). Whatever trigger-rule pattern this ticket settles on becomes the default.

### Downstream
- **Backend DB / CPU cost savings** — immediate and proportional to active-collaboration activity. A 10-person team on a noisy board saves hundreds of `SELECT`s per open-panel session.
- **Cleaner Network panel** during future debugging on any attachments-adjacent feature.
- **Correct template for the next in-panel list feature.** Fixes the pattern before it proliferates.

### Backend Prerequisite
**None.** Verified against [`backend_api_map.md`](../../.claude/backend_api_map.md): `GET /api/task/{taskId}/assets` is unchanged in method, path, query, response shape, and status codes. No schema, no route, no payload change.

---

## Acceptance Criteria

Every criterion below is observable in the running UI and backend traffic from a single user's perspective (the user with the panel open), is specific enough for QA to script without knowing how the fix is implemented, and does not specify implementation. Network-level criteria are written in terms of DevTools-observable behaviour, not code paths.

### Panel open — initial fetch
- [ ] Opening the task detail panel on a task `X` that has one or more existing attachments issues **exactly one** `GET /api/task/X/assets` request, observable in DevTools → Network filtered by `assets`.
- [ ] Opening the task detail panel on a task `X` that has zero existing attachments issues **exactly one** `GET /api/task/X/assets` request.
- [ ] The single initial request populates the attachment list for `X` correctly (non-empty list renders the expected rows; empty list renders the [#51](https://github.com/Gulybi/KanbAI-Web/issues/51) empty-state placeholder).

### Panel stays open on `X`, unrelated board activity — no re-fetch
- [ ] While the detail panel remains open on task `X`, a teammate drags a **different** task to a different column (producing a `TaskUpdated` + position change for the dragged task) causes **zero** additional `GET /api/task/X/assets` requests in the originating client's DevTools → Network.
- [ ] While the detail panel remains open on task `X`, a teammate renames a **different** task causes **zero** additional `GET /api/task/X/assets` requests.
- [ ] While the detail panel remains open on task `X`, a teammate edits the description of a **different** task causes **zero** additional `GET /api/task/X/assets` requests.
- [ ] While the detail panel remains open on task `X`, a teammate uploads an attachment on a **different** task (producing `AssetCompleted` for that other task) causes **zero** additional `GET /api/task/X/assets` requests.
- [ ] While the detail panel remains open on task `X`, an arbitrary sequence of 10+ unrelated board-state updates emitted rapidly (drag + rename + attach on other tasks, back-to-back) causes **zero** additional `GET /api/task/X/assets` requests — not one per event, not one total, **zero**.

### Panel stays open on `X`, `X`'s metadata updated remotely — no re-fetch
- [ ] While the detail panel remains open on task `X`, a teammate renames `X` itself (producing a `TaskUpdated` for `X`) causes **zero** additional `GET /api/task/X/assets` requests in the originating client. The rendered task title re-renders as today; the attachment list does not re-fetch.
- [ ] While the detail panel remains open on task `X`, a teammate edits `X`'s description (producing a `TaskUpdated` for `X` with a new `content`) causes **zero** additional `GET /api/task/X/assets` requests.

### Panel stays open on `X`, live attachment updates — SignalR only
- [ ] While the detail panel remains open on task `X`, a teammate uploads an attachment on `X` itself (producing `AssetCompleted` for `X`). The new attachment row appears in the list via SignalR within seconds of the teammate's completion. **Zero** additional `GET /api/task/X/assets` requests are issued by the originating client.
- [ ] The new row appears with correct metadata (file name, size, icon, createdAt) populated from the `AssetCompleted` payload — i.e. the SignalR update path is authoritative and does not require a follow-up `GET` to be correct.

### Task navigation — fresh single fetch per new task id
- [ ] Closing the detail panel for `X` (via close button, Escape, or backdrop) and opening the detail panel for a different task `Y` issues **exactly one** `GET /api/task/Y/assets` request. The previous panel's in-flight request (if any) is not restarted.
- [ ] Opening `Y`, then `Z`, then `W` in sequence issues exactly three `GET` requests — one per new task id — across the three panel opens. No duplicate requests.

### Close and re-open the same task
- [ ] Closing the detail panel for `X` and re-opening the detail panel for `X` **without** any intervening task-id change issues **at most one** `GET /api/task/X/assets` request. Depending on the tech-spec choice, this is either zero (cache served) or one (deliberate fresh fetch on re-open). In either case it is **never two or more** fetches for a single close-open round trip.
- [ ] Rapidly opening the panel, closing it, and re-opening it on the same task three times in quick succession (faster than the typical `GET` round-trip) issues **at most** a small bounded number of `GET`s (one per open at most, with overlap deduped) — never one per emission of the task input signal. No storm.

### Explicit Retry — still works
- [ ] When the list fetch fails (simulated 500 via test-only interceptor, or observed in a real outage), the list error banner renders with a Retry button. Clicking Retry issues **exactly one** `GET /api/task/{currentTaskId}/assets` per click. Two rapid clicks issue at most one in-flight request at a time (overlapping clicks are deduped).
- [ ] After a successful Retry, the list transitions out of the error state and renders the fetched rows. Subsequent unrelated board events do not trigger further fetches (same as the non-error path).
- [ ] After a 403 or 404 list error (non-retryable codes per [#51](https://github.com/Gulybi/KanbAI-Web/issues/51)), Retry is disabled or absent as today; no path causes a re-fetch without user action.

### Error paths — regression guard on unchanged behaviour
- [ ] `403` on the initial `GET /api/task/X/assets` renders the [#51](https://github.com/Gulybi/KanbAI-Web/issues/51) 403 copy in the list error banner; `completedByTaskId[X]` is not cleared; unrelated board events do not trigger a re-fetch or clear the banner.
- [ ] `404` on the initial `GET /api/task/X/assets` renders the [#51](https://github.com/Gulybi/KanbAI-Web/issues/51) 404 copy; Retry is disabled per [#51](https://github.com/Gulybi/KanbAI-Web/issues/51); unrelated board events do not trigger a re-fetch or clear the banner.
- [ ] Network failure (`status === 0`) renders the retryable network-error copy; unrelated board events do not trigger a re-fetch.
- [ ] `5xx` on the initial fetch renders the retryable 5xx copy; unrelated board events do not trigger a re-fetch.

### Backend observability
- [ ] In backend asset-service logs (or equivalent DB log that records `SELECT` against the asset table by `task_id`), an open panel on task `X` over a period where 10+ unrelated board events are emitted results in **exactly one** `SELECT` for task `X`'s asset list — not 11, not 10, one. This criterion is observable by a backend engineer inspecting the query log or by a test environment with query capture.
- [ ] A user session that opens 5 different tasks (`X1` through `X5`) over a work period, while other users emit unrelated board events between each open, results in **exactly 5** `SELECT`s against the asset table by `task_id` — one per panel-open-per-task, regardless of how many unrelated SignalR events flowed in between.

### Real-time sync — regression guard on unchanged flows
- [ ] A `TaskUpdated` SignalR event for the currently-open task continues to update the rendered task title / description / other metadata as today (this ticket does not break remote-edit visibility).
- [ ] An `AssetCompleted` SignalR event for the currently-open task continues to append an attachment row via the existing state-service path — visible in the list without any HTTP `GET`.
- [ ] An `AssetFailed` SignalR event for an in-flight upload on the currently-open task continues to flip the upload progress row to the error state as today.
- [ ] An `AssetCompleted` SignalR event for a task **other than** the one currently shown in the panel has no visible effect on the panel (the list for the other task is updated in state in the background; the rendered content of the open panel does not change, and no `GET` is issued for the open task).

### Accessibility — regression guard on unchanged announcements
- [ ] The loading skeleton, empty-state message, error banner, and row-level affordances from [#51](https://github.com/Gulybi/KanbAI-Web/issues/51) render as today on the initial fetch and on Retry. No change to screen-reader announcements.
- [ ] The list error banner is not spuriously cleared or replaced by unrelated board-state emissions (which it is today on a slow backend — fixing the bug removes this accessibility side-effect as well).

### Out of scope (restated here for QA's no-test list)
- [ ] No test should assert changes to the `GET /api/task/{taskId}/assets` response shape, query parameters, or status-code set.
- [ ] No test should assert changes to the SignalR `AssetCompleted` / `AssetFailed` / `TaskUpdated` event wiring.
- [ ] No test should assert client-side persistent caching of attachment lists across hard refresh.
- [ ] No test should assert a time-based auto-refresh (e.g. "panel open for N minutes → refetch").
- [ ] No test should assert task-card attachment count badges.
- [ ] No test should assert changes to the upload or download pipelines.

---

*The business context is defined and saved. You can now instruct the staff-engineer agent to read the context note and design the frontend technical specification.*
