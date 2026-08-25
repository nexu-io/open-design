/**
 * Author the USD model hierarchy onto an exported stage.
 *
 * Blender's USD exporter writes geometry, materials, cameras and lights. It
 * does not write the semantics that make the result a *model*: no `kind`, no
 * `purpose`, no `assetInfo`. Those were being patched in afterwards by
 * regex from the Blender runner, which is the wrong place twice over — the
 * runner has no parser, so it matched on raw text, and it had no idea what
 * the asset actually was, so it wrote `kind = "component"` onto everything.
 *
 * Two things were wrong in the shipped artifact as a result:
 *
 *   The proof-render rig shipped as part of the asset. `scene.glb` from a
 *   compile contains exactly the meshes; `scene.usda` from the SAME compile
 *   contained those plus the hero camera, the key light and the dome light.
 *   Import the USD into an engine and you inherit lighting you never asked
 *   for, while the GLB of the same asset is clean. Two deliverables, two
 *   different answers about what the asset is.
 *
 *   A multi-part arrangement claimed to be a `component`. In USD's model
 *   hierarchy a component is a leaf model — the thing you reference as one
 *   asset. Declaring it on a root that contains several independent parts
 *   says the arrangement is atomic, and it means nothing beneath the root is
 *   addressable as a model at all.
 *
 * So this runs on the TypeScript side, after export, where the real USDA
 * parser lives. It reads the stage the same way the linter does, decides
 * from what is actually there, and splices. Splicing rather than
 * regenerating because the parser is deliberately structure-only: it does
 * not model every attribute it can see, so re-serialising from the parse
 * tree would quietly drop whatever it does not understand.
 *
 * The stage is self-describing, so this needs no census: a staging prim is
 * one that wraps a Camera or a Light, which is exactly the same rule
 * `deriveAssetKind` uses when it says a crate lit by a key light is still a
 * crate.
 */

import { parseUsda } from "../parse/usda.js";
import { UsdaPrim } from "../types.js";

/** Prim types that are the compiler's own rig, never the asset. */
const STAGING_TYPES = new Set(["Camera", "Speaker"]);

/** True for Camera/Speaker and for anything whose type name ends in Light. */
function isStagingType(typeName: string | null): boolean {
  if (!typeName) return false;
  return STAGING_TYPES.has(typeName) || /Light$/.test(typeName);
}

/**
 * A prim is staging when it IS a rig prim or when it is the transform that
 * carries one. Blender exports every object as an Xform wrapping the typed
 * data prim, so the camera the user sees in the tree is the Xform.
 */
function isStagingPrim(prim: UsdaPrim): boolean {
  if (isStagingType(prim.typeName)) return true;
  return prim.children.some((child) => isStagingType(child.typeName));
}

export interface StageModelAuthoring {
  /** Root prim path, e.g. "root". Absent when the stage declares no default. */
  rootName: string | null;
  /** What the root was declared as. */
  rootKind: "component" | "assembly" | null;
  /** Prims marked as referenceable component models. */
  components: string[];
  /** Named sub-parts inside a component. */
  subcomponents: string[];
  /** Prims marked `purpose = "guide"` — the compiler's rig, not the asset. */
  guides: string[];
  /** True when an assetInfo block was added. */
  assetInfo: boolean;
}

export interface StageModelResult {
  usda: string;
  authored: StageModelAuthoring;
}

/** Leading whitespace of a line, so inserted lines match their neighbours. */
function indentOf(line: string): string {
  return /^\s*/.exec(line)?.[0] ?? "";
}

/**
 * Locate a prim's metadata parens and its body brace.
 *
 * Parenthesis depth is tracked rather than matching the first brace, because
 * a metadata block can itself contain one: Blender writes
 * `customData = { dictionary Blender = { ... } }` inside the parens, and a
 * naive scan would mistake that for the prim's body and splice attributes
 * into the middle of a dictionary.
 */
/**
 * Character-walk state that survives across lines: whether we are inside a
 * quoted string (single or triple). Structural characters inside string
 * values must not move the depth counters — an ordinary parenthetical in a
 * doc string ("cut at 45mm (approx") permanently desynced the old scan and
 * silently dropped kind authoring (found by adversarial review, reproduced
 * live).
 */
