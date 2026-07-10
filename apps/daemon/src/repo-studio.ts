// @summary Safe manifest loading, exact-token source edits, and allowlisted
// verification for Repo Studio targets.
import { constants as fsConstants } from 'node:fs';
import { access, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type {
  RepoStudioApplyRequest,
  RepoStudioApplyResponse,
  RepoStudioControl,
  RepoStudioControlValue,
  RepoStudioDiffRequest,
  RepoStudioDiffResponse,
  RepoStudioInspectRequest,
  RepoStudioInspectResponse,
  RepoStudioManifest,
  RepoStudioVerification,
  RepoStudioVerifyRequest,
  RepoStudioVerifyResponse,
} from '@open-design/contracts';
import { REPO_STUDIO_PROTOCOL_VERSION } from '@open-design/contracts';

const MAX_MANIFEST_BYTES = 256_000;
const MAX_OUTPUT_BYTES = 200_000;
const DEFAULT_WINDOW_CHARS = 600;
const MAX_WINDOW_CHARS = 4_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;

export class RepoStudioError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'RepoStudioError';
  }
}

export async function inspectRepoStudio(request: RepoStudioInspectRequest): Promise<RepoStudioInspectResponse> {
  const root = await resolveProjectRoot(request.root);
  const manifest = await fetchRepoStudioManifest(request.manifestUrl);
  return { root, manifestUrl: request.manifestUrl, manifest };
}

export async function applyRepoStudioControl(request: RepoStudioApplyRequest): Promise<RepoStudioApplyResponse> {
  const { root, manifest } = await inspectRepoStudio(request);
  const component = manifest.components.find((candidate) => candidate.id === request.componentId);
  if (!component) throw new RepoStudioError(`Unknown component: ${request.componentId}`, 404);
  const control = component.controls.find((candidate) => candidate.id === request.controlId);
  if (!control) throw new RepoStudioError(`Unknown control: ${request.controlId}`, 404);
  const selected = control.options.find((option) => valuesEqual(option.value, request.value));
  if (!selected) throw new RepoStudioError(`Unsupported value for ${request.controlId}`);

  const filePath = await resolveProjectFile(root, control.edit.file);
  const before = await readFile(filePath, 'utf8');
  const markerIndex = uniqueIndexOf(before, control.edit.marker, `marker ${control.edit.marker}`);
  const windowChars = Math.min(
    Math.max(control.edit.windowChars ?? DEFAULT_WINDOW_CHARS, 64),
    MAX_WINDOW_CHARS,
  );
  const windowEnd = Math.min(before.length, markerIndex + control.edit.marker.length + windowChars);
  const editWindow = before.slice(markerIndex, windowEnd);
  const current = currentControlOption(control, editWindow);
  if (valuesEqual(current.value, selected.value)) {
    return {
      ok: true,
      file: control.edit.file,
      componentId: component.id,
      controlId: control.id,
      previousValue: current.value,
      value: selected.value,
      beforeSnippet: editWindow,
      afterSnippet: editWindow,
    };
  }

  const tokenIndex = uniqueIndexOf(editWindow, current.sourceToken, `source token ${current.sourceToken}`);
  const nextWindow = `${editWindow.slice(0, tokenIndex)}${selected.sourceToken}${editWindow.slice(tokenIndex + current.sourceToken.length)}`;
  const after = `${before.slice(0, markerIndex)}${nextWindow}${before.slice(windowEnd)}`;
  await atomicWrite(filePath, after);

  return {
    ok: true,
    file: control.edit.file,
    componentId: component.id,
    controlId: control.id,
    previousValue: current.value,
    value: selected.value,
    beforeSnippet: editWindow,
    afterSnippet: nextWindow,
  };
}

