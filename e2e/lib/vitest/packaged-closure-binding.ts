import { readFile } from 'node:fs/promises';

import { resolveClosureStorePaths } from '@open-design/closure/store';

type JsonRecord = Record<string, unknown>;

export type PackagedClosureBindingExpectation = {
  channel: string;
  namespace: string;
  releaseVersion: string;
  target: string;
  version: string;
};

export type PackagedStandaloneStatusExpectation = {
  namespace: string;
  releaseVersion: string;
};

function record(value: unknown, label: string): JsonRecord {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value as JsonRecord;
}

export function assertPackagedClosureBinding(
  value: unknown,
  expected?: PackagedClosureBindingExpectation,
): JsonRecord {
  const binding = record(value, 'packaged Closure binding');
  const committed = record(binding.committed, 'packaged Closure committed binding');
  const standalone = record(committed.standalone, 'packaged Closure standalone binding');
  if (expected != null) {
    for (const [name, actual, wanted] of [
      ['releaseVersion', committed.releaseVersion, expected.releaseVersion],
      ['channel', standalone.channel, expected.channel],
      ['namespace', standalone.namespace, expected.namespace],
      ['target', standalone.target, expected.target],
      ['version', standalone.version, expected.version],
    ] as const) {
      if (actual !== wanted) throw new Error(`packaged Closure binding ${name} mismatch: ${String(actual)} != ${wanted}`);
    }
  }
  if (
    typeof standalone.digest !== 'string'
    || !/^sha256:[0-9a-f]{64}$/u.test(standalone.digest)
    || standalone.protocolVersion !== 1
  ) throw new Error('packaged Closure standalone identity is invalid');
  return binding;
}

export function assertPackagedStandaloneStatus(
  value: unknown,
  expected: PackagedStandaloneStatusExpectation,
): JsonRecord {
  const status = record(value, 'packaged Standalone status');
  const handoff = record(status.handoff, 'packaged Standalone handoff');
  const descriptor = record(handoff.descriptor, 'packaged Standalone descriptor');
  const release = record(descriptor.release, 'packaged Standalone release descriptor');
  const standalone = record(descriptor.standalone, 'packaged Standalone identity');
  const scope = record(handoff.scope, 'packaged Standalone scope');
  for (const [name, actual, wanted] of [
    ['release version', release.version, expected.releaseVersion],
    ['Standalone version', standalone.version, expected.releaseVersion],
    ['protocol version', standalone.protocolVersion, 1],
    ['generation', scope.generation, 0],
    ['namespace', scope.namespace, expected.namespace],
    ['state', status.state, 'running'],
  ] as const) {
    if (actual !== wanted) throw new Error(`packaged Standalone ${name} mismatch: ${String(actual)} != ${wanted}`);
  }
  if (typeof status.pid !== 'number') throw new Error('packaged Standalone pid is invalid');
  return status;
}

export async function readPackagedClosureBinding(input: {
  channel: string;
  label: string;
  namespace: string;
  root: string;
  expected?: PackagedClosureBindingExpectation;
}): Promise<Record<string, unknown>> {
  const bindingPath = resolveClosureStorePaths({
    channel: input.channel,
    namespace: input.namespace,
    root: input.root,
  }).bindingPath;
  const source = await readFile(bindingPath, 'utf8');
  const value = JSON.parse(source.replace(/^\uFEFF/u, '')) as unknown;
  try {
    return assertPackagedClosureBinding(value, input.expected);
  } catch (error) {
    throw new Error(`${input.label} Closure binding is invalid: ${bindingPath}`, { cause: error });
  }
}
