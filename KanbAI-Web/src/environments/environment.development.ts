import { Environment } from '../app/core/models/environment.interface';

/**
 * Development Environment Configuration
 *
 * This file is used when running:
 * - ng serve (default configuration is 'development')
 * - ng build --configuration development
 *
 * Points to local development backend or proxy endpoints.
 */
export const environment: Environment = {
  production: false,
  apiUrl: 'http://localhost:4200/api'
};
