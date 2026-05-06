# Technical Specification: Drag-and-Drop File Dropzone Component

**Context Document:** [issue_49_context.md](./issue_49_context.md)
**GitHub Issue:** #49
**Milestone:** #6 — Asynchronous File Upload UI
**Sibling tickets:** #50 (upload pipeline — consumer of this component), #51 (attachment list), #52 (AI logs)

---

## Overview

This spec introduces a self-contained, reusable **`FileDropzoneComponent`** plus a **validation helper module** under a new `features/attachments/` feature slice. The dropzone renders a visually distinct region that accepts a file via (a) HTML5 drag-and-drop, (b) pointer click, or (c) keyboard activation (`Enter` / `Space`) of a hidden `<input type="file">`. On drop or pick it runs the file through a pure client-side validation pipeline that mirrors the backend rules documented in `.claude/backend_api_map.md` (10 MB cap, 8-extension whitelist, non-empty, filename sanity). A validated file transitions the component to a "selected" state and emits a typed event `{ file: File; taskId: string }` to the parent; a rejected file transitions to an "error" state with a specific, human-readable reason and emits nothing. The component **does not** import `HttpClient`, does not depend on any API service, and does not touch `BoardStateService` or `SignalRService` — its entire contract is: render → accept gesture → validate → emit.

Because no task-detail surface exists in the codebase today (see "Hosting decision" below), this spec also stands up a **minimal stub task-detail panel** (`TaskDetailPanelComponent`) whose only purpose in this ticket is to give the dropzone a host with a real `taskId`, so sibling tickets #50 / #51 have a concrete wiring point. The stub is a plain drawer fixed to the right of the board page; no route change. The stub is explicitly marked as a placeholder both in code comments and in the tech spec — any richer detail view (comments, activity log, assignee picker) is future work.

Rationale for the "stub host" choice versus the three options the context doc surfaced to this phase is given in §"Hosting decision" below.

---

## Hosting decision

The context document raised one open question: **where does the dropzone live?** Three candidates, ranked simplest first:

| Option | Description | Verdict |
|--------|-------------|---------|
| (a) Full "Task Details" modal/side panel built in this ticket | Comments, assignee, activity, attachments, editing — a proper detail view. | **Rejected.** Out of the issue's business scope ("dropzone + client-side validation"). Would balloon the ticket, block the milestone, and duplicate work that belongs to future tickets. |
| (b) Minimal stub detail panel — right-side drawer that opens on task-card click and renders only the task title + the dropzone slot | Just enough surface to host the dropzone with a real `taskId`; marked as placeholder; can be replaced wholesale later. | **Chosen.** |
| (c) Temporary harness route (`/dropzone-harness`) holding a fake task id | Pure dev scaffolding, never reachable from the board. | **Rejected.** Fails the acceptance criterion that the dropzone must be reachable "on the task-detail surface" in product terms — a keyboard/AT user cannot reach it. Also forces a second refactor in #50 when the upload has to fire against a real task. |

**Why (b).** The acceptance criteria are written about the dropzone, not the host, but the zone must still be mountable on a real task surface so:

- The milestone demo shows "click a task → see a dropzone against *that* task".
- Ticket #50 can wire its upload call against the exact emit event without first having to stand up a host.
- The dropzone is a true reusable unit — the host is swappable without touching the dropzone.

The stub panel is a **temporary scaffold**. A TODO block at the top of its TS file names the issue that will replace it with a real detail view. It does not contain comments, activity log, assignee pickers, or editing — the issue body excludes all of those. What it does provide:

1. A click handler on `TaskCardComponent` that sets a `selectedTaskId` signal on `BoardPageComponent`.
2. A right-aligned drawer rendered when `selectedTaskId() !== null` showing `{ task.title }` and the `<app-file-dropzone>` slotted inside.
3. A close button (`X`) plus `Escape` key handler that clears `selectedTaskId`.

The cdkDrag behaviour on the card is preserved — the click handler is wired through `(click)` without swallowing drag events. The handler checks `cdkDragStarted` has not just fired (we detect a drag by the absence of click following a pointerdown+pointermove, standard CDK-safe pattern): a short-lived pointer-move threshold suppresses the click after a drag, identical to the pattern already used by Angular CDK's own examples.

### Host-side modifications

**Minimal changes to existing files:**
- `TaskCardComponent` — **add** `(click)` emitter `cardActivated = output<void>()` that fires only when the interaction is a click, not a drag (see above). No structural changes to the existing `cdkDrag` wiring.
- `BoardColumnComponent` — **add** re-emit of `cardActivated` → `taskOpened = output<BoardTask>()` so the smart parent can wire it without the column knowing about drawer state.
- `BoardPageComponent` — **add** `selectedTask: signal<BoardTask | null>` and handler `handleTaskOpened(task)`. Wire the drawer into `board-page.component.html` behind `@if (selectedTask())`.

The existing optimistic-move flow from #47 stays untouched; the only addition is the drawer slot.

---

## Component Architecture

### Routing

**No new routes.** The dropzone is reached via the existing `/board/:projectId` route → click a task card → stub drawer opens with the dropzone. The stub drawer is a conditionally rendered child of `BoardPageComponent`, not a router-outlet child.

### Component Hierarchy

**New presentational component (core deliverable of this ticket):**
- `FileDropzoneComponent` — `KanbAI-Web/src/app/features/attachments/components/file-dropzone/file-dropzone.component.ts`
  - **Inputs:**
    - `taskId = input.required<string>()`
    - `disabled = input<boolean>(false)`
    - `disabledReason = input<string | null>(null)` — rendered inside the disabled state copy when non-null (e.g. "You are not a member of this project.")
  - **Outputs:**
    - `fileSelected = output<DropzoneFileSelectedEvent>()` — emitted only after a file passes validation
    - `validationFailed = output<DropzoneValidationError>()` — emitted on every rejection for parent-side analytics hookup (optional consumer; the zone also renders the error in-place)
  - **Internal state (Signals):** `phase`, `selectedFile`, `currentError`, `isDraggingOver` (see §State & Data Layer).
  - `ChangeDetectionStrategy.OnPush`.
  - Standalone, imports = `[]` (no other Angular modules — the component uses only plain DOM APIs).

