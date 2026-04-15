Filename: .ai./.junie/rules/pre-implementation-checklist.md
Activation: By file patterns: docs/handoffs/*.md

# Pre-Implementation Checklist (@rule_pre_impl_checklist)

## When to Use
Run this checklist after reading a `_tech_spec.md` and before creating or modifying any `.ts`, `.html`, or `.scss` files[cite: 411]. The goal is to surface blockers early[cite: 411].

## The Checklist

### 1. Directory Readiness
- Does the target directory exist (e.g., `src/app/features/xyz`)? If not, create it[cite: 413].
- Does the directory follow Angular folder conventions[cite: 414]?

### 2. NPM Dependencies
- For every NPM package the spec assumes is available, check `package.json`[cite: 416].
- If missing, run `npm install {package}` before implementation.

### 3. Naming Conflict Scan
- Does a Component, Service, or Interface with the same name already exist[cite: 419]? 
- If a conflict exists, stop and ask the user to clarify with the Staff Engineer[cite: 421].

### 4. Tech Spec Completeness
- Does the spec provide the exact TypeScript interface signatures[cite: 424]?
- For modified files: does the spec describe exactly where the change goes (e.g., which HTML container, which RxJS pipe)[cite: 428]? If ambiguous, ask[cite: 429].
