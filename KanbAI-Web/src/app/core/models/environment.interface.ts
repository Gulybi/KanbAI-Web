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

  /**
   * Full URL of the backend SignalR hub endpoint.
   *
   * Used by the SignalR client to open the real-time connection. Defined as
   * an explicit field (not derived from apiUrl) so the hub can live on a
   * different host/path than the REST API without code changes.
   *
   * Examples:
   * - Development: 'http://localhost:5257/hubs/kanban'
   * - Production: 'https://api.kanbai.com/hubs/kanban'
   */
  hubUrl: string;
}
