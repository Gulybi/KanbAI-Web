# Feature: State Management Pattern (Angular Signals)

**GitHub Issue:** #11
**Milestone:** Not assigned

## Business Value

**Who is this for?**
- Frontend developers working on the KanbAI-Web application
- AI agents that will generate code following consistent patterns
- Future maintainers who need a standardized approach to reactive state

**Why is it valuable?**
- Provides a single, reusable template for managing reactive state across all features
- Ensures consistency in how state is handled (current user, loaded tasks, UI state)
- Reduces cognitive load by establishing one clear pattern instead of ad-hoc solutions
- Enables predictable, testable state management using modern Angular Signals

**What problem does it solve?**
- Currently, there is no standardized way to manage reactive state in the application
- Without a pattern, each feature might implement state management differently
- Lack of a template makes it harder for AI to generate consistent, maintainable code
- Prevents duplication and inconsistent approaches across the codebase

## Current State vs Desired State

### Current State
**Angular Version:** 21.2.0 (supports Signals)

**Existing Structure:**
- `src/app/core/` - Contains interceptors, layout components, models
  - `core/interceptors/auth.interceptor.ts` - HTTP interceptor skeleton
  - `core/layout/navbar/navbar.component.ts` - Navigation bar component
  - `core/layout/sidebar/sidebar.component.ts` - Sidebar component
  - `core/models/environment.interface.ts` - Environment configuration interface
- `src/app/features/` - Contains feature modules (auth, board)
  - `features/auth/login-page/login-page.component.ts` - Login page
  - `features/board/board-page/board-page.component.ts` - Board page
- `src/app/app.ts` - Root component using `signal()` for basic state

**Current Behavior:**
- The root component (`app.ts`) demonstrates basic Signal usage: `readonly title = signal('KanbAI-Web')`
- No centralized state management service or pattern exists
- No shared state utilities or base classes for reactive state
- Each feature would need to implement its own state management from scratch

### Desired State

**Expected Pattern:**
A reusable state management service template that provides:
1. Centralized reactive state using Angular Signals
2. Computed values derived from state
3. Methods to update state immutably
4. Optional integration with RxJS for async operations
5. Clear separation between state (private) and selectors (public)

**Expected Location:**
- Base pattern/utility in `src/app/core/state/` or `src/app/core/services/`
- Example implementation showing how to use the pattern
- TypeScript interfaces for common state shapes

**Expected User Flow:**
1. Developer (or AI) needs to manage state for a feature (e.g., current user, task list)
2. Developer creates a new service extending or following the base state pattern
3. Service exposes read-only signals for UI components to consume
4. Service provides methods to update state immutably
5. Components inject the service and subscribe to state changes via signals

## Milestone Context

**Prerequisite Issues:**
- #6 - Install and configure Tailwind CSS and PostCSS - ✅ DONE (merged)
- #7 - Setup global HttpClient and interceptor skeleton - ✅ DONE (merged)
- #8 - Install Angular CDK for drag and drop - ✅ DONE (merged)
- #9 - Implement environment-aware configuration and API constants - ✅ DONE (merged)
- #10 - Implement application shell layout and routing - ✅ DONE (merged)

**Downstream Issues:**
- Future feature development will depend on this state pattern
- AI-generated code will follow this template for consistency
- Board feature (#unknown) will need state management for tasks
- Auth feature will need state management for current user

**Related Work:**
- Angular 21.2.0 includes full support for Signals (stable API)
- Project already demonstrates basic Signal usage in `app.ts`
- RxJS (v7.8.0) is available for async operations if needed

## Acceptance Criteria

- [ ] A base state management service template is created in `src/app/core/state/` or `src/app/core/services/`
- [ ] The template uses Angular Signals for reactive state management
- [ ] The template provides private `signal()` for state and public computed selectors
- [ ] The template includes methods to update state immutably (no direct mutation)
- [ ] An example implementation demonstrates the pattern with a real use case (e.g., user state or theme state)
- [ ] TypeScript interfaces are defined for common state shapes
- [ ] The pattern integrates with RxJS Observables using `toSignal()` where async data is involved
- [ ] The service is documented with inline comments explaining the pattern
- [ ] The pattern can be easily copied and adapted for new features (task state, board state, etc.)
- [ ] Unit tests demonstrate how to test services following this pattern

**Edge Cases:**
- [ ] If state update fails (e.g., API call fails), the state remains unchanged
- [ ] If multiple updates happen rapidly, the most recent update wins
- [ ] If component destroys while async operation is pending, subscriptions clean up properly (use `takeUntilDestroyed()`)

**Documentation:**
- [ ] A brief markdown document (`docs/patterns/state-management.md`) explains the pattern and when to use it
