/**
 * Environment Configuration Interface
 *
 * Defines the shape of environment objects used across the application.
 * Ensures type safety when accessing environment variables.
 */
export interface Environment {
  /**
   * Indicates if the application is running in production mode.
   * - true: Production build (ng build --configuration production)
   * - false: Development build (ng serve)
   */
  production: boolean;

  /**
   * Base URL for backend API endpoints.
   *
   * All HTTP services should use this constant for API calls.
   *
   * Examples:
   * - Development: 'http://localhost:4200/api'
   * - Staging: 'https://staging-api.kanbai.com'
   * - Production: 'https://api.kanbai.com'
   */
  apiUrl: string;
}
