# Feature: Application Shell (Base Layout) and Routing

**GitHub Issue:** #10  
**Milestone:** Angular Frontend Foundations (Milestone #2)  
**Assignee:** Gulybán Dániel (@Gulybi)

## Business Value

This feature establishes the foundational layout structure for the KanbAI-Web application, creating a consistent navigation experience across all future pages. By implementing a shell component with a top navigation bar and sidebar placeholder, users will have a predictable way to navigate between authentication and board features. This is the architectural foundation that all subsequent features will be built upon.

**Who is this for?**  
All end users of the KanbAI application who need to navigate between login and board views.

**Why is it valuable?**  
Without a consistent layout structure, users would experience disjointed navigation and each feature would need to implement its own navigation patterns. This shell provides a unified user experience and reduces development time for future features.

**What problem does it solve?**  
Solves the navigation and layout consistency problem by providing a single source of truth for the application's visual structure and routing mechanism.

## Current State vs Desired State

### Current State

The application currently has:
- Basic Angular configuration: `KanbAI-Web/src/app/app.config.ts` with HTTP client and auth interceptor configured
- Empty routes array: `KanbAI-Web/src/app/app.routes.ts` contains no route definitions
- Simple app template: `KanbAI-Web/src/app/app.html` shows a Tailwind CSS demo and a `<router-outlet />` tag
- Core directory structure: `KanbAI-Web/src/app/core/` exists with interceptors and models subdirectories
- No features directory yet
- No layout components (navbar, sidebar, shell)
- No route guards or lazy-loaded modules

**Current behavior:**
- Users see only a Tailwind CSS demo message
- No navigation structure exists
- No routes are configured
- Application is a single-page stub

### Desired State

After this feature is complete:
- A new `ShellComponent` serves as the main layout wrapper containing:
  - A top `NavbarComponent` that spans the full width of the application
  - A placeholder `SidebarComponent` (can be empty or show basic structure)
  - A `<router-outlet>` for rendering routed content
- Route configuration in `app.routes.ts` includes:
  - `/login` route (placeholder component or empty for now)
  - `/board` route (placeholder component or empty for now)
  - Default redirect from `/` to `/login`
- All navigation happens within the shell layout

**Expected behavior:**
- When a user navigates to the application root (`/`), they are redirected to `/login`
- The shell layout (navbar + sidebar + content area) is visible on all pages
- Navigation between `/login` and `/board` renders different content in the router outlet while maintaining the shell layout
- The navbar displays the application name "KanbAI"
- The sidebar is a placeholder (can show "Sidebar" text or be styled but empty)

**Expected user flow:**
1. User accesses the application root URL
2. Application redirects to `/login`
3. Shell component renders with navbar, sidebar, and login content in the outlet
4. User can navigate to `/board` (mechanism TBD - could be via URL or future UI elements)
5. Shell persists, board content appears in outlet

## Milestone Context

**Milestone:** Angular Frontend Foundations (Milestone #2)

This issue is part of the foundational Angular setup phase. It establishes the core routing and layout patterns that all future features will build upon.

**Prerequisite Issues:**
- #6 - Setup Tailwind CSS and PostCSS - ✅ COMPLETED (Tailwind is working as shown in app.html)
- #7 - Setup global HttpClient and interceptor skeleton - ✅ COMPLETED (authInterceptor is configured in app.config.ts)
- #8 - Install Angular CDK for drag and drop - ✅ COMPLETED (CDK will be used for future board features)
- #9 - Implement environment-aware configuration and API constants - ✅ COMPLETED (environment setup is ready)

**Downstream Issues:**
- All future feature development depends on this shell structure
- Authentication feature (#11 or similar) will use the `/login` route
- Board features will use the `/board` route and sidebar navigation

**Related Work:**
- The `core/interceptors/auth.interceptor.ts` file is already implemented and will work with the routing system
- The application is using standalone components (no NgModules based on app.config.ts pattern)
- Tailwind CSS is configured and ready for styling the layout components

## Acceptance Criteria

### Layout Structure

- [ ] A `ShellComponent` exists in `src/app/core/layout/` or `src/app/shell/`
- [ ] The `ShellComponent` template includes three sections: navbar, sidebar, and content area with `<router-outlet>`
- [ ] A `NavbarComponent` exists and is rendered at the top of the shell
- [ ] The `NavbarComponent` displays the text "KanbAI" as the application name
- [ ] A `SidebarComponent` exists and is rendered on the left side of the shell
- [ ] The sidebar has a defined width (e.g., 240px or similar) and contrasting background color
- [ ] The content area (router outlet) takes up the remaining space to the right of the sidebar

### Routing Configuration

- [ ] `app.routes.ts` defines a route for `/login` (can point to a placeholder component)
- [ ] `app.routes.ts` defines a route for `/board` (can point to a placeholder component)
- [ ] `app.routes.ts` defines a wildcard redirect from `` (empty path) to `/login`
- [ ] When navigating to `http://localhost:4200/`, the browser URL changes to `http://localhost:4200/login`
- [ ] When manually navigating to `http://localhost:4200/board`, the board route loads without error
- [ ] The shell layout (navbar + sidebar) remains visible when switching between `/login` and `/board`

### Visual & Responsive Behavior

- [ ] The navbar spans the full width of the viewport
- [ ] The navbar has a minimum height (e.g., 60px) and contains the "KanbAI" text
- [ ] The sidebar is visible on desktop viewports (width >= 768px)
- [ ] The layout uses Flexbox or CSS Grid to position navbar, sidebar, and content area
- [ ] No visual overlap occurs between navbar, sidebar, and content area
- [ ] The content area (router outlet) is scrollable if content exceeds viewport height

### Error Handling & Edge Cases

- [ ] If a user navigates to an undefined route (e.g., `/invalid`), no console errors occur (though a 404 or redirect is acceptable)
- [ ] The shell component does not break if the router outlet has no active route
- [ ] All components are standalone (no NgModules required)

### Technical Validation

- [ ] `npm run build` completes successfully with no errors
- [ ] `npm run test` runs without failing due to the new components
- [ ] All new components follow Angular naming conventions (e.g., `shell.component.ts`, `navbar.component.ts`)
- [ ] Components use `ChangeDetectionStrategy.OnPush` where appropriate
- [ ] No hardcoded styles in TypeScript files (styles in `.scss` or Tailwind classes only)

---

## Notes for Engineering

- **Styling Approach:** Use Tailwind CSS utility classes for layout. Custom SCSS is acceptable for complex component-specific styles.
- **Component Location:** Suggest placing shell, navbar, and sidebar in `src/app/core/layout/` or `src/app/shell/` to keep core UI structure organized.
- **Placeholder Components:** For `/login` and `/board` routes, simple placeholder components with text like "Login Page" and "Board Page" are sufficient. These will be replaced in future issues.
- **Accessibility:** Ensure navbar uses semantic HTML (`<nav>` tag) and sidebar uses `<aside>` if it's a navigation menu.
- **Standalone Components:** All new components should be standalone (use `standalone: true` in component metadata).
