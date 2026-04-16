# Claude Code Agents for KanbAI-Web

This directory contains Claude Code-compatible agent definitions for the KanbAI-Web Angular project.

## Overview

These agents follow a structured workflow for Angular feature development:

**Product Manager** → **Staff Engineer** → **Developer** → **Build Verifier**

Supporting agents: **Codebase Scanner**, **Backend API Bridge**

## Project Guidelines

See [CLAUDE.md](../CLAUDE.md) in the project root for complete project guidelines, coding standards, and workflow documentation.

## Available Agents

### 1. product-manager
**Purpose:** Create business context from GitHub issues

**When to use:** Starting work on a new feature

**Output:** `docs/handoffs/issue_{N}_context.md` with:
- Business value and requirements
- Current vs desired state
- Acceptance criteria

**Invocation:**
```javascript
Agent({
  description: "Create business context",
  subagent_type: "product-manager",
  prompt: "Create business context document for GitHub issue #42."
})
```

### 2. staff-engineer
**Purpose:** Design technical architecture from business context

**When to use:** After product-manager creates context document

**Output:** `docs/handoffs/issue_{N}_tech_spec.md` with:
- Component architecture
- TypeScript interfaces
- State management approach
- Implementation steps

**Invocation:**
```javascript
Agent({
  description: "Design technical architecture",
  subagent_type: "staff-engineer",
  prompt: "Read docs/handoffs/issue_42_context.md and design the technical specification."
})
```

### 3. developer
**Purpose:** Implement code from technical specification

**When to use:** After staff-engineer creates tech spec

**Output:** 
- Angular component/service files
- Updated tech spec with development status

**Invocation:**
```javascript
Agent({
  description: "Implement feature",
  subagent_type: "developer",
  prompt: "Implement the feature specified in docs/handoffs/issue_42_tech_spec.md."
})
```

### 4. codebase-scanner
**Purpose:** Map current Angular architecture (read-only)

**When to use:** 
- Before designing architecture (staff-engineer needs context)
- Understanding current project structure
- Discovering existing patterns

**Output:** Structured report with:
- Dependencies and versions
- Component/service structure
- Routing patterns
- State management approach

**Invocation:**
```javascript
Agent({
  description: "Scan Angular architecture",
  subagent_type: "codebase-scanner",
  prompt: "Map the current Angular architecture. Focus on features/ directory and state management."
})
```

### 5. build-verifier
**Purpose:** Execute build and tests, classify failures

**When to use:**
- After implementing code
- Before marking work complete
- Verifying no regressions introduced

**Output:** Structured report with:
- Build status
- Test results
- Failure classification (PRE-EXISTING vs INTRODUCED)
- Recommended action

**Invocation:**
```javascript
Agent({
  description: "Verify build and tests",
  subagent_type: "build-verifier",
  prompt: "Run build and test suite. I modified DashboardComponent and NotificationService."
})
```

### 6. backend-api-bridge
**Purpose:** Scout backend API contracts (read-only)

**When to use:**
- Before designing frontend services
- Need to understand backend DTOs
- Mapping Swagger/OpenAPI to TypeScript

**Output:** `docs/handoffs/backend_api_map.md` with:
- HTTP endpoints
- Request/response interfaces
- TypeScript-compatible types

**Invocation:**
```javascript
Agent({
  description: "Fetch backend contracts",
  subagent_type: "backend-api-bridge",
  prompt: "Scout the backend /api/notifications endpoints. Translate DTOs to TypeScript interfaces."
})
```

### 7. qa-tester
**Purpose:** Write comprehensive test suites for components and services

**When to use:**
- After developer implements code
- Before marking feature complete
- Need to ensure test coverage and quality

**Output:** Test files (`.spec.ts`) with:
- Unit tests for components/services
- Integration tests for user flows
- Coverage report (>80% target)
- Acceptance criteria verification

**Invocation:**
```javascript
Agent({
  description: "Write test suite",
  subagent_type: "qa-tester",
  prompt: "Create comprehensive test suite for dashboard feature. Read docs/handoffs/issue_42_tech_spec.md for requirements. Cover all acceptance criteria and ensure >80% coverage."
})
```

## Typical Workflow

### Scenario: New Feature from GitHub Issue

```javascript
// Step 1: Create business context
Agent({
  description: "Create business context",
  subagent_type: "product-manager",
  prompt: "Create business context for GitHub issue #42: Add user notification panel."
})

// Wait for completion, review context document

// Step 2: Design technical architecture
Agent({
  description: "Design architecture",
  subagent_type: "staff-engineer",
  prompt: "Read docs/handoffs/issue_42_context.md and design technical spec. Use codebase-scanner to understand current structure."
})

// staff-engineer will internally invoke codebase-scanner and backend-api-bridge as needed

// Wait for completion, review tech spec

// Step 3: Implement feature
Agent({
  description: "Implement feature",
  subagent_type: "developer",
  prompt: "Implement feature from docs/handoffs/issue_42_tech_spec.md. Follow implementation steps exactly."
})

// developer will internally invoke build-verifier after implementation

// Wait for completion, review code changes

// Step 4: Write tests
Agent({
  description: "Write test suite",
  subagent_type: "qa-tester",
  prompt: "Create comprehensive test suite for dashboard feature. Read docs/handoffs/issue_42_tech_spec.md for requirements and acceptance criteria. Ensure coverage >80%."
})

// Wait for completion, review tests and coverage

// Step 5: Manual QA and code review by human
```

## Agent Characteristics

