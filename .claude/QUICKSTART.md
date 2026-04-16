# Quick Start Guide

## TL;DR - How to Use These Agents

### Starting a New Feature

```javascript
// 1. Create business context from GitHub issue
Agent({
  description: "Create business context",
  subagent_type: "product-manager",
  prompt: "Create business context for GitHub issue #42."
})

// 2. Design technical architecture
Agent({
  description: "Design architecture",
  subagent_type: "staff-engineer",
  prompt: "Read docs/handoffs/issue_42_context.md and create tech spec."
})

// 3. Implement the code
Agent({
  description: "Implement feature",
  subagent_type: "developer",
  prompt: "Implement feature from docs/handoffs/issue_42_tech_spec.md."
})
```

That's it! Each agent creates handoff documents for the next phase.

## Agent Cheat Sheet

| Agent | Does What | Output |
|-------|-----------|--------|
| **product-manager** | GitHub issue → Business requirements | `issue_N_context.md` |
| **staff-engineer** | Requirements → Technical design | `issue_N_tech_spec.md` |
| **developer** | Tech spec → Working code | Angular files |
| **codebase-scanner** | Maps current architecture | Report |
| **build-verifier** | Runs build + tests | Pass/fail report |
| **backend-api-bridge** | Backend → TS interfaces | `backend_api_map.md` |

## When to Use Which Agent

### "I have a GitHub issue to implement"
→ Start with **product-manager**

### "I have business requirements, need architecture"
→ Use **staff-engineer**

### "I have a tech spec, need code"
→ Use **developer**

### "I don't understand the codebase structure"
→ Use **codebase-scanner**

### "Did my code break anything?"
→ Use **build-verifier** (or developer does this automatically)

### "What does the backend API expect?"
→ Use **backend-api-bridge**

## Example: Real Feature Development

**Scenario:** GitHub issue #42 - "Add real-time notification panel"

### Phase 1: Business Context (2 min)
```javascript
Agent({
  description: "Create business context",
  subagent_type: "product-manager",
  prompt: "Create business context for issue #42: Add real-time notification panel with unread count and mark-as-read functionality."
})
```

**Output:** `docs/handoffs/issue_42_context.md`
- Business value
- Current vs desired state
- Acceptance criteria

### Phase 2: Technical Design (5 min)
```javascript
Agent({
  description: "Design architecture",
  subagent_type: "staff-engineer",
  prompt: "Read docs/handoffs/issue_42_context.md. Design technical spec with component hierarchy, state management (use Signals), and HTTP service integration."
})
```

The staff-engineer will:
1. Invoke **codebase-scanner** to understand current structure
2. Invoke **backend-api-bridge** if backend APIs needed
3. Create `docs/handoffs/issue_42_tech_spec.md`

**Output:** `docs/handoffs/issue_42_tech_spec.md`
- Component architecture (Smart/Dumb)
- TypeScript interfaces
- State management approach
- Implementation steps

### Phase 3: Implementation (10-20 min)
```javascript
Agent({
  description: "Implement feature",
  subagent_type: "developer",
  prompt: "Implement feature from docs/handoffs/issue_42_tech_spec.md. Follow implementation steps exactly. Run build verification before completion."
})
```

The developer will:
1. Run pre-implementation checklist
2. Generate components/services with `ng generate`
3. Write code following the tech spec
4. Invoke **build-verifier** to ensure no regressions
5. Update tech spec with development status

**Output:**
- `src/app/features/dashboard/` (new components, services)
- `src/app/features/dashboard/models/` (interfaces)
- Updated routing
- Updated tech spec with status

### Phase 4: Review (Manual)
You review the code, test in browser, then commit or request changes.

## Common Patterns

### Understanding Existing Code
```javascript
Agent({
  description: "Scan Angular architecture",
  subagent_type: "codebase-scanner",
  prompt: "Map the features/ directory structure, state management approach, and routing patterns."
})
```

### Checking Build Status
```javascript
Agent({
  description: "Verify build",
  subagent_type: "build-verifier",
  prompt: "Run build and tests. I modified DashboardComponent."
})
```

### Understanding Backend API
```javascript
Agent({
  description: "Map backend API",
  subagent_type: "backend-api-bridge",
  prompt: "Scout backend endpoints at http://localhost:3000/api-docs. Focus on /notifications endpoints."
})
```

## Workflow Tips

### ✅ Do This
- Let agents complete their phase before moving to next
- Review handoff documents between phases
- Ask agents for clarification if spec is unclear
- Use codebase-scanner before designing new features

### ❌ Don't Do This
- Skip phases (PM → Developer directly)
- Modify tech spec without updating code to match
- Ignore build failures
- Force agents to proceed when they ask for clarification

## Agent Communication

Agents communicate via files:
- **product-manager** writes `issue_N_context.md`
- **staff-engineer** reads context, writes `issue_N_tech_spec.md`
- **developer** reads tech spec, writes code, updates tech spec
- **codebase-scanner** writes structured report (ephemeral)
- **build-verifier** writes structured report (ephemeral)
- **backend-api-bridge** writes `backend_api_map.md`

## Troubleshooting

### "Agent is asking me questions"
Good! Agents stop when specs are unclear. Answer the question and they'll continue.

### "Build verifier says I have INTRODUCED failures"
Fix the test failures before proceeding. The agent will tell you which tests failed.

### "I want to skip the PM phase"
You can! Manually create `issue_N_context.md` or go straight to staff-engineer with full requirements.

### "Agent created wrong file structure"
Check the tech spec - the structure is defined there. If tech spec is wrong, regenerate it.

## Advanced Usage

### Parallel Development
Multiple developers working on different features:
```
Feature A: issue_100_context.md → issue_100_tech_spec.md → code
Feature B: issue_101_context.md → issue_101_tech_spec.md → code
```

Each feature has isolated handoff documents.

### Incremental Features
Building on existing work:
```javascript
Agent({
  description: "Extend feature",
  subagent_type: "staff-engineer",
  prompt: "Read docs/handoffs/issue_42_tech_spec.md (existing). Design extension for real-time WebSocket support. Update the same tech spec."
})
```

### Quick Fixes (Skip PM Phase)
For bug fixes or small changes:
```javascript
Agent({
  description: "Fix bug",
  subagent_type: "developer",
  prompt: "Fix bug #45: notification count not updating. The issue is in DashboardComponent line 67. Update the computed signal to properly filter unread notifications."
})
```

## Full Documentation

- [CLAUDE.md](../CLAUDE.md) - Complete project guidelines
- [.claude/README.md](README.md) - Agent reference documentation
- [.claude/agents/](agents/) - Individual agent definitions

## Next Steps

1. Read [CLAUDE.md](../CLAUDE.md) for coding standards
2. Try invoking **codebase-scanner** to understand the current project
3. Pick a GitHub issue and run the full PM → Engineer → Developer workflow
4. Review the generated code and handoff documents

Happy coding! 🚀