export async function verifyRepoStudio(request: RepoStudioVerifyRequest): Promise<RepoStudioVerifyResponse> {
  const { root, manifest } = await inspectRepoStudio(request);
  const verification = manifest.verification.find((candidate) => candidate.id === request.verificationId);
  if (!verification) throw new RepoStudioError(`Unknown verification: ${request.verificationId}`, 404);
  return runVerification(root, verification);
}

export async function diffRepoStudio(request: RepoStudioDiffRequest): Promise<RepoStudioDiffResponse> {
  const { root, manifest } = await inspectRepoStudio(request);
  const files = Array.from(new Set(
    manifest.components.flatMap((component) => [
      component.sourceFile,
      ...component.controls.map((control) => control.edit.file),
    ]),
  )).sort();
  for (const file of files) await resolveProjectFile(root, file);
  const result = await runProcess(root, 'git', ['diff', '--', ...files], 30_000);
  if (result.exitCode !== 0) {
    throw new RepoStudioError(`Could not read Git diff: ${result.stderr || `exit ${result.exitCode}`}`, 500);
  }
  return { clean: result.stdout.trim().length === 0, files, diff: result.stdout };
}

export async function fetchRepoStudioManifest(rawUrl: string): Promise<RepoStudioManifest> {
  const url = validateManifestUrl(rawUrl);
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new RepoStudioError(`Manifest request failed: ${response.status}`, 502);
  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (contentLength > MAX_MANIFEST_BYTES) throw new RepoStudioError('Manifest is too large', 413);
  const text = await response.text();
  if (text.length > MAX_MANIFEST_BYTES) throw new RepoStudioError('Manifest is too large', 413);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new RepoStudioError('Manifest is not valid JSON', 502);
  }
  return validateManifest(value);
}

export function validateManifest(value: unknown): RepoStudioManifest {
  if (!isRecord(value)) throw new RepoStudioError('Manifest must be an object');
  if (value.protocolVersion !== REPO_STUDIO_PROTOCOL_VERSION) {
    throw new RepoStudioError(`Unsupported Repo Studio protocol: ${String(value.protocolVersion)}`);
  }
  if (typeof value.appId !== 'string' || !value.appId) throw new RepoStudioError('Manifest appId is required');
  if (typeof value.appName !== 'string' || !value.appName) throw new RepoStudioError('Manifest appName is required');
  if (typeof value.previewUrl !== 'string') throw new RepoStudioError('Manifest previewUrl is required');
  validateManifestUrl(value.previewUrl);
  if (!Array.isArray(value.components)) throw new RepoStudioError('Manifest components must be an array');
  if (!Array.isArray(value.verification)) throw new RepoStudioError('Manifest verification must be an array');
  for (const component of value.components) validateComponent(component);
  for (const check of value.verification) validateVerification(check);
  return value as RepoStudioManifest;
}

function validateComponent(value: unknown): void {
  if (!isRecord(value)) throw new RepoStudioError('Component must be an object');
  for (const key of ['id', 'label', 'selector', 'sourceFile']) {
    if (typeof value[key] !== 'string' || !value[key]) throw new RepoStudioError(`Component ${key} is required`);
  }
  if (!Array.isArray(value.controls)) throw new RepoStudioError('Component controls must be an array');
  for (const control of value.controls) validateControl(control);
}

function validateControl(value: unknown): void {
  if (!isRecord(value)) throw new RepoStudioError('Control must be an object');
  if (typeof value.id !== 'string' || !value.id) throw new RepoStudioError('Control id is required');
  if (typeof value.label !== 'string' || !value.label) throw new RepoStudioError('Control label is required');
  if (!Array.isArray(value.options) || value.options.length === 0) throw new RepoStudioError('Control options are required');
  if (!isRecord(value.edit)) throw new RepoStudioError('Control edit descriptor is required');
  if (typeof value.edit.file !== 'string' || typeof value.edit.marker !== 'string') {
    throw new RepoStudioError('Control edit file and marker are required');
  }
  for (const option of value.options) {
    if (!isRecord(option) || typeof option.label !== 'string' || typeof option.sourceToken !== 'string' || !option.sourceToken) {
      throw new RepoStudioError('Invalid control option');
    }
  }
}

