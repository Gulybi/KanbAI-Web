Filename: .ai/.junie/rules/performance_metrics.md
Activation (JetBrains setting): By file patterns: *.ts, *.html, *.scss

# Performance & Efficiency Standards (@rule_performance)

These rules apply to all development activities to ensure the Angular application remains performant, responsive, and maintainable.

## 1. 🚄 Core Web Vitals & Bundle Size
- **Lazy Loading:** All feature modules and large libraries must be lazy-loaded. Use the `loadComponent` or `loadChildren` syntax in the router.
- **Tree Shaking:** Avoid importing entire libraries (e.g., `lodash`, `moment`). Prefer modular imports or native ES6+ features.
- **Third-Party Libraries:** Before adding any dependency, evaluate its size and impact on the bundle.

## 2. ⚡ Rendering Efficiency
- **OnPush Change Detection:** As defined in `@rule_code_standards`, `OnPush` is the default. Avoid "heavy" logic (loops, object creation) inside template-bound getters or methods.
- **Pure Pipes:** Use pure pipes for data transformation in templates to avoid re-calculation on every change detection cycle.
- **`trackBy` for Lists:** Use the `trackBy` function in `*ngFor` (or the `track` block in `@for`) when rendering lists to minimize DOM manipulation.

## 3. 🛡️ Resource Management
- **Image Optimization:** Use modern formats (WebP) and ensure images have explicit `width` and `height` to prevent Layout Shift (CLS).
- **Early Fetching:** Use `PreloadAllModules` or custom preloading strategies for critical paths to improve perceived performance.
- **Web Workers:** For heavy computational tasks (e.g., data processing, encryption), utilize Web Workers to keep the main thread unblocked.

## 4. 📝 Monitoring & Audits
- **Lighthouse:** New features should maintain or improve existing Lighthouse scores.
- **Bundle Analysis:** Run `source-map-explorer` or similar tools periodically to identify bundle bloat.
