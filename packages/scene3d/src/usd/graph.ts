/**
 * A legible scene-GRAPH view of the exported USD, for an LLM.
 *
 * USD is the master format and `scene.usda` is technically text — but every
 * prim is buried under multi-kilobyte `points` / `faceVertexIndices` / `normals`
 * / `primvars:st` arrays, so an agent that `read`s the file blows its context on
 * vertex data before it reaches the semantics that make it a MODEL: the prim
 * tree, `kind`/`purpose`, xforms, and material bindings. This walks the parsed
 * stage (reusing the compiler's own `parseUsda`, which collapses those bulk
 * arrays) and emits ONLY that semantic layer — the thing an agent needs to
 * reason about the shipped artifact rather than trust that export worked.
 *
 * Deterministic (a pure function of the .usda text), no Blender.
 */
import { parseUsda, walkPrims } from "../parse/usda.js";
import type { UsdaPrim } from "../types.js";

const unquote = (s: string | undefined): string | undefined =>
  s === undefined ? undefined : s.replace(/^"(.*)"$/s, "$1");

/**
 * Strip control characters — NEWLINES included — from any text taken verbatim
 * from the .usda (a prim name, a `kind`, a material path, a shader id). Without
 * this, a prim whose quoted name contains a newline becomes MULTIPLE lines in
 * the graph, and a crafted name reads as a legitimate child prim (type, `kind=`,
 * transform) — a forged row in the very text an agent trusts as the shipped
 * asset's ground truth. USD source can be third-party (imported glTF/FBX names,
 * a hand-authored usda), so this is not a friendly-input assumption. Found by an
 * adversarial fuzz pass.
 */
const clean = (s: string): string => s.replace(/[\u0000-\u001f\u007f]/g, "\uFFFD");

/** The material/shader target `</root/_materials/mtl_wood>` → `mtl_wood`. */
const lastSegment = (path: string): string =>
  path.replace(/[<>]/g, "").split("/").filter(Boolean).pop() ?? path;

/** Round a raw USDA tuple `(0, 0, 0.059999)` to `(0,0,0.06)` for reading. */
function compactTuple(raw: string): string {
  const nums = raw
    .replace(/[()[\]]/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const n = Number(s);
      return Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : s;
    });
  return `(${nums.join(",")})`;
}

/** A compact T/R/S summary, omitting identity components. */
function xformSummary(prim: UsdaPrim): string {
  const bits: string[] = [];
  const norm = (v: string) => v.replace(/[\s()]/g, "");
  const t = prim.attributes.get("xformOp:translate");
  const r = prim.attributes.get("xformOp:rotateXYZ");
  const s = prim.attributes.get("xformOp:scale");
  if (t && norm(t) !== "0,0,0") bits.push(`T${compactTuple(t)}`);
  if (r && norm(r) !== "0,0,0" && norm(r) !== "0,-0,0") bits.push(`R${compactTuple(r)}`);
  if (s && norm(s) !== "1,1,1") bits.push(`S${compactTuple(s)}`);
  return bits.join(" ");
}

/** A Material's surface shaders, collapsed — `UsdPreviewSurface + MaterialX` —
 *  so the graph names WHAT the material is without dumping its whole node
 *  network (every internal `ND_*` node is noise to a reader). */
function materialSummary(prim: UsdaPrim): string {
  const surfaces: string[] = [];
  let hasMaterialX = false;
  walkPrims(prim, (child) => {
    const id = unquote(child.attributes.get("info:id"));
    if (!id) return;
    if (id === "UsdPreviewSurface" && !surfaces.includes(id)) surfaces.push(id);
    else if (id.startsWith("ND_")) hasMaterialX = true;
  });
  if (hasMaterialX) surfaces.push("MaterialX");
  return surfaces.join(" + ");
}

/**
 * Render `scene.usda` as a semantic scene-graph tree. Returns a human/agent
 * readable multi-line string; on a parse failure returns a one-line reason
 * rather than throwing (the deliverable still shipped).
 */
export function renderUsdGraph(usda: string): string {
  let tree;
  try {
    tree = parseUsda(usda);
  } catch (err) {
    return `usd graph: could not parse scene.usda — ${(err as Error).message}`;
  }
  const st = tree.stage;
  const header =
    `stage: ${clean(st.defaultPrim ?? "?")}` +
    ` (up=${st.upAxis ?? "?"}, metersPerUnit=${st.metersPerUnit ?? 1}` +
    `${st.hasAssetInfo ? ", assetInfo" : ""}` +
    `${st.startTimeCode !== undefined ? `, frames ${st.startTimeCode}–${st.endTimeCode ?? st.startTimeCode}` : ""})`;
  const lines: string[] = [header];

  const emit = (prim: UsdaPrim, depth: number): void => {
    const indent = "  ".repeat(Math.max(0, depth - 1));
    const type = prim.typeName ?? prim.kind;
    const bits: string[] = [];
    const kind = unquote(prim.metadata.get("kind"));
    if (kind) bits.push(`kind=${kind}`);
    const purpose = unquote(prim.metadata.get("purpose"));
    if (purpose) bits.push(`purpose=${purpose}`);
    const xf = xformSummary(prim);
    if (xf) bits.push(xf);
    const mat = prim.attributes.get("material:binding");
    if (mat) bits.push(`mat=${lastSegment(mat)}`);
    if (prim.typeName === "Material") {
      const surf = materialSummary(prim);
      if (surf) bits.push(surf);
    } else {
      const shaderId = unquote(prim.attributes.get("info:id"));
      if (shaderId) bits.push(shaderId);
    }
    lines.push(
      `${indent}${clean(prim.name)}  ${clean(type)}${bits.length ? "  " + bits.map(clean).join("  ") : ""}`,
    );
  };

  // Manual DFS so the shader NETWORK under a Material can be pruned — its guts
  // are summarised on the Material line, not spilled node by node.
  const dfs = (prim: UsdaPrim, depth: number): void => {
    if (prim.name !== "$stage") emit(prim, depth);
    if (prim.typeName === "Material") return; // pruned — summarised above
    for (const child of prim.children) dfs(child, depth + 1);
  };
  dfs(tree.root, 0);

  return lines.join("\n");
}
