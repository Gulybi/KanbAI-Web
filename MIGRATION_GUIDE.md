# Migration Guide: .junie → .claude Agents

This document explains how the `.ai/.junie/` agents were adapted for Claude Code compatibility.

## Overview

The `.ai/.junie/` agents were designed for Cursor AI / JetBrains IDE integration. The `.claude/` agents maintain the same workflow philosophy but use Claude Code's tool ecosystem.

## Key Differences

### Tool Mapping

| .junie Tool | .claude Tool | Notes |
|-------------|--------------|-------|
| `shell` | `Bash` | Same functionality, different name |
| `StrReplace` | `Edit` | Claude Code's Edit is more powerful |
| `explore` | `Glob` + `Grep` + `Read` | Multiple tools replace single explore |
| `@agent_name` | `Agent({ subagent_type })` | Explicit function call |
| `@skill_name` | `Skill()` or inline | Skills may be agents or inline logic |
| `@rule_name` | Documentation in CLAUDE.md | Rules become guidelines |

### Activation Patterns

**Before (.junie):**
```markdown
Activation: By file patterns: *.ts, *.html
Activation: Manually (when explicitly called) or Model Decision
```

**After (.claude):**
```javascript
// Explicit invocation via Agent tool
Agent({
  description: "Create business context",
  subagent_type: "product-manager",
  prompt: "..."
})
```

### Agent References

**Before (.junie):**
```markdown
Invoke `@agent_staff_engineer` to design the architecture.
Use `@rule_code_standards` when writing code.
Call `@skill_codebase_scanner` to map the structure.
```

**After (.claude):**
```javascript
// Other agents invoked via Agent tool
Agent({
  subagent_type: "staff-engineer",
  prompt: "..."
})

// Rules referenced in CLAUDE.md
// Skills may be agents or inline instructions
```

## Agent-by-Agent Comparison

### Product Manager

#### .junie Version
- Activation: Manual or Model Decision
- Tools: `shell`, `explore`, `StrReplace`
- Output: Markdown file via `StrReplace` append

#### .claude Version
- Activation: Explicit `Agent()` call
- Tools: `Bash` (for `gh` commands), `Glob`, `Grep`, `Read`, `Write`
- Output: Markdown file via `Write` tool

**Workflow Preserved:** ✅
- Still fetches GitHub issue details
- Still explores codebase for current state
- Still creates `issue_N_context.md`
- Still validates acceptance criteria

### Staff Engineer

#### .junie Version
- Activation: Manual
- References: `@skill_codebase_scanner`, `@skill_backend_api_bridge`
- Tools: `StrReplace`, `explore`

#### .claude Version
- Activation: Explicit `Agent()` call
- Sub-agents: Invokes `codebase-scanner`, `backend-api-bridge` via `Agent()`
- Tools: `Read`, `Write`, `Glob`, `Grep`, `Agent`

**Workflow Preserved:** ✅
- Still reads context document
- Still invokes scanner and bridge for research
- Still creates `issue_N_tech_spec.md`
- Still designs TypeScript interfaces

### Developer

#### .junie Version
- Activation: Manual
- Pre-check: `@rule_pre_impl_checklist`
- Verification: `@skill_build_verifier`
- Tools: `shell`, `StrReplace`

#### .claude Version
- Activation: Explicit `Agent()` call
- Pre-check: Inline checklist execution
- Verification: Invokes `build-verifier` via `Agent()`
- Tools: `Bash` (for `ng` commands), `Read`, `Write`, `Edit`, `Agent`

**Workflow Preserved:** ✅
- Still runs pre-implementation checklist
- Still generates components via `ng generate`
- Still invokes build verifier
- Still updates tech spec with status

### Codebase Scanner (Skill → Agent)

#### .junie Version
- Type: Skill (sub-agent)
- Activation: Called by other agents
- Tools: File reading, pattern matching

#### .claude Version
- Type: Agent (specialized)
- Activation: Invoked via `Agent({ subagent_type: "codebase-scanner" })`
- Tools: `Read`, `Glob`, `Grep`

**Workflow Preserved:** ✅
- Still read-only
- Still maps architecture
- Still returns structured snapshot
- Still avoids reading test files

### Build Verifier (Skill → Agent)

#### .junie Version
- Type: Skill (sub-agent)
- Tools: `shell` for build/test commands

