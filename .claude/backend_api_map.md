# KanbAI Core — Backend API map

This document describes HTTP routes exposed by `KanbAI-Core`, request/response shapes, and DTO definitions. JSON uses ASP.NET Core’s default serializer settings (**camelCase** property names in JSON unless configured otherwise).

## Authentication

| Aspect | Detail |
|--------|--------|
| Scheme | JWT Bearer (`Authorization: Bearer <token>`) |
| User identity | Controllers read `ClaimTypes.NameIdentifier` as `Guid` |
| Anonymous | Health check; auth register/login |

Endpoints marked **JWT** require a valid Bearer token.

---

## Standard response wrapper (`ApiResponse`)

Most endpoints return `ApiResponse` or `ApiResponse<T>`.

| Property | Type | Description |
|----------|------|-------------|
| `success` | `boolean` | Operation outcome |
| `message` | `string \| null` | Optional human-readable message |
| `errors` | `string[]` | Validation or error messages (often empty on success) |
| `data` | `T \| null` | Payload when using `ApiResponse<T>` |

Factories in code: `ApiResponse.Ok(...)`, `ApiResponse<T>.Ok(data, ...)`, `ApiResponse.Fail(...)`.

**Auth** endpoints (`/api/auth/register`, `/api/auth/login`) return **`AuthResponseDto` directly**, not wrapped in `ApiResponse`.

---

## Endpoints

### Health

| Method | Route | Auth | Request body | Success response | Notes |
|--------|-------|------|--------------|------------------|-------|
| `GET` | `/api/health` | None | — | `200` — `ApiResponse` (`success`, `message`, `errors`) | Liveness |

---

### Auth

| Method | Route | Auth | Request body | Success | Error responses |
|--------|-------|------|--------------|---------|-----------------|
| `POST` | `/api/auth/register` | None | `RegisterRequestDto` | `201` — `AuthResponseDto` (raw body) | `400` — `{ "message": "Email is already registered." }` |
| `POST` | `/api/auth/login` | None | `LoginRequestDto` | `200` — `AuthResponseDto` (raw body) | `401` — `{ "message": "Invalid email or password." }` |

---

### Projects

| Method | Route | Auth | Request body | Success response |
|--------|-------|------|--------------|-------------------|
| `POST` | `/api/project` | JWT | `CreateProjectDto` | `201` — `ApiResponse<ProjectResponseDto>` |
| `GET` | `/api/project` | JWT | — | `200` — `ApiResponse<List<ProjectResponseDto>>` |
| `GET` | `/api/project/{id}` | JWT | — | `200` — `ApiResponse<ProjectResponseDto>` / `404` |
| `PUT` | `/api/project/{id}` | JWT | `UpdateProjectDto` | `200` — `ApiResponse<ProjectResponseDto>` / `404` |
| `DELETE` | `/api/project/{id}` | JWT | — | `204` / `403` / `404` |
| `GET` | `/api/project/{projectId}/members` | JWT | — | `200` — `ApiResponse<List<MemberResponseDto>>` / `404` |
| `POST` | `/api/project/{projectId}/members` | JWT | `AddMemberDto` | `201` — `ApiResponse<MemberResponseDto>` / `400` / `403` / `404` |
| `DELETE` | `/api/project/{projectId}/members/{userId}` | JWT | — | `204` / `400` / `403` / `404` |

**Delete project:** `403` when caller is not owner; `404` when not found.

**List members:** returns `404 "Project not found."` both when the project is missing AND when the caller is not a member. Frontend maps this to "This project no longer exists."

**Add member:** `403` — only owner; `400` — user not found (`"User not found."` or `"No user found with email address: {email}"` — match by prefix), already member (`"User is already a member of this project."`), or missing input (`"Either UserId or Email is required."` / `"Provide either UserId or Email, not both."`); `404` — project not found.

**Remove member:** `403` — only owner (`"Only the project owner can remove members."`); `400` — cannot remove last owner (`"Cannot remove the last owner from the project."`); `404` — not found (treated as success by the frontend: already gone server-side).

---

### Columns

| Method | Route | Auth | Request body | Success response |
|--------|-------|------|--------------|-------------------|
| `GET` | `/api/column/project/{projectId}` | JWT | — | `200` — `ApiResponse<List<ColumnResponseDto>>` / `404` |
| `POST` | `/api/column/project/{projectId}` | JWT | `CreateColumnDto` | `201` — `ApiResponse<ColumnResponseDto>` / `404` |
| `DELETE` | `/api/column/{id}` | JWT | — | `204` / `404` |

---

### Tasks

| Method | Route | Auth | Request body | Success response |
|--------|-------|------|--------------|-------------------|
| `POST` | `/api/task/column/{columnId}` | JWT | `CreateTaskDto` | `201` — `ApiResponse<TaskResponseDto>` |
| `PUT` | `/api/task/{taskId}/move` | JWT | `MoveTaskDto` | `200` — `ApiResponse<TaskResponseDto>` |

**Create task** failures (examples): `404` column not found; `403` not a project member; `400` missing title, assignee not found, or assignee not a member.

**Move task** failures (examples): `404` task or target column; `403` not a member; `400` cross-project move or invalid `taskOrder`.

---

## DTO reference (C# types → JSON shape)

### `ApiResponse` / `ApiResponse<T>`

