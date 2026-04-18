# Technical Specification: Global HTTP Client and Interceptor Infrastructure

**Context Document:** [issue_7_context.md](./issue_7_context.md)  
**GitHub Issue:** #7

## Overview

This foundational infrastructure adds Angular's `HttpClient` provider and a functional HTTP interceptor to the application configuration. The interceptor will serve as a centralized point for attaching authentication headers and handling API errors in future iterations. For this implementation, the interceptor will be a pass-through with placeholder comments indicating where JWT attachment and error handling logic will be added.

## Component Architecture

### Directory Structure Changes

**New Directories to Create:**
```
KanbAI-Web/src/app/
└── core/
    └── interceptors/
```

**New Files to Create:**
- `KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts` - Functional HTTP interceptor

**Files to Modify:**
- `KanbAI-Web/src/app/app.config.ts` - Add HTTP client provider and register interceptor

### Project Structure After Implementation

```
KanbAI-Web/src/app/
├── core/
│   └── interceptors/
│       └── auth.interceptor.ts    ✨ NEW
├── app.config.ts                  ✏️ MODIFIED
├── app.routes.ts
├── app.ts
├── app.html
├── app.css
└── app.spec.ts
```

## State & Data Layer

### HTTP Client Configuration

**File:** `KanbAI-Web/src/app/app.config.ts`

**Current State:**
```typescript
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes)
  ]
};
```

**Desired State:**
```typescript
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([authInterceptor])
    )
  ]
};
```

**Key Changes:**
1. Import `provideHttpClient` and `withInterceptors` from `@angular/common/http`
2. Import the `authInterceptor` function from `./core/interceptors/auth.interceptor`
3. Add `provideHttpClient(withInterceptors([authInterceptor]))` to the providers array

### Interceptor Implementation

**File:** `KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts`

**TypeScript Interface:**
```typescript
import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Authentication Interceptor
 * 
 * This interceptor will eventually:
 * 1. Attach JWT tokens to outgoing requests
 * 2. Handle 401/403 authentication errors globally
 * 3. Redirect to login on authentication failures
 * 
 * Current behavior: Pass-through (no modifications)
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // TODO: Attach JWT token from storage (localStorage/sessionStorage/signal)
  // Example future implementation:
  // const token = localStorage.getItem('auth_token');
  // if (token) {
  //   req = req.clone({
  //     setHeaders: {
  //       Authorization: `Bearer ${token}`
  //     }
  //   });
  // }

  // Pass the request through to the next handler
  return next(req);
  
  // TODO: Add error handling for 401/403/500 responses
  // Example future implementation:
  // return next(req).pipe(
  //   catchError((error: HttpErrorResponse) => {
  //     if (error.status === 401) {
  //       // Redirect to login or dispatch logout action
  //     }
  //     return throwError(() => error);
  //   })
  // );
};
```

**Interceptor Design Decisions:**

1. **Functional Interceptor API:** Using `HttpInterceptorFn` (Angular 15+) instead of deprecated class-based interceptors
2. **Pass-through Pattern:** Currently does nothing, just passes requests to `next(req)`
3. **Placeholder Comments:** Clear TODO comments indicate where JWT and error handling will be added
4. **Type Safety:** Uses `HttpInterceptorFn` type for compile-time safety

**Interceptor Signature:**
```typescript
type HttpInterceptorFn = (
  req: HttpRequest<unknown>, 
  next: HttpHandlerFn
) => Observable<HttpEvent<unknown>>
```

## Implementation Steps

Follow these steps in order:

### 1. Create Directory Structure
- [ ] Create `KanbAI-Web/src/app/core/` directory
- [ ] Create `KanbAI-Web/src/app/core/interceptors/` directory
- [ ] Verify directories exist using `ls` or file explorer

### 2. Create Interceptor File
- [ ] Create `KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts`
- [ ] Import `HttpInterceptorFn` from `@angular/common/http`
- [ ] Export a constant function `authInterceptor` of type `HttpInterceptorFn`
- [ ] Implement pass-through logic: `return next(req);`
- [ ] Add JSDoc comment explaining future purpose
- [ ] Add TODO comments for JWT attachment (lines 10-17)
- [ ] Add TODO comments for error handling (lines 23-30)

