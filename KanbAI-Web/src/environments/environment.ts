import { Environment } from '../app/core/models/environment.interface';

/**
 * Production Environment Configuration
 *
 * This file is used when building with:
 * - ng build (default configuration is 'production')
 * - ng build --configuration production
 *
 * IMPORTANT: This file should NOT contain secrets (API keys, passwords).
 * All values here are publicly accessible in the browser bundle.
 */
export const environment: Environment = {
  production: true,
  apiUrl: 'https://api.kanbai.com'
};
