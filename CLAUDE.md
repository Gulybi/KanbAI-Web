# KanbAI-Web Project Guidelines

This document contains project-specific instructions for Claude Code when working on the KanbAI-Web Angular application.

## Project Overview

This is an Angular frontend application following a structured workflow with clear separation of concerns between Product Management, Architecture, and Development phases.

## Directory Structure

- `docs/handoffs/` - Handoff documents between workflow phases
  - `issue_{N}_context.md` - Business requirements (Product Manager phase)
  - `issue_{N}_tech_spec.md` - Technical specifications (Staff Engineer phase)
  - `issue_{N}_design_spec.md` - Design specifications (Web Designer phase)
  - `backend_api_map.md` - Backend API contracts
- `src/app/` - Angular application source
  - `core/` or `shared/` - Core services, interceptors, shared components
  - `features/` - Feature modules/standalone components
  - `models/` or `types/` - TypeScript interfaces and types
  - `store/` - State management (NgRx/Signals)

## Development Workflow

The project follows a four-phase workflow:

### Phase 1: Product Management (Business Context)
**Goal:** Define WHAT and WHY, not HOW.

When working on new features from GitHub issues:
1. Use the `product-manager` agent to create business context
2. Output: `docs/handoffs/issue_{N}_context.md`
3. Must include: Title, Business Value, Current vs Desired State, Acceptance Criteria

### Phase 2: Technical Architecture (Design)
**Goal:** Design component hierarchy, state management, and data contracts.

When translating business requirements to technical specs:
1. Use the `staff-engineer` agent to create technical specifications
2. Output: `docs/handoffs/issue_{N}_tech_spec.md`
3. Must include: Component Architecture, State Management, Service Integration, Implementation Steps

### Phase 3: UI/UX Design (Visual Specification)
**Goal:** Define unified design system, component styling, and accessibility standards.

When creating visual specifications:
1. Use the `web-designer` agent to create design specifications
2. Output: `docs/handoffs/issue_{N}_design_spec.md`
3. Must include: Design System (colors, typography, spacing), Component Styling (exact SCSS), Responsive Design, Accessibility Compliance

### Phase 4: Implementation (Code)
**Goal:** Write clean, secure, optimized TypeScript/Angular code with proper styling.

When implementing features:
1. Use the `developer` agent to implement code
2. Follow the tech spec AND design spec exactly - don't invent features
3. Run build verification before considering work complete
4. Update tech spec with "Development Status" section

## Coding Standards

### Modern Angular Features
- **Angular 15+:** Use Standalone components, Signals for state management
- **Dependency Injection:** Use `inject()` function over constructor injection
- **YAGNI:** Don't over-engineer - implement only what's specified

### Performance
- **RxJS:** Use for async operations, prefer `async` pipe in templates
- **Memory Management:** Use `takeUntilDestroyed()` or `async` pipe to prevent leaks
- **Change Detection:** Use `ChangeDetectionStrategy.OnPush` when possible

### State Management
- **Signals:** For component-local UI state and simple computed values
- **RxJS:** For async operations, HTTP requests, complex event flows
- **Bridge:** Use `toSignal()` to convert Observables to Signals

### Accessibility (a11y)
- **Semantic HTML:** Use correct tags (`<nav>`, `<main>`, `<button>`)
- **Form Labels:** Every input must have an associated `<label>` or `aria-label`
- **Focus Management:** Ensure logical focus flow and visual distinction

## Security Standards

### Input Validation & XSS
- **Never trust client input:** Validate all form data with Reactive Forms validators
- **XSS Prevention:** Never use `[innerHTML]` for user content without `DomSanitizer`
- **Avoid direct DOM:** Don't manipulate `ElementRef.nativeElement` directly

### Secret Management
- **No hardcoded secrets:** Never commit API keys, tokens, passwords
- **Environment files:** Use `environment.ts` for configuration (remember: client-side is public)

### Authorization
- **Route Guards:** Use `CanActivate`/`CanActivateChild` to protect routes
- **State Protection:** Don't store sensitive data in `localStorage` without encryption

### Logging & Privacy
- **No PII in logs:** Never log passwords, credit cards, or sensitive user data

## Pre-Implementation Checklist