See [Standard response wrapper](#standard-response-wrapper-apiresponse).

### `UserProfileDto` & `AuthResponseDto`

Defined in `DTOs/Auth/AuthResponseDto.cs`.

**`UserProfileDto`**

| JSON property | Type | Notes |
|---------------|------|--------|
| `id` | `string` | User id |
| `name` | `string` | Display name |
| `email` | `string` | Email |

**`AuthResponseDto`**

| JSON property | Type | Notes |
|---------------|------|--------|
| `token` | `string` | JWT |
| `user` | `UserProfileDto` | Profile |

### `RegisterRequestDto`

| JSON property | Type | Validation |
|---------------|------|------------|
| `name` | `string` | Required |
| `email` | `string` | Required, email format |
| `password` | `string` | Required, min length 6 |

### `LoginRequestDto`

| JSON property | Type | Validation |
|---------------|------|------------|
| `email` | `string` | Required, email format |
| `password` | `string` | Required |

### `CreateProjectDto`

| JSON property | Type | Validation |
|---------------|------|------------|
| `name` | `string` | Required, max 200 |
| `description` | `string \| null` | Optional, max 500 |

### `UpdateProjectDto`

Same shape as `CreateProjectDto`.

### `ProjectResponseDto`

| JSON property | Type | Notes |
|---------------|------|--------|
| `id` | `string` | Project id |
| `name` | `string` | |
| `description` | `string \| null` | |
| `role` | `string` | Caller’s role in project |
| `createdAt` | `string` (ISO 8601) | `DateTimeOffset` |
| `updatedAt` | `string` (ISO 8601) | `DateTimeOffset` |

### `AddMemberDto`

Either `userId` or `email` must be supplied, not both. The backend resolves the email to a user internally.

| JSON property | Type | Validation |
|---------------|------|------------|
| `userId` | `string` (GUID, optional) | Required when `email` is absent |
| `email` | `string` (optional) | Required when `userId` is absent; validated as email format |

The frontend Members UI (issue #33) sends `{ email }` only.

### `MemberResponseDto`

| JSON property | Type | Notes |
|---------------|------|--------|
| `userId` | `string` | |
| `name` | `string` | |
| `email` | `string` | |
| `role` | `string` | |
| `joinedAt` | `string` (ISO 8601) | |

### `CreateColumnDto`

| JSON property | Type | Validation |
|---------------|------|------------|
| `name` | `string` | Required, max 100 |
| `colorCode` | `string \| null` | Optional, max 20 |
| `columnOrder` | `number \| null` | Optional |

### `ColumnResponseDto`

| JSON property | Type | Notes |
|---------------|------|--------|
| `id` | `string` | |
| `name` | `string` | |
| `colorCode` | `string \| null` | |
| `columnOrder` | `number` | |
| `projectId` | `string` | |
| `createdAt` | `string` (ISO 8601) | |
| `updatedAt` | `string` (ISO 8601) | |

### `CreateTaskDto`

| JSON property | Type | Validation |
|---------------|------|------------|
| `title` | `string` | Required, max 200 |
| `content` | `string \| null` | Optional |
| `assignedId` | `string (GUID) \| null` | Optional assignee |

### `TaskResponseDto`

| JSON property | Type | Notes |
|---------------|------|--------|
| `id` | `string` | |
| `title` | `string` | |
| `content` | `string \| null` | |
| `taskOrder` | `number` | Order within column |
| `columnId` | `string` | |
| `assignedId` | `string \| null` | |
| `createdAt` | `string` (ISO 8601) | |
| `updatedAt` | `string` (ISO 8601) | |

### `MoveTaskDto`

| JSON property | Type | Validation |
|---------------|------|------------|
| `columnId` | `string` (GUID) | Required — target column |
| `taskOrder` | `number` | Required, ≥ 0 |

---

## Source locations

| Area | Path |
|------|------|
| Controllers | `KanbAI-Core/KanbAI-Core/Controllers/` |
| DTOs | `KanbAI-Core/KanbAI-Core/DTOs/` |

---

## Frontend documentation — suggested artifacts

Pairing this backend map with a few frontend-focused docs keeps UI work aligned with API contracts and UX expectations:

1. **`frontend_api_client.md` (or typed SDK notes)** — Base URL per environment, how the SPA attaches `Authorization`, handling of `401`/`403`, and a mapping from UI flows to the routes above (including that auth responses are **not** wrapped in `ApiResponse`, unlike most other endpoints).

2. **Screen / route map** — App routes, guards (logged-in vs public), and which backend endpoints each screen calls (projects list, board, settings, login/register).

3. **State & caching strategy** — Where tokens live (memory vs secure storage), refresh policy if added later, and invalidation rules after mutations (e.g. after move task, refetch board vs optimistic updates).

4. **Forms & validation matrix** — Field-level rules mirrored from DTO validation (max lengths, required fields) so client messages match server behavior.

5. **Error UX contract** — How to surface `ApiResponse.errors`, auth `{ message }` bodies, and empty bodies on `204 No Content`.

6. **Optional: OpenAPI-driven types** — If you generate TypeScript clients from the OpenAPI doc (`MapOpenApi` in Development), document the generation command and where generated files live.

Together with **`backend_api_map.md`**, these give frontend developers enough context to implement safely without rediscovering quirks (especially the auth response shape vs `ApiResponse`).
