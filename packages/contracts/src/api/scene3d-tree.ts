/**
 * Scene3D Part Hierarchy and Tree Layout Subsystem.
 *
 * Provides pure TypeScript algorithms for organizing 3D scene part DAGs into
 * clean, hierarchical, prototype-clustered tree rows with prim path resolution.
 * Shared across @open-design/contracts, @open-design/web, and @open-design/scene3d.
 */

/**
 * Trailing naming token regex: ordinals (_1, _f2, blade3) or positions
 * (_left, _fl, _upper, _side, etc.). Stripped at most twice so mirror-and-corner
 * families like `bracket_bl_side` / `bracket_fr_top` meet at `bracket`, while
 * distinct prototypes with real names never merge. The stem must keep at least
 * 4 characters so collapsing to a fragment doesn't group unrelated parts.
 */
export const TREE_STEM_SUFFIX =
  /[._-](?:[a-z]*\d+|l|r|fl|fr|bl|br|left|right|front|back|top|bottom|upper|lower|mid|middle|side|end|a|b|c|xn|xp|yn|yp|zn|zp)$/i;

/**
 * Extract base prototype stem from a part name by stripping trailing naming tokens.
 */
export function protoStem(name: string): string {
  let stem = String(name);
  for (let i = 0; i < 2; i++) {
    const next = stem.replace(TREE_STEM_SUFFIX, '');
    if (next === stem || next.length < 4) break;
    stem = next;
  }
  return stem;
}

/**
 * Compute USD-style prim paths from a flat parent list (e.g. `/crate/lid/prp_handle`).
 * Guards against cyclic references by falling back to root form.
 */
export function primPaths(
  tree: ReadonlyArray<{ name: string; parent: string | null }>,
): Map<string, string> {
  const byName = new Map(tree.map((p) => [p.name, p]));
  const paths = new Map<string, string>();
  const pathOf = (node: { name: string; parent: string | null }, guard: Set<string>): string => {
    if (paths.has(node.name)) return paths.get(node.name)!;
    if (guard.has(node.name)) return '/' + node.name; // cycle fallback
    guard.add(node.name);
    const parent = node.parent !== null ? byName.get(node.parent) : undefined;
    const full = (parent ? pathOf(parent, guard) : '') + '/' + node.name;
    paths.set(node.name, full);
    return full;
  };
  for (const node of tree) pathOf(node, new Set<string>());
  return paths;
}

/**
 * Generic node input for the part tree layout builder.
 */
export interface Scene3dTreeNodeInput {
  name: string;
  parent: string | null;
  type: string;
  mesh?: { verts: number; faces: number } | null | undefined;
  tris?: number | undefined;
  dimensions?: [number, number, number] | undefined;
  /**
   * Nature glyph flags:
   * - `a`: animated / keyframed
   * - `w`: watertight
   * - `x`: textured
   */
  glyphs?: string | undefined;
  /** Ground gap in metres when the part floats above tolerance. */
  groundGap?: number | undefined;
  /** Bone count on armature objects. */
  bones?: number | undefined;
  /** Authored source line in scene.json. */
  sourceLine?: number | undefined;
}

/**
 * An individual part instance row in the formatted tree.
 */
export interface Scene3dTreeInstanceRow {
  kind: 'instance';
  key: string;
  name: string;
  type: string;
  depth: number;
  path: string;
  targetNames: string[];
  mesh: { verts: number; faces: number } | null;
  tris?: number | undefined;
  dimensions?: [number, number, number] | undefined;
  glyphs?: string | undefined;
  groundGap?: number | undefined;
  bones?: number | undefined;
  node: Scene3dTreeNodeInput;
}

/**
 * A prototype cluster row grouping 3 or more clone instances.
 */
export interface Scene3dTreePrototypeRow {
  kind: 'prototype';
  key: string;
  stem: string;
  count: number;
  type: string;
  depth: number;
  path: string;
  /** Every part in the prototype's subtree (for selecting all geometry). */
  targetNames: string[];
  /** Direct member names belonging to this prototype cluster. */
  memberNames: string[];
  mesh: { verts: number; faces: number } | null;
  tris?: number | undefined;
  dimensions?: [number, number, number] | undefined;
  glyphs?: string | undefined;
  worstGroundGap?: number | undefined;
  bones?: number | undefined;
  members: Scene3dTreeNodeInput[];
}

export type Scene3dTreeRow = Scene3dTreeInstanceRow | Scene3dTreePrototypeRow;

/** Minimum number of sibling clone instances to collapse into a prototype row. */
export const PROTOTYPE_CLUSTER_THRESHOLD = 3;