Before writing code, verify:

1. **Directory Readiness**
   - Does the target directory exist? (e.g., `src/app/features/xyz`)
   - Does it follow Angular conventions?

2. **NPM Dependencies**
   - Check `package.json` for required packages
   - Install missing dependencies before implementation

3. **Naming Conflicts**
   - Check for existing Components/Services with the same name
   - Ask user if conflicts exist

4. **Tech Spec Completeness**
   - Are TypeScript interfaces defined?
   - Are modification points clearly specified?
   - If ambiguous, ask for clarification

## Angular Scaffolding Patterns

### Component Generation
```bash
ng generate component features/feature-name/component-name --skip-tests=false
```

### Service Generation
```bash
ng generate service features/feature-name/services/service-name
```

### Interface/Model Generation
Create in `src/app/models/` or `src/app/features/{feature}/models/`

## Build & Test Verification

After implementation:

1. **Build the application:**
   ```bash
   npm run build
   ```
   - Must succeed before proceeding
   - Report file path, line number, and error message for failures

2. **Run test suite:**
   ```bash
   npm run test -- --watch=false
   ```
   - Report: Total, Passed, Failed, Skipped
   - Classify failures: PRE-EXISTING vs INTRODUCED
   - Must fix INTRODUCED failures before completion

3. **Failure Classification:**
   - Test in untouched component → PRE-EXISTING
   - Error references newly created/modified code → INTRODUCED
   - When in doubt → INTRODUCED (safe default)

## Workflow Agents

The project defines specialized agents for different workflow phases. Invoke these using the Agent tool:

### product-manager
Creates business context documents from GitHub issues.

**When to use:** Starting work on a new feature/issue
**Output:** `docs/handoffs/issue_{N}_context.md`

### staff-engineer
Designs technical architecture from business context.

**When to use:** After product-manager creates context document
**Output:** `docs/handoffs/issue_{N}_tech_spec.md`

### developer
Implements code based on technical specifications.

**When to use:** After staff-engineer creates tech spec
**Output:** Angular code files + updated tech spec with status

### codebase-scanner
Discovers and maps Angular architecture (read-only).

**When to use:** Need to understand current architecture before designing changes
**Output:** Structured snapshot of project structure, dependencies, routes

### build-verifier
Executes build and tests, classifies failures.

**When to use:** After code implementation to verify correctness
**Output:** Structured build/test report with failure classification

### backend-api-bridge
Scouts backend API contracts (Controllers, DTOs, Swagger).

**When to use:** Need to understand backend expectations for frontend services
**Output:** `docs/handoffs/backend_api_map.md` with TypeScript-compatible interfaces

### web-designer
Creates unified design system specifications and component styling.

**When to use:** After staff-engineer creates tech spec, before developer implements
**Output:** `docs/handoffs/issue_{N}_design_spec.md` with design tokens, SCSS code, accessibility guidelines

## Agent Invocation Examples

```typescript
// Product Manager Phase
Agent({
  description: "Create business context",
  subagent_type: "product-manager",
  prompt: "Create business context document for GitHub issue #42. The issue is about adding a user dashboard with real-time notifications."
})

// Staff Engineer Phase
Agent({
  description: "Design technical architecture",
  subagent_type: "staff-engineer",
  prompt: "Read the context document at docs/handoffs/issue_42_context.md and design the technical specification. Focus on component hierarchy and state management for real-time notifications."
})

// Web Designer Phase
Agent({
  description: "Create design specification",
  subagent_type: "web-designer",
  prompt: "Read the tech spec at docs/handoffs/issue_42_tech_spec.md and create a complete design specification. Define color palette, typography, spacing, and provide exact SCSS code for all components. Ensure WCAG AA compliance."
})

// Developer Phase
Agent({
  description: "Implement feature",
  subagent_type: "developer",
  prompt: "Implement the feature described in docs/handoffs/issue_42_tech_spec.md using the styling from docs/handoffs/issue_42_design_spec.md. Follow both specifications exactly."
})

// Codebase Scanner
Agent({
  description: "Scan Angular architecture",
  subagent_type: "codebase-scanner",
  prompt: "Map the current Angular architecture focusing on the features/ directory, routing structure, and state management approach."
})

// Build Verifier
Agent({
  description: "Verify build and tests",
  subagent_type: "build-verifier",
  prompt: "Run the build and test suite. Classify any failures as PRE-EXISTING or INTRODUCED based on the files modified in the last commit."
})
```

