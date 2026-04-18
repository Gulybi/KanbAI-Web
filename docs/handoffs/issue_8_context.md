# Feature: Install Angular CDK for Drag and Drop

**GitHub Issue:** #8  
**Milestone:** None specified  
**Related Issues:** Prerequisite for Kanban board implementation

## Business Value

**Who is this for?**  
- Development team preparing to build the KanbAI Kanban board application
- End users who will interact with drag-and-drop functionality for managing tasks

**Why is it valuable?**  
Angular CDK (Component Dev Kit) provides battle-tested, accessible drag-and-drop primitives that integrate seamlessly with Angular's change detection and component lifecycle. It eliminates the need to write custom drag-and-drop logic, reducing implementation time and preventing common accessibility and UX pitfalls.

**What problem does it solve?**  
Building accessible, performant drag-and-drop from scratch is complex and error-prone. Angular CDK provides:
- Keyboard navigation (Space/Enter to pick up, Arrow keys to move, Escape to cancel)
- Screen reader announcements for accessibility
- Touch device support
- Automatic scroll-on-drag for long lists
- Drop zone visual feedback
- Reordering animations

Without CDK, implementing these features manually would take weeks and likely miss edge cases.

## Current State

**Current Project Structure:**
- Angular v21.2.0 application
- No drag-and-drop dependencies installed
- Project initialized with basic routing and HTTP interceptors (Issue #7)
- Core infrastructure in place: `src/app/core/interceptors/`
- No feature modules yet (empty `features/` directory to be created)

**Current Dependency Manifest (`KanbAI-Web/package.json`):**
```json
{
  "dependencies": {
    "@angular/common": "^21.2.0",
    "@angular/compiler": "^21.2.0",
    "@angular/core": "^21.2.0",
    "@angular/forms": "^21.2.0",
    "@angular/platform-browser": "^21.2.0",
    "@angular/router": "^21.2.0",
    "rxjs": "~7.8.0",
    "tslib": "^2.3.0"
  }
}
```

**Current Behavior:**  
The application has no drag-and-drop capability. No CDK dependencies are available.

## Desired State

**Expected Package Installation:**
- `@angular/cdk` package added to `dependencies` in `package.json`
- Version should align with Angular core version (^21.0.0 range)
- Package installed in `node_modules/`
- TypeScript types available for IDE autocomplete

**Expected Behavior After Installation:**
- Developers can import CDK modules: `import { DragDropModule } from '@angular/cdk/drag-drop';`
- TypeScript recognizes CDK types: `CdkDragDrop`, `moveItemInArray`, etc.
- Application continues to build and run without errors
- No runtime errors from version mismatches

**Version Compatibility Requirement:**
- Angular CDK version must match Angular core major version
- For Angular 21.x, use `@angular/cdk@^21.0.0`
- Verify compatibility on [Angular CDK releases](https://github.com/angular/components/releases)

## Milestone Context

**Prerequisite Issues:**
- #7 - Setup Global HttpClient and Interceptor Skeleton - ✅ COMPLETE (per tech spec)

**Downstream Issues:**
- Kanban board implementation (not yet created)
- Card drag-and-drop functionality (future)
- List reordering features (future)

**Related Work:**
- This is a foundational dependency for all future drag-and-drop features
- CDK also provides other primitives (virtual scrolling, accessibility utilities) that may be useful later

## Acceptance Criteria

- [ ] `@angular/cdk` package is listed in `dependencies` section of `KanbAI-Web/package.json`
- [ ] Package version is compatible with Angular 21.2.0 (e.g., `^21.0.0` or `~21.2.0`)
- [ ] `npm install` completes successfully with no peer dependency conflicts
- [ ] `@angular/cdk` directory exists in `node_modules/` after installation
- [ ] Application builds successfully with `npm run build` (no TypeScript errors)
- [ ] Application starts successfully with `npm start` (no runtime errors)
- [ ] TypeScript autocomplete works for CDK imports (e.g., `import { DragDropModule } from '@angular/cdk/drag-drop';` shows no red underlines in IDE)
- [ ] Existing tests continue to pass with `npm run test` (no new failures introduced)
- [ ] `package-lock.json` is updated with CDK dependency tree

**Non-Functional Requirements:**
- Installation completes in under 2 minutes on standard broadband
- Bundle size increase is under 100KB for drag-drop module (CDK is tree-shakeable)
- No security vulnerabilities introduced (check with `npm audit`)

## Implementation Notes

**Technical Considerations:**
- CDK is modular - only import modules you need (e.g., `DragDropModule` for drag-drop, `A11yModule` for accessibility)
- CDK requires Angular core as a peer dependency (already satisfied)
- CDK uses `@angular/common` and `rxjs` (already installed)

**Post-Installation Verification:**
```bash
# Verify installation
npm list @angular/cdk

# Expected output:
# kanb-ai-web@0.0.0 C:\temp\KanbAI-Web\KanbAI-Web
# └── @angular/cdk@21.x.x
```

**Future Usage Pattern (not part of this issue):**
```typescript
// In a future Kanban component
import { DragDropModule } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-kanban-board',
  imports: [DragDropModule],
  template: `
    <div cdkDropList>
      <div *ngFor="let item of items" cdkDrag>{{ item }}</div>
    </div>
  `
})
export class KanbanBoardComponent { }
```

## Edge Cases & Error Handling

**Scenario: Version Mismatch**
- If Angular core is 21.x but CDK is 20.x, peer dependency warnings appear
- Resolution: Install CDK version matching Angular core major version

**Scenario: Network Failure**
- If `npm install` fails due to network issues, retry with `npm install --verbose`
- Alternative: Use `npm install --registry=https://registry.npmmirror.com` (China mirror)

**Scenario: Existing CDK Installation (stale version)**
- If CDK is already installed but outdated, run `npm install @angular/cdk@latest`
- Verify no breaking changes between versions

**Scenario: Package Lock Conflicts**
- If `package-lock.json` has conflicts, delete it and `node_modules/`, then re-run `npm install`
- Commit the new `package-lock.json` after verification

## Dependencies & Prerequisites

**Required:**
- Node.js v20+ (already available - used for initial project setup)
- npm v9+ (specified in `package.json`: `packageManager: "npm@11.11.0"`)
- Angular v21.2.0 (already installed)

**No additional prerequisites needed.**

## Definition of Done

This feature is complete when:
1. A developer can import CDK modules without TypeScript errors
2. Application builds and runs without errors
3. Existing tests pass without new failures
4. `package.json` and `package-lock.json` are committed to Git

---

**Next Step:** Pass this context document to the `staff-engineer` agent to create the technical specification for package installation and verification.
