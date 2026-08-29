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
  /*
   * The naming checks run PER PRIM and PER OBJECT, not over a name-keyed set.
   * USD lets two prims share a leaf name under different parents (the same fact
   * the depth check below is careful about), so a map keyed on name would let
   * one prim's naming violation overwrite another's and report only the last —
   * an under-count on a naming-strict contract, and a finding that cannot say
   * WHICH prim it means. `where` carries the parent so the two are told apart
   * in the message, and `line` makes their issue identities distinct so the
   * dedup keeps both. Census object names are unique, so they need no such
   * discriminator.
   */
  const checkName = (
    name: string,
    source: "prim" | "object",
    where: string,
    identity: Record<string, unknown>,
  ): void => {
    if (contract.forbidDefaultNames && BLENDER_DEFAULT_NAMES.has(baseName(name))) {
      issues.push({
        code: ISSUE_CODES.NAME_DEFAULT,
        severity: "error",
        message: `${where} is a Blender default name`,
        hint: `give the ${source} a descriptive name`,
        target: name,
        detail: identity,
      });
      return;
    }
    if (!contract.objectPattern.test(name)) {
      issues.push({
        code: ISSUE_CODES.NAME_PATTERN,
        severity: "error",
        message: `${where} does not match ${contract.objectPattern}`,
        hint: "use [A-Za-z][A-Za-z0-9_]{2,63}",
        target: name,
        detail: identity,
      });
      return;
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
        message: `${where} must start with one of ${contract.partPrefixes.join(", ")}`,
        hint: `did you mean '${suggestion}${name}'?`,
        target: name,
        detail: identity,
      });
    }
  };

  if (ctx.primTree) {
    for (const prim of ctx.primTree.prims) {
      const where =
        prim.parent !== null ? `'${prim.name}' (under '${prim.parent}')` : `'${prim.name}'`;
      checkName(prim.name, "prim", where, { parent: prim.parent, line: prim.line });
    }
  }
  if (ctx.census) {
    for (const obj of ctx.census.objects) {
      checkName(obj.name, "object", `'${obj.name}'`, {});
    }
  }

  if (ctx.primTree) {
    /* Keyed by PATH, never by leaf name. USD lets two prims share a leaf
       name under different parents, so a name-keyed map lets whichever
       the walk reaches last win — and a real depth violation is erased
       by a shallow namesake visited after it. A prim's identity is its
       path; its name is a display fact. */
    const depthMap = new Map<string, { name: string; depth: number }>();
    const stack: Array<{
      prim: (typeof ctx.primTree.prims)[number];
      depth: number;
      path: string;
    }> = [];
    for (const child of ctx.primTree.root.children) {
      stack.push({ prim: child, depth: 1, path: `/${child.name}` });
    }
    while (stack.length > 0) {
      const { prim, depth, path } = stack.pop()!;
      depthMap.set(path, { name: prim.name, depth });
      for (const child of prim.children) {
        stack.push({ prim: child, depth: depth + 1, path: `${path}/${child.name}` });
      }
    }
    for (const [path, { name, depth }] of depthMap) {
      if (depth > contract.maxDepth) {
        issues.push({
          code: ISSUE_CODES.DEPTH_LIMIT,
          severity: "error",
          message: `'${path}' exceeds max hierarchy depth ${contract.maxDepth}`,
          target: name,
          // The full PATH is the identity, not the leaf name: two prims sharing
          // a leaf name at the same depth under different parents are two real
          // violations, and a dedup keyed on name + depth would collapse them
          // into one — dropping a violation the path traversal just found.
          detail: { path, depth, maxDepth: contract.maxDepth },
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
          detail: { depth, maxDepth: contract.maxDepth },
        });
      }
    }
  }
}

function baseName(name: string): string {
  return name.replace(/\.\d+$/, "");
}