# Feature: Environment Variables and API Constants

**GitHub Issue:** #9  
**Milestone:** Angular Frontend Foundations

## Business Value

**Who is this for?**  
Development team and DevOps engineers who need to deploy the Angular application across different environments (local development, staging, production).

**Why is it valuable?**  
- Enables configuration-driven development without code changes
- Prevents hardcoded URLs scattered throughout the codebase
- Facilitates smooth deployment across environments
- Reduces risk of pushing development URLs to production
- Establishes a foundation for all future API integrations

**What problem does it solve?**  
Currently, the application lacks a centralized configuration system. Services that need to communicate with backend APIs would have to hardcode URLs, leading to maintenance nightmares and deployment errors. This feature establishes the infrastructure for environment-aware configuration.

## Current State vs Desired State

### Current State
- No `src/environments/` directory exists
- Application has basic Angular structure in `c:\temp\KanbAI-Web\KanbAI-Web\src\app\`
- Core interceptors exist at `src/app/core/interceptors/auth.interceptor.ts`
- Current Angular configuration in `angular.json` has development and production build configurations but no environment file references

### Desired State
- `src/environments/` directory created with two files:
  - `environment.ts` - Production configuration
  - `environment.development.ts` - Development configuration
- Each environment file exports an `environment` object with:
  - `apiUrl` constant (e.g., `http://localhost:4200/api` for dev, production URL for prod)
  - `production` boolean flag
- Services can import and reference `environment.apiUrl` instead of hardcoding URLs
- Angular build system automatically uses the correct environment file based on build configuration

### Expected User Flow
1. Developer imports `environment` from `src/environments/environment`
2. Developer accesses `environment.apiUrl` in HTTP service calls
3. Build system (via `ng serve` or `ng build --configuration production`) automatically substitutes the correct environment file
4. No manual configuration changes needed when deploying

## Milestone Context

**Milestone:** Angular Frontend Foundations

This feature is part of establishing the foundational infrastructure for the Angular application before building user-facing features.

**Prerequisite Issues:**
- #6 - Setup global HttpClient and interceptor skeleton - **COMPLETED** (interceptors exist at `src/app/core/interceptors/`)
- #7 - Install and configure Tailwind CSS and PostCSS - **COMPLETED**

**Downstream Issues:**
- Future API service implementations will depend on `environment.apiUrl`
- Authentication services will need environment-specific token endpoints
- Any feature that communicates with backend APIs

**Related Work:**
- This establishes the pattern for all future environment-specific configuration (feature flags, analytics keys, auth endpoints, etc.)

## Acceptance Criteria

- [ ] `src/environments/` directory exists in the Angular project
- [ ] `environment.ts` file exists with `production: true` and a `apiUrl` property set to a production-appropriate URL placeholder (e.g., `'https://api.kanbai.com'`)
- [ ] `environment.development.ts` file exists with `production: false` and `apiUrl: 'http://localhost:4200/api'`
- [ ] Both files export a TypeScript object named `environment` with consistent property structure
- [ ] `angular.json` is configured to use file replacements for environment files (if needed for Angular 15+)
- [ ] A developer can import `environment` from `'src/environments/environment'` in any TypeScript file
- [ ] Running `ng serve` (development mode) uses `environment.development.ts`
- [ ] Running `ng build --configuration production` uses `environment.ts`
- [ ] No build errors or warnings related to environment configuration
- [ ] Environment files are NOT gitignored (they are configuration templates, not secrets)
- [ ] If any service currently exists that would benefit from `environment.apiUrl`, it is updated as an example (optional, but recommended)

### Quality Gates
Each criterion is:
- **Observable:** Can verify by inspecting files and running build commands
- **Specific:** Exact file names, property names, and values specified
- **Testable:** Can confirm through build process and import statements
- **Edge cases covered:** Both development and production configurations addressed
