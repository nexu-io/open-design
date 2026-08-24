import { Issue, UsdaPrimTree, Census } from "../types.js";
import { ISSUE_CODES } from "../errors.js";
import { NormalizedContract, BLENDER_DEFAULT_NAMES } from "../contract.js";

export interface LintContext {
  contract: NormalizedContract;
  census?: Census;
  primTree?: UsdaPrimTree;
  /**
   * Object names that came from a `file:` import — third-party geometry the
   * author did not author vertex-by-vertex. Its provenance is "imported", so
   * the topology/UV gates that punish open meshes, doubles, odd winding, or a
   * missing unwrap relax for it (a downloaded GLB is inspected, not judged) —
   * the same posture the `mesh` source kind gets scene-wide, made per-part. A
   * `watertight` claim still enforces closure on a specific part; and an author
   * who imports nothing has an empty set, so nothing changes.
   */
  imported?: Set<string>;
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
      // Suggest the closest prefix rather than just listing them: a model
      // reading "must start with one of prp_, cam_, lgt_, mtl_" after writing
      // `moot_foot` has to guess; naming the nearest match turns a thrash
      // into a one-token edit. Nearest by shared leading characters, ties
      // broken alphabetically so the suggestion is deterministic.
      const suggestion = [...contract.partPrefixes]
        .sort((a, b) => {
          const shared = (p: string) => {
            let n = 0;
            while (n < p.length && n < name.length && p[n] === name[n]) n++;
            return -n;
          };
          return shared(a) - shared(b) || (a < b ? -1 : 1);
        })[0]!;
      issues.push({
        code: ISSUE_CODES.NAME_PREFIX,
        severity: "error",
        message: `'${name}' must start with one of ${contract.partPrefixes.join(", ")}`,
        hint: `did you mean '${suggestion}${name}'?`,
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
  } else if (ctx.census) {
    // No authored prim tree (a build.py / scene.json spec scene): the depth
    // rule used to silently never run for exactly those scenes. Walk the
    // census's object PARENT CHAIN instead. Deriving a prim tree from the
    // EXPORT would instead drag Blender's own structure — the `_materials`
    // scope, the per-object Xform wrappers — into the naming and collection
    // pattern rules and manufacture false positives; the export's naming is
    // already lintExportedStage's job.
    const parentOf = new Map(ctx.census.objects.map((o) => [o.name, o.parent]));
    for (const obj of ctx.census.objects) {
      let depth = 1;
      let cursor = obj.parent;
      const seen = new Set<string>([obj.name]);
      while (cursor && !seen.has(cursor)) {
        seen.add(cursor);
        depth++;
        cursor = parentOf.get(cursor) ?? null;
      }
      if (depth > contract.maxDepth) {
        issues.push({
          code: ISSUE_CODES.DEPTH_LIMIT,
          severity: "error",
          message: `'${obj.name}' exceeds max hierarchy depth ${contract.maxDepth}`,
          target: obj.name,
          detail: { depth },
        });
      }
    }
  }
}

function baseName(name: string): string {
  return name.replace(/\.\d+$/, "");
}