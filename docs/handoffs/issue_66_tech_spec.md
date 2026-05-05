# Technical Specification: Open Kanban Board from Dashboard Project Card

**Context Document:** [issue_66_context.md](./issue_66_context.md)
**GitHub Issue:** #66
**Label:** `bug`
**Prerequisites merged:** #30-series (dashboard project grid / card), #45, #46, #47 (board page & realtime)

---

## Overview

This spec wires the existing `ProjectCardComponent` on the dashboard to the already-functional `/board/:projectId` route. The card today renders an `<article class="project-card" tabindex="0" aria-labelledby="…">` with no activation path; the board works end-to-end when reached by direct URL. The fix threads a new activation event up the existing passive-relay chain — `ProjectCardComponent` → `ProjectGridComponent` → `DashboardPageComponent` — and the dashboard calls `Router.navigate(['/board', project.id])`. No route changes, no new files, no new services: this is a bug fix confined to the three existing components plus their specs. The card receives click / keyboard-activation handlers and a `role="button"` on the host; the Manage-members icon button keeps its existing `event.stopPropagation()` and is additionally excluded from activation via an `event.target` check to cover keyboard activation. Text-selection inside the card is guarded by a `window.getSelection()` check in the click handler.

---

## Component Architecture

### Routing

**No changes.** The existing route is reused unchanged:

| Path | Component | Guard | Source |
|------|-----------|-------|--------|
| `/board/:projectId` | `BoardPageComponent` | `authGuard` | `KanbAI-Web/src/app/app.routes.ts` lines 30–35 |

This spec does **not** touch `app.routes.ts`.

### Component Hierarchy

**Smart container (modified):**

