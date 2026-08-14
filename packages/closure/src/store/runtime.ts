import { writeJsonFile } from "@open-design/sidecar";

import {
  ClosureStoreError,
  normalizeReleaseVersion,
  normalizeShellBinding,
  sameReleaseBinding,
  sameShellBinding,
  type ClosureBindingDescriptor,
  type ClosureReleaseBinding,
  type ClosureRuntimeBinding,
  type ClosureRuntimePointer,
  type ClosureShellBinding,
  type ClosureStorePaths,
} from "./binding.js";
import { readClosureBindingDescriptor } from "./legacy-candidate.js";

async function writeDescriptor(
  paths: ClosureStorePaths,
  descriptor: ClosureBindingDescriptor,
): Promise<ClosureBindingDescriptor> {
  const next = { ...descriptor, updatedAt: new Date().toISOString() };
  await writeJsonFile(paths.bindingPath, next);
  return next;
}

function expectedBinding(
  actual: ClosureReleaseBinding | null,
  expected: ClosureReleaseBinding | ClosureRuntimePointer,
  label: string,
): ClosureReleaseBinding {
  if (actual == null) throw new ClosureStoreError(`Closure ${label} binding is missing`);
  const pointer = "standalone" in expected ? expected.standalone : expected;
  if (
    actual.standalone.generation !== pointer.generation
    || actual.standalone.digest !== pointer.digest
    || actual.standalone.version !== pointer.version
    || actual.standalone.target !== pointer.target
  ) {
    throw new ClosureStoreError(`Closure ${label} binding changed concurrently`);
  }
  return actual;
}

export async function publishPreparedClosureBinding(
  paths: ClosureStorePaths,
  pointer: ClosureRuntimePointer,
  releaseVersion: string,
): Promise<ClosureBindingDescriptor> {
  const current = await readClosureBindingDescriptor(paths);
  if (pointer.generation !== current.nextGeneration) {
    throw new ClosureStoreError("prepared Closure generation is stale");
  }
  const prepared: ClosureReleaseBinding = {
    releaseVersion: normalizeReleaseVersion(releaseVersion),
    standalone: pointer,
  };
  return await writeDescriptor(paths, {
    ...current,
    activationAuthorized: false,
    nextGeneration: current.nextGeneration + 1,
    prepared,
  });
}

export async function authorizePreparedClosureActivation(
  paths: ClosureStorePaths,
  expected: ClosureReleaseBinding | ClosureRuntimePointer,
): Promise<ClosureReleaseBinding> {
  const current = await readClosureBindingDescriptor(paths);
  const prepared = expectedBinding(current.prepared, expected, "prepared");
  await writeDescriptor(paths, { ...current, activationAuthorized: true });
  return prepared;
}

export async function activatePreparedClosureBinding(
  paths: ClosureStorePaths,
  expected: ClosureReleaseBinding | ClosureRuntimePointer,
  shell: ClosureShellBinding,
): Promise<ClosureRuntimeBinding> {
  const current = await readClosureBindingDescriptor(paths);
  if (current.attempt != null) {
    throw new ClosureStoreError("Closure activation is blocked by an unfinished attempt");
  }
  const prepared = expectedBinding(current.prepared, expected, "prepared");
  const attempt: ClosureRuntimeBinding = { ...prepared, shell: normalizeShellBinding(shell) };
  await writeDescriptor(paths, {
    ...current,
    active: attempt,
    attempt,
    activationAuthorized: false,
    prepared: null,
  });
  return attempt;
}

export async function beginActiveClosureBindingAttempt(
  paths: ClosureStorePaths,
  expected: ClosureReleaseBinding | ClosureRuntimePointer,
  shellInput: ClosureShellBinding,
): Promise<ClosureRuntimeBinding> {
  const current = await readClosureBindingDescriptor(paths);
  if (current.attempt != null) {
    throw new ClosureStoreError("Closure activation is blocked by an unfinished attempt");
  }
  const active = expectedBinding(current.active, expected, "active");
  if (current.active == null) throw new ClosureStoreError("Closure active binding is missing");
  const shell = normalizeShellBinding(shellInput);
  if (sameShellBinding(current.active.shell, shell)) return current.active;
  const attempt: ClosureRuntimeBinding = { ...active, shell };
  await writeDescriptor(paths, { ...current, active: attempt, attempt });
  return attempt;
}

export async function confirmClosureBindingAttempt(
  paths: ClosureStorePaths,
  expected: ClosureReleaseBinding | ClosureRuntimePointer,
): Promise<ClosureRuntimeBinding> {
  const current = await readClosureBindingDescriptor(paths);
  expectedBinding(current.attempt, expected, "attempt");
  const attempt = current.attempt;
  if (attempt == null) throw new ClosureStoreError("Closure attempt binding is missing");
  await writeDescriptor(paths, {
    ...current,
    active: attempt,
    attempt: null,
    lastSuccessful: attempt,
  });
  return attempt;
}

export async function rollbackClosureBindingAttempt(
  paths: ClosureStorePaths,
  expected?: ClosureReleaseBinding | ClosureRuntimePointer,
): Promise<ClosureRuntimeBinding | null> {
  const current = await readClosureBindingDescriptor(paths);
  if (current.attempt == null) return current.lastSuccessful;
  if (expected != null) expectedBinding(current.attempt, expected, "attempt");
  await writeDescriptor(paths, {
    ...current,
    active: current.lastSuccessful,
    attempt: null,
    activationAuthorized: false,
    prepared: null,
  });
  return current.lastSuccessful;
}

export async function recoverInterruptedClosureBinding(
  paths: ClosureStorePaths,
): Promise<ClosureRuntimeBinding | null> {
  const descriptor = await readClosureBindingDescriptor(paths);
  return descriptor.attempt == null
    ? descriptor.active
    : await rollbackClosureBindingAttempt(paths, descriptor.attempt);
}

export function isCurrentClosureBinding(
  current: ClosureReleaseBinding | null,
  expected: ClosureReleaseBinding,
): boolean {
  return current != null && sameReleaseBinding(current, expected);
}
