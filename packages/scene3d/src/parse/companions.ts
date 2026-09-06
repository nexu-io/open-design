import * as fs from "node:fs";
import * as path from "node:path";

/**
 * The files a source depends on but does not contain.
 *
 * A scene's inputs are not its declared file list. glTF 2.0 legally splits a
 * model across a `.gltf` and an external `.bin`; an `.obj` names its materials
 * in a sibling `.mtl`, which in turn names texture files. All of that is
 * geometry and appearance the build reads, and none of it was in the content
 * hash — so editing `model.bin` and recompiling reported `build: cached` and
 * shipped the OLD geometry, with `--no-cache` as the only way to discover it.
 * A cache key that omits a real input does not make builds fast, it makes them
 * wrong.
 *
 * Resolution is by reference, not by "hash the whole folder": a cache that
 * busts when the README changes trades a correctness bug for a precision bug
 * and quietly breaks the determinism story. Where a reference cannot be
 * resolved the file is still recorded by PATH, so `hashFiles`' present/missing
 * domain separation makes it appear when it appears.
 *
 * Unknown containers (`.glb`, `.fbx`, `.blend`) are self-contained in every
 * shape this compiler produces or ingests; a `.glb` with external `uri`s is
 * legal but vanishingly rare in practice, and guessing at binary formats here
 * would be a second parser to keep in sync with Blender's. That boundary is
 * deliberate and stated rather than silently assumed.
 */

/** How deep a reference chain may go (obj → mtl → texture is two). */
const MAX_DEPTH = 4;

export function companionFiles(sourceFiles: readonly string[]): string[] {
  const found = new Set<string>();
  const queue = sourceFiles.map((f) => ({ file: f, depth: 0 }));
  const visited = new Set(sourceFiles.map((f) => path.resolve(f)));

  while (queue.length > 0) {
    const { file, depth } = queue.shift()!;
    if (depth >= MAX_DEPTH) continue;
    for (const ref of referencesOf(file)) {
      const abs = path.resolve(path.dirname(file), ref);
      if (visited.has(abs)) continue;
      visited.add(abs);
      found.add(abs);
      queue.push({ file: abs, depth: depth + 1 });
    }
  }
  return [...found].sort();
}

/** Relative paths a source names, for the formats whose references are text. */
function referencesOf(file: string): string[] {
  const ext = path.extname(file).toLowerCase();
  if (ext !== ".gltf" && ext !== ".obj" && ext !== ".mtl") return [];
  let text: string;
  try {
    // A companion may itself be missing; that is a fact for hashFiles to
    // record, not a reason to fail the compile.
    text = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  return ext === ".gltf" ? gltfRefs(text) : objRefs(text);
}

/** `buffers[].uri` and `images[].uri`, skipping embedded data: payloads. */
function gltfRefs(text: string): string[] {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return [];
  }
  if (typeof doc !== "object" || doc === null) return [];
  const out: string[] = [];
  for (const key of ["buffers", "images"] as const) {
    const list = (doc as Record<string, unknown>)[key];
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const uri = (entry as { uri?: unknown } | null)?.uri;
      if (typeof uri === "string" && uri.length > 0 && !uri.startsWith("data:")) {
        out.push(decodeUri(uri));
      }
    }
  }
  return out;
}

/** `mtllib` from an OBJ, and `map_*`/`bump`/`disp`/`refl` from an MTL. */
function objRefs(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const space = line.search(/\s/);
    if (space < 0) continue;
    const keyword = line.slice(0, space).toLowerCase();
    const rest = line.slice(space + 1).trim();
    if (keyword === "mtllib") {
      // One directive may name several libraries.
      for (const name of rest.split(/\s+/)) if (name) out.push(name);
    } else if (keyword.startsWith("map_") || keyword === "bump" || keyword === "disp" || keyword === "refl") {
      // Options precede the filename (`-bm 0.2 rock.png`); the path is the
      // last token, and MTL has no quoting to unpick.
      const tokens = rest.split(/\s+/).filter(Boolean);
      const name = tokens[tokens.length - 1];
      if (name && !name.startsWith("-")) out.push(name);
    }
  }
  return out;
}

function decodeUri(uri: string): string {
  try {
    return decodeURIComponent(uri);
  } catch {
    return uri;
  }
}
