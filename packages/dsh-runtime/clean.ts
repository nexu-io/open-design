import { rm } from 'node:fs/promises';

await Promise.all([
  rm(new URL('./dist', import.meta.url), { force: true, recursive: true }),
  // Builds before 0.1.0 emitted here. Removing it keeps workspace checks from
  // treating stale generated JavaScript as project-owned source.
  rm(new URL('./lib', import.meta.url), { force: true, recursive: true }),
]);
