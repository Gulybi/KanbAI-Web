import { isSafeReturnUrl } from './return-url.util';

describe('isSafeReturnUrl', () => {
  describe('safe inputs', () => {
    it('accepts a simple in-app path', () => {
      expect(isSafeReturnUrl('/board')).toBe(true);
    });

    it('accepts a nested in-app path', () => {
      expect(isSafeReturnUrl('/board/abc-123')).toBe(true);
    });

    it('accepts a path with query string', () => {
      expect(isSafeReturnUrl('/dashboard?foo=bar')).toBe(true);
    });

    it('accepts a path that only shares a prefix with a reserved path', () => {
      // `/registering` is NOT a sub-path of `/register`.
      expect(isSafeReturnUrl('/registering')).toBe(true);
    });
  });

  describe('external / tampered inputs', () => {
    it('rejects an https URL', () => {
      expect(isSafeReturnUrl('https://evil.example.com')).toBe(false);
    });

    it('rejects an http URL', () => {
      expect(isSafeReturnUrl('http://evil.example.com')).toBe(false);
    });

    it('rejects a protocol-relative URL', () => {
      expect(isSafeReturnUrl('//evil.example.com')).toBe(false);
    });

    it('rejects a javascript: pseudo-URL', () => {
      expect(isSafeReturnUrl('javascript:alert(1)')).toBe(false);
    });

    it('rejects a path without a leading slash', () => {
      expect(isSafeReturnUrl('board')).toBe(false);
    });
  });

  describe('redirect-loop prevention', () => {
    it('rejects exact /login', () => {
      expect(isSafeReturnUrl('/login')).toBe(false);
    });

    it('rejects /login with a query string', () => {
      expect(isSafeReturnUrl('/login?x=1')).toBe(false);
    });

    it('rejects a sub-path of /login', () => {
      expect(isSafeReturnUrl('/login/forgot')).toBe(false);
    });

    it('rejects exact /register', () => {
      expect(isSafeReturnUrl('/register')).toBe(false);
    });

    it('rejects a sub-path of /register', () => {
      expect(isSafeReturnUrl('/register/step-2')).toBe(false);
    });
  });

  describe('empty / non-string inputs', () => {
    it('rejects empty string', () => {
      expect(isSafeReturnUrl('')).toBe(false);
    });

    it('rejects null', () => {
      expect(isSafeReturnUrl(null)).toBe(false);
    });

    it('rejects undefined', () => {
      expect(isSafeReturnUrl(undefined)).toBe(false);
    });
  });
});