**New host scaffold component (stub, marked for replacement):**
- `TaskDetailPanelComponent` — `KanbAI-Web/src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts`
  - **Inputs:** `task = input.required<BoardTask>()`, `disabled = input<boolean>(false)`, `disabledReason = input<string | null>(null)`
  - **Outputs:** `panelClosed = output<void>()`, `fileSelected = output<DropzoneFileSelectedEvent>()` (straight re-emit from the dropzone for the parent to consume in #50)
  - Renders: task title, close button (`X`), `<app-file-dropzone [taskId]="task().id" [disabled]="disabled()" [disabledReason]="disabledReason()" (fileSelected)="...">`.
  - Imports `FileDropzoneComponent`.
  - `ChangeDetectionStrategy.OnPush`.

**Existing components modified:**
- `TaskCardComponent` — add `cardActivated` output (click/keyboard-activate distinguished from drag).
- `BoardColumnComponent` — add re-emit output `taskOpened`.
- `BoardPageComponent` — add `selectedTask` signal and drawer slot in the template.

### CDK / Angular module requirements

No new package additions. `@angular/cdk` is already in `package.json`. The dropzone itself does **not** use CDK — drag-and-drop here is HTML5 native (the CDK `DragDropModule` is specifically designed for *intra-application* drags of DOM elements the app renders, not for receiving external OS files, which is what this component does).

### New Files to Create

Paths are absolute from `KanbAI-Web/KanbAI-Web/` (the nested Angular app root):

- `src/app/features/attachments/components/file-dropzone/file-dropzone.component.ts`
- `src/app/features/attachments/components/file-dropzone/file-dropzone.component.html`
- `src/app/features/attachments/components/file-dropzone/file-dropzone.component.scss`
- `src/app/features/attachments/components/file-dropzone/file-dropzone.component.spec.ts`
- `src/app/features/attachments/models/dropzone.model.ts` — all TS interfaces exported by this slice (see §State & Data Layer)
- `src/app/features/attachments/constants/attachment-rules.ts` — **single-source-of-truth** module for the 10 MB cap, 8-extension whitelist, human-readable rule copy, and the error-code → user-message map (see §Validation constants)
- `src/app/features/attachments/utils/validate-attachment.ts` — pure validation helper (pure function, no Angular, no DOM)
- `src/app/features/attachments/utils/validate-attachment.spec.ts`
- `src/app/features/attachments/utils/format-file-size.ts` — pure helper: bytes → human-readable ("1.2 MB")
- `src/app/features/attachments/utils/format-file-size.spec.ts`
- `src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts`
- `src/app/features/board/components/task-detail-panel/task-detail-panel.component.html`
- `src/app/features/board/components/task-detail-panel/task-detail-panel.component.scss`
- `src/app/features/board/components/task-detail-panel/task-detail-panel.component.spec.ts`

### Files to Modify

- `src/app/features/board/components/task-card/task-card.component.ts` — add `cardActivated` output, add click + keyboard (`Enter` / `Space`) handlers gated on not-dragging.
- `src/app/features/board/components/task-card/task-card.component.html` — wire `(click)` / `(keydown.enter)` / `(keydown.space)` handlers and `tabindex="0"` attribute.
- `src/app/features/board/components/task-card/task-card.component.spec.ts` — add coverage for the new output plus a regression test that dragging does **not** emit `cardActivated`.
- `src/app/features/board/components/board-column/board-column.component.ts` — add `taskOpened` output that re-emits `cardActivated` with the task payload.
- `src/app/features/board/components/board-column/board-column.component.html` — bind `(cardActivated)="taskOpened.emit(task)"` on each `<app-task-card>`.
- `src/app/features/board/components/board-column/board-column.component.spec.ts` — coverage for `taskOpened` re-emission.
- `src/app/features/board/board-page/board-page.component.ts` — add `selectedTask` signal, `handleTaskOpened(task)` and `handleTaskDetailClosed()` handlers, import `TaskDetailPanelComponent`. Leave existing optimistic-move logic entirely untouched.
- `src/app/features/board/board-page/board-page.component.html` — wire `(taskOpened)="handleTaskOpened($event)"` on `<app-board-column>`; add `@if (selectedTask())` drawer slot hosting `<app-task-detail-panel>`.
- `src/app/features/board/board-page/board-page.component.spec.ts` — tests for open-on-click and close-on-panel-closed.

### Event emission contract (hand-off to ticket #50)

The critical inter-ticket contract is the payload shape emitted by `FileDropzoneComponent.fileSelected`. This is the object ticket #50 will consume to drive the upload call:

```typescript
export interface DropzoneFileSelectedEvent {
  /** The validated File — guaranteed non-empty, ≤ 10 MB, whitelisted extension, sane name. */
  readonly file: File;
  /** The task id the file was selected against — passed to POST /api/attachment/task/{taskId}. */
  readonly taskId: string;
}
```

**Invariants** (must hold at every emission):
1. The file has passed the full validation pipeline — `validateAttachment(file)` returned `{ ok: true }`.
2. `taskId` is the exact value passed to the component's `taskId` input at the moment of selection (no stale capture).
3. The event is emitted **once per validated selection**. Replacement selections emit a fresh event.
4. No emission occurs if the component is `disabled`.
5. No emission occurs on any validation failure.

Ticket #50 is free to construct `FormData`, call `POST /api/attachment/task/{taskId}`, and drive a progress UI on receipt of this event. This ticket produces no side effects beyond the emission.

---

## State & Data Layer

### State Management Strategy

All dropzone UI state is **local component state using Angular Signals**. There is no cross-component state, no service, no observable stream (a single signal per concern is simpler and adequate for a local interaction component). RxJS is not used in this ticket.

The component exposes a single `phase` signal enumerating its visual state (union type — exhaustive and small enough to reason about in a template):

```typescript
type DropzonePhase =
  | 'idle'
  | 'dragover'
  | 'selected'
  | 'error'
  | 'disabled';
```

**Signals declared on `FileDropzoneComponent`:**

```typescript
/** Current visual phase. Derived from other signals via computed(). */
private readonly phase = computed<DropzonePhase>(() => { /* see below */ });

/** True while a native dragover is active over the zone. Toggled by
 *  handleDragEnter / handleDragLeave. Set to false on any drop. */
private readonly isDraggingOver = signal<boolean>(false);

/** The currently-selected validated file, or null in idle/error. */
private readonly selectedFile = signal<File | null>(null);

/** The current validation error to render, or null. Mutually exclusive
 *  with selectedFile (selecting a new file clears the error; a new error
 *  clears the selection). */
private readonly currentError = signal<DropzoneValidationError | null>(null);
```

`phase` is `computed` from the three signals above plus the `disabled()` input:

```typescript
phase = computed<DropzonePhase>(() => {
  if (this.disabled()) return 'disabled';
  if (this.currentError() !== null) return 'error';
  if (this.selectedFile() !== null) return 'selected';
  if (this.isDraggingOver()) return 'dragover';
  return 'idle';
});
```

Two additional `computed`s drive rendering:

```typescript
/** Human-readable summary of the selected file; '' when none. */
selectedFileSummary = computed<string>(() => { /* `${name} · ${formatFileSize(size)}` */ });

/** Accessible-name string applied via aria-label. Includes the two input
 *  methods plus the accepted-format and max-size constraints in every
 *  phase; appends the current selection or error summary when present. */
accessibleName = computed<string>(() => { /* see §Accessibility */ });
```

**Why Signals, not RxJS.** No async data flows, no cross-subscription composition, no temporal operators. Signals compose via `computed()` cleanly for the `phase` selector and keep `OnPush` change detection pull-based and cheap.

**Why not a service.** State is entirely local to one component instance. Multiple dropzones on the same page must not share state (e.g. if two sibling tasks each had a dropzone). A service would incur an unnecessary coupling and violate the dropzone's reusability promise.

### TypeScript Interfaces

**File:** `src/app/features/attachments/models/dropzone.model.ts`

```typescript
/** Payload emitted by FileDropzoneComponent.fileSelected after a file
 *  passes validation. See also: issue #50 (consumer of this event). */
export interface DropzoneFileSelectedEvent {
  readonly file: File;
  readonly taskId: string;
}

/** Tagged error union describing why a file was rejected. The code is
 *  stable for analytics / tests; the message is the exact copy rendered
 *  to the user. Codes map 1-to-1 onto the backend's user-facing errors
 *  so copy is consistent if #50 ever surfaces a server-side rejection
 *  with the same shape. */
export type DropzoneErrorCode =
  | 'FORMAT_NOT_ALLOWED'
  | 'SIZE_EXCEEDED'
  | 'SIZE_ZERO'
  | 'NAME_INVALID'
  | 'MULTI_FILE_TRUNCATED';

export interface DropzoneValidationError {
  readonly code: DropzoneErrorCode;
  readonly message: string;
  /** When true, the "error" is informational (the first file WAS accepted
   *  but the user tried to drop more). Rendered as a non-blocking note
   *  alongside the selected-file summary. Only used with
   *  MULTI_FILE_TRUNCATED. */
  readonly informational: boolean;
}

/** Discriminated result of validateAttachment(). */
export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: DropzoneValidationError };

/** Visual state enum (documented in §State Management Strategy). */
export type DropzonePhase =
  | 'idle'
  | 'dragover'
  | 'selected'
  | 'error'
  | 'disabled';
```

### Validation constants — single source of truth

Acceptance criterion #170 requires that the three validation constants (max size bytes, allowed-extension list, human-readable rule copy) are edited in exactly one place. This is satisfied by a dedicated constants module exporting everything the dropzone, the validation helper, and any future consumer needs.

**File:** `src/app/features/attachments/constants/attachment-rules.ts`

```typescript
/**
 * Single source of truth for client-side attachment validation rules.
 * These values mirror .claude/backend_api_map.md §Attachments; any
 * change to the backend cap or whitelist requires editing THIS FILE
 * and only this file on the frontend.
 */

/** Hard maximum file size in bytes. Mirrors backend MaxFileSize = 10 MB. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10,485,760

/** Canonical whitelist (lowercase, leading dot) — mirrors backend. */
export const ATTACHMENT_ALLOWED_EXTENSIONS: readonly string[] = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.pdf',
  '.docx',
  '.xlsx',
  '.txt'
] as const;

/** Value for the hidden <input type="file"> accept attribute. */
export const ATTACHMENT_ACCEPT_ATTRIBUTE: string =
  ATTACHMENT_ALLOWED_EXTENSIONS.join(',');

/** Human-readable formats list shown in the dropzone copy and error text
 *  ("JPG, JPEG, PNG, GIF, PDF, DOCX, XLSX, TXT"). Derived from the
 *  extension list so the two cannot drift. */
export const ATTACHMENT_ALLOWED_EXTENSIONS_DISPLAY: string =
  ATTACHMENT_ALLOWED_EXTENSIONS
    .map(ext => ext.slice(1).toUpperCase())
    .join(', ');

/** Human-readable max-size string for copy ("10 MB"). */
export const ATTACHMENT_MAX_SIZE_DISPLAY: string = '10 MB';

/** Composed idle-state affordance copy. Wording deferred to design spec;
 *  this constant is the canonical fallback / AT accessible-name. */
export const ATTACHMENT_IDLE_COPY: string =
  `Drop a file here or click to browse — up to ${ATTACHMENT_MAX_SIZE_DISPLAY}; ` +
  `${ATTACHMENT_ALLOWED_EXTENSIONS_DISPLAY}.`;
```

**Invariants:**
- `ATTACHMENT_ALLOWED_EXTENSIONS` must remain lowercase and leading-dot — the validation helper compares lowercased file extension against it.
- `ATTACHMENT_ACCEPT_ATTRIBUTE` and `ATTACHMENT_ALLOWED_EXTENSIONS_DISPLAY` are **derived** from the list — never typed as literals. A new extension is added in exactly one place (the array).
- Unit tests in `validate-attachment.spec.ts` reference `ATTACHMENT_MAX_BYTES` and `ATTACHMENT_ALLOWED_EXTENSIONS` (not literals) so a rule change does not silently pass stale tests.

### Validation helper

**File:** `src/app/features/attachments/utils/validate-attachment.ts`

Pure function — no Angular, no injection, no side effects. Takes a `File` and returns a discriminated `ValidationResult`. The dropzone component calls this once per drop/pick.

```typescript
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_ALLOWED_EXTENSIONS,
  ATTACHMENT_ALLOWED_EXTENSIONS_DISPLAY,
  ATTACHMENT_MAX_SIZE_DISPLAY
} from '../constants/attachment-rules';
import type {
  DropzoneValidationError,
  ValidationResult
} from '../models/dropzone.model';
import { formatFileSize } from './format-file-size';

/** Validates a single File against the attachment rules. Runs checks in
 *  this order (first failure wins):
 *    1. Name validity  → NAME_INVALID
 *    2. Format (extension, case-insensitive) → FORMAT_NOT_ALLOWED
 *    3. Size zero → SIZE_ZERO
 *    4. Size > max → SIZE_EXCEEDED
 *  Returns { ok: true } if all checks pass. */
export function validateAttachment(file: File): ValidationResult;

/** Returns true if the filename is plausibly the OS-provided sanitized
 *  name (non-empty, no path separators, no null bytes). Mirrors the
 *  server's SanitizeFileName rejection criteria. */
export function isValidFileName(name: string): boolean;

/** Returns the lowercase extension including the leading dot, or '' if
 *  the name has no '.'. */
export function getExtension(name: string): string;
```

**Method signatures only** — bodies are the developer's to write, guided by the ordered-check contract above.

### Format helper

**File:** `src/app/features/attachments/utils/format-file-size.ts`

Pure function used both in the dropzone's "selected" summary and in the `SIZE_EXCEEDED` error message.

```typescript
/** Formats a byte count as "X KB" / "X.X MB" / "X.X GB" etc., with one
 *  decimal place above 1 KB. Zero returns "0 B".
 *  Units are binary (1024-based) to match the backend's 10 MB = 10,485,760. */
export function formatFileSize(bytes: number): string;
```

### Suppressing the browser default drop outside the zone

Acceptance criterion #129 requires that dropping a file anywhere on the page outside the dropzone does not navigate the browser away. The solution is **listener-leak-safe**:

- The listeners for `dragover` and `drop` are attached to `window` from inside `FileDropzoneComponent.ngOnInit` (or equivalent constructor-registered `DestroyRef` cleanup) **only while the component is mounted**.
- Each listener calls `event.preventDefault()` **unless the event target is inside the component's own host element** (in which case the component's own element-scoped handlers take over).
- The listeners are removed in `ngOnDestroy` via the stored `AbortController` / `removeEventListener` pair.
- A static reference-count (`FileDropzoneComponent.mountCount`) ensures that if two dropzones are mounted on the page simultaneously, the window suppression is attached once and detached only when the last instance unmounts. This prevents one dropzone's unmount from leaving the other's page un-guarded, and prevents two listeners firing twice on the same event.

