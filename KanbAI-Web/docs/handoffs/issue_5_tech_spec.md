# Tech Spec: Issue #5 - Initialize Angular Workspace and Folder Structure

#### Section 1: Overview
This technical specification defines a scalable, modular folder structure for the KanbAI-Web project, transitioning from a flat default scaffold to a robust "Core/Shared/Features" architecture. This structure ensures a clear separation between application-wide singletons, reusable components, and domain-specific feature modules, adhering to modern Angular standalone architecture best practices.

#### Section 2: Component Architecture
- **Routing:** No new routes at this stage. Existing `app.routes.ts` remains in `src/app`.
- **Hierarchy:**
    - **App Component:** Root container (`src/app/app.ts`).
    - **Core Folder (`src/app/core/`):** Contains singleton components (e.g., Header, Footer) and application-wide services.
    - **Shared Folder (`src/app/shared/`):** Contains dumb (presentational) components (e.g., Buttons, Inputs, Cards).
    - **Features Folder (`src/app/features/`):** Contains smart (container) components grouped by domain (e.g., `features/boards`, `features/auth`).
- **Inputs/Outputs:** N/A for this infrastructure task.

#### Section 3: State & Data Layer
- **State Management:** N/A for this task.
- **Interfaces:** N/A for this task.

#### Section 4: Service Integration
- **HTTP Service methods:** N/A for this task.

#### Section 5: Implementation Steps
1.  **Create Core Directory:** Create `src/app/core`.
    -   *Guideline:* Use for interceptors, guards, and singleton services.
2.  **Create Shared Directory:** Create `src/app/shared`.
    -   *Guideline:* Use for reusable components, pipes, and directives.
3.  **Create Features Directory:** Create `src/app/features`.
    -   *Guideline:* Use for domain-specific feature modules.
4.  **Verification:** Run `ng build` to ensure the scaffold remains functional.

#### Section 6: QA Guidance
- **Build Check:** Ensure `npm run build` (or `ng build`) completes without errors.
- **Structural Check:** Verify directories `src/app/core`, `src/app/shared`, and `src/app/features` are present.
- **Performance:** Ensure no circular dependencies are introduced (unlikely at this stage).

#### Development Status
- **Files Created/Modified:**
    - `src/app/core/` (Created)
    - `src/app/shared/` (Created)
    - `src/app/features/` (Created)
    - `docs/handoffs/issue_5_tech_spec.md` (Modified)
- **Build & Test Results:**
    - `npm run build` passed successfully.
- **Edge Cases for QA:**
    - N/A for this infrastructure task.

### Testing Status
- **Test Files Created/Updated:**
    - `src/app/app.spec.ts` (Verified existing tests pass with new structure)
- **Test Scenarios Covered:**
| Scenario | Result |
| :--- | :--- |
| Core directory exists | Success |
| Shared directory exists | Success |
| Features directory exists | Success |
| Project build (`ng build`) | Success |
| App component unit tests | Success |
- **Coverage Gaps / Known Issues:**
    - No new tests created as no logic was added. Core/Shared/Features are currently empty placeholders.