/**
 * Build a structured, hierarchical, prototype-clustered tree row list from flat part inputs.
 *
 * Algorithm mirrors the kit viewer breakdown:
 * 1. Build parent-to-children index and USD prim paths.
 * 2. Compute structural subtree signatures so identical assemblies match all the way down.
 * 3. Group sibling nodes by signature. Clusters of >=3 instances collapse into one prototype row
 *    (`stem ×count`), with the first instance's children walked once beneath it.
 * 4. Clusters of 1-2 instances render as standard instance rows with their subtrees walked.
 */
export function buildPartTreeLayout(
  tree: readonly Scene3dTreeNodeInput[],
  threshold = PROTOTYPE_CLUSTER_THRESHOLD,
): Scene3dTreeRow[] {
  if (!tree || tree.length === 0) return [];

  const byParent = new Map<string | null, Scene3dTreeNodeInput[]>();
  for (const node of tree) {
    const key = node.parent !== null && tree.some((t) => t.name === node.parent) ? node.parent : null;
    const list = byParent.get(key);
    if (list) {
      list.push(node);
    } else {
      byParent.set(key, [node]);
    }
  }

  const paths = primPaths(tree);

  const subtreeNames = (node: Scene3dTreeNodeInput, out: string[]): string[] => {
    out.push(node.name);
    for (const child of byParent.get(node.name) || []) {
      subtreeNames(child, out);
    }
    return out;
  };

  const sigCache = new Map<string, string>();
  const sigOf = (node: Scene3dTreeNodeInput): string => {
    if (sigCache.has(node.name)) return sigCache.get(node.name)!;
    const kids = (byParent.get(node.name) || []).map(sigOf).sort();
    const sig = `${protoStem(node.name)}|${node.type || 'MESH'}(${kids.join(',')})`;
    sigCache.set(node.name, sig);
    return sig;
  };

  const result: Scene3dTreeRow[] = [];

  const walk = (parentKey: string | null, depth: number): void => {
    const siblings = byParent.get(parentKey) || [];
    const slots: Array<{ key: string; stem: string; members: Scene3dTreeNodeInput[] }> = [];
    const clusters = new Map<string, { stem: string; members: Scene3dTreeNodeInput[] }>();

    for (const node of siblings) {
      const key = sigOf(node);
      const existing = clusters.get(key);
      if (existing) {
        existing.members.push(node);
      } else {
        const cluster = { stem: protoStem(node.name), members: [node] };
        clusters.set(key, cluster);
        slots.push({ key, ...cluster });
      }
    }

    for (const slot of slots) {
      if (slot.members.length >= threshold) {
        const memberNames = slot.members.map((m) => m.name);
        const targetNames: string[] = [];
        for (const m of slot.members) {
          subtreeNames(m, targetNames);
        }

        // Aggregate facts: glyphs union, worst ground gap
        const glyphSet = new Set<string>();
        let worstGap: number | undefined;
        for (const m of slot.members) {
          if (m.glyphs) {
            for (const g of m.glyphs) glyphSet.add(g);
          }
          if (typeof m.groundGap === 'number') {
            if (worstGap === undefined || m.groundGap > worstGap) {
              worstGap = m.groundGap;
            }
          }
        }
        const aggregatedGlyphs = ['a', 'w', 'x'].filter((c) => glyphSet.has(c)).join('') || undefined;

        const firstNode = slot.members[0]!;
        const protoRow: Scene3dTreePrototypeRow = {
          kind: 'prototype',
          key: `proto:${parentKey ?? 'root'}:${slot.stem}:${slot.members.length}`,
          stem: slot.stem,
          count: slot.members.length,
          type: firstNode.type,
          depth,
          path: paths.get(firstNode.name) ?? `/${slot.stem}`,
          targetNames,
          memberNames,
          mesh: firstNode.mesh ?? null,
          tris: firstNode.tris,
          dimensions: firstNode.dimensions,
          glyphs: aggregatedGlyphs,
          worstGroundGap: worstGap,
          bones: firstNode.bones,
          members: slot.members,
        };
        result.push(protoRow);

        // Walk first instance's children underneath
        walk(firstNode.name, depth + 1);
      } else {
        for (const member of slot.members) {
          const targetNames: string[] = [];
          subtreeNames(member, targetNames);

          const instRow: Scene3dTreeInstanceRow = {
            kind: 'instance',
            key: `inst:${member.name}`,
            name: member.name,
            type: member.type,
            depth,
            path: paths.get(member.name) ?? `/${member.name}`,
            targetNames,
            mesh: member.mesh ?? null,
            tris: member.tris,
            dimensions: member.dimensions,
            glyphs: member.glyphs,
            groundGap: member.groundGap,
            bones: member.bones,
            node: member,
          };
          result.push(instRow);

          walk(member.name, depth + 1);
        }
      }
    }
  };

  walk(null, 0);
  return result;
}
