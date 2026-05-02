# Feature: Setup SignalR Client Service

**GitHub Issue:** #45
**Milestone:** Real-time UI Updates & Kanban Interaction (Milestone #5)
**Assignee:** Gulybi

## Business Value

**Who is this for?**
End users of the KanbAI Kanban board (project members and project owners) who collaborate on the same board simultaneously.

**Why is it valuable?**
Today the KanbAI web app only reflects changes that the current user makes locally (or sees after a manual refresh). When multiple teammates work on the same board, each user sees a stale view of the board state until the page is reloaded. This undermines the core promise of a Kanban tool: shared, real-time situational awareness across the team.

**What problem does it solve?**
It establishes the client-side transport foundation for real-time updates. Without a functioning SignalR client connection, no downstream real-time feature in this milestone (state integration #46, drag-and-drop with optimistic UI #47, and the accompanying AI logs documentation #48) can operate. This issue is the enabling infrastructure that unblocks the rest of the milestone.

**Business impact:**
- Enables multi-user collaboration on the same board without manual refreshes.
- Unblocks delivery of Milestone #5 (Real-time UI Updates & Kanban Interaction).
- Lays the groundwork for future server-pushed notifications (e.g., assignments, comments, AI agent activity) without re-architecting a second channel.

## Current State

- No SignalR (or any WebSocket) transport exists in the Angular app. A search for `signalr|SignalR|websocket|hub` across `KanbAI-Web/src` returns zero results.
- The `@microsoft/signalr` npm package is not present in `KanbAI-Web/KanbAI-Web/package.json` dependencies.
- All data currently flows through one-shot HTTP calls; see existing API services such as `KanbAI-Web/src/app/features/projects/services/projects-api.service.ts` and `KanbAI-Web/src/app/features/projects/services/members-api.service.ts`.
- State services (e.g., `KanbAI-Web/src/app/features/projects/state/project-state.service.ts`, `members-state.service.ts`, `KanbAI-Web/src/app/core/state/base-state.service.ts`) are populated only after an HTTP request resolves; they have no mechanism to receive pushed updates.
- Authentication state is held in `KanbAI-Web/src/app/core/services/auth-state.service.ts`; the access token it manages is what a real-time connection will need.
- The API base URL comes from `KanbAI-Web/src/app/core/models/environment.interface.ts` + `KanbAI-Web/src/environments/environment.ts` (and its `.development.ts` sibling). A hub URL must be derivable from the same environment configuration so that dev, staging, and prod all behave correctly without code changes.
- Net effect today: if another user moves a card on the backend, the current user sees nothing happen until they refresh the page.

## Desired State

After this issue is delivered, the Angular app must contain a reusable, injectable client service that owns the lifecycle of a single real-time connection to the backend SignalR hub.

**Expected behaviors (UI-observable):**
- While an authenticated user is using the app, the real-time channel is established automatically and kept alive in the background.
- When the network drops or the backend restarts, the client reconnects on its own without requiring the user to refresh; once reconnected, the rest of the app (delivered by downstream issues) can resume receiving pushed events.
- If the user logs out, the real-time channel is closed cleanly so no stale connection remains.
- If the user is not authenticated, the app does not attempt to open a real-time connection (no noisy errors in the console, no failed requests in the network tab).
- Connection target is environment-driven: dev builds connect to the dev backend, prod builds connect to the prod backend, with no source-code change.

**Expected user flow:**
1. User logs in successfully.
2. The app silently establishes the real-time channel in the background; the login flow itself is not blocked or delayed perceptibly.
3. User navigates the app normally; nothing visible changes in this issue alone, but the channel is live and ready.
4. If the user briefly loses connectivity (wifi drop, laptop sleep), the channel re-establishes itself once connectivity returns, without user interaction.
5. User logs out; the real-time channel is torn down.

**Out of scope for this issue (explicitly handled by later issues):**
- Handling specific server events such as `TaskMoved` and updating Signals state — this is #46.
- Drag-and-drop UI and optimistic updates — this is #47.
- AI-logs documentation of the real-time flow — this is #48.
- Any visual connection-status indicator in the UI is not required for this issue.

## Milestone Context

**Milestone:** #5 — Real-time UI Updates & Kanban Interaction

**Prerequisite Issues:**
- Authentication/login flow must already be in place so the client has a token to hand to the hub. This is satisfied: auth state is already managed in `KanbAI-Web/src/app/core/services/auth-state.service.ts` (login/authentication work was completed in earlier PRs including #60).
- Environment configuration must be usable for the hub URL. This is satisfied by the existing `environment.ts` / `environment.development.ts` + `environment.interface.ts`.

**Downstream Issues (blocked by this one):**
- #46 — Integrate Real-time Events with State Management (requires this service to subscribe to events and push them into Signals state).
- #47 — Implement Visual Drag-and-Drop (Angular CDK) with optimistic UI (relies on the realtime channel from #46, which in turn relies on this issue).
- #48 — Document AI Frontend Real-time Logic (AI_LOGS.md) (documents the flow that this issue introduces).

**Related Work:**
- Issue #59 (currently in progress on the active branch) is tightening environment/API-URL configuration; the hub URL introduced in this issue should follow the same environment-driven pattern established there.

## Acceptance Criteria

- [ ] The `@microsoft/signalr` package is added to `KanbAI-Web/KanbAI-Web/package.json` dependencies and is installed (i.e., `npm install` succeeds and `package-lock.json` is updated).
- [ ] A single, injectable `SignalRService` exists in the Angular app and is discoverable via a Glob search under `KanbAI-Web/src/app/`.
- [ ] The hub URL used by the service is read from the existing environment configuration (`environment.ts` / `environment.development.ts`) rather than hardcoded, so a production build and a development build connect to different backends with no code change.
- [ ] When a logged-in user is present, calling the service's start/connect entry point transitions the connection to a connected state and resolves without throwing; when there is no authenticated user/token, the service does not attempt to connect and surfaces no uncaught errors in the browser console or network tab.
- [ ] The connection attaches the current user's access token (from `AuthStateService`) when opening the channel, so the backend can authenticate the socket.
- [ ] If the connection is lost after being established (simulated by stopping the backend or disabling the network), the client automatically attempts to reconnect without any user action; once connectivity returns, the connection state returns to connected.
- [ ] The service exposes a way for consumers (to be used by issue #46) to stop/disconnect the channel, and calling it leaves no active SignalR connection in the browser's network panel.
- [ ] Logging out (clearing auth state) results in the real-time channel being closed; no reconnection attempts continue in the background after logout.
- [ ] No access tokens, user IDs, or other PII are written to `console.log` by the service, in keeping with the project's logging/privacy standard.
- [ ] `npm run build` completes successfully with the new service and dependency in place.
- [ ] `npm run test -- --watch=false` runs to completion; any failures tied to the new service are fixed before the issue is considered done (pre-existing failures unrelated to SignalR are documented, not fixed, per project policy).

### Quality Gate Check

Each criterion above has been reviewed for:
- **Observable:** every item can be verified either visually in the browser (DevTools network/console panels), via package manifest inspection, via file existence, or via build/test command output.
- **Specific:** no vague terms like "robust" or "fast"; concrete states (connected, no uncaught errors, reconnection without user action) are named.
- **Testable:** QA can script each criterion (toggle network, log out, inspect package.json, run `npm run build`, etc.) and get a deterministic pass/fail.

---

*"The business context is defined and saved. You can now instruct the staff-engineer agent to read the context note and design the frontend technical specification."*