#### .claude Version
- Type: Agent (specialized)
- Tools: `Bash` for build/test commands

**Workflow Preserved:** ✅
- Still runs build and tests
- Still classifies failures
- Still returns structured report
- Still filters verbose output

### Backend API Bridge (Skill → Agent)

#### .junie Version
- Type: Skill (sub-agent)
- Tools: File reading, `shell` for curl

#### .claude Version
- Type: Agent (specialized)
- Tools: `Bash` (curl), `Read`, `Glob`, `Grep`, `Write`

**Workflow Preserved:** ✅
- Still scouts backend contracts
- Still translates types to TypeScript
- Still creates `backend_api_map.md`
- Still read-only

## Rules → Guidelines

In .junie, rules were separate files activated by patterns. In .claude, they're consolidated into `CLAUDE.md`.

| .junie Rule | .claude Location | Application |
|-------------|------------------|-------------|
| `@rule_code_standards` | CLAUDE.md § Coding Standards | Developer agent follows |
| `@rule_security_safety` | CLAUDE.md § Security Standards | Developer agent follows |
| `@rule_performance_metrics` | CLAUDE.md § Performance | Developer agent follows |
| `@rule_pre_impl_checklist` | Developer agent § Step 2 | Built into workflow |
| `@rule_angular_scaffolding` | Developer agent § Step 3.2 | Built into workflow |
| `@rule_testing_observability` | CLAUDE.md § Testing Philosophy | Developer agent follows |
| `@rule_integration_testing` | CLAUDE.md § Integration Testing | Developer agent follows |
| `@rule_global_logging` | ❌ Removed | Not needed (git commits serve this) |
| `@rule_acceptance_criteria_quality` | PM agent § Step 4 | Built into workflow |

**Why consolidate?**
- Easier to maintain (one source of truth)
- Agents reference guidelines naturally
- No pattern-based activation needed
- Rules become contextual documentation

## Skills → Agents or Inline

| .junie Skill | .claude Equivalent | Rationale |
|--------------|-------------------|-----------|
| `@skill_codebase_scanner` | `codebase-scanner` agent | Complex enough to warrant agent |
| `@skill_build_verifier` | `build-verifier` agent | Needs bash execution, complex logic |
| `@skill_backend_api_bridge` | `backend-api-bridge` agent | Complex mapping, file creation |
| `@skill_issue_scout` | Inline in PM agent | Simple `gh issue view` command |
| `@skill_test_troubleshooter` | Inline in Developer | Part of fix workflow |
| `@skill_ac_quality` | Inline in PM agent § Step 4 | Validation checklist |

**Decision criteria:**
- **Agent:** Needs multiple steps, tool orchestration, or separate concern
- **Inline:** Simple command or integrated into workflow

## File Structure Comparison

### .junie Structure
```
KanbAI-Web/
├── .ai/
│   └── .junie/
│       ├── agents/
│       │   ├── developer.md
│       │   ├── product_manager.md
│       │   └── staff_engineer.md
│       ├── rules/
│       │   ├── code_standards.md
│       │   ├── security_safety.md
│       │   ├── pre-implementation-checklist.md
│       │   └── ... (9 files total)
│       └── skills/
│           ├── codebase-scanner.md
│           ├── build-verifier.md
│           ├── backend-api-bridge.md
│           └── ... (5 files total)
```

### .claude Structure
```
KanbAI-Web/
├── .claude/
│   ├── README.md (agent reference)
│   ├── QUICKSTART.md (usage guide)
│   └── agents/
│       ├── product-manager.md
│       ├── staff-engineer.md
│       ├── developer.md
│       ├── codebase-scanner.md
│       ├── build-verifier.md
│       └── backend-api-bridge.md
├── CLAUDE.md (project guidelines, consolidated rules)
└── MIGRATION_GUIDE.md (this file)
```

**Simplification:**
- 3 directories → 1 directory
- 17 files → 8 files
- Rules consolidated into CLAUDE.md
- Skills promoted to agents or inlined

## Invocation Examples

### Before (.junie - Cursor/JetBrains)

**In chat:**
```
@agent_product_manager create context for issue #42
```

**In agent file:**
```markdown
Invoke `@agent_staff_engineer` to design the architecture.
Run `@skill_codebase_scanner` to map existing structure.
Follow `@rule_code_standards` when writing code.
```