### 3. Update Application Configuration
- [ ] Open `KanbAI-Web/src/app/app.config.ts`
- [ ] Import `provideHttpClient` from `@angular/common/http`
- [ ] Import `withInterceptors` from `@angular/common/http`
- [ ] Import `authInterceptor` from `./core/interceptors/auth.interceptor`
- [ ] Add `provideHttpClient(withInterceptors([authInterceptor]))` to providers array
- [ ] Verify import paths are correct

### 4. Build Verification
- [ ] Run `npm run build` from `KanbAI-Web/` directory
- [ ] Verify build succeeds with no errors
- [ ] Check for TypeScript compilation errors
- [ ] Verify no missing import errors

### 5. Functional Testing (Optional Manual Test)
- [ ] Create a test service that injects `HttpClient`
- [ ] Make a test HTTP request to `https://jsonplaceholder.typicode.com/posts/1`
- [ ] Add `console.log('Interceptor executed')` temporarily in interceptor
- [ ] Verify log appears in browser console
- [ ] Remove console log after verification

### 6. Test Suite Verification
- [ ] Run `npm run test -- --watch=false` from `KanbAI-Web/` directory
- [ ] Verify existing tests pass
- [ ] Classify any failures as PRE-EXISTING or INTRODUCED
- [ ] Fix INTRODUCED failures before completion

## QA Guidance

### Test Strategy

