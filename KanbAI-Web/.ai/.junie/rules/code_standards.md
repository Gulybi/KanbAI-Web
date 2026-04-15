Filename: .ai/.junie/rules/code_standards.md
Activation (JetBrains setting): By file patterns: *.ts, *.html, *.scss

# Angular Coding Standards & Best Practices (@rule_code_standards)

These rules dictate how TypeScript/Angular code should be written and structured. They apply strictly to any agent modifying `.ts`, `.html`, or `.scss` files.

## 1. 🏗️ Modern Angular Features & Clean Code
- **Angular 15+ Features:** Always utilize modern Angular capabilities. Prefer Standalone components over NgModules, and use Signals for state management if supported by the project.
- **YAGNI (You Aren't Gonna Need It):** Do not over-engineer. If a feature requires a simple single-method update, do not generate complex design patterns or new layers unless explicitly instructed.
- **Dependency Injection:** Use Angular's built-in DI system, preferably utilizing the modern `inject()` function instead of constructor-based injection. Never instantiate services using the `new` keyword.

## 2. ⚡ Performance & Asynchronous Operations
- **RxJS & Observables:** Prefer RxJS for all asynchronous operations (HTTP calls, event streams).
- **Memory Leak Prevention:** Strictly manage Subscriptions. Use the `async` pipe in templates wherever possible, or the `takeUntilDestroyed()` operator in components.
- **Change Detection:** Whenever possible and permitted by the component's state, use `ChangeDetectionStrategy.OnPush` to prevent unnecessary re-renders.

## 4. ♿ Accessibility (a11y)
- **Semantic HTML:** Always use the correct HTML tags (`<nav>`, `<main>`, `<footer>`, `<button>`). Avoid using `<div>` or `<span>` for interactive elements without correct ARIA roles.
- **Form Controls:** Every form input must have an associated `<label>`. Use `aria-label` or `aria-labelledby` where appropriate.
- **Focus Management:** Ensure the focus state is visually distinct and logically managed during route changes or modal openings.

## 5. 🧠 State Management: Signals vs. RxJS
- **Signals for UI State:** Prefer Signals for component-local state, simple computed values, and data that will be bound to the template (better performance).
- **RxJS for Data Streams:** Use RxJS for asynchronous operations, HTTP requests, debouncing, and complex multi-source event flows.
- **Conversion:** Use `toSignal()` to bridge the gap between HTTP observables and the UI layer.