interface ScanState {
  inString: boolean;
  triple: boolean;
}

/**
 * One line with every in-string character replaced by a space: columns
 * preserved, so line-anchored regexes ("^\s*kind\s*=") stay meaningful,
 * while text inside doc/customData values can never masquerade as a
 * declaration. The "does this already declare kind/purpose/assetInfo"
 * scans MUST read masked lines — matching raw text silently overwrote
 * string content that merely resembled metadata (found by adversarial
 * review, reproduced live).
 */
function maskStrings(line: string, state: ScanState): string {
  // Fast path for the lines that dominate a real master: geometry data.
  // A mesh-heavy stage is a few thousand lines, several MB each, and not
  // one of them contains a quote — masking those char-by-char is what
  // turned this authoring pass into gigabytes of string churn. No open
  // string, no quote on the line → the line IS its own mask.
  if (!state.inString && line.indexOf('"') === -1) return line;
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (state.inString) {
      if (state.triple && line.startsWith('"""', i)) {
        state.inString = false;
        state.triple = false;
        out += "   ";
        i += 3;
        continue;
      }
      if (!state.triple && line[i] === "\\") {
        out += "  ";
        i += 2;
        continue;
      }
      if (!state.triple && line[i] === '"') state.inString = false;
      out += " ";
      i++;
      continue;
    }
    if (line.startsWith('"""', i)) {
      state.inString = true;
      state.triple = true;
      out += "   ";
      i += 3;
      continue;
    }
    if (line[i] === '"') {
      state.inString = true;
      out += " ";
      i++;
      continue;
    }
    out += line[i];
    i++;
  }
  return out;
}

function primSpan(
  lines: string[],
  defLine: number,
): { metaOpen: number | null; bodyOpen: number | null } {
  let depth = 0;
  let metaOpen: number | null = null;
  const state: ScanState = { inString: false, triple: false };
  for (let i = defLine; i < lines.length; i++) {
    // charCodeAt over the masked line, not an array of one-char strings:
    // this walk can cross multi-MB data lines, and materializing a string
    // per character was one of the allocation storms that OOM'd the
    // daemon on a real master. The mask keeps in-string characters inert
    // (they become spaces) at zero cost for quote-free lines.
    const masked = maskStrings(lines[i] ?? "", state);
    for (let j = 0; j < masked.length; j++) {
      const c = masked.charCodeAt(j);
      if (c === 40 /* ( */) {
        if (depth === 0 && metaOpen === null) metaOpen = i;
        depth++;
      } else if (c === 41 /* ) */) {
        depth--;
      } else if (c === 123 /* { */ && depth === 0) {
        return { metaOpen, bodyOpen: i };
      }
    }
  }
  return { metaOpen, bodyOpen: null };
}

/** One pending text edit, applied back-to-front so indices stay valid. */
interface Splice {
  /** Line index to insert before, or to replace when `replace` is set. */
  at: number;
  replace?: boolean;
  text: string[];
}

/**
 * Declare `kind` on a prim, replacing any existing declaration.
 *
 * `kind` is prim METADATA, so it belongs inside the parentheses — unlike
 * `purpose`, which is an attribute and belongs in the body. Getting that
 * backwards produces a file that still parses and means nothing.
 */
