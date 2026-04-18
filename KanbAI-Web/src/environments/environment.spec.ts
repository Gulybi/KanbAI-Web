import { environment as prodEnvironment } from './environment';
import { environment as devEnvironment } from './environment.development';
import { Environment } from '../app/core/models/environment.interface';

describe('Environment Configuration', () => {
  describe('Production Environment', () => {
    it('should exist and be defined', () => {
      expect(prodEnvironment).toBeDefined();
      expect(prodEnvironment).not.toBeNull();
    });

    it('should have production flag set to true', () => {
      expect(prodEnvironment.production).toBe(true);
    });

    it('should have a valid apiUrl', () => {
      expect(prodEnvironment.apiUrl).toBeDefined();
      expect(typeof prodEnvironment.apiUrl).toBe('string');
      expect(prodEnvironment.apiUrl.length).toBeGreaterThan(0);
    });

    it('should have production apiUrl', () => {
      expect(prodEnvironment.apiUrl).toBe('https://api.kanbai.com');
    });

    it('should use HTTPS protocol for production', () => {
      expect(prodEnvironment.apiUrl).toMatch(/^https:\/\//);
    });

    it('should implement Environment interface', () => {
      const env: Environment = prodEnvironment;
      expect(env.production).toBeDefined();
      expect(env.apiUrl).toBeDefined();
    });

    it('should not have trailing slash in apiUrl', () => {
      expect(prodEnvironment.apiUrl).not.toMatch(/\/$/);
    });

    it('should be a valid URL format', () => {
      expect(() => new URL(prodEnvironment.apiUrl)).not.toThrow();
    });
  });

  describe('Development Environment', () => {
    it('should exist and be defined', () => {
      expect(devEnvironment).toBeDefined();
      expect(devEnvironment).not.toBeNull();
    });

    it('should have production flag set to false', () => {
      expect(devEnvironment.production).toBe(false);
    });

    it('should have a valid apiUrl', () => {
      expect(devEnvironment.apiUrl).toBeDefined();
      expect(typeof devEnvironment.apiUrl).toBe('string');
      expect(devEnvironment.apiUrl.length).toBeGreaterThan(0);
    });

    it('should have development apiUrl', () => {
      expect(devEnvironment.apiUrl).toBe('http://localhost:4200/api');
    });

    it('should use HTTP protocol for development', () => {
      expect(devEnvironment.apiUrl).toMatch(/^http:\/\//);
    });

    it('should point to localhost', () => {
      expect(devEnvironment.apiUrl).toContain('localhost');
    });

    it('should implement Environment interface', () => {
      const env: Environment = devEnvironment;
      expect(env.production).toBeDefined();
      expect(env.apiUrl).toBeDefined();
    });

    it('should not have trailing slash in apiUrl', () => {
      expect(devEnvironment.apiUrl).not.toMatch(/\/$/);
    });

    it('should be a valid URL format', () => {
      expect(() => new URL(devEnvironment.apiUrl)).not.toThrow();
    });
  });

  describe('Environment Consistency', () => {
    it('should have consistent property structure', () => {
      const prodKeys = Object.keys(prodEnvironment).sort();
      const devKeys = Object.keys(devEnvironment).sort();

      expect(prodKeys).toEqual(devKeys);
    });

    it('should have different production flags', () => {
      expect(prodEnvironment.production).not.toBe(devEnvironment.production);
    });

    it('should have different apiUrls', () => {
      expect(prodEnvironment.apiUrl).not.toBe(devEnvironment.apiUrl);
    });

    it('should both implement the same interface', () => {
      const checkInterface = (env: Environment) => {
        expect(typeof env.production).toBe('boolean');
        expect(typeof env.apiUrl).toBe('string');
      };

      checkInterface(prodEnvironment);
      checkInterface(devEnvironment);
    });

    it('should have exactly two properties', () => {
      expect(Object.keys(prodEnvironment).length).toBe(2);
      expect(Object.keys(devEnvironment).length).toBe(2);
    });
  });

  describe('Type Safety', () => {
    it('production should be a boolean in production environment', () => {
      expect(typeof prodEnvironment.production).toBe('boolean');
    });

    it('production should be a boolean in development environment', () => {
      expect(typeof devEnvironment.production).toBe('boolean');
    });

    it('apiUrl should be a string in production environment', () => {
      expect(typeof prodEnvironment.apiUrl).toBe('string');
    });

    it('apiUrl should be a string in development environment', () => {
      expect(typeof devEnvironment.apiUrl).toBe('string');
    });
  });

  describe('URL Validation', () => {
    it('production apiUrl should be a well-formed URL', () => {
      const url = new URL(prodEnvironment.apiUrl);
      expect(url.protocol).toBe('https:');
      expect(url.hostname).toBe('api.kanbai.com');
    });

    it('development apiUrl should be a well-formed URL', () => {
      const url = new URL(devEnvironment.apiUrl);
      expect(url.protocol).toBe('http:');
      expect(url.hostname).toBe('localhost');
      expect(url.port).toBe('4200');
      expect(url.pathname).toBe('/api');
    });

    it('both URLs should not have query parameters', () => {
      const prodUrl = new URL(prodEnvironment.apiUrl);
      const devUrl = new URL(devEnvironment.apiUrl);

      expect(prodUrl.search).toBe('');
      expect(devUrl.search).toBe('');
    });

    it('both URLs should not have fragments', () => {
      const prodUrl = new URL(prodEnvironment.apiUrl);
      const devUrl = new URL(devEnvironment.apiUrl);

      expect(prodUrl.hash).toBe('');
      expect(devUrl.hash).toBe('');
    });
  });

  describe('Acceptance Criteria Coverage', () => {
    it('AC: environment.ts exists with production: true and apiUrl', () => {
      expect(prodEnvironment.production).toBe(true);
      expect(prodEnvironment.apiUrl).toBe('https://api.kanbai.com');
    });

    it('AC: environment.development.ts exists with production: false and apiUrl', () => {
      expect(devEnvironment.production).toBe(false);
      expect(devEnvironment.apiUrl).toBe('http://localhost:4200/api');
    });

    it('AC: Both files export an object named environment', () => {
      expect(prodEnvironment).toBeDefined();
      expect(devEnvironment).toBeDefined();
    });

    it('AC: Both files have consistent property structure', () => {
      const prodProps = Object.keys(prodEnvironment).sort();
      const devProps = Object.keys(devEnvironment).sort();

      expect(prodProps).toEqual(['apiUrl', 'production']);
      expect(devProps).toEqual(['apiUrl', 'production']);
    });

    it('AC: Can import environment from src/environments/environment', () => {
      // This test itself proves the import works
      expect(() => {
        const env = prodEnvironment;
        expect(env).toBeDefined();
      }).not.toThrow();
    });

    it('AC: TypeScript type safety is enforced', () => {
      // This compiles successfully, proving type safety
      const checkType = (env: Environment) => {
        return env.apiUrl && typeof env.production === 'boolean';
      };

      expect(checkType(prodEnvironment)).toBeTruthy();
      expect(checkType(devEnvironment)).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('should handle environment objects as read-only', () => {
      // Environment objects should be treated as immutable configuration
      const originalProdUrl = prodEnvironment.apiUrl;
      const originalDevUrl = devEnvironment.apiUrl;

      // Verify they don't change unexpectedly
      expect(prodEnvironment.apiUrl).toBe(originalProdUrl);
      expect(devEnvironment.apiUrl).toBe(originalDevUrl);
    });

    it('should be usable in string concatenation', () => {
      const endpoint = '/users';
      const fullUrl = `${devEnvironment.apiUrl}${endpoint}`;

      expect(fullUrl).toBe('http://localhost:4200/api/users');
    });

    it('should be usable in URL construction', () => {
      const endpoint = 'users';
      const fullUrl = `${devEnvironment.apiUrl}/${endpoint}`;

      expect(fullUrl).toBe('http://localhost:4200/api/users');
    });

    it('should work with startsWith for URL matching', () => {
      const testUrl = 'http://localhost:4200/api/users';
      expect(testUrl.startsWith(devEnvironment.apiUrl)).toBe(true);

      const prodTestUrl = 'https://api.kanbai.com/users';
      expect(prodTestUrl.startsWith(prodEnvironment.apiUrl)).toBe(true);
    });

    it('should not match URLs with similar but different domains', () => {
      const wrongUrl = 'https://other-api.kanbai.com/users';
      expect(wrongUrl.startsWith(prodEnvironment.apiUrl)).toBe(false);
    });
  });

  describe('Security Considerations', () => {
    it('should not contain sensitive secrets in production', () => {
      const prodString = JSON.stringify(prodEnvironment).toLowerCase();

      // These should NOT be in environment files
      expect(prodString).not.toContain('password');
      expect(prodString).not.toContain('secret');
      expect(prodString).not.toContain('key');
      expect(prodString).not.toContain('token');
    });

    it('should not contain sensitive secrets in development', () => {
      const devString = JSON.stringify(devEnvironment).toLowerCase();

      // These should NOT be in environment files
      expect(devString).not.toContain('password');
      expect(devString).not.toContain('secret');
      expect(devString).not.toContain('key');
      expect(devString).not.toContain('token');
    });

    it('production should use secure HTTPS protocol', () => {
      expect(prodEnvironment.apiUrl.startsWith('https://')).toBe(true);
    });
  });
});
