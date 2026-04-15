Filename: .ai/.junie/rules/testing_observability.md
Activation (JetBrains setting): By file patterns: *.spec.ts

# Testing & Observability Standards (@rule_testing_observability)

These rules apply when writing automated tests or implementing logging. High test quality and clear observability are critical for long-term maintainability.

## 1. 🧪 Automated Testing (Jasmine / Jest)
- **Framework:** Use the project's built-in testing framework (Jasmine or Jest) for unit tests.
- **Structure (AAA):** Every test MUST follow the Arrange-Act-Assert pattern. Keep these three sections visually separated by blank lines.
- **Test Coverage:** Do not just test the "Happy Path". You must explicitly write tests for edge cases (null inputs, empty arrays) and failure modes (exceptions, 400/404 HTTP responses).

## 2. 🎭 Mocking & Isolation
- **Isolation:** Unit tests must be completely isolated. NEVER call a real backend API in a unit test.
- **Mocking:** Use test doubles (Jasmine Spies or Jest Mocks) to mock dependencies (e.g., `HttpClient`, Angular Services).
- **Setup Specificity:** Be specific when setting up mocks. Verify that expected methods were called with the correct parameters rather than just using generic `any()` matchers.

## 3. 🔭 Client-Side Logging
- **Service over Console:** Avoid raw `console.log()` in production code. Use a dedicated logging service (e.g., `LoggerService` or `NGXLogger`) that handles environment-specific log levels.
- **Log Levels:**
  - `Error`: For unhandled exceptions or critical failures (e.g., backend unreachable).
  - `Warning`: For handled exceptions or unexpected states.
  - `Information`: For significant business events (e.g., "Form submitted successfully").
  - `Debug`: For detailed tracing information used only during development.
