import { Issue, UsdaPrimTree, Census } from "../types.js";
import { ISSUE_CODES } from "../errors.js";
import { NormalizedContract, BLENDER_DEFAULT_NAMES } from "../contract.js";

export interface LintContext {
  contract: NormalizedContract;
  census?: Census;
  primTree?: UsdaPrimTree;
}

/**
 * Naming discipline. Blender auto-names (`Cube.001`, `Empty`, `Collection`)
 * are the strongest signal that a scene was dropped out of a generative
 * loop without being humanized — these rules turn that smell into stable
 * codes the agent learns once.
 */
export function lintNaming(ctx: LintContext, issues: Issue[]): void {
  const { contract } = ctx;
  const targets = new Map<string, { source: "prim" | "object"; depth?: number }>();
  if (ctx.primTree) {
    for (const prim of ctx.primTree.prims) targets.set(prim.name, { source: "prim" });
  }
  if (ctx.census) {
    for (const obj of ctx.census.objects) targets.set(obj.name, { source: "object" });
  }

  for (const [name, info] of targets) {
    if (contract.forbidDefaultNames && BLENDER_DEFAULT_NAMES.has(baseName(name))) {
      issues.push({
        code: ISSUE_CODES.NAME_DEFAULT,
        severity: "error",
        message: `'${name}' is a Blender default name`,
        hint: `give the ${info.source} a descriptive name`,
        target: name,
      });
      continue;
    }
    if (!contract.objectPattern.test(name)) {
      issues.push({
        code: ISSUE_CODES.NAME_PATTERN,
        severity: "error",
        message: `'${name}' does not match ${contract.objectPattern}`,
        hint: "use [A-Za-z][A-Za-z0-9_]{2,63}",
        target: name,
      });
      continue;
    }
    if (contract.partPrefixes.length > 0 && !contract.partPrefixes.some((p) => name.startsWith(p))) {
      issues.push({
        code: ISSUE_CODES.NAME_PREFIX,
        severity: "error",
        message: `'${name}' must start with one of ${contract.partPrefixes.join(", ")}`,
        target: name,
      });
    }
  }

  if (ctx.primTree) {
    const depthMap = new Map<string, number>();
    const stack: Array<{ prim: (typeof ctx.primTree.prims)[number]; depth: number }> = [];
    for (const child of ctx.primTree.root.children) stack.push({ prim: child, depth: 1 });
    while (stack.length > 0) {
      const { prim, depth } = stack.pop()!;
      depthMap.set(prim.name, depth);
      for (const child of prim.children) stack.push({ prim: child, depth: depth + 1 });
    }
    for (const [name, depth] of depthMap) {
      if (depth > contract.maxDepth) {
        issues.push({
          code: ISSUE_CODES.DEPTH_LIMIT,
          severity: "error",
          message: `'${name}' exceeds max hierarchy depth ${contract.maxDepth}`,
          target: name,
          detail: { depth },
        });
      }
    }
    for (const prim of ctx.primTree.prims) {
      if (prim.kind !== "scope") continue;
      if (contract.forbidDefaultNames && BLENDER_DEFAULT_NAMES.has(prim.name)) {
        issues.push({
          code: ISSUE_CODES.COLLECTION_NAME_DEFAULT,
          severity: "error",
          message: `scope '${prim.name}' is a Blender default collection name`,
          target: prim.name,
        });
      } else if (!contract.collectionPattern.test(prim.name)) {
        issues.push({
          code: ISSUE_CODES.COLLECTION_NAME_PATTERN,
          severity: "error",
          message: `scope '${prim.name}' does not match ${contract.collectionPattern}`,
          target: prim.name,
        });
      }
    }
  }
}

function baseName(name: string): string {
  return name.replace(/\.\d+$/, "");
}