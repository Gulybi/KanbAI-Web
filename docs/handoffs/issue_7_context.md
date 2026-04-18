# Feature: Global HTTP Client and Interceptor Infrastructure

**GitHub Issue:** #7  
**Milestone:** Angular Frontend Foundations

## Business Value

This foundational infrastructure enables the Angular application to communicate with backend APIs in a standardized, secure, and maintainable way. 

**Who is this for?**  
- Frontend developers building features that consume backend APIs
- Security and DevOps teams requiring centralized authentication and error handling
- End users who will benefit from consistent error messaging and improved security

**Why is it valuable?**  
- **Security:** Centralizes JWT token attachment for all API requests, preventing auth token duplication across services
- **Maintainability:** Provides a single point of control for HTTP configuration (base URLs, headers, timeouts)
- **User Experience:** Enables global error handling (401 redirects, friendly error messages, retry logic)
- **Developer Experience:** Simplifies service creation—developers won't need to manually attach auth headers

**What problem does it solve?**  
Without this infrastructure, every HTTP service would need to:
- Manually attach authentication tokens
- Handle errors inconsistently
- Duplicate retry logic and timeout configuration
- Risk security vulnerabilities from missing auth headers

## Current State

**Current HTTP Configuration:**  
- Location: `KanbAI-Web/src/app/app.config.ts`
- Current providers: `provideBrowserGlobalErrorListeners()`, `provideRouter(routes)`
- **Missing:** `provideHttpClient()` is NOT configured
- **Missing:** No interceptor infrastructure exists
- **Missing:** No `core/` folder structure for shared services

**Current Project Structure:**
```
KanbAI-Web/src/app/
├── app.config.ts       (Application configuration - needs HTTP client setup)
├── app.routes.ts       (Routing configuration)
├── app.ts              (Root component)
├── app.html            (Root template)
├── app.spec.ts         (Root component tests)
└── [NO core/ folder]   (Needs to be created)
```

**Current Behavior:**  
- The application cannot make HTTP requests to backend APIs
- No centralized authentication mechanism exists
- No global error handling for API failures

## Desired State

**Expected Configuration:**  
- `provideHttpClient()` added to `app.config.ts` providers array
- HTTP interceptor registered via `withInterceptors()` or `provideHttpClient(withInterceptors([...]))`

**Expected Project Structure:**
```
KanbAI-Web/src/app/
├── core/
│   └── interceptors/
│       └── auth.interceptor.ts    (Placeholder interceptor)
└── app.config.ts                  (Updated with HTTP client config)
```

**Expected Behavior:**  
- Application can make HTTP requests using `HttpClient` in services
- A placeholder interceptor is registered and executes on all outgoing requests
- The interceptor logs requests (temporary) and passes them through unchanged
- The interceptor is structured to later attach JWT tokens from storage
- The interceptor is structured to later handle 401/403/500 errors globally

**Expected Developer Flow:**  
1. Developer creates a service that injects `HttpClient`
2. Developer makes an API call: `http.get('/api/users')`
3. The request automatically passes through the registered interceptor
4. (Future) The interceptor attaches `Authorization: Bearer <token>` header
5. (Future) If the API returns 401, the interceptor redirects to login

## Milestone Context

**Milestone:** Angular Frontend Foundations  
This issue is part of the foundational infrastructure setup. Other issues in this milestone may depend on this HTTP infrastructure.

**Prerequisite Issues:**  
- None identified (this is a foundational setup task)

**Downstream Issues:**  
- Any feature requiring API communication will depend on this setup
- Authentication/login features will extend this interceptor to attach tokens
- Data services (user service, board service, etc.) will use `HttpClient` configured here

**Related Work:**  
- Once this infrastructure is in place, developers can create services in `src/app/core/services/` or feature-specific services
- The interceptor will later integrate with authentication state management (NgRx/Signals)

## Acceptance Criteria

### HTTP Client Configuration
- [ ] `provideHttpClient()` is added to the `providers` array in `app.config.ts`
- [ ] The application builds successfully with `npm run build`
- [ ] No console errors related to missing `HttpClient` provider appear when the app runs

### Interceptor Infrastructure
- [ ] A `core/interceptors/` directory exists at `src/app/core/interceptors/`
- [ ] An `auth.interceptor.ts` file exists in the interceptors directory
- [ ] The interceptor exports a function compatible with Angular's functional interceptor API
- [ ] The interceptor is registered in `app.config.ts` via `withInterceptors([authInterceptor])`
- [ ] The interceptor includes placeholder comments indicating where JWT logic will be added
- [ ] The interceptor includes placeholder comments indicating where error handling will be added

### Functional Verification
- [ ] When any HTTP request is made, the interceptor function executes (verifiable via console log or debugger)
- [ ] The interceptor passes requests through unchanged (no modifications to headers/body yet)
- [ ] HTTP requests to mock endpoints (e.g., `http.get('https://jsonplaceholder.typicode.com/posts/1')`) succeed

### Code Quality
- [ ] The interceptor follows Angular functional interceptor syntax (not the deprecated class-based syntax)
- [ ] The interceptor file includes a comment explaining its future purpose
- [ ] No hardcoded credentials, tokens, or API keys exist in the code
- [ ] TypeScript compilation succeeds with no errors

### Testing
- [ ] Existing tests pass: `npm run test -- --watch=false`
- [ ] No new test failures are introduced by this change
- [ ] The interceptor can be unit tested (imports/exports are correct)

## Edge Cases & Error Handling

- **If HttpClient is not provided:** Application should fail at build/runtime with clear error message
- **If interceptor throws an error:** Should not crash the application, request should be aborted gracefully
- **If multiple interceptors are registered:** They should execute in the order registered

## Non-Functional Requirements

- **Performance:** Interceptor should add negligible overhead (<5ms per request)
- **Security:** No sensitive data should be logged to console in production builds
- **Compatibility:** Must work with Angular 15+ standalone component architecture

---

## Notes for Technical Specification

The staff-engineer should address:
- Exact TypeScript interface for the functional interceptor
- How to structure placeholder logic for future JWT attachment
- How to structure placeholder logic for future error handling
- Whether to use `withInterceptors()` or `provideHttpClient(withInterceptors([]))`
- Import paths and module dependencies