function setKind(lines: string[], prim: UsdaPrim, kind: string, out: Splice[]): boolean {
  const defLine = prim.line - 1;
  if (defLine < 0 || defLine >= lines.length) return false;
  const { metaOpen, bodyOpen } = primSpan(lines, defLine);
  if (bodyOpen === null) return false;
  const indent = indentOf(lines[defLine] ?? "");

  if (metaOpen !== null) {
    // Replace an existing kind rather than adding a second one — matched
    // on STRING-MASKED lines, so "kind =" inside a doc value is inert.
    // The mask state walks from the def line so a string opened before
    // the metadata parens is tracked correctly.
    const state: ScanState = { inString: false, triple: false };
    const masked: string[] = [];
    for (let i = defLine; i < bodyOpen; i++) masked[i] = maskStrings(lines[i] ?? "", state);
    for (let i = metaOpen; i < bodyOpen; i++) {
      if (/^\s*kind\s*=/.test(masked[i] ?? "")) {
        out.push({ at: i, replace: true, text: [`${indentOf(lines[i] ?? "")}kind = "${kind}"`] });
        return true;
      }
    }
    out.push({ at: metaOpen + 1, text: [`${indent}    kind = "${kind}"`] });
    return true;
  }

  // No metadata parens yet: the `( kind = ... )` block belongs BETWEEN the
  // prim's name and its body brace.
  if (bodyOpen > defLine) {
    // Brace on a later line — the block goes on its own lines before it, which
    // reads as `def Xform "Root"\n(\n  kind=...\n)\n{`. This is the form
    // Blender's pxr text writer produces and it round-trips cleanly.
    out.push({
      at: bodyOpen,
      text: [`${indent}(`, `${indent}    kind = "${kind}"`, `${indent})`],
    });
    return true;
  }

  // Brace on the def line itself (`def Xform "Root" {`, the shape a USDA-source
  // scene commonly hand-writes). Splicing the block BEFORE this line would put
  // it at stage scope, not prim scope — an unparseable stage, which is worse
  // than not authoring at all. Split the line at the body brace and thread the
  // parens between the name and the `{`. The brace column is found on
  // string-masked text so a `{` inside the prim name's quotes cannot fool it.
  const defText = lines[defLine] ?? "";
  const braceCol = maskStrings(defText, { inString: false, triple: false }).indexOf("{");
  if (braceCol < 0) return false;
  const head = defText.slice(0, braceCol).replace(/\s+$/, "");
  const tail = defText.slice(braceCol);
  out.push({
    at: defLine,
    replace: true,
    text: [`${head} (`, `${indent}    kind = "${kind}"`, `${indent}) ${tail}`],
  });
  return true;
}

/**
 * Declare `purpose` on a prim, replacing any existing declaration.
 *
 * An attribute, so it goes in the body. `uniform` because purpose cannot
 * vary over time — USD requires the declaration to say so.
 */
function setPurpose(lines: string[], prim: UsdaPrim, purpose: string, out: Splice[]): boolean {
  const defLine = prim.line - 1;
  if (defLine < 0 || defLine >= lines.length) return false;
  const { bodyOpen } = primSpan(lines, defLine);
  if (bodyOpen === null) return false;
  const indent = `${indentOf(lines[defLine] ?? "")}    `;

  // Only scan the immediate body, not nested prims: a child's purpose is
  // its own business and must not be mistaken for this prim's. String
  // content is skipped so a brace inside a doc value cannot desync depth.
  let depth = 0;
  const state: ScanState = { inString: false, triple: false };
  for (let i = bodyOpen; i < lines.length; i++) {
    const line = lines[i] ?? "";
    // One masked pass serves both jobs: depth from its structural chars,
    // and the declaration match on text that string content cannot fake.
    // charCodeAt, not for..of — iterating a string yields a fresh one-char
    // string per character, and this walk crosses the data lines.
    const masked = maskStrings(line, state);
    for (let j = 0; j < masked.length; j++) {
      const c = masked.charCodeAt(j);
      if (c === 123 /* { */) depth++;
      else if (c === 125 /* } */) depth--;
    }
    if (i > bodyOpen && depth <= 0) break;
    if (i > bodyOpen && depth === 1 && /^\s*(uniform\s+)?token\s+purpose\s*=/.test(masked)) {
      out.push({ at: i, replace: true, text: [`${indentOf(line)}uniform token purpose = "${purpose}"`] });
      return true;
    }
  }
  out.push({ at: bodyOpen + 1, text: [`${indent}uniform token purpose = "${purpose}"`] });
  return true;
}

