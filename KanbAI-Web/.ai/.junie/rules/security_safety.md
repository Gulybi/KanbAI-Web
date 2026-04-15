Filename: .ai/.junie/rules/security_safety.md
Activation (JetBrains setting): By file patterns: *.ts, *.html

# Security & Safety Standards (@rule_security_safety)

These rules dictate the security baseline for all development. Security is non-negotiable and must be prioritized in every implementation.

## 1. 🛑 Secret Management
- **No Hardcoded Secrets:** NEVER hardcode passwords, API keys, JWT tokens, or any sensitive data in the source code.
- **Environment Variables:** Load API endpoints and non-sensitive configurations from Angular's `environment.ts` files. (Remember: Angular code runs on the client; true "secrets" should never be placed here).

## 2. 🛡️ Input Validation & XSS Prevention
- **Never Trust Client Input:** All form data must be strictly validated using built-in Angular Reactive Forms validators before leaving the client.
- **XSS Prevention:** NEVER use the `[innerHTML]` binding for user-generated content without passing it through Angular's `DomSanitizer`. Avoid direct DOM manipulation (`ElementRef.nativeElement`).

## 3. 🤐 Data Privacy & Logging
- **No PII in Logs:** Ensure that Personally Identifiable Information (PII) such as passwords, credit card numbers, or sensitive user data is NEVER recorded in frontend console logs.

## 4. 🌐 Web Security (OWASP Basics)
- **Authorization:** Use Angular Route Guards (`CanActivate`, `CanActivateChild`) to protect routes and prevent unauthorized access to protected views.
- **State Protection:** Do not store sensitive DTOs or authorization states in plain `localStorage` without encryption; prefer memory-based state management (NgRx/Signals).
