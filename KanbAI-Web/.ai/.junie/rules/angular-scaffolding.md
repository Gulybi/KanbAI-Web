Filename: .ai/.junie/rules/angular-scaffolding.md
Activation: Always, or when generating new Angular entities.

# Angular Scaffolding & Setup (@rule_angular_scaffolding)

## When to Use
Read this rule whenever an implementation involves creating new Angular Components, Directives, Pipes, or Services.

## 1. CLI Scaffolding
Whenever possible, use the Angular CLI via the `shell` tool to generate boilerplate. This ensures spec files and correct file naming conventions are handled automatically.
- Component: `ng generate component path/name --standalone`
- Service: `ng generate service path/name`
- Interface: `ng generate interface path/name`

## 2. Standalone Paradigm
Assume all new components, directives, and pipes should be `standalone: true` unless the tech spec explicitly specifies adding them to an `NgModule`.
- When using a standalone component, ensure you add required imports directly to the component's `@Component({ imports: [...] })` array (e.g., `CommonModule`, `ReactiveFormsModule`).

## 3. Post-Generation Routing & Wiring
After generating a component:
- **Routing:** Check if the tech spec requires registering the component in a routes file (e.g., `app.routes.ts`). Add the `path` and `loadComponent` or `component` definition.
- **Exports:** If the component needs to be used in another standalone component, ensure it is correctly exported and imported.

## 4. State Management Integration (NgRx / Signals)
- If the feature requires state management, verify that the necessary Store/State dependencies are injected using the `inject()` function.
- Do not mutate state directly; always dispatch actions or use `signal.set()` / `signal.update()`.