**Unit Tests (Interceptor):**
The interceptor can be unit tested by mocking `HttpRequest` and `HttpHandlerFn`:

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let httpClient: HttpClient;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting()
      ]
    });

    httpClient = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should pass through requests without modification', () => {
    httpClient.get('/api/test').subscribe();

    const req = httpTesting.expectOne('/api/test');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.has('Authorization')).toBe(false); // No token yet
    
    req.flush({ data: 'test' });
  });

  it('should allow requests to complete successfully', () => {
    httpClient.get('/api/users').subscribe(response => {
      expect(response).toEqual({ users: [] });
    });

    const req = httpTesting.expectOne('/api/users');
    req.flush({ users: [] });
  });
});
```

**Integration Tests:**
- Test that `HttpClient` is properly injected in services
- Verify interceptor executes on all HTTP requests
- Confirm no console errors when making requests

**Manual Testing Checklist:**
1. Application builds successfully
2. Application starts without console errors (`npm start`)
3. HTTP requests to external APIs succeed (e.g., JSONPlaceholder)
4. Interceptor function is called (verifiable via debugger breakpoint)

### Edge Cases to Test

- **No token in storage:** Interceptor should pass request unchanged (current behavior)
- **Multiple interceptors:** If more interceptors are added, they execute in registration order
- **Request failures:** Interceptor should not interfere with natural HTTP error propagation
- **Request cancellation:** Unsubscribed requests should be cancelled properly

### Acceptance Criteria Verification

| Criteria | Verification Method |
|----------|---------------------|
| `provideHttpClient()` added | Inspect `app.config.ts` providers array |
| Application builds | Run `npm run build` - must succeed |
| No console errors | Start app and check browser console |
| `core/interceptors/` directory exists | Check file system |
| `auth.interceptor.ts` file exists | Check file system |
| Interceptor uses functional API | Verify `HttpInterceptorFn` type |
| Interceptor registered | Check `withInterceptors([authInterceptor])` in config |
| Placeholder comments present | Read interceptor file, verify TODOs |
| HTTP requests succeed | Test with mock API endpoint |
| TypeScript compiles | Run `npm run build` - no TS errors |
| Existing tests pass | Run `npm run test` - no new failures |

## Security Considerations

### Current Implementation (Safe)
- ✅ No hardcoded tokens or credentials
- ✅ No sensitive data logged to console
- ✅ Pass-through behavior is secure (no modifications)

### Future Security Requirements (Not Implemented Yet)

**Token Storage:**
- Consider using `httpOnly` cookies instead of `localStorage` for JWT tokens (more secure against XSS)
- If using `localStorage`, be aware of XSS risks

**Error Handling:**
- Don't expose sensitive error details to the user
- Log detailed errors server-side, show generic messages client-side
- Never log authentication tokens in error messages

**Production Builds:**
- Remove or disable console logs in production
- Use Angular environment files to control logging behavior

## Performance Considerations

**Interceptor Overhead:**
- Functional interceptors add ~1-2ms overhead per request (negligible)
- Pass-through logic (current implementation) is nearly zero-cost
- Future JWT attachment will add ~0.1ms for token retrieval

**Memory:**
- No state stored in interceptor (stateless function)
- No memory leaks from subscriptions (uses RxJS operators correctly)

## Dependencies

**Required NPM Packages (Already Installed):**
- `@angular/common` v21.2.0 - Contains `HttpClient` and `withInterceptors`
- `@angular/core` v21.2.0 - Contains `ApplicationConfig`
- `rxjs` ~7.8.0 - For Observable handling

**No additional packages need to be installed.**

## Future Enhancements (Out of Scope)

These features are NOT part of this implementation but are prepared for:

1. **JWT Token Attachment:**
   - Read token from storage (localStorage, signal, or state management)
   - Clone request and add `Authorization: Bearer <token>` header
   - Handle token expiration

2. **Error Handling:**
   - Catch `HttpErrorResponse` with `catchError` operator
   - Redirect to login on 401/403
   - Show user-friendly error messages on 500
   - Implement retry logic for transient failures

3. **Request/Response Logging:**
   - Log requests in development mode
   - Track API call performance
   - Debug API integration issues

4. **Request Caching:**
   - Cache GET requests to reduce API calls
   - Implement cache invalidation strategies

## Design Validation Checklist

Before implementation, verify:

**Standards Compliance:**
- [x] Using functional interceptor API (Angular 15+)
- [x] Using `inject()` pattern (not applicable - interceptor is a standalone function)
- [x] No deprecated APIs used
- [x] TypeScript types are explicit

**Security:**
- [x] No hardcoded secrets or tokens
- [x] No sensitive data in console logs
- [x] Pass-through behavior is secure

**Completeness:**
- [x] All new files listed
- [x] All modifications to existing files listed
- [x] Implementation steps are in logical order
- [x] Acceptance criteria from context doc addressed

**Testability:**
- [x] Interceptor can be unit tested
- [x] Test examples provided
- [x] Manual testing steps documented

---

## Development Status

**Implementation Date:** 2026-04-18  
**Developer:** Claude Sonnet 4.5

### Files Created
- `KanbAI-Web/src/app/core/interceptors/auth.interceptor.ts`

### Files Modified
- `KanbAI-Web/src/app/app.config.ts` - Added `provideHttpClient` with `authInterceptor` registration

### Build & Test Results
- **Build:** ✅ SUCCESS
- **Bundle Size:** 210.94 kB (initial total), 57.01 kB estimated transfer
- **Tests:** 8 total, 8 passed, 0 failed
- **Pre-existing Failures:** None

### Implementation Highlights
- Functional interceptor using `HttpInterceptorFn` (Angular 15+)
- Pass-through behavior with clear TODO comments for future JWT attachment
- Placeholder comments for future error handling (401/403/500)
- Type-safe implementation with explicit TypeScript types
- Zero overhead - no state, no side effects

### Edge Cases Handled
- Pass-through behavior ensures no disruption to existing HTTP requests
- Ready for future JWT token attachment without breaking changes
- Prepared for centralized error handling without current interference

### Future Enhancement Markers
- TODO comments at lines 13-22: JWT token attachment logic
- TODO comments at lines 27-36: HTTP error handling logic

### Technical Details
- Uses modern functional interceptor API (`HttpInterceptorFn`)
- Registered via `withInterceptors([authInterceptor])`
- No dependencies on external packages (uses built-in Angular APIs)
- Stateless design for optimal performance

**Ready for Future Development**

The infrastructure is in place. When authentication is implemented, JWT logic can be added directly to the marked TODO sections without changing the registration or configuration.

---

## Testing Status

**Test Implementation Date:** 2026-04-18  
**QA Engineer:** Claude Sonnet 4.5

### Test Files Created
- `KanbAI-Web/src/app/core/interceptors/auth.interceptor.spec.ts`

### Test Execution Results
- **Total Tests:** 24
- **Passed:** 24 ✅
- **Failed:** 0
- **Pre-existing Failures:** None
- **Introduced Failures:** None (all tests pass)

### Test Coverage Summary

| Category | Test Scenarios | Status |
|----------|---------------|--------|
| **Basic Functionality** | Interceptor creation, pass-through behavior | ✅ PASS |
| **HTTP Methods** | GET, POST, PUT, DELETE requests | ✅ PASS |
| **Request Integrity** | Headers, payloads, query parameters preserved | ✅ PASS |
| **Error Propagation** | 401, 404, 500 errors handled correctly | ✅ PASS |
| **Edge Cases** | Request cancellation, multiple sequential requests | ✅ PASS |
| **Response Types** | JSON, Blob, empty responses | ✅ PASS |

### Detailed Test Scenarios

#### 1. Interceptor Creation & Structure
- ✅ Interceptor is defined and is a function
- ✅ Uses `HttpInterceptorFn` type (Angular 15+ functional API)

#### 2. Pass-through Behavior (Current Implementation)
- ✅ GET requests pass through without modification
- ✅ POST requests pass through with payload intact
- ✅ PUT requests pass through with payload intact
- ✅ DELETE requests pass through without modification
- ✅ No Authorization header added (expected for pass-through)

#### 3. Request Integrity
- ✅ Custom headers are preserved
- ✅ Request body/payload is not modified
- ✅ Query parameters are preserved correctly
- ✅ Request URL is preserved
- ✅ HTTP method is preserved

#### 4. Error Handling (Non-interference)
- ✅ 404 errors propagate to subscribers correctly
- ✅ 401 errors propagate to subscribers correctly
- ✅ 500 errors propagate to subscribers correctly
- ✅ Error status codes and messages are preserved

#### 5. Edge Cases & Advanced Scenarios
- ✅ Request cancellation (unsubscribe) works properly
- ✅ Multiple sequential requests all execute correctly
- ✅ Different response types (Blob) are handled
- ✅ Empty response bodies are handled
- ✅ Requests complete successfully with expected data

#### 6. Integration with HttpClient
- ✅ Interceptor is properly registered via `withInterceptors([authInterceptor])`
- ✅ `HttpTestingController` correctly intercepts requests
- ✅ All HTTP requests flow through the interceptor

### Test Implementation Highlights

**Test Framework:** Jasmine with Angular Testing Utilities  
**Mocking Strategy:** `HttpTestingController` from `@angular/common/http/testing`  
**Pattern:** Arrange-Act-Assert (AAA)

**Key Testing Techniques Used:**
1. **TestBed Configuration:** Proper setup with `provideHttpClient` and `provideHttpClientTesting`
2. **Request Verification:** Using `httpTesting.expectOne()` to verify requests
3. **Error Simulation:** Using `req.flush()` with error status codes
4. **Subscription Management:** Testing request cancellation behavior
5. **Custom Matchers:** Predicate functions for complex request matching

### Coverage Gaps & Future Testing Needs

**Current Coverage:** ✅ Complete for pass-through implementation

**Future Test Scenarios (when features are added):**
1. **JWT Token Attachment:**
   - Token from localStorage is attached to requests
   - Requests without token proceed normally
   - Token is formatted correctly as `Bearer <token>`
   - Token is not attached to excluded URLs (e.g., `/login`, `/register`)

2. **Error Handling:**
   - 401 errors trigger logout/redirect
   - 403 errors show appropriate user messages
   - 500 errors are logged and reported
   - Retry logic for transient failures

3. **Performance:**
   - Interceptor overhead is negligible (<2ms)
   - No memory leaks from subscriptions
   - Concurrent requests are handled efficiently

4. **Security:**
   - Tokens are not logged to console
   - Sensitive data is not exposed in error messages
   - HTTPS-only token transmission

### Known Issues & UI Discrepancies

**None identified.** All tests pass and the implementation matches the specification exactly.

### Manual Testing Checklist

- [x] Application builds successfully (`npm run build`)
- [x] Test suite passes completely (`npm run test`)
- [x] No console errors during test execution
- [x] Interceptor is registered in `app.config.ts`
- [x] Interceptor file structure matches specification
- [x] TODO comments are present for future enhancements

### Recommendations for Next Sprint

1. **Authentication Implementation:**
   - Add JWT token storage (consider signals or state management)
   - Implement token attachment logic in the interceptor
   - Add token refresh logic for expired tokens

2. **Error Handling:**
   - Implement centralized error handling in the interceptor
   - Add user-facing error notifications
   - Integrate with logging service

3. **Testing Infrastructure:**
   - Add E2E tests for authentication flows
   - Set up test coverage reporting
   - Add integration tests with real backend (staging environment)

---

**Testing Status:** ✅ COMPLETE  
**All acceptance criteria verified and passing.**  

*Testing is complete and logged. The feature is ready for final review.*