function validateVerification(value: unknown): void {
  if (!isRecord(value)) throw new RepoStudioError('Verification must be an object');
  if (typeof value.id !== 'string' || typeof value.label !== 'string' || typeof value.command !== 'string') {
    throw new RepoStudioError('Invalid verification definition');
  }
  if (!Array.isArray(value.args) || !value.args.every((arg) => typeof arg === 'string')) {
    throw new RepoStudioError('Verification args must be strings');
  }
}

async function resolveProjectRoot(rawRoot: string): Promise<string> {
  if (typeof rawRoot !== 'string' || !path.isAbsolute(rawRoot)) {
    throw new RepoStudioError('Project root must be an absolute path');
  }
  await access(rawRoot, fsConstants.R_OK | fsConstants.W_OK);
  return realpath(rawRoot);
}

async function resolveProjectFile(root: string, relativeFile: string): Promise<string> {
  if (!relativeFile || path.isAbsolute(relativeFile)) throw new RepoStudioError('Source file must be project-relative');
  const resolved = path.resolve(root, relativeFile);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new RepoStudioError('Source file escapes project root');
  const real = await realpath(resolved);
  if (real !== root && !real.startsWith(`${root}${path.sep}`)) throw new RepoStudioError('Source file escapes project root');
  await access(real, fsConstants.R_OK | fsConstants.W_OK);
  return real;
}

function validateManifestUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new RepoStudioError('Manifest URL is invalid');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new RepoStudioError('Manifest URL must use HTTP');
  const host = url.hostname.toLowerCase();
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new RepoStudioError('Manifest URL must be loopback-local');
  }
  return url;
}

function currentControlOption(control: RepoStudioControl, editWindow: string) {
  const matches = control.options.filter((option) => editWindow.includes(option.sourceToken));
  if (matches.length !== 1) {
    throw new RepoStudioError(`Expected exactly one current source token for ${control.id}; found ${matches.length}`, 409);
  }
  const current = matches[0];
  if (!current) throw new RepoStudioError(`Could not resolve the current option for ${control.id}`, 409);
  return current;
}

function valuesEqual(left: RepoStudioControlValue, right: RepoStudioControlValue): boolean {
  return String(left) === String(right);
}

function uniqueIndexOf(source: string, search: string, label: string): number {
  const first = source.indexOf(search);
  if (first < 0) throw new RepoStudioError(`Could not find ${label}`, 409);
  if (source.indexOf(search, first + search.length) >= 0) throw new RepoStudioError(`Found multiple matches for ${label}`, 409);
  return first;
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  const tempDir = await mkdtemp(path.join(dir, '.repo-studio-'));
  const tempFile = path.join(tempDir, path.basename(filePath));
  try {
    await writeFile(tempFile, content, 'utf8');
    await rename(tempFile, filePath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function runVerification(root: string, check: RepoStudioVerification): Promise<RepoStudioVerifyResponse> {
  const timeoutMs = Math.min(Math.max(check.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1_000), MAX_TIMEOUT_MS);
  const result = await runProcess(root, check.command, check.args, timeoutMs);
  return {
    ok: result.exitCode === 0 && !result.timedOut,
    verificationId: check.id,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
  };
}

async function runProcess(root: string, command: string, args: string[], timeoutMs: number): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: root,
      shell: false,
      env: { ...process.env, CI: process.env.CI ?? '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const append = (current: string, chunk: Buffer) => `${current}${chunk.toString('utf8')}`.slice(-MAX_OUTPUT_BYTES);
    child.stdout.on('data', (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk: Buffer) => { stderr = append(stderr, chunk); });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2_000).unref();
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ exitCode: null, stdout, stderr: `${stderr}${error.message}`, timedOut });
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr, timedOut });
    });
  });
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
