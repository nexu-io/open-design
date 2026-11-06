#!/usr/bin/env -S node --experimental-strip-types
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';

type PutObjectArgs = {
  bucket: string;
  cacheControl?: string;
  contentType?: string;
  dryRun: boolean;
  endpoint: string;
  file: string;
  key: string;
  publicOrigin?: string;
};

function usage(): string {
  return `Usage:
  node --experimental-strip-types .github/scripts/r2.ts put-object \\
    --endpoint <url> \\
    --bucket <bucket> \\
    --key <object-key> \\
    --file <local-file> \\
    [--content-type <mime>] \\
    [--cache-control <value>] \\
    [--public-origin <url>] \\
    [--dry-run]
`;
}

function readOption(argv: string[], index: number, name: string): string {
  const value = argv[index + 1];
  if (value == null || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function parsePutObjectArgs(argv: string[]): PutObjectArgs {
  const args: Partial<PutObjectArgs> = { dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--endpoint') {
      args.endpoint = readOption(argv, i, arg);
      i += 1;
    } else if (arg === '--bucket') {
      args.bucket = readOption(argv, i, arg);
      i += 1;
    } else if (arg === '--key') {
      args.key = readOption(argv, i, arg);
      i += 1;
    } else if (arg === '--file') {
      args.file = readOption(argv, i, arg);
      i += 1;
    } else if (arg === '--content-type') {
      args.contentType = readOption(argv, i, arg);
      i += 1;
    } else if (arg === '--cache-control') {
      args.cacheControl = readOption(argv, i, arg);
      i += 1;
    } else if (arg === '--public-origin') {
      args.publicOrigin = readOption(argv, i, arg);
      i += 1;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else {
      throw new Error(`Unknown put-object option: ${arg}`);
    }
  }

  for (const name of ['endpoint', 'bucket', 'key', 'file'] as const) {
    if (!args[name]) throw new Error(`--${name} is required`);
  }

  return args as PutObjectArgs;
}

function assertNonEmptyFile(file: string): void {
  if (!existsSync(file)) throw new Error(`File does not exist: ${file}`);
  const stat = statSync(file);
  if (!stat.isFile()) throw new Error(`Path is not a file: ${file}`);
  if (stat.size === 0) throw new Error(`File is empty: ${file}`);
}

function publishedUrl(publicOrigin: string | undefined, key: string): string | undefined {
  if (!publicOrigin) return undefined;
  return `${publicOrigin.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`;
}

function putObject(args: PutObjectArgs): void {
  assertNonEmptyFile(args.file);

  const endpoint = args.endpoint.replace(/\/+$/, '');
  const command = [
    '--endpoint-url',
    endpoint,
    's3api',
    'put-object',
    '--bucket',
    args.bucket,
    '--key',
    args.key,
    '--body',
    args.file,
    '--no-cli-pager',
  ];
  if (args.contentType) command.push('--content-type', args.contentType);
  if (args.cacheControl) command.push('--cache-control', args.cacheControl);

  if (args.dryRun) {
    console.log(`Dry run: aws ${command.join(' ')}`);
  } else {
    const result = spawnSync('aws', command, { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`aws exited with status ${result.status ?? 'unknown'}`);
    }
  }

  const url = publishedUrl(args.publicOrigin, args.key);
  if (url) console.log(`Published ${url}`);
}

function main(): void {
  const [command, ...argv] = process.argv.slice(2);
  if (command == null || command === '--help' || command === 'help') {
    process.stdout.write(usage());
    return;
  }
  if (command !== 'put-object') {
    throw new Error(`Unknown command: ${command}\n${usage()}`);
  }
  putObject(parsePutObjectArgs(argv));
}

try {
  main();
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
