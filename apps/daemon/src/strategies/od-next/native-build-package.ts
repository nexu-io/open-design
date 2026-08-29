import { createHash } from 'node:crypto';

import type { OpenDesignPlanContractV2 } from '@open-design/contracts';

export interface OdNextNativeBuildPackageBinding {
  buildPackageId: string;
  nativeAgentHandle: string;
  dependsOn: string[];
}

function handleDigest(input: {
  taskExecutionId: string;
  taskRunIndex: number;
  planContractHash: string;
  buildPackageId: string;
}): string {
  return createHash('sha256')
    .update([
      input.taskExecutionId,
      String(input.taskRunIndex),
      input.planContractHash,
      input.buildPackageId,
    ].join('\0'), 'utf8')
    .digest('hex');
}

/**
 * Derive stable opaque native agent handles from the locked task identity.
 * Package ownership is later accepted only from the runtime's structured
 * native agent-type field after it matches one of these daemon-issued handles.
 */
export function createOdNextNativeBuildPackageBindings(input: {
  taskExecutionId: string;
  taskRunIndex: number;
  planContractHash: string;
  plan: OpenDesignPlanContractV2;
}): OdNextNativeBuildPackageBinding[] {
  if (input.plan.fullPlan.executionMode !== 'complex') return [];
  if (!Number.isSafeInteger(input.taskRunIndex) || input.taskRunIndex <= 0) {
    throw new TypeError('Native Build Package bindings require a positive taskRunIndex.');
  }
  const bindings = input.plan.fullPlan.buildPackages.map((buildPackage, index) => ({
    buildPackageId: buildPackage.id,
    nativeAgentHandle: `od-build-${index + 1}-${handleDigest({
      ...input,
      buildPackageId: buildPackage.id,
    }).slice(0, 16)}`,
    dependsOn: [...buildPackage.dependsOn],
  }));
  if (
    new Set(bindings.map(({ buildPackageId }) => buildPackageId)).size !== bindings.length
    || new Set(bindings.map(({ nativeAgentHandle }) => nativeAgentHandle)).size !== bindings.length
  ) {
    throw new TypeError('Native Build Package bindings must be one-to-one.');
  }
  return bindings;
}

export function nativeBuildPackageBindingMap(
  bindings: readonly OdNextNativeBuildPackageBinding[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(bindings.map(({ nativeAgentHandle, buildPackageId }) => (
    [nativeAgentHandle, buildPackageId]
  )));
}