### After (.claude - Claude Code)

**In chat:**
```javascript
Agent({
  description: "Create business context",
  subagent_type: "product-manager",
  prompt: "Create business context for GitHub issue #42."
})
```

**In agent file:**
```markdown
Agent({
  description: "Scan architecture",
  subagent_type: "codebase-scanner",
  prompt: "Map the current Angular architecture."
})
```

## What Changed, What Didn't

### ✅ Preserved (Core Workflow)

1. **Three-phase workflow:** PM → Architect → Developer
2. **Handoff documents:** context.md and tech_spec.md
3. **Pre-implementation checklist:** Still runs before coding
4. **Build verification:** Still mandatory after coding
5. **Failure classification:** PRE-EXISTING vs INTRODUCED logic
6. **Agent responsibilities:** PM (WHAT/WHY), Architect (HOW), Developer (CODE)
7. **Coding standards:** Angular best practices, security, accessibility
8. **Sub-agent orchestration:** Architect invokes scanner/bridge

### 🔄 Changed (Implementation Details)

1. **Tool names:** shell → Bash, StrReplace → Edit, explore → Glob/Grep
2. **Activation:** Pattern-based → Explicit function calls
3. **Agent references:** @agent_name → Agent({ subagent_type })
4. **Rules location:** Separate files → CLAUDE.md
5. **Skills:** Some promoted to agents, some inlined
6. **File organization:** 3 directories → 1 directory
7. **Logging requirement:** junie_prompts.md → Not needed (git history)

### ❌ Removed

1. **Pattern-based activation:** No longer needed
2. **Global logging rule:** Git commits provide this
3. **Some helper skills:** Inlined into agent workflows
4. **IDE-specific features:** Not applicable to Claude Code

## Migration Checklist

If you're migrating from .junie to .claude:

- [ ] Install Claude Code (CLI, Desktop, or VS Code extension)
- [ ] Read [CLAUDE.md](CLAUDE.md) for project guidelines
- [ ] Review [.claude/QUICKSTART.md](.claude/QUICKSTART.md) for usage
- [ ] Update your workflow to use `Agent()` calls instead of `@agent_name`
- [ ] Reference CLAUDE.md for coding standards (not separate rule files)
- [ ] Invoke sub-agents explicitly via `Agent({ subagent_type })`
- [ ] Keep existing handoff documents in `docs/handoffs/`
- [ ] Continue using same file naming conventions

**Backward compatibility:**
- Handoff documents work with both systems
- File structure (`docs/handoffs/`) unchanged
- Coding standards equivalent
- Workflow philosophy identical

## Why This Migration?

1. **Tool Compatibility:** Claude Code has different tools than Cursor/JetBrains
2. **Simpler Structure:** Consolidated rules, fewer files
3. **Explicit Invocation:** More control over agent execution
4. **Better Documentation:** CLAUDE.md serves as single source of truth
5. **Flexibility:** Easier to add new agents or modify workflows

## FAQ

**Q: Can I use both .junie and .claude?**
A: Yes! They work independently. Use .junie for Cursor/JetBrains, .claude for Claude Code.

**Q: Will my existing handoff documents work?**
A: Yes! Both systems use the same document format and location.

**Q: Do I need to rewrite my coding standards?**
A: No. The standards in CLAUDE.md match .junie rules, just consolidated.

**Q: Can I customize the agents?**
A: Yes! Edit files in `.claude/agents/` to adjust workflows.

**Q: What if I find a bug in an agent?**
A: Open an issue or PR with the fix.

## Next Steps

1. **Try it:** Run the product-manager agent on a test issue
2. **Compare:** Review the output against .junie agent output
3. **Customize:** Adjust agents for your team's specific needs
4. **Document:** Add team-specific guidelines to CLAUDE.md
5. **Iterate:** Improve agents based on real-world usage

## Support

- **Claude Code docs:** Check official documentation
- **.claude agents:** See [.claude/README.md](.claude/README.md)
- **Workflow help:** See [.claude/QUICKSTART.md](.claude/QUICKSTART.md)
- **Original .junie:** Reference files in `.ai/.junie/`

---

**Both systems are valid!** Choose based on your AI assistant:
- **Cursor / JetBrains IDEs** → Use `.ai/.junie/`
- **Claude Code** → Use `.claude/`
