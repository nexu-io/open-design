/**
 * Visual harness fixtures.
 *
 * Renders the REAL `renderKitHtml` output — not a mock — across the states
 * the viewer actually has to survive: a single asset, a full kit, long
 * names, a failing compile, and an empty project. Iterating on viewer
 * design without looking at it is how the wasted-space layout shipped in
 * the first place; this makes "look at it" a command.
 *
 * Usage:  node scripts/harness/build-fixtures.mjs [outDir]
 * Then:   node scripts/harness/shoot.mjs   (screenshots every fixture)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { renderKitHtml } from "../../dist/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] ?? path.join(here, ".out");
fs.mkdirSync(outDir, { recursive: true });

/**
 * A small multi-part GLB so the viewer has real geometry to select, and so
 * the gizmo, the in-world label and the touching-parts list all have
 * something true to render. A single triangle could not exercise any of
 * them.
 */
/**
 * The demo crate, optionally rescaled and optionally pushed away from the
 * origin.
 *
 * Scale exists because every pointer-to-world conversion in the viewer is a
 * candidate for a hidden unit assumption, and a corpus that only ever
 * contains metre-sized crates cannot catch one. Offset exists because the
 * orbit pivot sits at the scene centre: a part far from it has a view depth
 * quite unlike the camera's orbit distance, which is exactly the case that
 * made the gizmo come out the wrong size in a large scene.
 */
function triangleGlb(scale = 1, offsets = [[0, 0, 0]]) {
  const boxes = [
    { name: 'prp_base', o: [0, 0, 0], s: [1.2, 0.16, 0.8], c: [0.72, 0.52, 0.3, 1] },
    { name: 'prp_body', o: [0, 0.16, 0], s: [1.0, 0.6, 0.68], c: [0.66, 0.46, 0.26, 1] },
    // Each part rests exactly on the one below (base top 0.16, body top
    // 0.76, lid top 0.86). Leaving a gap here would make the viewer's
    // touching-parts list look broken when it was in fact correct.
    { name: 'prp_lid', o: [0, 0.76, 0], s: [1.06, 0.1, 0.72], c: [0.3, 0.3, 0.33, 1] },
    { name: 'prp_handle', o: [0, 0.86, 0], s: [0.3, 0.06, 0.08], c: [0.28, 0.28, 0.3, 1] },
    // Side battens. A pure vertical stack cannot exercise the neighbourhood
    // map's lateral axis, and a map only ever reviewed against a stack is a
    // map whose horizontal behaviour nobody has actually looked at.
    { name: 'prp_batten_l', o: [-0.52, 0.16, 0], s: [0.06, 0.5, 0.6], c: [0.5, 0.35, 0.2, 1] },
    { name: 'prp_batten_r', o: [0.52, 0.16, 0], s: [0.06, 0.5, 0.6], c: [0.5, 0.35, 0.2, 1] },
  ];
  const pos = [];
  const idx = [];
  const nodes = [];
  const meshes = [];
  const materials = [];
  const accessors = [];
  const views = [];
  let posBytes = 0;
  const chunks = [];

  /* One copy of the crate per offset, so a fixture can place geometry far
     apart. That is the case the gizmo maths actually breaks on: with the
     orbit pivot at the scene centre, a part at one end of a spread-out
     scene has a view depth quite unlike the camera's orbit distance, and
     any widget sized from the orbit distance comes out wrong. A single
     cluster — however far from the origin — cannot show this, because the
     pivot lands on it. */
  const placed = [];
  for (let c = 0; c < offsets.length; c++) {
    const offset = offsets[c];
    for (const raw of boxes) {
      placed.push({
        ...raw,
        name: offsets.length > 1 ? `${raw.name}_${c}` : raw.name,
        o: [raw.o[0] * scale + offset[0], raw.o[1] * scale + offset[1], raw.o[2] * scale + offset[2]],
        s: [raw.s[0] * scale, raw.s[1] * scale, raw.s[2] * scale],
      });
    }
  }
  for (const b of placed) {
    const [sx, sy, sz] = b.s;
    const v = [];
    // Axis-aligned box centred on its own origin; the node carries the
    // placement so the viewer sees a real node transform per part.
    for (const [dx, dy, dz] of [
      [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],
    ]) v.push((dx*sx)/2, (dy*sy)/2, (dz*sz)/2);
    const faces = [0,1,2, 0,2,3, 4,6,5, 4,7,6, 0,4,5, 0,5,1, 1,5,6, 1,6,2, 2,6,7, 2,7,3, 3,7,4, 3,4,0];
    const vp = new Float32Array(v);
    const vi = new Uint16Array(faces);
    const posView = views.length;
    chunks.push(Buffer.from(vp.buffer)); views.push({ buffer: 0, byteOffset: posBytes, byteLength: vp.byteLength });
    posBytes += vp.byteLength;
    const idxView = views.length;
    chunks.push(Buffer.from(vi.buffer)); views.push({ buffer: 0, byteOffset: posBytes, byteLength: vi.byteLength });
    posBytes += vi.byteLength;
    const posAcc = accessors.length;
    accessors.push({ bufferView: posView, componentType: 5126, count: 8, type: 'VEC3' });
    const idxAcc = accessors.length;
    accessors.push({ bufferView: idxView, componentType: 5123, count: faces.length, type: 'SCALAR' });
    materials.push({ name: 'mtl_' + b.name, pbrMetallicRoughness: { baseColorFactor: b.c, metallicFactor: 0, roughnessFactor: 0.7 } });
    meshes.push({ primitives: [{ attributes: { POSITION: posAcc }, indices: idxAcc, material: materials.length - 1, mode: 4 }] });
    nodes.push({ mesh: meshes.length - 1, name: b.name, translation: [b.o[0], b.o[1] + b.s[1] / 2, b.o[2]] });
  }

  const binAll = Buffer.concat(chunks);
  const gltfMulti = {
    asset: { version: '2.0' }, scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes, meshes, materials, accessors, bufferViews: views,
    buffers: [{ byteLength: binAll.length }],
  };
  return packGlb(gltfMulti, binAll);
}