## Critical Constraints

### Product Manager Agent
- ❌ DO NOT write implementation code
- ❌ DO NOT design technical architecture
- ✅ Focus on WHAT and WHY, not HOW

### Staff Engineer Agent
- ❌ DO NOT write concrete implementation code
- ✅ Design component hierarchy, state management, data contracts
- ✅ Provide exact TypeScript interfaces

### Web Designer Agent
- ❌ DO NOT write component logic or business logic
- ❌ DO NOT design technical architecture
- ✅ Define design system (colors, typography, spacing)
- ✅ Provide exact SCSS code for all components
- ✅ Ensure WCAG AA accessibility compliance
- ✅ Define responsive breakpoints and mobile-first design

### Developer Agent
- ❌ DO NOT invent features beyond the tech spec
- ❌ DO NOT invent styles beyond the design spec
- ❌ DO NOT guess when spec is ambiguous
- ✅ Implement exactly what's specified in both tech and design specs
- ✅ Fix introduced test failures before completion
- ✅ Ask for clarification if spec is unclear

### Codebase Scanner Agent
- ❌ DO NOT write code
- ❌ DO NOT design architecture
- ✅ Return structured facts only
- ✅ Read-only operations

### Build Verifier Agent
- ❌ DO NOT fix code
- ✅ Report results only
- ✅ Classify failures accurately

## Integration Testing Patterns

- Mock external dependencies (HTTP services, third-party APIs)
- Use Angular's `HttpClientTestingModule` for HTTP mocking
- Test component behavior, not implementation details
- Focus on user interactions and expected outcomes

## Performance Metrics

- Lazy load feature modules where possible
- Use trackBy functions in `*ngFor` loops
- Minimize bundle size - analyze with `ng build --stats-json`
- Optimize images and assets
- Use pure pipes for transformations

## When to Use Which Agent

| Scenario | Agent | Why |
|----------|-------|-----|
| New GitHub issue assigned | product-manager | Need business context |
| Context doc exists, need architecture | staff-engineer | Need technical design |
| Tech spec exists, need visual design | web-designer | Need styling specification |
| Design spec exists, ready to code | developer | Ready for implementation |
| Don't understand current structure | codebase-scanner | Need architecture map |
| Code written, need to verify | build-verifier | Ensure build passes |
| Need backend contract details | backend-api-bridge | Ensure API compatibility |

## Response Format Guidelines

### For Product Manager
End with: *"The business context is defined and saved. You can now instruct the staff-engineer agent to read the context note and design the frontend technical specification."*

### For Staff Engineer
End with: *"The technical specification is saved. You can now instruct the web-designer agent to create the design specification."*

### For Web Designer
End with: *"The design specification is saved. You can now instruct the developer agent to implement the feature using both the technical spec and design spec."*

### For Developer
End with: *"Development is complete and files are saved. You can now instruct QA to review the implementation and write automated tests."*

## Obstacle Escalation

- **Pre-existing test breaks:** Fix the regression before proceeding
- **Missing package/pattern in tech spec:** STOP and ask the user
- **Ambiguous specification:** STOP and ask for clarification
- **Build fails:** Do NOT proceed to next step
- **Introduced test failures:** Fix before marking work complete

## File Modification Protocol

- **Prefer Edit over Write:** Use Edit tool for existing files (sends only diff)
- **Use Write for new files:** Only for creating new files
- **No chat output of full code:** Physically modify workspace files
- **Update handoff notes:** Append status sections to tech specs after implementation

## Testing Philosophy

- Write tests for new components/services
- Fix tests that break due to your changes
- Don't worry about pre-existing failures (but document them)
- Unit tests for component logic
- Integration tests for service interactions
- E2E tests for critical user flows

## Git Commit Guidelines

After completing a workflow phase:
1. Stage only relevant files
2. Write clear commit messages explaining WHY
3. Reference issue numbers: `feat: add user dashboard (#42)`
4. Don't commit generated files or node_modules
5. Include "Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