/** Add the stage-level assetInfo block when the stage carries none. */
function addAssetInfo(lines: string[], assetName: string, out: Splice[]): boolean {
  const state: ScanState = { inString: false, triple: false };
  const masked = lines.map((line) => maskStrings(line, state));
  for (const line of masked) {
    if (/^\s*assetInfo\s*=/.test(line)) return false;
  }
  const header = masked.findIndex((l) => /^\s*\(\s*$/.test(l) || /#usda\s+1\.0\s*\($/.test(l));
  if (header < 0) return false;
  out.push({
    at: header + 1,
    text: [
      "    assetInfo = {",
      `        string name = "${assetName.replace(/"/g, "")}"`,
      '        string version = "1"',
      "    }",
    ],
  });
  return true;
}

export interface StageModelInput {
  /** Raw text of the exported `.usda`. */
  usda: string;
  /** Asset name for `assetInfo`, normally the project directory name. */
  assetName: string;
  /** Source path, for parse-error attribution only. */
  file?: string;
}

/**
 * Rewrite an exported stage so it declares what it is.
 *
 * Returns the original text unchanged when the stage cannot be parsed or
 * declares no default prim — a stage this cannot understand is one it must
 * not edit, and the linter will have its own say either way.
 */
export function authorStageModel(input: StageModelInput): StageModelResult {
  const none: StageModelAuthoring = {
    rootName: null,
    rootKind: null,
    components: [],
    subcomponents: [],
    guides: [],
    assetInfo: false,
  };

  let tree;
  try {
    tree = parseUsda(input.usda, input.file ?? "<usda>");
  } catch {
    return { usda: input.usda, authored: none };
  }

  const rootName = tree.stage.defaultPrim;
  const root = rootName ? tree.root.children.find((p) => p.name === rootName) : undefined;
  if (!root) return { usda: input.usda, authored: none };

  const children = root.children.filter((p) => p.kind === "def");
  const guides = children.filter(isStagingPrim);
  /* Scopes are namespace containers, not geometry — Blender parks materials
     under `_materials`. Counting one as a geometry root would turn every
     single-part prop into an assembly. */
  const geometry = children.filter((p) => !isStagingPrim(p) && p.typeName !== "Scope");

  /*
   * One geometry root is a component: a single referenceable asset, which is
   * exactly what `deriveAssetKind` calls a prop. More than one is an
   * arrangement, and USD's word for an arrangement of components is an
   * assembly. Both are decided from the stage itself, so a USDA-authored
   * scene with no Blender census gets the same treatment as a built one.
   */
  const rootKind: "component" | "assembly" = geometry.length > 1 ? "assembly" : "component";

  /* Split on either EOL and rejoin with the stage's own. Splitting on bare
     "\n" left every retained line carrying its "\r" while every SPLICED line
     went out bare — a mixed-EOL stage — and the def-line split above even
     threaded a stray "\r" into the middle of the rewritten line. Blender's
     writer emits LF, so this only ever bit hand-authored (Windows-authored)
     .usda sources — which "USD is the master" makes a first-class path. */
  const eol = input.usda.includes("\r\n") ? "\r\n" : "\n";
  const lines = input.usda.split(/\r\n|\n/);
  const splices: Splice[] = [];
  const authored: StageModelAuthoring = {
    rootName: root.name,
    rootKind,
    components: [],
    subcomponents: [],
    guides: [],
    assetInfo: false,
  };

  setKind(lines, root, rootKind, splices);

  for (const prim of geometry) {
    if (rootKind === "assembly") {
      // Each top-level part becomes a model in its own right, so a consumer
      // can reference one piece of an arrangement instead of all of it.
      if (setKind(lines, prim, "component", splices)) authored.components.push(prim.name);
    } else {
      /* Under a component the parts are not models — USD forbids a model
         beneath a component — but they are still the named pieces someone
         wants to select and talk about, which is precisely what
         `subcomponent` is for. */
      if (setKind(lines, prim, "subcomponent", splices)) authored.subcomponents.push(prim.name);
    }
  }

  for (const prim of guides) {
    if (setPurpose(lines, prim, "guide", splices)) authored.guides.push(prim.name);
  }

  authored.assetInfo = addAssetInfo(lines, input.assetName, splices);

  // Back-to-front, so an earlier splice cannot shift a later one's index.
  splices.sort((a, b) => b.at - a.at || (a.replace === b.replace ? 0 : a.replace ? -1 : 1));
  for (const splice of splices) {
    lines.splice(splice.at, splice.replace ? 1 : 0, ...splice.text);
  }

  return { usda: lines.join(eol), authored };
}
