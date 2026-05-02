import { describe, it, expect } from 'vitest';

/**
 * Additional regression guards for GitHub issue #59.
 *
 * This file complements `environment-config.spec.ts`. It covers:
 *  - AC8: no new occurrences of the production host string (the host
 *    referenced by `environment.ts`) anywhere in `src/` outside a
 *    known, enumerated allowlist. The literal string is constructed
 *    from parts (see `PROD_HOST_LITERAL`) so this spec file itself
 *    does not match — otherwise it would have to allowlist itself.
 *  - Sanity checks for the two `angular.json` deviations introduced
 *    during the developer phase:
 *      1. A new `build.configurations.test` block (no `fileReplacements`).
 *      2. `architect.test.options.buildTarget` wired to
 *         `KanbAI-Web:build:test`.
 *    Without #2, the unit-test builder would fall back to the dev
 *    build configuration and `environment.spec.ts` would fail because
 *    both `./environment` and `./environment.development` imports would
 *    resolve to the same dev file.
 *
 * The Node.js built-ins (`fs`, `path`) and `__dirname` are available at
 * runtime under Vitest. They are declared ambiently so this file does
 * not require `@types/node` (AC15: no new npm deps).
 */

declare const require: (id: string) => unknown;
declare const __dirname: string;

interface FsLike {
  readFileSync(path: string, encoding: string): string;
  readdirSync(path: string, options: { withFileTypes: true }): FsDirent[];
  existsSync(path: string): boolean;
}
interface FsDirent {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}
interface PathLike {
  join(...segments: string[]): string;
  relative(from: string, to: string): string;
  sep: string;
}

const { readFileSync, readdirSync, existsSync } = require('fs') as FsLike;
const { join, relative, sep } = require('path') as PathLike;

const srcRoot = join(__dirname, '..');
const repoRoot = join(__dirname, '..', '..');

/**
 * The literal production host we are grepping for. Constructed from parts
 * so this source file itself does not match — otherwise we would be
 * forced to allowlist our own spec, which defeats the point.
 */
const PROD_HOST_LITERAL = ['api', '.', 'kanbai', '.', 'com'].join('');

/**
 * AC8 allowlist — files where the production host literal is a
 * legitimate reference (the production constant itself, assertion-based
 * tests, JSDoc example text, and interceptor tests that deliberately
 * validate host-matching against a production-shaped URL — the last
 * entry is the "broadening" noted in tech spec Step 7).
 *
 * Paths are stored as forward-slashed relative-to-`src/` strings so the
 * list is identical on Windows and *nix.
 */
const AC8_ALLOWLIST = new Set([
  'environments/environment.ts',
  'environments/environment.spec.ts',
  'app/core/models/environment.interface.ts',
  'app/core/interceptors/auth.interceptor.spec.ts',
]);

/** Recursively collect every file under `dir`. */
function walk(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip nothing — `src/` has no node_modules; everything under it is
      // first-party application code, styles, or tests.
      results.push(...walk(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

/** Normalize a file path to `a/b/c` form relative to `src/`. */
function toPosixRelative(absolute: string): string {
  return relative(srcRoot, absolute).split(sep).join('/');
}

describe(`AC8 — no hardcoded ${PROD_HOST_LITERAL} outside allowlist`, () => {
  const allFiles = walk(srcRoot);

  it('walker discovered source files (sanity check)', () => {
    // Guard against a silently-empty walk masking a regression.
    expect(allFiles.length).toBeGreaterThan(10);
  });

  it(`every file containing "${PROD_HOST_LITERAL}" is in the AC8 allowlist`, () => {
    const offenders: string[] = [];
    for (const file of allFiles) {
      // Only scan text-shaped source; skip binary/image assets that
      // incidentally live under src/ (none today, but cheap to guard).
      if (!/\.(ts|html|scss|css|js|json|md)$/.test(file)) continue;

      const contents = readFileSync(file, 'utf-8');
      if (!contents.includes(PROD_HOST_LITERAL)) continue;

      const relPath = toPosixRelative(file);
      if (!AC8_ALLOWLIST.has(relPath)) {
        offenders.push(relPath);
      }
    }

    // Descriptive failure message if someone adds a new hardcoded host.
    expect(
      offenders,
      `Unexpected hardcoded '${PROD_HOST_LITERAL}' found in: ${offenders.join(
        ', '
      )}. If this is a legitimate new reference, update the AC8 allowlist in environment-coverage.spec.ts.`
    ).toEqual([]);
  });

  it(`every file on the allowlist still exists and still references the production host`, () => {
    // Prevents the allowlist from silently drifting out of sync with the
    // code — e.g., if `auth.interceptor.spec.ts` is renamed or its
    // production-host references are removed, we want to know so the
    // allowlist can be tightened.
    for (const relPath of AC8_ALLOWLIST) {
      const absolute = join(srcRoot, ...relPath.split('/'));
      expect(existsSync(absolute), `Allowlisted file missing: ${relPath}`).toBe(true);
      const contents = readFileSync(absolute, 'utf-8');
      expect(
        contents.includes(PROD_HOST_LITERAL),
        `Allowlisted file no longer references the production host (can be removed from allowlist): ${relPath}`
      ).toBe(true);
    }
  });
});

describe('angular.json — developer-phase deviations (issue #59)', () => {
  const angularJson = JSON.parse(
    readFileSync(join(repoRoot, 'angular.json'), 'utf-8')
  );
  const project = angularJson.projects['KanbAI-Web'];

  describe('test build configuration', () => {
    const testBuildConfig = project.architect.build.configurations.test;

    it('build.configurations.test is defined', () => {
      // The developer added this block so the unit-test builder has a
      // configuration distinct from `development` — without it, tests
      // resolve environment.ts to environment.development.ts and
      // environment.spec.ts (AC9) fails 9/600.
      expect(testBuildConfig).toBeDefined();
    });

    it('build.configurations.test does NOT declare fileReplacements', () => {
      // If a future change adds fileReplacements here, the unit-test
      // builder would again merge dev and prod environments together
      // and environment.spec.ts would break.
      expect(testBuildConfig.fileReplacements).toBeUndefined();
    });
  });

  describe('test architect target', () => {
    const testArchitect = project.architect.test;

    it('architect.test exists and uses the @angular/build:unit-test builder', () => {
      expect(testArchitect).toBeDefined();
      expect(testArchitect.builder).toBe('@angular/build:unit-test');
    });

    it('architect.test.options.buildTarget points at the test build configuration', () => {
      // This is the other half of the dev-phase deviation. Removing
      // this line makes `ng test` fall back to
      // `KanbAI-Web:build:development`, which applies fileReplacements
      // and breaks environment.spec.ts.
      expect(testArchitect.options).toBeDefined();
      expect(testArchitect.options.buildTarget).toBe('KanbAI-Web:build:test');
    });
  });

  describe('production configuration is not accidentally affected', () => {
    const prodBuildConfig = project.architect.build.configurations.production;

    it('production build does not declare fileReplacements (preserves AC2)', () => {
      // AC2 requires the production bundle to contain the prod host.
      // If fileReplacements ever leaks into the production block, that
      // AC silently breaks. This test is the cheapest guard.
      expect(prodBuildConfig.fileReplacements).toBeUndefined();
    });
  });
});