- `DashboardPageComponent` — `KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.ts`
  - Newly injects `Router` from `@angular/router` via `inject(Router)`.
  - Adds a `protected openBoard(project: ProjectSummary): void` method that calls `this.router.navigate(['/board', project.id])`. The array form is used so Angular handles URL encoding of `project.id` (satisfies the context doc's GUID-safety AC).
  - Wires the new `(openBoard)` output from `ProjectGridComponent` in the template.
  - No changes to `vm()`, `openCreateDialog()`, `openMembersDialog()`, `retry()`, or `ngOnInit()`.

**Passive relay (modified — mirrors the existing `manageMembersClick` pattern):**

- `ProjectGridComponent` — `KanbAI-Web/src/app/features/projects/components/project-grid/project-grid.component.ts`
  - Adds `@Output() openBoard = new EventEmitter<ProjectSummary>()`.
  - Template re-emits the card's `(openBoard)` event through this output.
  - No logic, no subscriptions — identical relay pattern to the existing `manageMembersClick` re-emit.

**Presentation / activation surface (modified):**

- `ProjectCardComponent` — `KanbAI-Web/src/app/features/projects/components/project-card/project-card.component.ts`
  - Adds `@Output() openBoard = new EventEmitter<ProjectSummary>()`.
  - Adds three protected methods driven by the template (see §Interaction Model).
  - Template gains `role="button"`, `(click)`, `(keydown.enter)`, and `(keydown.space)` bindings on the host `<article>`. `tabindex="0"` is retained. `aria-labelledby` is retained.
  - No changes to the existing Manage-button markup, the existing `onManageMembers(event)` handler, any other signals, or the computed state.

### Architecture Choice — "Host activation + event output"

Three options were considered:

| Option | Approach | Outcome |
|---|---|---|
| (a) Stretched `[routerLink]` on a nested `<a>` with `::after { inset: 0 }` | Semantic anchor, RouterLink-native click | **Rejected.** To satisfy "click anywhere on the card navigates" the `::after` must cover the whole card, which disables native text selection on the title/description. Z-indexing the text content above the anchor would preserve selection but would then prevent clicks on the text from navigating — contradicting the AC. |
| (b) Host `(click)` / `(keydown)` on `<article>` + `@Output() openBoard` routed through grid → dashboard → `Router.navigate` | Minimal DOM change, single interactive host, consistent with existing `manageMembersClick` plumbing | **Chosen.** |
| (c) Host `(click)` on `<article>` with `Router` injected directly in `ProjectCardComponent` | Same activation UX as (b), fewer files touched | **Rejected.** Breaks symmetry with the grid's existing pass-through relay; couples the card to `Router` where no sibling component needs it; makes grid-level tests harder to assert ("did the card ask to open the board?" vs. "did the card emit the right id?"). |

**ARIA trade-off (called out per the staff-engineer checklist):** The `<article role="button">` contains a `<button>` descendant (the Manage-members icon). WAI-ARIA 1.2 advises against interactive content inside an interactive role. In practice:
- Chrome/Firefox + NVDA/JAWS/VoiceOver announce both the outer role ("button, Alpha") and the inner `<button>` ("button, Manage members for Alpha") and allow Tab to land on each independently.
- The `role="link"` alternative would be more semantically honest (the action is navigation) but carries the same nested-interactive constraint.
- Not setting any role and relying on `tabindex="0"` alone silently loses the "this is activatable" announcement for screen-reader users, which is worse.

We accept `role="button"` as the least-bad option. The nested-button rule is documented in the spec and in the component doc comment so future contributors don't "fix" it by removing the role.

### New Files to Create

**None.** This is a scope-minimal bug fix.

### Files to Modify

- `KanbAI-Web/src/app/features/projects/components/project-card/project-card.component.ts` — add `openBoard` output, add click / keydown handlers.
- `KanbAI-Web/src/app/features/projects/components/project-card/project-card.component.html` — add `role="button"`, `(click)`, `(keydown.enter)`, `(keydown.space)` bindings on the host `<article>`.
- `KanbAI-Web/src/app/features/projects/components/project-card/project-card.component.scss` — change `.project-card { cursor: default; }` to `cursor: pointer;` (minimal affordance cue — the only visual change this ticket makes).
- `KanbAI-Web/src/app/features/projects/components/project-grid/project-grid.component.ts` — add `@Output() openBoard`.
- `KanbAI-Web/src/app/features/projects/components/project-grid/project-grid.component.html` — bind `(openBoard)="openBoard.emit($event)"` on `<app-project-card>`.
- `KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.ts` — inject `Router`, add `openBoard(project)` method.
- `KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.html` — bind `(openBoard)="openBoard($event)"` on `<app-project-grid>`.

### Spec Files to Update

- `KanbAI-Web/src/app/features/projects/components/project-card/project-card.component.spec.ts` — add coverage for the new activation paths and guards; remove (or invert) any assertion that pins "card has no click handler" (none today, but the mouse-click + propagation tests change meaning).
- `KanbAI-Web/src/app/features/projects/components/project-grid/project-grid.component.spec.ts` — add re-emit test mirroring the existing `manageMembersClick` re-emit test.
- `KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.spec.ts` — add Router mock + test asserting `navigate(['/board', project.id])` is called with the correct id on grid's `openBoard` emit.

---

## State & Data Layer

### State Management Strategy

**No new state.** This ticket introduces no signals, no computed values, no service mutations.

- `ProjectCardComponent` keeps its existing `_project` signal and all derived computeds unchanged.
- `DashboardPageComponent` keeps its existing `vm()` discriminated-union view model unchanged.
- No interaction with `ProjectStateService`, `BoardStateService`, or any other store — the navigation itself is a pure `Router` call; the board page fetches its own data on entry per #47.

### TypeScript Interfaces

**No new or modified interfaces.** The activation payload reuses the existing model:

`KanbAI-Web/src/app/features/projects/models/project.model.ts`:
```typescript
export interface ProjectSummary {
  id: string;             // opaque stable id — navigation target
  name: string;
  description: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
}
```

The new outputs are typed as `EventEmitter<ProjectSummary>` — identical shape and type to the existing `manageMembersClick` output, so grid / dashboard tests follow the same mocking template.

---

## Interaction Model

### Host bindings on `<article class="project-card">`

```html
<article
  class="project-card"
  role="button"
  tabindex="0"
  [attr.aria-labelledby]="titleId()"
  (click)="onCardActivate($event)"
  (keydown.enter)="onKeyboardActivate($event)"
  (keydown.space)="onKeyboardActivate($event)"
>
  …existing content unchanged…
</article>
```

### Handler contracts (`ProjectCardComponent`)

```typescript
@Output() openBoard = new EventEmitter<ProjectSummary>();

protected onCardActivate(event: MouseEvent): void {
  // 1. Skip if the click originated on (or inside) the Manage-members button.
  //    The button already calls event.stopPropagation() in onManageMembers(),
  //    so this is belt-and-braces for clicks that bypass the button's own
  //    handler (e.g. clicks on the button's inner <svg>/<path> elements
  //    where stopPropagation on the surrounding <button>'s (click) has not
  //    yet fired in edge browsers).
  if (this.isInsideManageButton(event.target)) {
    return;
  }

  // 2. Skip if the user just finished a text selection inside the card
  //    (mouseup after drag-select fires a click event). window.getSelection()
  //    returns the current document selection; if it is non-empty AND the
  //    anchor node of the selection is inside this card's DOM subtree, treat
  //    the click as a selection release, not an activation.
  if (this.isTextBeingSelected(event)) {
    return;
  }

  // 3. Skip any non-primary mouse button (right-click / middle-click).
  //    (click) only fires for primary click in modern browsers, so this is
  //    a defensive no-op today, but documents intent for future readers.
  if (event.button !== undefined && event.button !== 0) {
    return;
  }

  this.openBoard.emit(this.project);
}

protected onKeyboardActivate(event: KeyboardEvent): void {
  // Enter and Space must navigate; Space additionally must not scroll.
  // If the focused element is the Manage-members button (separate focus
  // stop), the host handler should not activate the card — the button's
  // own native Enter/Space -> click mapping handles that case, and its
  // click handler calls stopPropagation(). Defensive target check covers
  // event-order edge cases.
  if (this.isInsideManageButton(event.target)) {
    return;
  }
  event.preventDefault();     // suppresses Space page-scroll
  this.openBoard.emit(this.project);
}

private isInsideManageButton(target: EventTarget | null): boolean {
  return target instanceof Element
    && !!target.closest('.project-card__manage-btn');
}

private isTextBeingSelected(event: MouseEvent): boolean {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.toString().length === 0) {
    return false;
  }
  // Only treat as "selection in this card" if the selection anchor lives
  // inside the card's DOM. A stale selection elsewhere on the page must
  // not block navigation.
  const host = event.currentTarget as HTMLElement;
  const anchor = selection.anchorNode;
  return !!anchor && host.contains(anchor);
}
```

### Existing `onManageMembers(event)` handler — unchanged

The existing line `event.stopPropagation();` remains the primary defence against the Manage button triggering card activation. The new target-check in `onCardActivate` is additive, not a replacement. Do **not** remove the existing `stopPropagation()` — one test (`stops click propagation so the card does not also receive the click`) asserts it directly.

### Keyboard reachability — focus stops

Tab order within a single card:
1. The `<article>` host (`tabindex="0"`) — role="button", activated by Enter or Space.
2. The Manage-members icon `<button>` (if `canManage()` is true — native button, natively focusable) — activated by Enter or Space via the browser's native button keyboard mapping, which fires `click`, which runs `onManageMembers(event)`, which emits `manageMembersClick` and calls `stopPropagation()`.

These are two distinct focus stops. The host handler ignores Enter/Space when `event.target` is the Manage button (it bubbled up), so keyboard activation of the Manage button never emits `openBoard`.

### Visual affordance

`.project-card { cursor: pointer; }` — replacing the current `cursor: default`. This is the only style token change. The existing `:focus-visible { outline: 2px solid $brand-primary; }` is retained and now applies to the activatable host. No design-system tokens are invented. Any richer treatment (hover elevation change tied specifically to clickability, role-aware affordances, etc.) is deferred to Phase 3.

---

## Service Integration

**None.** This ticket makes zero HTTP calls, subscribes to zero observables, and touches no API service.

- The board fetches its own columns via `ColumnsApiService.getColumnsForProject(projectId)` when `BoardPageComponent` mounts (per #47). The dashboard does **not** pre-fetch or warm the cache.
- 401 / 403 / 404 handling on the board is governed by `mapColumnErrorToUserMessage` inside the board feature; the dashboard surfaces no additional error UI for a failed board entry.
- No new injectable services, no new providers, no `provideHttpClient` changes.

---

## Implementation Steps

Follow these in order. Each step ends in a buildable state.

### 1. Wire the dashboard to the Router

- [ ] Open `KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.ts`.
- [ ] Add `Router` to the imports: `import { Router } from '@angular/router';`.
- [ ] Add `private readonly router = inject(Router);` alongside the existing `projectState` / `dialog` injections.
- [ ] Add `protected openBoard(project: ProjectSummary): void { this.router.navigate(['/board', project.id]); }` next to `openMembersDialog(...)`.
- [ ] Open `dashboard-page.component.html` and bind the new output on `<app-project-grid>`:
  ```html
  <app-project-grid
    [projects]="$any(vm()).projects"
    (manageMembersClick)="openMembersDialog($event)"
    (openBoard)="openBoard($event)"
  ></app-project-grid>
  ```

### 2. Add the passive relay in the grid

- [ ] Open `project-grid.component.ts`. Add `@Output() openBoard = new EventEmitter<ProjectSummary>();` below the existing `manageMembersClick` output.
- [ ] Open `project-grid.component.html`. Add the passthrough binding on `<app-project-card>`:
  ```html
  <app-project-card
    [project]="project"
    (manageMembersClick)="manageMembersClick.emit($event)"
    (openBoard)="openBoard.emit($event)"
  ></app-project-card>
  ```

### 3. Add activation on the card

- [ ] Open `project-card.component.ts`.
- [ ] Add `@Output() openBoard = new EventEmitter<ProjectSummary>();` next to the existing `manageMembersClick` output.
- [ ] Add the three handlers from §Interaction Model: `onCardActivate`, `onKeyboardActivate`, and the two private helpers `isInsideManageButton` / `isTextBeingSelected`.
- [ ] Open `project-card.component.html`. On the host `<article>`, add:
  - `role="button"`
  - `(click)="onCardActivate($event)"`
  - `(keydown.enter)="onKeyboardActivate($event)"`
  - `(keydown.space)="onKeyboardActivate($event)"`
- [ ] Keep `tabindex="0"` and `[attr.aria-labelledby]="titleId()"` exactly as today. Do not touch the Manage button, the title, the description, or the meta row.

### 4. Affordance cue

- [ ] Open `project-card.component.scss`. In the `.project-card` rule, change `cursor: default;` to `cursor: pointer;`. No other style changes in this ticket.

### 5. Update tests

See §QA Guidance for the full matrix. The scope is: rewrite two existing card tests that lean on "the card only emits manageMembersClick", and add new tests for:
- `ProjectCardComponent`: click emits `openBoard`; Enter emits; Space emits AND `event.preventDefault()` was called; Manage-button click does **not** emit `openBoard`; Manage-button keyboard activation does **not** emit `openBoard`; text selection inside the card does **not** emit; right-click does **not** emit; host has `role="button"` and `tabindex="0"`.
- `ProjectGridComponent`: `openBoard` re-emit mirror of the existing `manageMembersClick` test.
- `DashboardPageComponent`: grid-emits-`openBoard` triggers `Router.navigate(['/board', <id>])` with the exact id; verify via a `provideRouter`-backed `Router` mock or a `navigate` spy, consistent with the existing login-page-component test style.

### 6. Verify

- [ ] Run `npm run build`. Build must succeed.
- [ ] Run `npm run test -- --watch=false`. All tests must pass; classify any new failures per `CLAUDE.md` (PRE-EXISTING vs INTRODUCED). INTRODUCED failures block completion.
- [ ] Manual check: `ng serve`, log in, click a card — URL switches to `/board/:id`, board renders, Back returns to `/dashboard`. Repeat with Tab+Enter and Tab+Space. Click the Manage icon on an owner card — dialog opens, URL stays at `/dashboard`.

### 7. Commit

- [ ] One commit per CLAUDE.md guidelines, referencing `#66`.

**Performance / regression notes:**
- `ChangeDetectionStrategy.OnPush` on all three components is already set — unchanged.
- No new subscriptions, no new `ngOnInit` work, no additional render passes per card.
- `trackBy` on the grid remains `project.id`; array identity is preserved.

---

## QA Guidance

### Unit tests — `ProjectCardComponent`

The spec file already uses Vitest's `vi` spies, `TestBed.createComponent`, and `By.css` / `By.directive` helpers. Keep the same patterns.

**New / modified tests:**

| # | Test name | Assertion |
|---|---|---|
| 1 | `emits openBoard with the project when the article is clicked` | `article.click()` → `openBoard` fires with `{ id: 'abc-123', … }`. |
| 2 | `emits openBoard with the project when Enter is pressed on the article` | `dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))` on the article → `openBoard` fires. |
| 3 | `emits openBoard with the project when Space is pressed on the article, and prevents default` | Same as Enter, for `key: ' '` — and `spyOn(event, 'preventDefault')` is called. |
| 4 | `does NOT emit openBoard when the Manage-members button is clicked` | `manage button.click()` → `openBoard` is **not** fired (observer records zero emits). |
| 5 | `does NOT emit openBoard when Enter is pressed on the Manage-members button` | Dispatch keydown on the button with a target that `.closest('.project-card__manage-btn')` resolves → `openBoard` not fired. |
| 6 | `does NOT emit openBoard when a text selection exists inside the card at click time` | Programmatically `window.getSelection().selectAllChildren(titleElement)`, then click the article → `openBoard` not fired. Restore with `selection.removeAllRanges()` in `afterEach`. |
| 7 | `does NOT emit openBoard on right-click (button !== 0)` | Dispatch a `MouseEvent('click', { button: 2 })` — observer sees zero emits. |
| 8 | `exposes role="button" on the <article> host` | `article.getAttribute('role')` === `'button'`. |
| 9 | `keeps tabindex="0" on the <article> host (regression guard)` | Existing assertion from today's spec, unchanged. |
| 10 | `still stops Manage-button click propagation (regression guard for the existing onManageMembers stopPropagation)` | Existing test retained verbatim — `stopPropagation` is still called on button click. |

**Selection helper (pasteable into the card spec):**
```typescript
function selectTextInside(el: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

afterEach(() => window.getSelection()?.removeAllRanges());
```

### Unit tests — `ProjectGridComponent`

Mirror the existing `manageMembersClick` re-emit test:

| # | Test name | Assertion |
|---|---|---|
| 11 | `re-emits openBoard from a child card` | Render 2 projects, subscribe to grid's `openBoard`, invoke `cards[1].componentInstance.openBoard.emit(projects[1])` → grid observer sees `projects[1]`. |

### Unit tests — `DashboardPageComponent`

Follow the existing `ProjectStateMock` / `DialogMock` pattern. Add a `Router` mock and provide via `provideRouter` or plain `{ provide: Router, useValue: mock }`:

```typescript
interface RouterMock { navigate: ReturnType<typeof vi.fn>; }
const router: RouterMock = { navigate: vi.fn() };
// providers: [ …existing, { provide: Router, useValue: router } ]
```

| # | Test name | Assertion |
|---|---|---|
| 12 | `navigates to /board/:projectId when the grid emits openBoard` | Set `mock.projects.set(projects); mock.hasLoaded.set(true);` → grid emits `openBoard(projects[0])` → `router.navigate` called with `['/board', projects[0].id]` exactly once. |
| 13 | `passes the clicked card's own id, not some other card's id (regression guard)` | Render 3 projects, emit `openBoard` for the middle one, assert `router.navigate` called with the middle one's id — catches any future array-index confusion. |
| 14 | `does not navigate on manageMembersClick (regression guard)` | Emit `manageMembersClick` — `router.navigate` is **never** called; `dialog.open` is. |

### Integration / manual QA matrix (from the context doc AC)

| Scenario | Expected | Where verified |
|---|---|---|
| Click card body → board loads | URL = `/board/:id`; no full reload (Router nav) | Unit tests 1 & 12 + manual |
| Click card body, previous text selection elsewhere | Navigates (selection not inside card) | Add targeted unit test or manual |
| Drag-select text inside title → release | No navigation | Unit test 6 + manual |
| Tab to card → Enter | Navigates | Unit tests 2 & 12 |
| Tab to card → Space | Navigates, no page scroll | Unit test 3 + manual |
| Tab to card → arrow key / letter | No navigation, no throw | Implicit (handlers are keydown.enter / keydown.space only; other keys never enter the handlers) |
| Tab past card to Manage button → Enter | Members dialog opens; URL stays | Unit test 5 + existing manage-dialog integration test |
| Click Manage button | Dialog opens; URL stays | Unit test 4 + existing test `stops click propagation so the card does not also receive the click` |
| Right-click on card | No navigation, native context menu | Unit test 7 + manual |
| Card for a deleted project | Navigates; board shows its own 404 error state (#47) | Manual (backend-dependent) |
| Project with accented name | Navigates with unmodified id | Implicit — `Router.navigate(['/board', id])` handles encoding; no unit test needed beyond the id-equality check in tests 12/13 |
| Browser Back from board | `/dashboard` re-renders without full reload | Manual |
| Loading / empty / error dashboard states | Unchanged — no card grid rendered, no click handler in reach | Existing dashboard state tests |

### Mocking cheat-sheet

```typescript
// project-card.component.spec.ts — observing output
let emitted: ProjectSummary | undefined;
fixture.componentInstance.openBoard.subscribe(p => (emitted = p));
article.click();
expect(emitted?.id).toBe(base.id);

// dashboard-page.component.spec.ts — observing Router.navigate
const router = TestBed.inject(Router) as unknown as { navigate: ReturnType<typeof vi.fn> };
// … drive grid.openBoard …
expect(router.navigate).toHaveBeenCalledWith(['/board', projects[0].id]);
```

### Edge cases to test

- Click on the `<h2>` title with no text selection → navigates.
- Click on the `<h2>` title after drag-selecting it → no navigation.
- Keyboard Space on the focused card → navigates AND the page does not scroll (no test for scroll; verify via `preventDefault` spy — unit test 3).
- Keyboard Enter on the Manage button while focused → dialog opens, no navigation (unit test 5).
- `mousedown` → drag off the card → `mouseup` off the card: no `click` fires on the card (native browser behavior, no test needed).
- Project array is swapped for one containing a new project with the same id → card DOM identity preserved, existing trackBy test still passes unchanged.

---

## Design Validation (Self-Check)

**Interface alignment**
- [x] `ProjectSummary` shape unchanged; `id` is a `string` per the existing model.
- [x] New outputs (`openBoard`) typed as `EventEmitter<ProjectSummary>` — matches the existing `manageMembersClick` output.

**Standards compliance**
- [x] `inject()` used for `Router` (consistent with `navbar.component.ts` line 17, `login-page.component.ts` line 39, and current `dashboard-page.component.ts` style).
- [x] Signals unchanged — no new reactive state needed.
- [x] `ChangeDetectionStrategy.OnPush` unchanged on all three components.
- [x] `Router.navigate(['/board', project.id])` uses the array form (handles encoding) per the context doc's correctness AC.

**Security**
- [x] `authGuard` on `/board/:projectId` is unchanged — no new route to guard.
- [x] No user input handled; no `innerHTML`, no `ElementRef.nativeElement` writes.
- [x] No PII, no JWT, no raw project payload logged — the handlers contain zero `console.log` calls.

**Completeness**
- [x] All modified files listed in §"Files to Modify".
- [x] No new files.
- [x] Steps are in dependency order: dashboard (top) → grid (middle) → card (leaf). The app builds after each step if done in reverse (leaf-first) as well; order chosen for readability.
- [x] Every AC from the context doc maps to at least one unit test or manual-QA row.

---

## Out of Scope (reaffirmed from the context doc)

- No pinning, recent-boards, notifications, context menus.
- No board-page changes — the board's own #47 behavior (column fetch, error state, DnD) is untouched.
- No pre-fetch, no cache-warming, no membership guard on `/board/:projectId`.
- No card visual redesign beyond `cursor: pointer`. Anything richer (affordance-tied elevation, role-specific hover, etc.) is deferred to Phase 3.
- No telemetry / analytics on project-open.

---

*"The technical specification is saved. You can now instruct the web-designer agent to create the design specification."*

---

## Development Status

**Implementation Date:** 2026-05-05
**Developer:** Claude Opus 4.7

### Files Modified
- `KanbAI-Web/src/app/features/projects/components/project-card/project-card.component.ts` — added `openBoard` output, `onCardActivate`, `onKeyboardActivate`, `isInsideManageButton`, `isTextBeingSelected`.
- `KanbAI-Web/src/app/features/projects/components/project-card/project-card.component.html` — added `role="button"`, `(click)`, `(keydown.enter)`, `(keydown.space)` on host `<article>`.
- `KanbAI-Web/src/app/features/projects/components/project-card/project-card.component.scss` — `cursor: default` → `cursor: pointer` (single-line swap, design spec §3.1).
- `KanbAI-Web/src/app/features/projects/components/project-grid/project-grid.component.ts` — added `@Output() openBoard`.
- `KanbAI-Web/src/app/features/projects/components/project-grid/project-grid.component.html` — passthrough `(openBoard)="openBoard.emit($event)"`.
- `KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.ts` — injected `Router`, added `openBoard(project)` calling `router.navigate(['/board', project.id])`.
- `KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.html` — bound `(openBoard)="openBoard($event)"` on `<app-project-grid>`.

### Spec Files Updated
- `KanbAI-Web/src/app/features/projects/components/project-card/project-card.component.spec.ts` — added 7 new tests: role="button"; click emits openBoard; Enter emits; Space emits + preventDefault; Manage-button click does NOT emit; Manage-button keydown does NOT emit; text-selection inside card does NOT emit; right-click does NOT emit.
- `KanbAI-Web/src/app/features/projects/components/project-grid/project-grid.component.spec.ts` — added `re-emits openBoard from a child card`.
- `KanbAI-Web/src/app/features/projects/dashboard-page/dashboard-page.component.spec.ts` — added `Router` mock + 3 tests: navigates on openBoard; passes correct id (regression guard); manageMembersClick does NOT navigate.

### Files Created
- None. Scope-minimal bug fix per tech spec.

### Build & Test Results
- **Build:** ✅ SUCCESS (`npm run build`)
- **Tests:** ✅ 771/771 passed across 46 test files (`npm run test -- --watch=false`)
- **Pre-existing failures:** None introduced; pre-existing Sass deprecation warnings in `board-page.component.scss` (lines 73, 88) are unrelated and unchanged.

### Implementation Notes
- `onKeyboardActivate` parameter is typed as `Event` (not `KeyboardEvent`) because Angular's `(keydown.enter)` / `(keydown.space)` pseudo-event bindings type `$event` as `Event`. `preventDefault()` and `event.target` both live on `Event` — the runtime instance is always `KeyboardEvent`, so behavior is unchanged. Inline comment added to document this.
- `isTextBeingSelected` test attaches the `<article>` to `document.body` before selecting so `window.getSelection()` can observe the range. Selection is cleared in `afterEach`.
- All three components retain `ChangeDetectionStrategy.OnPush`. No new signals, no service calls, no new routes.

### Edge Cases Covered by Tests
- Click on card body → emits openBoard.
- Enter on card host → emits openBoard.
- Space on card host → emits openBoard AND `preventDefault()` is called (suppresses page-scroll).
- Click on Manage-members button → does NOT emit openBoard (guarded by `isInsideManageButton`).
- Keydown Enter on Manage-members button → does NOT emit openBoard.
- Text selection inside card at click time → does NOT emit openBoard.
- Right-click (`button: 2`) → does NOT emit openBoard.
- Dashboard: `openBoard` from grid → `router.navigate(['/board', projects[i].id])`.
- Dashboard: `manageMembersClick` from grid → dialog opens, `router.navigate` never called.

### Manual QA (recommended before merge)
Per tech spec §QA Guidance "Integration / manual QA matrix" — verify with `ng serve`, logged-in user:
- Click card body → `/board/:id` loads; board renders.
- Tab to card → Enter navigates; Tab to card → Space navigates without page scroll.
- Click Manage icon (owner cards) → dialog opens; URL stays `/dashboard`.
- Drag-select title text → no navigation on release.
- Right-click card → native context menu; no navigation.
- Browser Back from board → `/dashboard` renders without full reload.

---

*"Development is complete and files are saved. You can now instruct QA to review the implementation and write automated tests."*
