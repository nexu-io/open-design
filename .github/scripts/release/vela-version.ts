import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function assertVelaVersion(manifestText: string, lock: string): void {
  const pinned = JSON.parse(manifestText).optionalDependencies?.['@powerformer/vela-cli'];
  const importer = lock.match(/^  tools\/pack:\n([\s\S]*?)(?=^  \S|(?![\s\S]))/m)?.[1];
  const dependency = importer?.match(/^      '@powerformer\/vela-cli':\n        specifier: (.+)\n        version: (.+)$/m);
  const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  if (typeof pinned !== 'string' || !stableVersion.test(pinned) || dependency?.[1] !== pinned || dependency?.[2] !== pinned) {
    throw new Error(`Vela CLI must use an exact stable X.Y.Z version matching the lockfile; manifest=${pinned ?? 'missing'}, lock specifier=${dependency?.[1] ?? 'missing'}, lock version=${dependency?.[2] ?? 'missing'}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifestPath, lockPath] = process.argv.slice(2);
  if (!manifestPath || !lockPath) throw new Error('Expected manifest and lockfile paths');
  assertVelaVersion(readFileSync(manifestPath, 'utf8'), readFileSync(lockPath, 'utf8'));
  console.log('Vela CLI uses an exact stable version matching the lockfile');
}