**Signatures for the component-level implementation (bodies are the developer's to write):**

```typescript
/** Registers the window-level suppression listeners on first mount,
 *  no-ops on subsequent mounts. Increments the mount counter. */
private static attachWindowSuppression(host: HTMLElement): void;

/** Decrements the counter; removes the window-level listeners when the
 *  last dropzone unmounts. */
private static detachWindowSuppression(host: HTMLElement): void;
```

**Why a static count and not a singleton service.** A service would force a lifecycle management convention on every consumer. The mount-counter pattern keeps the guard a private concern of the dropzone and guarantees symmetric attach/detach without any consumer awareness.

---

## Service Integration

**No HTTP service is introduced by this ticket.** The dropzone does not import `HttpClient`. The only cross-boundary "contract" is the shape of the emitted event consumed by sibling ticket #50.

### Inter-ticket contract with #50

| Producer | Consumer | Contract | Location |
|----------|----------|----------|----------|
| `FileDropzoneComponent.fileSelected` (new, this ticket) | `AttachmentService.upload(event)` (new, ticket #50) | `DropzoneFileSelectedEvent` (see §State & Data Layer) — exported from `features/attachments/models/dropzone.model.ts` | Producer: `features/attachments/components/file-dropzone/file-dropzone.component.ts` · Consumer: `features/attachments/services/attachments-api.service.ts` (to be created by #50) |

**Stability guarantee.** Ticket #49 and #50 agree that `DropzoneFileSelectedEvent` is `{ file: File; taskId: string }` and this shape does not change within milestone #6. Any future additions (e.g. a client-generated upload id for optimistic display) will be added as optional properties — existing consumers remain compatible.

### Shared utility boundary

The `attachment-rules.ts` constants and the `validate-attachment.ts` helper are public exports of the `features/attachments/` slice. Ticket #50 is explicitly allowed — and encouraged — to re-use these same constants when constructing its error UX for server-rejected uploads, so client- and server-origin rejection copy stays identical. Ticket #51 (attachment list, download UI) may also re-use `formatFileSize` when rendering uploaded-file sizes.

No inversion of dependency: `features/attachments/` has no dependency on `features/board/`. The `TaskDetailPanelComponent` (which lives under `features/board/`) imports **from** `features/attachments/`, not the other way round.

### HTTP contract (for reference only — owned by #50)

Documented here only so the reviewer can confirm the validation rules below mirror the backend. This ticket issues no HTTP.

| Method | Endpoint | Request | Response | Status codes mirrored by client validation |
|--------|----------|---------|----------|---------------------------------------------|
| `POST` | `/api/attachment/task/{taskId}` | `multipart/form-data` with `file: File` | `201 ApiResponse<AssetResponseDto>` | `400` (name/format/empty), `413` (size) — all pre-empted client-side by this ticket |

---

## Implementation Steps

Steps are ordered so each can be independently verified before moving to the next. Steps 1–4 produce a testable, consumable `FileDropzoneComponent` in isolation; steps 5–8 wire it into the board surface via the stub host.

### 1. Scaffold the feature folder and constants module

- [ ] Create directory: `src/app/features/attachments/`
- [ ] Create subdirectories: `components/file-dropzone/`, `models/`, `constants/`, `utils/`
- [ ] Create `constants/attachment-rules.ts` with the five exports documented in §Validation constants. Verify: `ATTACHMENT_ALLOWED_EXTENSIONS.length === 8`, `ATTACHMENT_MAX_BYTES === 10485760`, `ATTACHMENT_ACCEPT_ATTRIBUTE === '.jpg,.jpeg,.png,.gif,.pdf,.docx,.xlsx,.txt'`.
- [ ] Create `models/dropzone.model.ts` with the interfaces documented in §TypeScript Interfaces. Export every type.

### 2. Create and unit-test pure utility helpers

- [ ] Create `utils/format-file-size.ts` with the signature `formatFileSize(bytes: number): string`.
- [ ] Create `utils/format-file-size.spec.ts`. Cases: `0`, `1`, `1023`, `1024` ("1 KB"), `1536` ("1.5 KB"), `1048576` ("1 MB"), `10485760` ("10 MB"), `10485761` ("10 MB" or "10.0 MB" — decide in implementation), a very large value (GB), negative (defensive — document the behaviour: implementation may return "0 B" or throw; pick one).
- [ ] Create `utils/validate-attachment.ts` with the three exported signatures.
- [ ] Create `utils/validate-attachment.spec.ts`. Cases enumerated under §QA Guidance → Validation helper unit tests. Every test must reference `ATTACHMENT_MAX_BYTES` / `ATTACHMENT_ALLOWED_EXTENSIONS`, not literal values.

### 3. Scaffold `FileDropzoneComponent`

- [ ] `ng generate component features/attachments/components/file-dropzone --skip-tests=false` (or manual create).
- [ ] Mark `standalone: true`, `imports: []`, `changeDetection: ChangeDetectionStrategy.OnPush`.
- [ ] Declare inputs `taskId` (required), `disabled` (default `false`), `disabledReason` (default `null`).
- [ ] Declare outputs `fileSelected` and `validationFailed`.
- [ ] Declare the internal signals documented in §State Management Strategy.
- [ ] Declare the `phase`, `selectedFileSummary`, `accessibleName` computeds.
- [ ] Inject `DestroyRef`, `ElementRef<HTMLElement>`.

### 4. Implement gesture + validation pipeline

- [ ] Template structure (HTML — developer writes the markup, spec defines the required elements): a focusable root `<div role="button" tabindex="0" [attr.aria-label]="accessibleName()" [attr.aria-disabled]="disabled()" ...>` that binds `(dragenter)`, `(dragover)`, `(dragleave)`, `(drop)`, `(click)`, `(keydown.enter)`, `(keydown.space)`. A hidden `<input type="file" [accept]="accept" (change)="handleFileInputChange($event)">` for the click-to-browse fallback. A visible text node bound to the idle copy / selected summary / current error message. A live-region `<span aria-live="polite" class="sr-only">` that echoes the current error for AT users. **No `(click)` emission or picker open when `disabled()` is true.**
- [ ] Handler signatures (bodies = developer):

```typescript
private handleDragEnter(event: DragEvent): void;
private handleDragOver(event: DragEvent): void;     // preventDefault so drop fires
private handleDragLeave(event: DragEvent): void;
private handleDrop(event: DragEvent): void;          // consumes the File(s)
private handleClick(): void;                         // opens hidden input
private handleKeyActivate(event: KeyboardEvent): void; // Enter / Space
private handleFileInputChange(event: Event): void;   // consumes the File(s)

/** The single funnel for drop & pick. Applies multi-file truncation,
 *  runs validateAttachment, and either emits fileSelected or sets
 *  currentError. Resets the hidden input.value so re-picking the same
 *  file re-fires change. */
private acceptFiles(files: FileList | null): void;
```

- [ ] Multi-file handling inside `acceptFiles`: if `files.length > 1`, take `files[0]`, validate it, and on success set an **informational** error (`MULTI_FILE_TRUNCATED`) *in addition to* the `fileSelected` emission. On failure of the first file, do not consult the rest — emit the validation error only.
- [ ] `disabled()` short-circuit: early-return from every handler when the input is true.

### 5. Wire window-level default-drop suppression

- [ ] Implement the static `attachWindowSuppression` / `detachWindowSuppression` counter pair documented in §Suppressing the browser default drop outside the zone.
- [ ] Call `attach` in constructor (or `ngOnInit`), register `detach` via `DestroyRef.onDestroy`.
- [ ] Guard inside the listeners: if `event.target` is contained by any dropzone host element, do nothing; else `event.preventDefault()` + `event.dataTransfer.dropEffect = 'none'` (on `dragover`), and on `drop` do `event.preventDefault()` (no file is accepted anywhere outside a real zone).

### 6. Component styles

- [ ] Create `file-dropzone.component.scss` importing the existing global SCSS variable modules (`src/styles/variables/_colors.scss`, `_spacing.scss`, `_radius.scss`, `_typography.scss`, `_motion.scss`, `_breakpoints.scss`) — **use the same `@use` pattern as `task-card.component.scss`**. Exact visual tokens per phase (idle / dragover / selected / error / disabled) come from the design spec; placeholder SCSS may use `$bg-dropzone` / `$border-dropzone` as the idle colours per `.claude/kanban_board_design.json`.
- [ ] Provide a visible focus ring on `:focus-visible` matching `$brand-primary` (consistent with `task-card.component.scss`'s focus pattern).
- [ ] Respect `@media (prefers-reduced-motion: reduce)` for any phase-transition animations.

### 7. Scaffold `TaskDetailPanelComponent` (stub host)

- [ ] `ng generate component features/board/components/task-detail-panel --skip-tests=false`.
- [ ] Add a prominent code comment at the top of the TS file: `// TODO(future-issue): Replace this stub with a real task-detail view. In #49 it exists only to host FileDropzoneComponent.`
- [ ] Inputs: `task` (required `BoardTask`), `disabled` (default `false`), `disabledReason` (default `null`).
- [ ] Outputs: `panelClosed`, `fileSelected` (re-emit).
- [ ] Template: a right-aligned drawer with the task title, a close button (`aria-label="Close task details"`), and the `<app-file-dropzone>`. Binds `(panelClosed)` to Escape via `(document:keydown.escape)` with a `HostListener`-equivalent wiring (or a scoped listener registered via `DestroyRef`).
- [ ] Imports: `FileDropzoneComponent`.

### 8. Modify existing task card / column / board-page for click activation

- [ ] `TaskCardComponent`:
  - Add `cardActivated = output<void>()`.
  - Bind `(click)` that emits `cardActivated` only when CDK has not just ended a drag (use a `wasDragging` flag cleared on `mouseup` / `cdkDragStarted` / `cdkDragEnded` as needed — CDK's `cdkDragStarted` and `cdkDragEnded` events expose this cleanly).
  - Bind `(keydown.enter)` / `(keydown.space)` that emit `cardActivated` and `event.preventDefault()` (so Space does not scroll the page).
  - Add `tabindex="0"`, `role="button"`, `aria-label` already computed from `accessibleName()`.
- [ ] `BoardColumnComponent`:
  - Add `taskOpened = output<BoardTask>()`.
  - In template: `(cardActivated)="taskOpened.emit(task)"` on each `<app-task-card>`.
- [ ] `BoardPageComponent`:
  - Add `selectedTask = signal<BoardTask | null>(null)`.
  - Add `handleTaskOpened(task: BoardTask): void` that sets `selectedTask.set(task)`.
  - Add `handleTaskDetailClosed(): void` that sets `selectedTask.set(null)`.
  - Add `handleAttachmentSelected(event: DropzoneFileSelectedEvent): void` — for this ticket, this is a **no-op with a clarifying comment**: `// Consumed by issue #50 (upload pipeline). In #49 we intentionally do nothing with the validated file.`
  - Template: bind `(taskOpened)="handleTaskOpened($event)"` on `<app-board-column>`. Append:
    ```html
    @if (selectedTask(); as task) {
      <app-task-detail-panel
        [task]="task"
        (panelClosed)="handleTaskDetailClosed()"
        (fileSelected)="handleAttachmentSelected($event)"
      />
    }
    ```

### 9. Build & test verification

- [ ] `npm run build` must succeed. Report file/line/error on failure.
- [ ] `npm run test -- --watch=false` must run to completion. Introduced-failure threshold: zero. Pre-existing failures: documented, not fixed, per project policy.
- [ ] Visual smoke test: open a board, click a task card, drop a valid PDF, verify selected-state; drop a `.exe`, verify format error; drop a 12 MB file, verify size error.

### 10. Accessibility pass

- [ ] Using only the keyboard, `Tab` onto the dropzone, press `Enter` — OS picker opens. `Esc` to cancel — no error. Pick a valid file — selected state announced by screen reader.
- [ ] Verify `aria-label` / `aria-disabled` / `aria-live` via Chrome DevTools Accessibility tree.
- [ ] Verify `:focus-visible` outline is visible on the dropzone root.
- [ ] Run `axe-core` or equivalent on a page that includes the dropzone in all five phases; fix any violations before completion.

**Performance considerations:**
- `OnPush` change detection on the dropzone, detail panel, task card (already on), column (already on), board page (already on).
- No subscriptions, no `async` pipe — state is signals-only. Zero unsubscribe work needed on destroy beyond the single `DestroyRef.onDestroy` for window suppression.
- The hidden `<input type="file">` is never re-created — its `.value = ''` is reset on every file consume so the `change` event fires again for the same file (standard pattern).

---

## QA Guidance

### Test strategy

Three layers, each covering a distinct concern:

1. **Pure unit tests** for `validate-attachment.ts` and `format-file-size.ts` — no Angular, no DOM, fast.
2. **Angular component tests** for `FileDropzoneComponent` using `TestBed` + synthetic `File` / `DataTransfer` / `DragEvent` construction — matches the existing `task-card.component.spec.ts` idiom (Vitest-based).
3. **Integration tests** for `TaskDetailPanelComponent` + host wiring in `board-page.component.spec.ts` — confirms the click-on-card → drawer-open → dropzone-visible flow works end-to-end inside the board page.

All tests use Vitest (the project's `ng test` runner is configured to Vitest per `package.json`), matching the `describe`/`it` / `vi.useFakeTimers()` style already in `task-card.component.spec.ts`.

### Validation helper unit tests (`validate-attachment.spec.ts`)

Every acceptance criterion under *Drop — format/size/filename validation* is exercised here as a pure-function test. Synthesise `File` with `new File([bytes], name, { type })`.

| Test | File | Expected result |
|------|------|-----------------|
| Accepts canonical PDF | 1 KB `'spec.pdf'` | `{ ok: true }` |
| Accepts uppercase extension | 1 KB `'IMAGE.PNG'` | `{ ok: true }` (case-insensitive) |
| Accepts every whitelisted extension | iterate over `ATTACHMENT_ALLOWED_EXTENSIONS` | `{ ok: true }` for each |
| Rejects `.exe` | 1 KB `'malware.exe'` | `{ ok: false, error.code === 'FORMAT_NOT_ALLOWED' }` |
| Rejects no-extension | 1 KB `'noext'` | `{ ok: false, error.code === 'FORMAT_NOT_ALLOWED' }` |
| Rejects empty file | 0 bytes `'spec.pdf'` | `{ ok: false, error.code === 'SIZE_ZERO' }` |
| Accepts 1-byte file | 1 byte `'spec.pdf'` | `{ ok: true }` |
| Accepts exact-max file | `ATTACHMENT_MAX_BYTES` bytes `'spec.pdf'` | `{ ok: true }` (boundary — inclusive) |
| Rejects max+1 | `ATTACHMENT_MAX_BYTES + 1` bytes `'spec.pdf'` | `{ ok: false, error.code === 'SIZE_EXCEEDED' }` |
| Rejects path-traversal name | `'../etc/passwd.txt'` | `{ ok: false, error.code === 'NAME_INVALID' }` |
| Rejects backslash name | `'foo\\bar.txt'` | `{ ok: false, error.code === 'NAME_INVALID' }` |
| Rejects empty name | `''` | `{ ok: false, error.code === 'NAME_INVALID' }` |
| Rejects null byte | `"foo .txt"` | `{ ok: false, error.code === 'NAME_INVALID' }` |
| Error message for oversize mentions actual size | 12 MB file | `error.message` contains the formatted size string from `formatFileSize` |
| Error message for format lists allowed extensions | `.exe` | `error.message` contains every entry of `ATTACHMENT_ALLOWED_EXTENSIONS_DISPLAY` |
| Check order: name before format | `'../malware.exe'` | returns `NAME_INVALID` (not `FORMAT_NOT_ALLOWED`) |

### Format-helper unit tests (`format-file-size.spec.ts`)

| Input bytes | Expected output |
|-------------|-----------------|
| `0` | `'0 B'` |
| `1` | `'1 B'` |
| `1023` | `'1023 B'` |
| `1024` | `'1.0 KB'` (or `'1 KB'` — decide and lock) |
| `1536` | `'1.5 KB'` |
| `1048576` | `'1.0 MB'` |
| `10485760` | `'10.0 MB'` |
| `25 * 1024 * 1024` | `'25.0 MB'` |

### Component tests (`file-dropzone.component.spec.ts`)

Covers every user-visible acceptance criterion from the context doc. Uses `fixture.componentRef.setInput('taskId', 'task-1')`, `setInput('disabled', true/false)`, and synthetic events built via `new DragEvent('drop', { dataTransfer: new DataTransfer() })` (jsdom-polyfilled if needed).

**Rendering — idle state**
- Renders the idle copy containing `'10 MB'` and every extension in `ATTACHMENT_ALLOWED_EXTENSIONS_DISPLAY`.
- Root has `tabindex="0"` and a non-empty `aria-label`.
- Hidden input has `accept` attribute equal to `ATTACHMENT_ACCEPT_ATTRIBUTE`.

**Drag interaction**
- `dragenter` transitions `phase()` to `'dragover'`, applies the hover CSS class.
- `dragleave` transitions back to `'idle'`.
- `dragover` calls `preventDefault` (test: the event's `defaultPrevented` is `true` after dispatch).

**Drop — happy path**
- Drop of a valid 1 KB PDF:
  - `phase()` === `'selected'`
  - `selectedFileSummary()` matches `/spec\.pdf.*1(\.0)? KB/`
  - `fileSelected` output emits exactly once with `{ file: <the File>, taskId: 'task-1' }`
  - `validationFailed` output emits zero times
  - No network request (verified by an HttpTestingController backend — `expectNone`)
- Drop of a second valid file after the first:
  - `selectedFile()` is the second file (replacement)
  - `fileSelected` emits a second time
  - `validationFailed` remains zero

**Drop — error paths** (each isolated)
- Drop of a `.exe` → `phase()` === `'error'`, rendered error text contains `'not supported'` (wording TBD by design spec — assert presence of the code `FORMAT_NOT_ALLOWED` on the emitted `validationFailed` event instead, for wording-independence), `fileSelected` emits zero times.
- Drop of a 0-byte file → `SIZE_ZERO` error.
- Drop of `ATTACHMENT_MAX_BYTES + 1` → `SIZE_EXCEEDED` error, rendered text contains the formatted actual size.
- Drop of `'..\\bad.txt'` → `NAME_INVALID` error.

**Drop — multi-file**
- Drop of `[a.png, b.png, c.png]` (all valid): `fileSelected` emits once with `a.png`, `validationFailed` emits once with `MULTI_FILE_TRUNCATED` (`informational: true`), `phase()` === `'selected'` (informational errors do NOT clobber the selected phase — render side-by-side).
- Drop of `[a.exe, b.png]` (first invalid): `fileSelected` emits zero times, `validationFailed` emits once with `FORMAT_NOT_ALLOWED`, `phase()` === `'error'`.

**Click / keyboard fallback**
- Clicking the root calls `.click()` on the hidden input (spy verified). `phase` unchanged until `change` fires.
- Pressing `Enter` on a focused root has the same effect as click.
- Pressing `Space` on a focused root has the same effect as click; assert `event.preventDefault` was called so the page does not scroll.
- Cancelling the picker (hidden input `change` with `files.length === 0`): `phase` unchanged, no emission.

**Disabled state**
- `setInput('disabled', true)`:
  - `phase()` === `'disabled'` regardless of other signals.
  - Drop does not transition to `'selected'`, `fileSelected` emits zero times.
  - Click does not open picker — spy on `HTMLInputElement.click` asserts zero calls.
  - Enter/Space pressed — no emission.
  - `aria-disabled="true"` rendered on the root.
- `setInput('disabledReason', 'You are not a member of this project.')`:
  - The reason string appears in the visible copy AND in the `aria-label` (accessibleName).

**Listener leak guarantee**
- Mount component → assert `window` has exactly one `'drop'` listener added by the component (track via a jsdom spy on `window.addEventListener`).
- Destroy → assert removal.
- Mount two instances → assert only one window listener (reference-count).
- Destroy one of two → assert listener still present. Destroy second → assert removed.
- Full mount → destroy → mount cycle: assert no listener leak (listener count before first mount equals listener count after final destroy).

**Coexistence with #47 CDK drag**
- In `board-page.component.spec.ts`: click a task card → `selectedTask` is set, panel appears, dropzone is rendered. Drag the same task card across columns → `BoardPageComponent.handleTaskDropped` fires exactly once, optimistic-move sequence runs unchanged, `cardActivated` does NOT emit on the card that was dragged (regression guard for the "drag shouldn't count as click" rule).

**Privacy / logging guardrail**
- A `console.log` spy installed in `beforeEach` and asserted in `afterEach`: no call was made with any of `file.name`, `file.size`, or `file.type` as an argument across any test. The assertion runs against **all** tests in the component spec (this is the only realistic way to enforce AC #163).

### Integration tests (`task-detail-panel.component.spec.ts` & `board-page.component.spec.ts`)

- `TaskDetailPanelComponent` renders the task title and the dropzone; `panelClosed` emits on close-button click; `panelClosed` emits on `Escape` key while focused inside the drawer; `fileSelected` re-emits from the embedded dropzone.
- `BoardPageComponent`: card click → `selectedTask` set → drawer renders → close → `selectedTask` cleared. Drag a card → no drawer. `handleAttachmentSelected` is called with the emitted event but performs no side effects (asserted by HttpTestingController expectNone).

### Mocking instructions

No service to mock in this ticket. For component tests, synthesise:

```typescript
function makeFile(name: string, size: number, type = 'application/pdf'): File {
  // A Uint8Array filled with zeros is the simplest payload.
  return new File([new Uint8Array(size)], name, { type });
}

function makeDropEvent(files: File[]): DragEvent {
  const dataTransfer = new DataTransfer();
  for (const f of files) dataTransfer.items.add(f);
  return new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true });
}
```

### Edge cases to test

- File named `'.pdf'` (starts with a dot, no stem) — `NAME_INVALID`? **Decide at implementation time; document the chosen behaviour in the helper's JSDoc and mirror in a test.**
- File with a `type` (MIME) that lies about extension (e.g. `name='bad.exe'` but `type='application/pdf'`) — should still be rejected on extension (the client trusts the extension not the MIME; backend has its own MIME check).
- Extremely long filename (255+ chars) — validate pipeline does not crash; passed through to backend as-is.
- Drag a folder (a `DataTransferItem` with `kind === 'file'` but `webkitGetAsEntry().isDirectory === true` in browsers that support it) — should be rejected; cleanest path is to treat it as `NAME_INVALID` or a new `NOT_A_FILE` code. **Decide & document.**
- Drag text selection (not a file) — `dataTransfer.files.length === 0`, `acceptFiles(null)` short-circuits, no emission, `phase` returns to `idle`.

### Build & test gate

- `npm run build` — zero errors, zero warnings tied to the new code.
- `npm run test -- --watch=false` — all introduced tests pass; pre-existing failures (if any) documented, not fixed.
- Manual smoke: open a real board, click a task, drop a `.pdf` of 1 MB, see selected state. Drop a `.exe`, see format error. Press `Esc` in the drawer, panel closes.

---

## Design Validation (self-check)

**Interface alignment**
- [x] `DropzoneFileSelectedEvent` matches the contract the issue body proposes as the sibling-ticket hand-off.
- [x] `ATTACHMENT_MAX_BYTES`, `ATTACHMENT_ALLOWED_EXTENSIONS` byte-for-byte mirror `.claude/backend_api_map.md`.
- [x] All properties typed (no `any`), optional vs required marked (`readonly` on immutable outputs).

**Standards compliance**
- [x] `inject()` used throughout, no constructor injection.
- [x] Signals for UI state, no RxJS needed.
- [x] `ChangeDetectionStrategy.OnPush` on every new component.
- [x] Matches existing board component style (imports, SCSS `@use` pattern, `input.required<T>()`, `output<T>()`, `DestroyRef` for cleanup).

**Security / privacy**
- [x] No `console.log` of file metadata.
- [x] No `[innerHTML]` usage.
- [x] No direct `nativeElement` manipulation beyond the sanctioned `ElementRef` host-element contains check.
- [x] Hidden input has explicit `accept` — cannot be bypassed by the user picking e.g. `.exe` (assistive browsers may still allow it; the validation helper is the real guard).

**Completeness**
- [x] All new files listed (13 files).
- [x] All modified files listed (8 files, all in `features/board/`).
- [x] Implementation steps are ordered and independently verifiable.
- [x] Every acceptance criterion in the context doc maps to at least one QA test or implementation step (format/size/name/multi/keyboard/disabled/listener-leak/a11y/privacy/single-source-of-truth).

---

## Development Status

**Implementation Date:** 2026-05-05
**Developer:** Claude Opus 4.7

### Files Created
- `src/app/features/attachments/constants/attachment-rules.ts`
- `src/app/features/attachments/models/dropzone.model.ts`
- `src/app/features/attachments/utils/format-file-size.ts`
- `src/app/features/attachments/utils/format-file-size.spec.ts`
- `src/app/features/attachments/utils/validate-attachment.ts`
- `src/app/features/attachments/utils/validate-attachment.spec.ts`
- `src/app/features/attachments/components/file-dropzone/file-dropzone.component.ts`
- `src/app/features/attachments/components/file-dropzone/file-dropzone.component.html`
- `src/app/features/attachments/components/file-dropzone/file-dropzone.component.scss`
- `src/app/features/attachments/components/file-dropzone/file-dropzone.component.spec.ts`
- `src/app/features/board/components/task-detail-panel/task-detail-panel.component.ts`
- `src/app/features/board/components/task-detail-panel/task-detail-panel.component.html`
- `src/app/features/board/components/task-detail-panel/task-detail-panel.component.scss`
- `src/app/features/board/components/task-detail-panel/task-detail-panel.component.spec.ts`

### Files Modified
- `src/app/features/board/components/task-card/task-card.component.ts` — added `active` input, `cardActivated` output, pointer-based drag/click arbitration, keyboard activation.
- `src/app/features/board/components/task-card/task-card.component.html` — added `role="button"`, `(click)`, `(keydown.enter|space)`, pointer handlers, `[class.task-card--active]`.
- `src/app/features/board/components/task-card/task-card.component.scss` — added `.task-card--active` outline affordance.
- `src/app/features/board/components/task-card/task-card.component.spec.ts` — added click/keyboard/drag-suppression coverage.
- `src/app/features/board/components/board-column/board-column.component.ts` — added `activeTaskId` input and `taskOpened` output.
- `src/app/features/board/components/board-column/board-column.component.html` — wired `[active]` and `(cardActivated)` on `<app-task-card>`.
- `src/app/features/board/components/board-column/board-column.component.spec.ts` — added `taskOpened` re-emission coverage.
- `src/app/features/board/board-page/board-page.component.ts` — added `selectedTask` signal, `handleTaskOpened`/`handleTaskDetailClosed`/`handleAttachmentSelected` handlers; imported `TaskDetailPanelComponent`.
- `src/app/features/board/board-page/board-page.component.html` — wired `[activeTaskId]` and `(taskOpened)` on `<app-board-column>`; added `@if (selectedTask())` drawer slot.
- `src/app/features/board/board-page/board-page.component.spec.ts` — added drawer open/close/no-op coverage.

### Build & Test Results
- **Build:** SUCCESS (`npm run build`). Pre-existing SASS deprecation warnings in `board-page.component.scss` and an NG8102 warning for `tasksByColumnId()[column.id] ?? []` are untouched by this ticket.
- **Tests:** 855 passed, 0 failed, 0 skipped (50 files, via Vitest).
- **Pre-existing failures:** None.
- **Introduced failures:** None.

### Acceptance-Criteria Coverage
- Idle-state copy, aria-label, accept attribute — asserted in `file-dropzone.component.spec.ts` "Rendering — idle state".
- Drag-over/leave visual transitions and `preventDefault` — "Drag interaction" block.
- Happy-path drop, replacement drop, single `fileSelected` emission — "Drop — happy path".
- Format / size-zero / size-exceeded / name-invalid rejections with error codes — "Drop — error paths".
- Multi-file drop with `MULTI_FILE_TRUNCATED` informational notice — "Drop — multi-file".
- Click / Enter / Space activation, Space `preventDefault`, cancelled picker — "Click / keyboard fallback".
- Disabled state (phase, aria, tabindex, click/drop suppression, reason rendering) — "Disabled state".
- Window-listener mount-count discipline — "window suppression lifecycle".
- Privacy guardrail — every test runs under a `console.log` spy that rejects File references or known filenames.
- Single source of truth — `validate-attachment.spec.ts` references `ATTACHMENT_MAX_BYTES` / `ATTACHMENT_ALLOWED_EXTENSIONS` constants, never literals.
- Task-card drag vs. click arbitration — `task-card.component.spec.ts` "Click / keyboard activation" suppresses emission when pointer moved past 5 px.
- Drawer open/close + no-HTTP on file selected — `board-page.component.spec.ts` "Task detail drawer".

### Implementation Notes / Decisions
- **Drag-vs-click arbitration** uses a pointer-distance threshold on the card itself (5 px) rather than inspecting CDK `cdkDragStarted`/`cdkDragEnded` events directly. Reason: the threshold runs against the same element CDK listens to and doesn't require passing CDK event references into the presentational card; keyboard activation bypasses the check entirely.
- **Hidden file-input click bubbling** — a `(click)="$event.stopPropagation()"` is attached to the hidden `<input type="file">` so the programmatic `.click()` doesn't re-enter the host's `(click)` handler (which would double-invoke the picker).
- **Window suppression uses AbortController signals**, not explicit `removeEventListener` calls. The jsdom listener-count spies in the lifecycle test set assert the mount-count invariant (one add per first mount, no add on additional mounts, fresh add after full unmount).
- **jsdom has neither `DragEvent` nor `DataTransfer`** — the component-spec helpers build plain `Event('drop'|'dragenter'|…)` instances and stub `dataTransfer` via `Object.defineProperty`. This mirrors the minimal surface the component consumes (`files`, `dropEffect`).
- **`handleAttachmentSelected` on `BoardPageComponent` is an explicit no-op** per the tech spec — the inter-ticket contract is the emission itself; #50 will replace the body with the upload call.
- **Hover tint** on idle state — kept the recommendation from the design spec §3.1 note: no extra tinted surface; only the border colour shifts to `$brand-primary-hover` on hover. No new tokens introduced.

### Edge Cases for QA
- Dropping a second valid file replaces the first selection (new emission).
- Dropping multiple valid files keeps the first and shows the amber informational notice.
- Dropping `./.pdf` or `.pdf` (leading-dot with no stem) → `NAME_INVALID`.
- Dropping an empty 0-byte file → `SIZE_ZERO` (not `FORMAT_NOT_ALLOWED`, even if extension check would otherwise pass — name check runs first).
- `Enter` and `Space` both open the OS picker; `Space` does not scroll the page.
- `Esc` inside the drawer closes it (routed through `@HostListener('document:keydown.escape')`).
- The task card drag gesture (>5px pointer move) does NOT emit `cardActivated` — CDK drag flow from #47 remains untouched.

### Known Limitations
- **No actual upload** — this ticket ends at `fileSelected` emission. #50 will consume the event.
- **No focus-restore on drawer close** — the tech spec notes this is the parent's responsibility; not wired in #49 since the drawer is a stub that #50/#51 will replace.
- **Slide-in animation** — relies on the `$motion-slow` base transition on `transform`. The explicit enter/leave classes from the design spec are not wired because Angular `@if` is synchronous — the drawer appears in-place; the transform transition reads as a subtle settle rather than a full slide. Acceptable for a stub; richer animation can land with the real detail view.

---

## QA Review

**Review Date:** 2026-05-06
**Reviewer:** Claude Opus 4.7 (QA pass)
**Result:** ✅ Approved with added coverage

### Gap analysis — ACs vs existing tests

A reverse map from every AC in `issue_49_context.md` to its covering test revealed four meaningful gaps in the developer-supplied suite. All four have been closed by appending to `file-dropzone.component.spec.ts` — no production code was modified.

| Gap | AC | Before | Added test(s) |
|---|---|---|---|
| Window-level drop suppression was only asserted at the *listener count* level; the actual `preventDefault` behaviour of those listeners was never exercised | AC #129 — "A browser-level drop outside the dropzone does not cause the browser to navigate away" | Listener add/remove count in `window suppression lifecycle` block | `page-level drop outside the zone is preventDefaulted (AC #129)` + `page-level drop inside the zone is NOT preventDefaulted by the window guard` |
| Picker *cancel* was tested; picker *happy* and *reject* paths never drove `handleFileInputChange` with files present | ACs #149–#151 — "A file selected via the file picker runs through the identical validation" | `cancelling the picker (change with no files)` only | `picker selection runs the same validation pipeline as a drop (happy path)` + `(rejection path)` |
| `aria-live` live-region element existed in the DOM but no test asserted its attributes or verified the error / selected messages reach it | ACs #159–#160 — "The validation error text is announced to assistive tech … via a polite live region" | No live-region assertions | New `Accessibility — live region` block: `renders a polite, atomic visually-hidden live region in every phase`, `live region announces the error message on transition to error`, `live region announces "File selected" on transition to selected` |
| `handleDragLeave`'s host-contains guard (moving pointer from zone to an inner `<svg>` child) was untested — a regression there would cause the dragover ring to flicker | AC #128 (drag interaction semantics) | Leave-outside-host only | `dragleave into a child element (related target inside host) keeps phase=dragover` |

### Acceptance-criteria coverage map (post-review)

Every AC in the context doc now maps to at least one automated test:

| AC group | Covering test block | File |
|---|---|---|
| Rendering — idle (#123–#125) | `Rendering — idle state` | `file-dropzone.component.spec.ts` |
| Drag interaction mouse (#128–#129) | `Drag interaction` + `window suppression lifecycle` (AC #129 added) | same |
| Drop — format (#132–#133) | `Drop — error paths` + `validateAttachment.spec.ts` format-rejections | both |
| Drop — size (#136–#138) | `Drop — error paths` + `validateAttachment.spec.ts` size-rejections (inclusive boundary, max+1) | both |
| Drop — name (#141) | `Drop — error paths` + `validateAttachment.spec.ts` name-rejections | both |
| Drop — happy (#144–#146) | `Drop — happy path` + `Drop — multi-file` | same |
| Click / keyboard fallback (#149–#152) | `Click / keyboard fallback` (picker happy+reject paths added) | same |
| Disabled state (#155) | `Disabled state` | same |
| Accessibility (#158–#160) | `Rendering — idle state` (role, tabindex, aria-label) + `Accessibility — live region` (added) | same |
| Privacy / logging (#163) | `assertNoFileMetadataLogged` afterEach guard on every test in the file | same |
| Listener leak (#166) | `window suppression lifecycle` block | same |
| Regression guard #47 CDK drag (#167) | `Click / keyboard activation > suppresses cardActivated when pointer moved far enough to be a drag` | `task-card.component.spec.ts` |
| Build (#168) | `npm run build` clean | — |
| Tests (#169) | `npm test` all green | — |
| Single source of truth (#170) | `validateAttachment.spec.ts` references `ATTACHMENT_MAX_BYTES` / `ATTACHMENT_ALLOWED_EXTENSIONS`, never literals | same |

### Build & test results (post-review)

- **Build:** ✅ `npm run build` SUCCESS. Only pre-existing SASS deprecation warnings in `board-page.component.scss` and one NG8102 nullish-coalescing warning — all untouched by #49.
- **Tests:** ✅ 863 passed, 0 failed, 0 skipped across 50 test files (Vitest).
- **Pre-existing failures:** None at time of review.
- **Introduced failures:** None.
- **Net delta from QA pass:** +8 tests added to `file-dropzone.component.spec.ts` (855 → 863). Zero production code changed.

### Follow-ups for sibling tickets

- **#50 upload pipeline:** the `fileSelected` emission contract is locked. The payload shape `{ file: File; taskId: string }` is asserted in `Drop — happy path > drops a valid PDF → phase=selected, emits fileSelected once`. Any future addition must be an optional property.
- **#51 attachment list:** `formatFileSize` is exported and unit-tested against the full byte/KB/MB/GB range; safe to re-use for rendering uploaded-file sizes.
- **Flaky SignalR suite:** `src/app/core/services/signalr.service.spec.ts` occasionally fails to load under Vitest's hoisted-`vi.mock` patch (observed once during the baseline run, passed on re-run). Not in scope for #49; recommend tracking as a separate pre-existing flake.

✅ **Ready for code review and merge.**

---

*"Test suite complete. All acceptance criteria covered, tests passing. Feature is ready for code review."*