function packGlb(gltf, bin) {
  const json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (json.length % 4)) % 4;
  const binPad = (4 - (bin.length % 4)) % 4;
  const total = 12 + 8 + json.length + jsonPad + 8 + bin.length + binPad;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  let at = 12;
  out.writeUInt32LE(json.length + jsonPad, at);
  out.writeUInt32LE(0x4e4f534a, at + 4);
  json.copy(out, at + 8);
  out.fill(0x20, at + 8 + json.length, at + 8 + json.length + jsonPad);
  at += 8 + json.length + jsonPad;
  out.writeUInt32LE(bin.length + binPad, at);
  out.writeUInt32LE(0x004e4942, at + 4);
  bin.copy(out, at + 8);
  return out;
}

function unusedTriangleGlb() {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0]);
  const bin = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(indices.buffer)]);
  const gltf = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "prp_demo_part" }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0, mode: 4 }] }],
    materials: [
      { name: "mtl_demo", pbrMetallicRoughness: { baseColorFactor: [0.72, 0.52, 0.3, 1], metallicFactor: 0, roughnessFactor: 0.7 } },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength },
    ],
    buffers: [{ byteLength: bin.length }],
  };
  const json = Buffer.from(JSON.stringify(gltf), "utf8");
  const jsonPad = (4 - (json.length % 4)) % 4;
  const binPad = (4 - (bin.length % 4)) % 4;
  const total = 12 + 8 + json.length + jsonPad + 8 + bin.length + binPad;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  let at = 12;
  out.writeUInt32LE(json.length + jsonPad, at);
  out.writeUInt32LE(0x4e4f534a, at + 4);
  json.copy(out, at + 8);
  out.fill(0x20, at + 8 + json.length, at + 8 + json.length + jsonPad);
  at += 8 + json.length + jsonPad;
  out.writeUInt32LE(bin.length + binPad, at);
  out.writeUInt32LE(0x004e4942, at + 4);
  bin.copy(out, at + 8);
  return out;
}

// Mirrors what the compiler now emits by default, so the menu is reviewed
// at the length it will actually be rather than a shortened stand-in.
const downloads = [
  { label: "GLB (web / engines)", url: "demo.glb" },
  { label: "OpenUSD", url: "demo.usda" },
  { label: "USDZ (AR / Vision Pro)", url: "demo.usdz" },
  { label: "FBX (DCC interchange)", url: "demo.fbx" },
  { label: "OBJ", url: "demo.obj" },
  { label: "OBJ materials", url: "demo.mtl" },
];

const entry = (name, category, extra = {}) => ({
  name,
  category,
  glb: "demo.glb",
  downloads,
  // Derived from the name rather than a constant. Every row used to read
  // "46", which made the rail look like a rendering bug in every review
  // screenshot and hid the fact that the column is right-aligned numbers.
  parts: 3 + (name.length % 11),
  scenePath: `scenes/${name}`,
  ok: true,
  ...extra,
});

