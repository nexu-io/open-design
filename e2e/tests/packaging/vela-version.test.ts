import { expect, it } from 'vitest';
import { assertVelaVersion } from '../../../.github/scripts/release/vela-version.js';

const manifest = (version: string) => JSON.stringify({ optionalDependencies: { '@powerformer/vela-cli': version } });
const lock = (specifier: string, version: string) => `importers:\n  tools/pack:\n    optionalDependencies:\n      '@powerformer/vela-cli':\n        specifier: ${specifier}\n        version: ${version}\n\n  tools/release:\n    dependencies: {}\n`;

it('[P0] requires an exact stable Vela CLI version matching the lockfile for backports', () => {
  for (const version of ['0.1.8', '1.20.300']) {
    expect(() => assertVelaVersion(manifest(version), lock(version, version))).not.toThrow();
  }
  for (const version of ['0.1.8-test.0', '0.1.8-rc.1', '0.1.8+build', '^0.1.8', 'latest', '01.1.8']) {
    expect(() => assertVelaVersion(manifest(version), lock(version, version))).toThrow(/exact stable/);
  }
  expect(() => assertVelaVersion(manifest('0.1.8'), lock('0.1.8', '0.1.7'))).toThrow(/lock version/);
  expect(() => assertVelaVersion(manifest('0.1.8'), '')).toThrow(/missing/);
});
