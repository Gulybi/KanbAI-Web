# Issue #5: Initialize Angular Workspace and Folder Structure

### Title & Business Value
**Title:** Initialize Angular Workspace and Scalable Folder Structure.
**Business Value:** Establishing a robust and scalable architecture from the start is critical for the long-term maintainability and velocity of the KanbAI-Web project. A clear separation of concerns (Core, Shared, Features) ensures that developers can easily locate, reuse, and extend components, services, and logic without creating technical debt or monolithic dependencies.

### Current State vs. Desired State
**Current State:**
*   The Angular project is a fresh scaffold (likely generated via `ng new`).
*   All component files (`app.ts`, `app.html`, etc.) are located in the root `src/app` directory.
*   No organizational structure (folders) exists for core logic, shared components, or domain-specific features.
*   Current components: `App` component in `src/app/app.ts`.
*   Current configuration: Standard `appConfig` in `src/app.config.ts`.

**Desired State:**
*   A well-defined folder structure following Angular best practices:
    *   `src/app/core/`: For singleton services, interceptors, guards, and app-wide initialization logic.
    *   `src/app/shared/`: For reusable UI components, pipes, and directives used across multiple features.
    *   `src/app/features/`: For domain-specific modules (e.g., Auth, Dashboard, Boards).
*   Standardized naming conventions for all new directories.
*   Scalable architecture ready for subsequent feature implementation (Auth, Board Management).

### Milestone Context
*   **Prerequisites:** None (Initial project setup).
*   **Downstream Issues:** Authentication (#6 - hypothetical), Board Management UI (#7 - hypothetical), AI Integration (#8 - hypothetical). This issue provides the foundation for all future work.

### Acceptance Criteria
- [ ] Create `src/app/core` directory for singletons and global services.
- [ ] Create `src/app/shared` directory for reusable components and utilities.
- [ ] Create `src/app/features` directory for domain-specific feature modules.
- [ ] Ensure the folder structure is documented (implicitly by its existence).
- [ ] Verify that the application still builds and runs after the structural changes (though no logic changes are expected).
- [ ] Follow Angular CLI best practices for naming and nesting.
