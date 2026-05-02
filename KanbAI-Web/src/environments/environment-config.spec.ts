import { describe, it, expect } from 'vitest';

/**
 * Regression guard for GitHub issue #59.
 *
 * This test reads angular.json and asserts that the development build
 * configuration is wired to swap environment.ts for environment.development.ts
 * via `fileReplacements`. Without this entry, `ng serve` and
 * `ng build --configuration development` bundle the production apiUrl,
 * producing net::ERR_SSL_UNRECOGNIZED_NAME_ALERT on every authenticated call.
 *
 * If this test fails, something in angular.json has reverted the fix
 * — re-add the fileReplacements block under:
 *   projects.KanbAI-Web.architect.build.configurations.development
 *
 * Note: Vitest runs this file under Node.js, so the `fs`/`path` modules and
 * `__dirname` are available at runtime. We declare them ambiently here to
 * avoid adding `@types/node` as a new devDependency (AC15: no new npm deps).
 */

declare const require: (id: string) => unknown;
declare const __dirname: string;

interface FsLike {
  readFileSync(path: string, encoding: string): string;
}
interface PathLike {
  join(...segments: string[]): string;
}

const { readFileSync } = require('fs') as FsLike;
const { join } = require('path') as PathLike;

describe('angular.json — build configuration wiring (issue #59 regression guard)', () => {
  const angularJsonPath = join(__dirname, '..', '..', 'angular.json');
  const angularJson = JSON.parse(readFileSync(angularJsonPath, 'utf-8'));
  const devBuildConfig =
    angularJson.projects['KanbAI-Web'].architect.build.configurations.development;

  it('development build configuration exists', () => {
    expect(devBuildConfig).toBeDefined();
  });

  it('development build declares fileReplacements', () => {
    expect(Array.isArray(devBuildConfig.fileReplacements)).toBe(true);
    expect(devBuildConfig.fileReplacements.length).toBeGreaterThan(0);
  });

  it('fileReplacements swaps environment.ts for environment.development.ts', () => {
    const entry = devBuildConfig.fileReplacements.find(
      (r: { replace: string; with: string }) =>
        r.replace === 'src/environments/environment.ts'
    );
    expect(entry).toBeDefined();
    expect(entry.with).toBe('src/environments/environment.development.ts');
  });

  it('ng serve defaults to the development configuration', () => {
    const serve = angularJson.projects['KanbAI-Web'].architect.serve;
    expect(serve.defaultConfiguration).toBe('development');
  });

  it('ng build defaults to the production configuration', () => {
    const build = angularJson.projects['KanbAI-Web'].architect.build;
    expect(build.defaultConfiguration).toBe('production');
  });
});