/*
 * Per-part findings in the shape writeProjectKit attaches them: part name ->
 * the issues whose target names it, errors first.
 *
 * The failing fixture used to carry only a red name and two issue CODES on
 * the scene. That is not what the viewer renders — the flagged-parts button
 * and the card's issue line both read `partIssues`, so with it absent the
 * two features that exist to make a broken scene findable were invisible in
 * every screenshot taken of the fixture built to show a broken scene.
 */
const overlap = {
  code: "S3D-E-324",
  severity: "error",
  message: "coplanar overlap between 'prp_body' and 'prp_batten_l' (4 face pair(s))",
};
const partIssues = {
  // Message text copied from the shapes src/lint actually emits, quoted
  // subject and all. Invented wording made the card look fine in review
  // while the real strings hit a different branch of shortIssue.
  prp_body: [
    overlap,
    {
      code: "S3D-W-341",
      severity: "warning",
      message: "mesh 'prp_body' has 2 ngon face(s)",
    },
  ],
  prp_batten_l: [overlap],
  prp_lid: [
    {
      code: "S3D-W-325",
      severity: "warning",
      message: "'prp_lid' floats 0.012m above the ground plane",
    },
  ],
};

/**
 * The kit sizes that matter. `single` is the common case and the one the
 * old layout wasted the most space on; `full` is the density test; `long`
 * proves names cannot blow the rail out; `failing` and `empty` are the
 * states that only ever show up when something is wrong.
 */
const FIXTURES = {
  single: { title: "Crate", entries: [entry("crate", "Scenes")] },
  full: {
    title: "3D Scene & Assets",
    entries: [
      entry("crate", "Scenes"),
      entry("eyeball_jar", "Scenes"),
      entry("jackbox", "Scenes"),
      entry("ufo_abduction", "Scenes"),
      entry("ore_rock", "Props"),
      entry("cairn", "Props"),
      entry("rune_stone", "Props"),
      entry("small_crate", "Props"),
      entry("long_crate", "Props"),
      entry("campfire", "Props"),
      entry("torch", "Props"),
      entry("lantern", "Props"),
      entry("barrel", "Props"),
      entry("watchtower", "Structures"),
      entry("supply_shed", "Structures"),
      entry("relay_mast", "Structures"),
    ],
  },
  long: {
    title: "Long names",
    entries: [
      entry("weathered_shipping_crate_variant_b", "Scenes"),
      entry("ufo_abduction_beam_with_cow", "Scenes"),
      entry("a", "Props"),
    ],
  },
  failing: {
    title: "Failing compile",
    entries: [
      entry("crate", "Scenes", {
        ok: false,
        issueCodes: ["S3D-E-324", "S3D-W-341"],
        partIssues,
      }),
      entry("jackbox", "Scenes"),
    ],
  },
  empty: { title: "Nothing yet", entries: [] },
  /* Scale domains, each a single asset so a shot of one is a shot of the
     widget rather than of the rail. */
  tiny: { title: "Millimetre scale", entries: [{ ...entry("crate_mm", "Scenes"), glb: "demo-tiny.glb" }] },
  huge: { title: "Kilometre scale", entries: [{ ...entry("crate_km", "Scenes"), glb: "demo-huge.glb" }] },
  far: { title: "Spread far apart", entries: [{ ...entry("crate_spread", "Scenes"), glb: "demo-far.glb" }] },
};

fs.writeFileSync(path.join(outDir, "demo.glb"), triangleGlb());
// Scale domains. A millimetre crate and a kilometre crate must behave
// identically on screen; anything that does not is carrying a unit
// assumption.
fs.writeFileSync(path.join(outDir, "demo-tiny.glb"), triangleGlb(0.001));
fs.writeFileSync(path.join(outDir, "demo-huge.glb"), triangleGlb(1000));
// A normal crate parked far from the scene origin, so its view depth and
// the camera's orbit distance are nothing like each other.
// Two crates a long way apart: the orbit pivot lands between them, so
// neither part's depth resembles the camera's orbit distance.
fs.writeFileSync(
  path.join(outDir, "demo-far.glb"),
  triangleGlb(40, [[0, 0, 0], [0, 0, 1800]]),
);
for (const name of ["demo.usda", "demo.usdz", "demo.fbx", "demo.obj", "demo.mtl"]) {
  fs.writeFileSync(path.join(outDir, name), "# harness placeholder\n");
}
for (const [name, page] of Object.entries(FIXTURES)) {
  fs.writeFileSync(path.join(outDir, `${name}.html`), renderKitHtml(page), "utf8");
}
console.log(`wrote ${Object.keys(FIXTURES).length} fixtures to ${outDir}`);