| Agent | Reads Code | Writes Code | Invokes Other Agents | Output Format |
|-------|------------|-------------|----------------------|---------------|
| product-manager | ✅ | ❌ | ❌ | Markdown doc |
| staff-engineer | ✅ | ❌ | ✅ (scanner, bridge) | Markdown doc |
| developer | ✅ | ✅ | ✅ (build-verifier) | Code files + doc update |
| qa-tester | ✅ | ✅ (tests only) | ❌ | Test files + coverage report |
| codebase-scanner | ✅ | ❌ | ❌ | Structured report |
| build-verifier | ❌ | ❌ | ❌ | Structured report |
| backend-api-bridge | ✅ | ❌ | ❌ | Markdown doc |

## Coding Standards (Applied by Developer Agent)

### Modern Angular (v15+)
- Standalone components (no NgModules)
- `inject()` function over constructor injection
- Signals for UI state
- RxJS for async operations
- `OnPush` change detection

### State Management
- **Signals:** Component-local state, computed values
- **RxJS:** HTTP calls, event streams, complex flows
- **Bridge:** `toSignal()` to convert Observables

### Security
- No hardcoded secrets
- Input validation with Reactive Forms
- No `[innerHTML]` without `DomSanitizer`
- Route guards for protected routes
- No PII in logs

### Accessibility
- Semantic HTML (`<nav>`, `<main>`, `<button>`)
- Form labels (explicit or `aria-label`)
- Keyboard navigation
- Focus management

### Performance
- `trackBy` in `*ngFor`
- Lazy loading for feature modules
- `takeUntilDestroyed()` for subscription cleanup

## Critical Constraints

### Product Manager Agent
- ❌ No code implementation
- ❌ No technical architecture
- ✅ Focus on WHAT and WHY

### Staff Engineer Agent
- ❌ No concrete code implementation
- ✅ Design architecture, interfaces, steps
- ✅ Can invoke codebase-scanner and backend-api-bridge

### Developer Agent
- ❌ No feature invention beyond spec
- ❌ No guessing when spec is unclear
- ✅ Ask user for clarification
- ✅ Fix introduced test failures
- ✅ Invoke build-verifier before completion

### Codebase Scanner Agent
- ❌ No code writing
- ❌ No architecture design
- ✅ Read-only operations
- ✅ Return structured facts

### Build Verifier Agent
- ❌ No code fixes
- ✅ Report results only
- ✅ Classify failures accurately

### Backend API Bridge Agent
- ❌ No frontend code
- ❌ No backend business logic
- ✅ Focus on Controllers/DTOs/Swagger
- ✅ Translate types to TypeScript

## File Locations

### Handoff Documents
- `docs/handoffs/issue_{N}_context.md` - Business requirements
- `docs/handoffs/issue_{N}_tech_spec.md` - Technical design
- `docs/handoffs/backend_api_map.md` - Backend API contracts

### Angular Source
- `src/app/features/` - Feature components
- `src/app/core/` - Core services, interceptors
- `src/app/shared/` - Shared components
- `src/app/models/` - TypeScript interfaces
- `src/app/store/` - State management

## Tools Used by Agents

| Agent | Bash | Read | Write | Edit | Glob | Grep | Agent (sub) |
|-------|------|------|-------|------|------|------|-------------|
| product-manager | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| staff-engineer | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| developer | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| codebase-scanner | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| build-verifier | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| backend-api-bridge | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |

## Pre-Implementation Checklist (Developer Agent)

Before writing code:
1. ✅ Target directory exists or created
2. ✅ Required NPM packages installed
3. ✅ No naming conflicts with existing components
4. ✅ Tech spec provides complete TypeScript interfaces
5. ✅ Modification points clearly specified

## Post-Implementation Validation (Developer Agent)

Before marking complete:
1. ✅ Build succeeds
2. ✅ Tests pass (or only PRE-EXISTING failures)
3. ✅ Code follows standards (inject, Signals, OnPush)
4. ✅ Security guidelines followed
5. ✅ Implementation matches spec exactly
6. ✅ No extra features added
7. ✅ Tech spec updated with development status

## Troubleshooting

### Agent not found
Ensure you're using the exact agent name:
- `product-manager` (not `product_manager` or `ProductManager`)
- `staff-engineer` (not `staff_engineer`)
- `codebase-scanner` (not `codebase_scanner`)

### Agent output too verbose
- Codebase scanner: Specify focus area in prompt
- Build verifier: Only returns actionable info (not full logs)

### Agent asks for clarification
This is intentional! Agents stop when:
- Spec is ambiguous
- File doesn't exist when expected
- Package is missing

Provide the requested information and the agent will continue.

## Differences from `.ai/.junie/` Agents

The original `.ai/.junie/` agents were designed for a different AI assistant (Cursor/JetBrains). Key differences:

| Feature | .junie | .claude |
|---------|--------|---------|
| Tool syntax | `shell`, `StrReplace`, `explore` | `Bash`, `Edit`, `Grep` |
| Activation | File patterns, `@agent_name` | Explicit `Agent()` calls |
| Sub-agents | Manual invocation | Automatic when needed |
| Format | IDE-specific | Claude Code compatible |

The `.claude/` agents maintain the same workflow philosophy but use Claude Code's tool ecosystem.

## Contributing

When adding new agents:
1. Add frontmatter with `model: sonnet`
2. Define clear constraints (DO NOT / DO)
3. Specify exact workflow steps
4. List tools the agent should use
5. Provide invocation examples
6. Update this README

## Support

For issues with:
- **Agents themselves:** Check agent file in `.claude/agents/`
- **Coding standards:** See [CLAUDE.md](../CLAUDE.md)
- **Project structure:** See [CLAUDE.md](../CLAUDE.md)
- **Original workflow:** See `.ai/.junie/` for reference
