Filename: .ai/.junie/rules/integration_testing.md
Activation (JetBrains setting): By file patterns: *.cy.ts, *.e2e.ts, *.spec.ts


# Integration & Component Testing Standards (@rule_integration_testing)

These rules apply to Angular component integration tests (`TestBed` / Angular Testing Library) and E2E tests (Cypress / Playwright).

## 1. 🏗️ Standard `TestBed` Pattern
For test classes requiring DOM rendering and service injection, use the following pattern for setting up the Angular `TestBed`:
- **Declarations:** Only declare the component under test. If the component is Standalone, import it directly.
- **Service Mocking:** All services making HTTP calls must be mocked (e.g., providing `HttpClientTestingModule` or custom mock classes in the `providers` array) so integration tests do not wait for network responses.

## 2. 🔑 Authentication Bypass in Tests
Since E2E tests are isolated, avoid repeating the real UI login flow in every single test:
- **E2E (Cypress/Playwright):** Perform login programmatically (e.g., by calling the API endpoint directly), then set the received token in `localStorage` or cookies.
- **State Setup:** Create a dedicated test command (e.g., `cy.login()`) that directly sets the authenticated state so tests can start immediately from protected views.

## 3. 🎯 Intercepting Network Requests
For UI integration testing, use network interception tools (e.g., Cypress `cy.intercept()` or Angular `HttpTestingController`) to simulate various backend responses:
- Return valid DTOs for positive test cases.
- Explicitly return 400/404/500 status codes for negative test cases, and verify that the UI correctly displays the appropriate error messages.
