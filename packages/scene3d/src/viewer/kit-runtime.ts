/**
 * The kit viewer runtime — a dependency-free WebGL2 glTF/GLB renderer.
 *
 * The proof turntable was always a compromise: eight PNGs is the compiler
 * describing the asset to the person who asked for it. This renders the
 * actual mesh, so the asset can be orbited, zoomed, panned, and downloaded
 * from one page — the whole kit browsable in a single artifact.
 *
 * It ships no third-party runtime on purpose. A CDN import is dead the
 * moment the preview iframe is sandboxed or the machine is offline, and
 * vendoring a full engine to draw untextured, unanimated boxes is a poor
 * trade. GLB is a 12-byte header plus a JSON chunk plus a binary chunk, and
 * scene3d's own exports are exactly the subset that needs: indexed
 * triangles, POSITION and NORMAL, and a baseColorFactor per material. That
 * subset is a few hundred lines and it cannot rot.
 *
 * Exported as a string rather than a bundled module because it is inlined
 * into a self-contained HTML file the daemon serves as a project file.
 */
export const KIT_RUNTIME_JS = String.raw`
"use strict";

/* ---------- GLB container ------------------------------------------- */

function parseGlb(buffer) {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("not a GLB file");
  let offset = 12;
  let json = null;
  let bin = null;
  // Bounds-checked walk: a truncated artifact must fail as "truncated
  // GLB", not as a RangeError out of getUint32 or a SyntaxError out of
  // JSON.parse on half a chunk.
  while (offset + 8 <= view.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + length > view.byteLength) throw new Error("truncated GLB chunk");
    if (type === 0x4e4f534a) {
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, length)));
    } else if (type === 0x004e4942) {
      bin = buffer.slice(start, start + length);
    }
    // Chunks are 4-byte aligned.
    offset = start + length + ((4 - (length % 4)) % 4);
  }
  if (!json) throw new Error("GLB has no JSON chunk");
  return { json: json, bin: bin };
}

const COMPONENT = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
  5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
};
const COMPONENTS_PER = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAccessor(gltf, bin, index) {
  const accessor = gltf.accessors[index];
  const Type = COMPONENT[accessor.componentType];
  const per = COMPONENTS_PER[accessor.type];
  if (accessor.bufferView === undefined) return new Type(accessor.count * per);
  const bufferView = gltf.bufferViews[accessor.bufferView];
  const base = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  const stride = bufferView.byteStride;
  // Interleaved buffers need element-by-element extraction; tightly packed
  // ones can alias the ArrayBuffer directly.
  if (!stride || stride === per * Type.BYTES_PER_ELEMENT) {
    return new Type(bin, base, accessor.count * per);
  }
  const out = new Type(accessor.count * per);
  const bytes = new DataView(bin);
  for (let i = 0; i < accessor.count; i++) {
    for (let c = 0; c < per; c++) {
      const at = base + i * stride + c * Type.BYTES_PER_ELEMENT;
      // Every component type COMPONENT advertises gets its own read —
      // the signed types used to fall through to getUint8, so a legal
      // interleaved Int16 accessor read one unsigned byte per component.
      out[i * per + c] =
        Type === Float32Array ? bytes.getFloat32(at, true)
        : Type === Uint32Array ? bytes.getUint32(at, true)
        : Type === Uint16Array ? bytes.getUint16(at, true)
        : Type === Int16Array ? bytes.getInt16(at, true)
        : Type === Int8Array ? bytes.getInt8(at)
        : bytes.getUint8(at);
    }
  }
  return out;
}

/* ---------- Minimal linear algebra ----------------------------------- */

function mul(a, b) {
  const o = new Float32Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
function identity() {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}
function fromTrs(node) {
  const m = identity();
  if (node.matrix) return new Float32Array(node.matrix);
  const t = node.translation || [0, 0, 0];
  const r = node.rotation || [0, 0, 0, 1];
  const s = node.scale || [1, 1, 1];
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  m[0] = (1 - (yy + zz)) * s[0]; m[1] = (xy + wz) * s[0];     m[2] = (xz - wy) * s[0];
  m[4] = (xy - wz) * s[1];       m[5] = (1 - (xx + zz)) * s[1]; m[6] = (yz + wx) * s[1];
  m[8] = (xz + wy) * s[2];       m[9] = (yz - wx) * s[2];     m[10] = (1 - (xx + yy)) * s[2];
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2];
  return m;
}
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const o = new Float32Array(16);
  o[0] = f / aspect; o[5] = f; o[11] = -1;
  o[10] = (far + near) / (near - far);
  o[14] = (2 * far * near) / (near - far);
  return o;
}
function lookAt(eye, target, up) {
  const z = norm([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}
function cross(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function dot(a, b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function norm(v) { const l = Math.hypot(v[0],v[1],v[2]) || 1; return [v[0]/l, v[1]/l, v[2]/l]; }

/* ---------- Renderer -------------------------------------------------- */

const VERT = [
  "#version 300 es",
  "in vec3 aPos; in vec3 aNormal; in vec2 aUv;",
  "uniform mat4 uModel, uView, uProj;",
  "out vec3 vNormal; out vec3 vWorld; out vec2 vUv;",
  "void main() {",
  "  vec4 world = uModel * vec4(aPos, 1.0);",
  "  vWorld = world.xyz;",
  "  vNormal = mat3(uModel) * aNormal;",
  "  vUv = aUv;",
  "  gl_Position = uProj * uView * world;",
  "}",
].join("\n");

const FRAG = [
  "#version 300 es",
  "precision highp float;",
  "in vec3 vNormal; in vec3 vWorld; in vec2 vUv;",
  "uniform vec4 uColor; uniform vec3 uEye; uniform float uMetallic; uniform float uRough;",
  // Emissive energy in linear space (factor × KHR emissive strength). Added
  // after the lighting so an emissive part glows regardless of the rig —
  // which is what makes a live emission tweak readable in the viewport.
  // With an emissive MAP (uHasEm) it becomes the map's multiplier, exactly
  // the glTF contract: emissive = emissiveTexture × factor × strength.
  "uniform vec3 uEmissive;",
  // glTF metallic-roughness map: roughness rides G, metallic rides B, both
  // LINEAR (the upload skips sRGB). The gate is per-channel because a user
  // override on one scalar must stop that channel's map without silencing
  // the other — override semantics shared with the compile-side runner.
  "uniform sampler2D uMrMap; uniform vec2 uMrGate;",
  "uniform sampler2D uEmMap; uniform float uHasEm;",
  // uMap samples in LINEAR space (the upload uses an SRGB8_ALPHA8 internal
  // format, so the GPU linearises), matching the linear baseColorFactor —
  // the single display transform at the end covers both paths.
  "uniform sampler2D uMap; uniform float uHasMap;",
  // X-ray / spectral pass. uXray is the energize-in amount (0 = the solid
  // material above, 1 = full inspection ghost). uMode picks which QUESTION the
  // colour answers — each a different diagnostic, not a recolour of one fact:
  // 0 curvature (how the form is built — convex vs concave, screen-space
  // derivatives), 1 inverted normals (which faces point the wrong way — a
  // binary facing flag), 2 clearance (gaps, contacts and buried parts — the
  // per-part proximity in uHeat). Only clearance ever alarms.
  "uniform float uXray; uniform float uGhost; uniform float uMode; uniform float uHeat;",
  "out vec4 outColor;",
  // The inspection ramp: ink indigo -> deep teal -> steel neutral -> amber
  // gold -> cream white-hot. Luminance climbs monotonically so it reads as
  // data, the body is desaturated so it reads as a premium instrument rather
  // than a rainbow, and the low end IS near-black so it melts into the dark
  // stage. This replaces Turbo, whose saturated rainbow read as acid candy.
  "vec3 inspectionRamp(float t){",
  "  t = clamp(t, 0.0, 1.0);",
  "  const vec3 c0 = vec3(0.043, 0.063, 0.149);",
  "  const vec3 c1 = vec3(0.070, 0.227, 0.353);",
  "  const vec3 c2 = vec3(0.118, 0.478, 0.549);",
  "  const vec3 c3 = vec3(0.561, 0.651, 0.639);",
  "  const vec3 c4 = vec3(0.784, 0.588, 0.235);",
  "  const vec3 c5 = vec3(0.961, 0.902, 0.784);",
  "  vec3 c = mix(c0, c1, smoothstep(0.00, 0.22, t));",
  "  c = mix(c, c2, smoothstep(0.22, 0.45, t));",
  "  c = mix(c, c3, smoothstep(0.45, 0.65, t));",
  "  c = mix(c, c4, smoothstep(0.65, 0.82, t));",
  "  c = mix(c, c5, smoothstep(0.82, 1.00, t));",
  "  return c;",
  "}",
  // Thin-film hue as a compressed cosine arc — teal to magenta to gold, sub-
  // full-cycle and desaturated, so the spectrum reads as a dielectric coating
  // and not a novelty hologram. Driven by view angle at the call site, so it
  // sweeps as the camera orbits — the spectrum split the user wanted, earned.
  "vec3 filmArc(float p){",
  "  const vec3 a = vec3(0.60, 0.56, 0.58);",
  "  const vec3 b = vec3(0.28, 0.24, 0.30);",
  "  const vec3 c = vec3(0.80, 0.80, 0.80);",
  "  const vec3 d = vec3(0.00, 0.20, 0.45);",
  "  return a + b * cos(6.28318 * (c * p + d));",
  "}",
  // PCG integer hash: fract(sin(...)) is banned here as driver-dependent; a
  // hash over the reinterpreted bits of the cell coordinate is byte-identical
  // on every GPU.
  "uint pcg(uint x){ x = x * 747796405u + 2891336453u; uint w = ((x >> ((x >> 28) + 4u)) ^ x) * 277803737u; return (w >> 22) ^ w; }",
  "float hcell(vec3 cell){ uvec3 q = floatBitsToUint(cell); uint h = pcg(q.x ^ pcg(q.y ^ pcg(q.z))); return float(h) * (1.0 / 4294967296.0); }",
  // Sparse iridescent glints — the jewelry. Fine cells, but only the top ~7%
  // ever light, with a round sub-cell falloff (not blocky squares) and a
  // grazing catch so they twinkle as you orbit. The fwidth term culls flakes
  // once a cell falls under a pixel, so dense or distant assets never dissolve
  // back into the static this replaces.
  "float flakeGlint(vec3 wpos, vec3 nrm, vec3 view){",
  "  float S = 90.0;",
  "  float spark = smoothstep(0.93, 1.0, hcell(floor(wpos * S)));",
  "  vec3 f = fract(wpos * S) - 0.5;",
  "  float soft = 1.0 - smoothstep(0.15, 0.5, length(f));",
  "  float grab = pow(1.0 - clamp(dot(nrm, view), 0.0, 1.0), 3.0);",
  "  float aa = 1.0 - smoothstep(0.5, 1.5, length(fwidth(wpos * S)));",
  "  return spark * soft * grab * aa;",
  "}",
  "void main() {",
  "  vec3 n = normalize(vNormal);",
  "  vec3 v = normalize(uEye - vWorld);",
  // Three fixed lights: key, fill, rim. A studio rig rather than a single
  // lamp, so form reads from every orbit angle instead of going black.
  "  vec3 key = normalize(vec3(0.6, 0.8, 0.5));",
  "  vec3 fill = normalize(vec3(-0.7, 0.2, 0.4));",
  "  vec3 rimL = normalize(vec3(0.0, -0.9, -0.4));",
  "  float d = max(dot(n, key), 0.0) * 1.0 + max(dot(n, fill), 0.0) * 0.35 + max(dot(n, rimL), 0.0) * 0.25;",
  "  vec3 hv = normalize(key + v);",
  // Factors multiply their maps where a map is gated in — the glTF
  // contract — so a brushed panel stays brushed while its slider scales it.
  "  vec2 mrTex = (uMrGate.x > 0.5 || uMrGate.y > 0.5) ? texture(uMrMap, vUv).gb : vec2(1.0);",
  "  float rough = clamp(uRough * mix(1.0, mrTex.x, uMrGate.x), 0.0, 1.0);",
  "  float metal = clamp(uMetallic * mix(1.0, mrTex.y, uMrGate.y), 0.0, 1.0);",
  "  float spec = pow(max(dot(n, hv), 0.0), mix(8.0, 128.0, 1.0 - rough)) * mix(0.12, 0.9, metal);",
  "  vec3 base = uColor.rgb * (uHasMap > 0.5 ? texture(uMap, vUv).rgb : vec3(1.0));",
  "  vec3 lit = base * (0.22 + d * 0.9) + vec3(spec) * mix(vec3(1.0), base, metal);",
  "  lit += uHasEm > 0.5 ? texture(uEmMap, vUv).rgb * uEmissive : uEmissive;",
  // Approximate sRGB for display; the GLB carries linear factors.
  "  vec3 disp = pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2));",
  // The spectral SKIN, one calm material: a dominant fill that IS the data,
  // and three whispers on top — a grazing-only silhouette sheen, rare
  // iridescent flakes, and thin cool structure lines. The body is the
  // instrument; the spectrum is jewelry, and jewelry is rare.
  "  vec3 nn = n * (gl_FrontFacing ? 1.0 : -1.0);",
  "  float graze = 1.0 - clamp(dot(nn, v), 0.0, 1.0);",
  // 1. FILL — the base colour, whose LANGUAGE differs per mode so each reads
  // as a distinct instrument, not a recolour: a diverging ramp for curvature,
  // a binary flag for inverted normals, a sequential ramp for clearance.
  "  vec3 fillCol;",
  "  if (uMode < 0.5) {",
  // Curvature — screen-space normal derivative, normalised by the world-space
  // pixel size so the reading does not swim with zoom. Sign splits convex from
  // concave; the diverging ramp reads cavities cool and ridges warm, flats at
  // the neutral steel midpoint. (Marmoset / URP screen-space-cavity technique.)
  "    vec3 dNx = dFdx(n); vec3 dNy = dFdy(n);",
  "    vec3 dPx = dFdx(vWorld); vec3 dPy = dFdy(vWorld);",
  "    float k = (dot(dNx, dPx) + dot(dNy, dPy)) / (dot(dPx, dPx) + dot(dPy, dPy) + 1e-8);",
  "    fillCol = inspectionRamp(clamp(0.5 + k * 0.45, 0.0, 1.0));",
  "  } else if (uMode < 1.5) {",
  // Inverted normals — a binary facing flag, like Blender's Face Orientation.
  // Tests the NORMAL ATTRIBUTE against the view direction, not the winding
  // (gl_FrontFacing): a visible surface whose normal points AWAY from you is a
  // flipped normal, and that is convention-independent — it does not depend on
  // whether the exporter wound faces CW or CCW. Teal reads correct, red wrong.
  "    fillCol = dot(normalize(vNormal), v) >= 0.0 ? vec3(0.118, 0.478, 0.549) : vec3(0.898, 0.290, 0.239);",
  "  } else {",
  // Clearance — the proximity ramp; the alarm below flags interpenetration.
  "    fillCol = inspectionRamp(clamp(uHeat, 0.0, 1.0));",
  "  }",
  // The ornament — the iridescent sheen and flakes — is dialled almost out in
  // normals mode, so the binary flag reads crisp rather than muddied into a
  // pretty haze. Curvature and clearance keep it.
  "  float orn = (uMode > 0.5 && uMode < 1.5) ? 0.18 : 1.0;",
  "  vec3 skin = fillCol;",
  // Shared thin-film hue, driven by view angle so it sweeps as the camera
  // orbits rather than sitting as a flat sheet.
  "  vec3 film = filmArc(0.15 + 0.55 * graze);",
  // 2. SILHOUETTE SHEEN — iridescence lives at the rim only, never the body.
  "  float rim = smoothstep(0.55, 0.98, graze);",
  "  skin = mix(skin, skin * 0.45 + film * 0.85, rim * 0.32 * orn);",
  // 3. FLAKES — rare spectral jewelry that catches the light.
  "  skin += film * flakeGlint(vWorld, nn, v) * 1.1 * orn;",
  // 4. EDGES — thin cool structure lines: the restrained wireframe. A full
  // wireframe on low-poly (split normals make every edge a discontinuity),
  // clean feature-lines on dense smooth meshes, no duplicated geometry.
  "  float edge = smoothstep(0.12, 0.5, length(fwidth(n)));",
  "  skin += vec3(0.55, 0.72, 0.80) * edge * 0.16;",
  // 5. CLEARANCE ALARM — a desaturated warning, in clearance mode only, at
  // genuine interpenetration. A data alarm, not decoration.
  "  if (uMode > 1.5) skin = mix(skin, vec3(0.90, 0.35, 0.28), smoothstep(0.92, 1.0, uHeat) * 0.6);",
  "  if (uGhost < 0.5) {",
  // Front pass: crossfade the real material into the OPAQUE spectral skin as
  // x-ray energizes. Opaque and depth-tested, so the readable fill lives on
  // the surface you are looking at and can never stack toward white.
  "    outColor = vec4(mix(disp, skin, uXray), uColor.a);",
  "    return;",
  "  }",
  // Ghost pass: a faint additive reveal of what is behind, drawn depth-off.
  // Structure and silhouette only — never the fill, whose re-adding stacked a
  // closed solid to white — so the interior mists in cool and quiet with the
  // edges and rim of buried parts, and the clearance alarm still flags a part
  // hidden inside another.
  "  vec3 reveal = film * rim * 0.6 + vec3(0.55, 0.72, 0.80) * edge * 0.5;",
  "  if (uMode > 1.5) reveal += vec3(0.90, 0.35, 0.28) * smoothstep(0.92, 1.0, uHeat) * 0.7;",
  "  float a = 0.04 + rim * 0.4 + edge * 0.35 + (uMode > 1.5 ? smoothstep(0.92, 1.0, uHeat) * 0.4 : 0.0);",
  "  outColor = vec4(reveal, clamp(a, 0.0, 0.6) * uXray);",
  "}",
].join("\n");

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || "shader");
  return sh;
}

function createRenderer(canvas) {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: true });
  if (!gl) throw new Error("WebGL2 unavailable");
  // A lost context silently blanks the viewport — the model appears to
  // vanish with no error anywhere, which is exactly how this presented the
  // first time. Preventing the default is what makes the context eligible
  // for restoration at all; the page listens for the restore and reloads
  // the mesh it still has.
  canvas.addEventListener("webglcontextlost", (e) => e.preventDefault(), false);
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  // Pin attribute locations BEFORE linking. loadModel binds buffers to
  // indices 0/1/2 by number; without these the linker is free to assign
  // any order, and the mesh silently renders from the wrong buffers.
  gl.bindAttribLocation(program, 0, "aPos");
  gl.bindAttribLocation(program, 1, "aNormal");
  gl.bindAttribLocation(program, 2, "aUv");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "link");
  gl.useProgram(program);
  gl.enable(gl.DEPTH_TEST);
  const u = {};
  for (const name of ["uModel","uView","uProj","uColor","uEye","uMetallic","uRough","uMap","uHasMap",
    "uEmissive","uMrMap","uMrGate","uEmMap","uHasEm","uXray","uGhost","uMode","uHeat"]) {
    u[name] = gl.getUniformLocation(program, name);
  }
  // Fixed unit assignment: baseColor 0, metallic-roughness 1, emissive 2.
  gl.uniform1i(u.uMap, 0);
  gl.uniform1i(u.uMrMap, 1);
  gl.uniform1i(u.uEmMap, 2);
  gl.uniform2f(u.uMrGate, 0, 0);
  gl.uniform1f(u.uHasEm, 0);
  return { gl: gl, program: program, u: u, draws: [], bounds: null, textures: new Map(), _lastState: null };
}

/**
 * Bytes and mime of one glTF texture's image, straight out of the GLB
 * container. Pure — no GL — so the container reading stays testable the
 * same way parseGlb/readAccessor are.
 */
function textureSourceInfo(gltf, bin, textureIndex) {
  const texture = (gltf.textures || [])[textureIndex];
  if (!texture || texture.source === undefined) return null;
  const image = (gltf.images || [])[texture.source];
  if (!image || image.bufferView === undefined) return null;
  const view = gltf.bufferViews[image.bufferView];
  const start = view.byteOffset || 0;
  return {
    mime: image.mimeType || "image/png",
    bytes: new Uint8Array(bin, start, view.byteLength),
    sampler: texture.sampler !== undefined ? (gltf.samplers || [])[texture.sampler] || null : null,
  };
}

/**
 * GL texture for a glTF texture index, created once per model load.
 *
 * The pixel decode is async (createImageBitmap), so the texture starts as
 * a 1x1 white placeholder — the part renders with its factor while the
 * bytes decode, then the real image uploads and the runtime repaints
 * itself through the last state render() saw. No black flash, no waiting
 * on the network that is not there, and a failed decode simply leaves the
 * placeholder: factor-lit geometry, never a magenta surprise.
 */
function ensureTexture(renderer, gltf, bin, textureIndex, srgb) {
  // Colour space is part of the identity: the same image indexed as a
  // baseColor map (sRGB, GPU linearises) and as a data map (linear —
  // metallic/roughness values are NOT colours) needs two GL textures.
  const key = textureIndex + (srgb ? ":s" : ":l");
  if (renderer.textures.has(key)) return renderer.textures.get(key);
  const info = textureSourceInfo(gltf, bin, textureIndex);
  if (!info) return null;
  const gl = renderer.gl;
  const format = srgb ? gl.SRGB8_ALPHA8 : gl.RGBA;
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, format, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
    new Uint8Array([255, 255, 255, 255]));
  const entry = { tex: tex };
  renderer.textures.set(key, entry);
  const wrapOf = (mode) => mode === 33071 ? gl.CLAMP_TO_EDGE : mode === 33648 ? gl.MIRRORED_REPEAT : gl.REPEAT;
  /* The decode is async and a model reload deletes every texture — a 4K
     decode can easily outlive the model that asked for it. The generation
     stamp keeps a late bitmap from uploading into a texture id the NEXT
     model may have been handed by the driver. */
  const generation = renderer._loadGeneration || 0;
  createImageBitmap(new Blob([info.bytes], { type: info.mime }), {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  }).then((bitmap) => {
    if ((renderer._loadGeneration || 0) !== generation) { bitmap.close(); return; }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, format, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapOf(info.sampler && info.sampler.wrapS));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapOf(info.sampler && info.sampler.wrapT));
    bitmap.close();
    if (renderer._lastState) render(renderer, renderer._lastState);
    // Anything drawing material previews from this texture (the panel's
    // matballs) was painted from the 1x1 placeholder; tell it the real
    // pixels arrived so it can repaint.
    if (renderer.onTextureReady) renderer.onTextureReady();
  }).catch(() => {});
  return entry;
}

/* ---------- Material preview balls ----------------------------------- */

/**
 * A unit UV sphere, built once per renderer — the geometry every material
 * preview ball shares. Positions double as normals; the UV wrap lets a
 * textured material show its ACTUAL texture on the ball, which is the
 * whole reason these previews exist.
 */
function matBallGeometry(renderer) {
  if (renderer._ball) return renderer._ball;
  const gl = renderer.gl;
  const SEG = 32, RING = 22;
  const pos = [], uv = [], idx = [];
  for (let y = 0; y <= RING; y++) {
    const v = y / RING, phi = v * Math.PI;
    for (let x = 0; x <= SEG; x++) {
      const u = x / SEG, theta = u * Math.PI * 2;
      pos.push(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
      uv.push(u, v);
    }
  }
  for (let y = 0; y < RING; y++) for (let x = 0; x < SEG; x++) {
    const a = y * (SEG + 1) + x, b = a + SEG + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const pb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  // A unit sphere's normal IS its position; bind the same buffer twice.
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  const ub = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, ub);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  renderer._ball = { vao: vao, count: idx.length };
  return renderer._ball;
}

/**
 * Render one material preview ball into a 2D canvas.
 *
 * The Unreal material-ball, earned honestly: the SAME shader program, the
 * same studio light rig and the same display transform as the viewport,
 * with the material's real factors and — when it has one — its real
 * baseColor texture straight from the loaded GLB. Nothing is imitated, so
 * the ball cannot lie about what the viewport will show.
 *
 * Drawn into an offscreen framebuffer at 2x and read back, because the
 * panel needs many small previews and one context already owns all the
 * textures (GL textures cannot cross contexts). azimuth turns the ball —
 * the hover turntable.
 */
function renderMatBall(renderer, props, out2d, azimuth) {
  const gl = renderer.gl;
  const size = Math.max(16, (out2d.width | 0) || 64);
  let fbo = renderer._ballFbo;
  if (!fbo || fbo.size !== size) {
    if (fbo) { gl.deleteFramebuffer(fbo.fb); gl.deleteTexture(fbo.color); gl.deleteRenderbuffer(fbo.depth); }
    const color = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, color);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    const depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, size, size);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    fbo = renderer._ballFbo = { fb: fb, color: color, depth: depth, size: size };
  }
  const ball = matBallGeometry(renderer);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fb);
  gl.viewport(0, 0, size, size);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const eye = [0, 0, 2.55];
  gl.uniformMatrix4fv(renderer.u.uProj, false, perspective(FOV_Y, 1, 0.1, 10));
  gl.uniformMatrix4fv(renderer.u.uView, false, lookAt(eye, [0, 0, 0], [0, 1, 0]));
  gl.uniform3f(renderer.u.uEye, eye[0], eye[1], eye[2]);
  const c = Math.cos(azimuth || 0), s = Math.sin(azimuth || 0);
  gl.uniformMatrix4fv(renderer.u.uModel, false, new Float32Array([
    c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1,
  ]));
  const color = props.color || [0.8, 0.8, 0.8, 1];
  gl.uniform4f(renderer.u.uColor, color[0], color[1], color[2],
    color[3] === undefined ? 1 : color[3]);
  gl.uniform1f(renderer.u.uMetallic, props.metallic || 0);
  gl.uniform1f(renderer.u.uRough, props.rough === undefined ? 0.6 : props.rough);
  const em = props.emissive || [0, 0, 0];
  gl.uniform3f(renderer.u.uEmissive, em[0], em[1], em[2]);
  const emitting = em[0] > 0 || em[1] > 0 || em[2] > 0;
  if (props.emTex && emitting) {
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, props.emTex.tex);
    gl.uniform1f(renderer.u.uHasEm, 1);
  } else {
    gl.uniform1f(renderer.u.uHasEm, 0);
  }
  const gate = props.mrTex && props.mrGate ? props.mrGate : [0, 0];
  if (gate[0] || gate[1]) {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, props.mrTex.tex);
  }
  gl.uniform2f(renderer.u.uMrGate, gate[0], gate[1]);
  gl.uniform1f(renderer.u.uXray, 0);
  gl.uniform1f(renderer.u.uGhost, 0);
  gl.uniform1f(renderer.u.uHeat, 0);
  gl.activeTexture(gl.TEXTURE0);
  if (props.tex) {
    gl.bindTexture(gl.TEXTURE_2D, props.tex.tex);
    gl.uniform1f(renderer.u.uHasMap, 1);
  } else {
    /* Unit 0 must NOT be left holding whatever was bound before — right
       after this FBO's creation that is the FBO's own colour texture, and
       drawing while it is bound to an active sampler is a feedback loop:
       INVALID_OPERATION, and a silently blank ball. Bind null; the gated
       sampler never reads it. */
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.uniform1f(renderer.u.uHasMap, 0);
  }
  const translucent = (color[3] !== undefined && color[3] < 0.999);
  if (translucent) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); }
  gl.bindVertexArray(ball.vao);
  gl.drawElements(gl.TRIANGLES, ball.count, gl.UNSIGNED_SHORT, 0);
  gl.bindVertexArray(null);
  if (translucent) gl.disable(gl.BLEND);

  const px = new Uint8Array(size * size * 4);
  gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // GL reads bottom-up; canvases paint top-down.
  const ctx = out2d.getContext('2d');
  const img = ctx.createImageData(size, size);
  const row = size * 4;
  for (let y = 0; y < size; y++) {
    img.data.set(px.subarray((size - 1 - y) * row, (size - y) * row), y * row);
  }
  // Both dimensions: size is derived from width but a zero-width canvas
  // would otherwise keep its zero while height changed — a blank ball
  // with no error, defeating the fallback the size floor promises.
  out2d.width = size;
  out2d.height = size;
  ctx.putImageData(img, 0, 0);
}

/** Flatten a glTF scene graph into draw calls with baked world matrices. */
function loadModel(renderer, buffer) {
  const gl = renderer.gl;
  // Invalidate any in-flight texture decodes from the outgoing model
  // before their targets are deleted (see ensureTexture's stamp).
  renderer._loadGeneration = (renderer._loadGeneration || 0) + 1;
  for (const draw of renderer.draws) {
    gl.deleteVertexArray(draw.vao);
    // The VAO does not own its buffers; without explicit deletion every
    // reload leaves the old model's vertex data to the GC's discretion.
    for (const buf of draw.glBuffers || []) gl.deleteBuffer(buf);
  }
  renderer.draws = [];
  for (const entry of renderer.textures.values()) gl.deleteTexture(entry.tex);
  renderer.textures.clear();

  const parsed = parseGlb(buffer);
  const gltf = parsed.json;
  const bin = parsed.bin;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];

  const visit = (nodeIndex, parent) => {
    const node = gltf.nodes[nodeIndex];
    const world = mul(parent, fromTrs(node));
    if (node.mesh !== undefined) {
      for (const prim of gltf.meshes[node.mesh].primitives) {
        if (prim.mode !== undefined && prim.mode !== 4) continue;
        const positions = readAccessor(gltf, bin, prim.attributes.POSITION);
        const normals = prim.attributes.NORMAL !== undefined
          ? readAccessor(gltf, bin, prim.attributes.NORMAL)
          : new Float32Array(positions.length);
        const indices = prim.indices !== undefined
          ? readAccessor(gltf, bin, prim.indices)
          : null;

        const vao = gl.createVertexArray();
        // Tracked so a reload can free them: deleting only the VAO leaves
        // the vertex data itself to GC timing, and reloads accumulate.
        const glBuffers = [];
        gl.bindVertexArray(vao);
        const pb = gl.createBuffer();
        glBuffers.push(pb);
        gl.bindBuffer(gl.ARRAY_BUFFER, pb);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        const nb = gl.createBuffer();
        glBuffers.push(nb);
        gl.bindBuffer(gl.ARRAY_BUFFER, nb);
        gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        // UVs ride attribute 2 when the primitive has them; without them
        // the attribute stays disabled and reads its default — harmless,
        // because uHasMap gates every sample.
        if (prim.attributes.TEXCOORD_0 !== undefined) {
          const uvs = readAccessor(gltf, bin, prim.attributes.TEXCOORD_0);
          const ub = gl.createBuffer();
          glBuffers.push(ub);
          gl.bindBuffer(gl.ARRAY_BUFFER, ub);
          gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
          gl.enableVertexAttribArray(2);
          gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
        }
        let count = positions.length / 3;
        let indexType = 0;
        if (indices) {
          const ib = gl.createBuffer();
          glBuffers.push(ib);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
          gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
          count = indices.length;
          indexType = indices instanceof Uint32Array ? gl.UNSIGNED_INT
            : indices instanceof Uint16Array ? gl.UNSIGNED_SHORT : gl.UNSIGNED_BYTE;
        }
        gl.bindVertexArray(null);

        const material = prim.material !== undefined ? gltf.materials[prim.material] : null;
        const pbr = (material && material.pbrMetallicRoughness) || {};
        const hasUv = prim.attributes.TEXCOORD_0 !== undefined;
        const texEntry = pbr.baseColorTexture !== undefined && hasUv
          ? ensureTexture(renderer, gltf, bin, pbr.baseColorTexture.index, true)
          : null;
        // The metallic-roughness map is DATA, not colour — linear upload.
        const mrTexEntry = pbr.metallicRoughnessTexture !== undefined && hasUv
          ? ensureTexture(renderer, gltf, bin, pbr.metallicRoughnessTexture.index, false)
          : null;
        const emTexEntry = material && material.emissiveTexture !== undefined && hasUv
          ? ensureTexture(renderer, gltf, bin, material.emissiveTexture.index, true)
          : null;
        // Per-part world bounds, kept so a click can be resolved to a part
        // without a picking pass. The manifest already names every part; this
        // is what connects a pixel to that name.
        const plo = [Infinity, Infinity, Infinity];
        const phi = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < positions.length; i += 3) {
          const p = [positions[i], positions[i + 1], positions[i + 2]];
          const w = [
            world[0]*p[0] + world[4]*p[1] + world[8]*p[2] + world[12],
            world[1]*p[0] + world[5]*p[1] + world[9]*p[2] + world[13],
            world[2]*p[0] + world[6]*p[1] + world[10]*p[2] + world[14],
          ];
          for (let a = 0; a < 3; a++) {
            if (w[a] < lo[a]) lo[a] = w[a];
            if (w[a] > hi[a]) hi[a] = w[a];
            if (w[a] < plo[a]) plo[a] = w[a];
            if (w[a] > phi[a]) phi[a] = w[a];
          }
        }

        // Emissive rides the factor times the KHR strength multiplier, so a
        // beam that emits at strength 4 actually glows 4x in the viewport.
        // With an emissive MAP the same product becomes the map's
        // multiplier (the glTF contract); a map the mesh has no UVs for is
        // suppressed entirely — a flat white factor applied without its
        // texture washed DamagedHelmet to a white blob once.
        const emissiveFactor = material && (!material.emissiveTexture || emTexEntry)
          ? material.emissiveFactor || [0, 0, 0]
          : [0, 0, 0];
        const emissiveExt = material && material.extensions &&
          material.extensions.KHR_materials_emissive_strength;
        const emissiveStrength = emissiveExt && typeof emissiveExt.emissiveStrength === "number"
          ? emissiveExt.emissiveStrength : 1;
        renderer.draws.push({
          vao: vao,
          glBuffers: glBuffers,
          count: count,
          indexType: indexType,
          model: world,
          name: node.name || (material && material.name) || "part",
          // The material NAME, so the page can answer "which draws share
          // this material" — the question every live material edit asks.
          matName: (material && material.name) || null,
          // The glTF default factor is white; the 0.8 grey is a display
          // choice for UNtextured factor-less materials only — multiplying
          // a texture by grey would darken every textured asset by 20%.
          color: pbr.baseColorFactor || (texEntry ? [1, 1, 1, 1] : [0.8, 0.8, 0.8, 1]),
          tex: texEntry,
          mrTex: mrTexEntry,
          emTex: emTexEntry,
          // Which channels the MR map drives. Per-channel because a user
          // override on one scalar gates only that channel off.
          mrGate: mrTexEntry ? [1, 1] : [0, 0],
          // glTF's DEFAULTS are metallic 1, roughness 1, and exporters OMIT
          // default-valued factors — Blender ships gold as metallicFactor:
          // absent. Mapping absent to 0 rendered every such metal as
          // plastic. The 0/0.6 display choice survives only for draws with
          // no material at all, where there is no spec to follow.
          metallic: pbr.metallicFactor === undefined ? (material ? 1 : 0) : pbr.metallicFactor,
          rough: pbr.roughnessFactor === undefined ? (material ? 1 : 0.6) : pbr.roughnessFactor,
          emissive: [
            emissiveFactor[0] * emissiveStrength,
            emissiveFactor[1] * emissiveStrength,
            emissiveFactor[2] * emissiveStrength,
          ],
          // BLEND materials draw in the transparent pass; MASK and OPAQUE
          // stay opaque (a cutout approximated as opaque beats one that
          // vanishes into additive mist).
          blend: !!(material && material.alphaMode === "BLEND"),
          min: plo,
          max: phi,
          // The mesh itself, kept for picking. The world AABB above is a
          // BROAD phase and nothing more: a rotated part's box is up to
          // sqrt(3) times its own volume, a sphere's box is 91% empty at the
          // corners, and boxes of neighbouring parts overlap freely. Choosing
          // the nearest box ENTRY therefore selected whichever box the ray
          // happened to enter first, which is not the part under the cursor
          // and is why clicking one thing selected another beside it.
          //
          // Local positions plus the world matrix, not pre-transformed
          // copies: a click transforms three vertices per triangle it
          // actually tests, and a gizmo drag that moves a part leaves this
          // valid because its model matrix moves with it.
          pickPositions: positions,
          pickIndices: indices || null,
        });
      }
    }
    for (const child of node.children || []) visit(child, world);
  };

  const scene = gltf.scenes[gltf.scene || 0];
  for (const nodeIndex of scene.nodes) visit(nodeIndex, identity());

  if (!isFinite(lo[0])) { lo[0]=lo[1]=lo[2]=-1; hi[0]=hi[1]=hi[2]=1; }
  renderer.bounds = {
    center: [(lo[0]+hi[0])/2, (lo[1]+hi[1])/2, (lo[2]+hi[2])/2],
    radius: Math.max(1e-3, Math.hypot(hi[0]-lo[0], hi[1]-lo[1], hi[2]-lo[2]) / 2),
    lo: lo.slice(),
    hi: hi.slice(),
  };

  // Per-part clearance to the nearest other part, in [0,1]: 1 where parts
  // touch or interpenetrate, 0 once they are a comfortable gap apart. The
  // spectral pass reads this so buried or colliding geometry glows hot in
  // every colour mode — x-ray's original job, made continuous. The tolerance
  // scales to the smaller part of each pair, matching touchingParts: a
  // millimetre is contact on a rivet and a chasm on a crate.
  for (const a of renderer.draws) {
    const aspan = Math.min(a.max[0]-a.min[0], a.max[1]-a.min[1], a.max[2]-a.min[2]);
    let heat = 0;
    for (const b of renderer.draws) {
      if (b === a) continue;
      const bspan = Math.min(b.max[0]-b.min[0], b.max[1]-b.min[1], b.max[2]-b.min[2]);
      // The floor exists only against degenerate zero-span parts. An
      // absolute millimetre floor here dominated for sub-2cm parts and
      // read two well-separated rivets as touching — the exact scale
      // dependence the pair-relative tolerance was built to avoid.
      const tol = Math.max(1e-6, 0.05 * Math.min(aspan, bspan));
      let near = true;
      let gap = -Infinity;
      for (let k = 0; k < 3; k++) {
        const apart = Math.max(b.min[k] - a.max[k], a.min[k] - b.max[k]);
        if (apart > tol) { near = false; break; }
        if (apart > gap) gap = apart;
      }
      if (!near) continue;
      // Map the binding gap across [+tol .. -tol] onto [0 .. 1]: a comfortable
      // gap is 0, flush face-contact (gap 0) is 0.5, and true interpenetration
      // (gap < 0) climbs to 1. This is what separates a crate's touching
      // boards from a part actually buried in its neighbour — the hot end is
      // reserved for geometry that is wrong, not merely adjacent.
      const h = Math.min(1, Math.max(0, (tol - gap) / (2 * tol)));
      if (h > heat) heat = h;
    }
    a.heat = heat;
  }

  let tris = 0;
  for (const d of renderer.draws) tris += d.count / 3;
  return { parts: renderer.draws.length, tris: Math.round(tris) };
}

/** Orbit / zoom / pan, matching the conventions of every DCC viewport. */
function attachControls(canvas, state, onChange, getBounds, alsoZoomOn) {
  let active = false;
  let lastX = 0, lastY = 0;
  /* Space is the universal "pan" hold — and the only pan a Magic Trackpad,
     which has no right button, can reach. Held, a drag pans instead of
     orbiting and the cursor shows the grab affordance. Tracked on the shared
     state so the gizmo's part-drag pan honours it too. Right-drag still pans
     for a mouse; shift-drag stays as the third way in.

     Pan vs orbit is decided EVERY FRAME, not latched at press — so pressing
     space in the middle of an orbit slides straight into a pan, and releasing
     it slides back, with no jump (both read the same relative delta). This is
     the flow a power user reaches for: spin to an angle, hold space to reframe,
     let go and keep spinning, all in one gesture. */
  const isTyping = () => {
    const a = document.activeElement;
    return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable);
  };
  const wantsPan = (e) => (e.buttons & 2) !== 0 || e.shiftKey || state.spaceHeld;
  const panCursor = () => { canvas.style.cursor = state.spaceHeld ? (active ? "grabbing" : "grab") : ""; };
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !e.repeat && !isTyping()) { state.spaceHeld = true; e.preventDefault(); panCursor(); }
  });
  window.addEventListener("keyup", (e) => { if (e.code === "Space") { state.spaceHeld = false; panCursor(); } });
  window.addEventListener("blur", () => { state.spaceHeld = false; panCursor(); });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (e) => {
    active = true;
    lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    panCursor();
  });
  canvas.addEventListener("pointerup", (e) => {
    active = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    panCursor();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!active) return;
    const pan = wantsPan(e);
    /*
     * The page claims the LEFT drag for direct part manipulation, so orbit
     * has to stand down or every edit also spins the camera. Pan does not:
     * it is a separate button, so it cannot be the same gesture, and being
     * able to slide the view while still holding a part is exactly the
     * freedom that makes fine placement workable — you reframe to see where
     * the part is going without dropping it first.
     */
    if (state.suppressOrbit && !pan) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    if (!pan) {
      state.azimuth -= dx * 0.01;
      state.elevation = Math.max(-1.5, Math.min(1.5, state.elevation + dy * 0.01));
    } else {
      /*
       * Pan in the CAMERA's basis, not the world's, and at the exact rate
       * that keeps the point under the cursor under the cursor.
       *
       * The previous version slid the pivot along world X and Z with a
       * magic per-metre constant. Broadly it looked fine; up close it felt
       * wrong for two reasons. Dragging vertically moved the scene along
       * world Z rather than screen-up, so the closer the camera got to
       * looking straight down, the more a vertical drag became a
       * forward/back push — and there was no way to pan up at all. And the
       * constant had nothing to do with the field of view, so the geometry
       * never tracked the pointer: it drifted ahead of or behind the hand.
       *
       * Units per pixel at the pivot's depth is exact for a perspective
       * camera: the frustum is 2·d·tan(fov/2) tall there, spread over the
       * viewport's height in CSS pixels. Move the pivot by that, along the
       * camera's own right and up, and the model follows the cursor 1:1.
       */
      panBy(state, canvas, dx, dy);
    }
    onChange();
  });
  /*
   * Zoom, bound to the gizmo overlay as well as to the canvas.
   *
   * The gizmo is an SVG that covers the viewport and carries pointer-events
   * on its grab corridors, so a wheel event over a handle targets the SVG
   * and never reaches the canvas beneath it. It is an IN-WORLD widget, not
   * chrome: scrolling over it means the same thing as scrolling over the
   * model, and it must not be able to swallow the one gesture that gets a
   * stuck camera unstuck.
   */
  const zoom = (e) => {
    e.preventDefault();
    const range = zoomRange(getBounds ? getBounds() : null);
    const next = state.distance * (1 + Math.sign(e.deltaY) * 0.12);
    state.distance = Math.min(range.max, Math.max(range.min, next));
    onChange();
  };
  canvas.addEventListener("wheel", zoom, { passive: false });
  /* Passed in rather than found by selector: this module is the renderer,
     and it has no business knowing what the editor's widgets are called. */
  for (const el of alsoZoomOn || []) {
    if (el) el.addEventListener("wheel", zoom, { passive: false });
  }
}

/** Vertical field of view. One definition, used by the projection, the
 *  picking ray and the pan rate — they are only consistent if they agree. */
const FOV_Y = Math.PI / 4;

/**
 * Slide the view by a pointer delta, exactly.
 *
 * Shared by the camera controls and by the part-drag path: with a mouse
 * every button reports the same pointerId, so a right-drag begun while the
 * left button already holds a gizmo handle is delivered to whoever captured
 * that pointer — the handle, not the canvas. Both callers therefore need
 * the same maths, and it lives here rather than being written twice.
 */
/**
 * Metres of world per CSS pixel, at the depth the pivot sits at.
 *
 * The frustum height at that depth spread over the viewport height. Named
 * and exported rather than inlined because it is the conversion between
 * pointer motion and world motion, and EVERY drag needs it — pan, and the
 * gizmo's free-move. The gizmo used to carry its own copy as the literal
 * literal distance * 0.0016, which back-solves to this formula pinned
 * canvas exactly 518px tall: the part outran the cursor on a taller
 * viewport and lagged it on a shorter one, and the panel is resizable.
 */
/**
 * Viewport height in CSS pixels, never zero and never NaN.
 *
 * A Math.max floor looks like it covers this and does not: Math.max with
 * NaN returns NaN, so a canvas that has not been laid out yet — or one
 * inside a hidden panel — poisoned every pointer-to-world conversion
 * downstream instead of falling back. A comparison rejects NaN, which is
 * the behaviour that was wanted all along.
 */
function viewportHeight(canvas) {
  const h = canvas && canvas.clientHeight;
  return h > 0 ? h : 1;
}

function worldPerPixel(state, canvas) {
  return (2 * state.distance * Math.tan(FOV_Y / 2)) / viewportHeight(canvas);
}

function panBy(state, canvas, dx, dy) {
  const basis = cameraBasis(state);
  const perPixel = worldPerPixel(state, canvas);
  for (let a = 0; a < 3; a++) {
    state.pan[a] += -dx * perPixel * basis.right[a] + dy * perPixel * basis.up[a];
  }
}

/**
 * The camera's own axes for the current orbit state.
 *
 * Forward points from the target toward the eye, so right and up come out
 * as the screen's right and up. Derived from azimuth/elevation
 * rather than from the view matrix so it is available before a frame has
 * been rendered — the pan handler needs it on the first pointer move.
 */
function cameraBasis(state) {
  const ce = Math.cos(state.elevation), se = Math.sin(state.elevation);
  const forward = [ce * Math.sin(state.azimuth), se, ce * Math.cos(state.azimuth)];
  // right = normalize(worldUp × forward), with worldUp = +Y.
  const right = norm([forward[2], 0, -forward[0]]);
  // up = forward × right, already unit because both inputs are.
  const up = [
    forward[1] * right[2] - forward[2] * right[1],
    forward[2] * right[0] - forward[0] * right[2],
    forward[0] * right[1] - forward[1] * right[0],
  ];
  return { forward: forward, right: right, up: up };
}

/**
 * Near/far planes and the legal zoom range for a scene, in one place.
 *
 * Everything here used to be written inline, three times, anchored to the
 * scene radius alone: near = radius * 0.01. That holds while you look at a
 * whole asset and breaks the moment you zoom into a detail of a large one,
 * because the near plane stays anchored kilometres out while the camera is
 * centimetres from a bolt.
 *
 * The failure was not a clean one. A point nearer than the near plane still
 * has w > 0, so it survived the projection guard and was divided by a value
 * approaching zero — projected coordinates in the tens of thousands. The
 * gizmo is drawn from those coordinates, so its transparent grab corridors
 * covered the whole viewport, and because they carry pointer-events while
 * the wheel and click handlers live on the canvas UNDERNEATH them, the
 * editor stopped responding to zoom and to selection at the same time. That
 * is the soft lock: not a frozen loop, a widget the size of the sky.
 *
 * So near tracks the camera as well as the scene, and the zoom range is
 * expressed in scene radii rather than absolute world units — 0.05 world
 * units means "cannot get close" in a scene measured in metres and "already
 * inside the geometry" in one measured in millimetres.
 */
function viewFrustum(state, bounds) {
  const radius = Math.max(1e-9, (bounds && bounds.radius) || 1);
  // Floored against the scene so the depth buffer keeps a workable
  // far/near ratio, and allowed to follow the camera in so a close
  // inspection is not clipped away.
  const near = Math.max(radius * 1e-4, state.distance * 0.02);
  const far = state.distance + radius * 10;
  return { near: near, far: far, radius: radius };
}

/** How close and how far the orbit camera may go, in scene radii. */
function zoomRange(bounds) {
  const radius = Math.max(1e-9, (bounds && bounds.radius) || 1);
  // A thousandth of the scene is close enough to inspect a rivet on a
  // watchtower, and still an order of magnitude outside the near plane, so
  // the camera can never arrive inside its own frustum.
  return { min: radius * 1e-3, max: radius * 50 };
}

/**
 * Distance from the camera along its view direction to a world point.
 *
 * The quantity every screen-space size depends on. It is NOT state.distance:
 * that is the camera's distance to the ORBIT PIVOT, and a part selected far
 * from the pivot in a large scene can sit at many times or a small fraction
 * of that depth.
 */
function viewDepth(renderer, state, point) {
  const cam = cameraFor(renderer, state);
  const basis = cameraBasis(state);
  // basis.forward points from the target toward the eye, so the view
  // direction is its negation.
  return (
    (cam.eye[0] - point[0]) * basis.forward[0] +
    (cam.eye[1] - point[1]) * basis.forward[1] +
    (cam.eye[2] - point[2]) * basis.forward[2]
  );
}

/** Camera basis for the current orbit state, shared by render and picking. */
function cameraFor(renderer, state) {
  const b = renderer.bounds || { center: [0,0,0], radius: 1 };
  const target = [b.center[0] + state.pan[0], b.center[1] + state.pan[1], b.center[2] + state.pan[2]];
  const d = state.distance;
  const eye = [
    target[0] + d * Math.cos(state.elevation) * Math.sin(state.azimuth),
    target[1] + d * Math.sin(state.elevation),
    target[2] + d * Math.cos(state.elevation) * Math.cos(state.azimuth),
  ];
  return { target: target, eye: eye, bounds: b };
}

/**
 * Resolve a click to a part name.
 *
 * Broad-phase ray/AABB sort, then an exact ray/triangle test against the
 * candidate meshes (rayMeshDistance, Möller–Trumbore) — CPU-side, so no
 * second render target and no framebuffer readback stall on every click.
 * The AABB alone used to BE the answer, which mis-picked any rotated or
 * non-box part whose world bounds overlap a neighbour's; the failure and
 * the fix are pinned in tests/kit-picking.test.ts. (No backticks here:
 * this file is one String.raw template, and a backtick in a comment ends
 * it mid-file.)
 */
function pickPart(renderer, state, canvas, clientX, clientY) {
  if (!renderer.draws.length) return null;
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;

  const cam = cameraFor(renderer, state);
  const forward = norm([
    cam.target[0] - cam.eye[0], cam.target[1] - cam.eye[1], cam.target[2] - cam.eye[2],
  ]);
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const aspect = rect.width / Math.max(1, rect.height);
  // Derived from FOV_Y, not restated: the projection, the pan rate and
  // this ray are only consistent while they share one definition.
  const tan = Math.tan(FOV_Y / 2);
  const dir = norm([
    forward[0] + right[0] * ndcX * tan * aspect + up[0] * ndcY * tan,
    forward[1] + right[1] * ndcX * tan * aspect + up[1] * ndcY * tan,
    forward[2] + right[2] * ndcX * tan * aspect + up[2] * ndcY * tan,
  ]);

  /* Broad phase: which boxes the ray meets at all, and how far away each
     box STARTS. Not a verdict — see the note on pickPositions. */
  const candidates = [];
  for (const draw of renderer.draws) {
    const span = rayBoxSpan(cam.eye, dir, draw.min, draw.max);
    if (span) candidates.push({ draw: draw, near: span });
  }
  /* Nearest box first, so the exact test below can stop as soon as a
     confirmed surface hit is closer than the next box can possibly be. */
  candidates.sort((a, b) => a.near - b.near);

  /* Solid mode: nearest surface wins, and the sort lets the exact test stop
     as soon as a confirmed hit is closer than the next box can start. */
  if ((state.xrayMix || 0) <= 0.5) {
    let best = null;
    let bestT = Infinity;
    for (const candidate of candidates) {
      if (candidate.near > bestT) break;
      const t = rayMeshDistance(cam.eye, dir, candidate.draw);
      if (t !== null && t < bestT) { bestT = t; best = candidate.draw; }
    }
    return best;
  }

  /* X-ray shows the interior through the shell, so the click must be able to
     reach what the eye can see — nearest-surface picking made the shell
     swallow every click. Depth cycling instead: the first click picks the
     front surface; clicking again picks the next part behind the one already
     selected, wrapping back to the front. Every candidate is tested (no
     early break) because the stack under the cursor IS the answer here. */
  const hits = [];
  for (const candidate of candidates) {
    const t = rayMeshDistance(cam.eye, dir, candidate.draw);
    if (t !== null) hits.push({ draw: candidate.draw, t: t });
  }
  if (!hits.length) return null;
  hits.sort((a, b) => a.t - b.t);
  const order = [];
  for (const hit of hits) {
    if (!order.some((d) => d.name === hit.draw.name)) order.push(hit.draw);
  }
  const selectedAt = order.findIndex((d) => state.selection && state.selection.has(d.name));
  if (selectedAt === -1) return order[0];
  return order[(selectedAt + 1) % order.length];
}

/**
 * Distance at which a ray enters an axis-aligned box, or null when it misses.
 * Negative spans (camera inside the box) report 0 — the box is under the
 * cursor from where the viewer stands, which is what the caller is asking.
 */
function rayBoxSpan(origin, dir, min, max) {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (let a = 0; a < 3; a++) {
    const o = origin[a];
    const d = dir[a];
    if (Math.abs(d) < 1e-9) {
      if (o < min[a] || o > max[a]) return null;
      continue;
    }
    let t1 = (min[a] - o) / d;
    let t2 = (max[a] - o) / d;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : 0;
}

/**
 * Distance to the nearest TRIANGLE of a draw along the ray, or null for a
 * miss. Möller-Trumbore, double-sided on purpose: a part whose winding the
 * author got backwards is still a part the user can see and click.
 *
 * Vertices are transformed on demand. A pick tests one draw's triangles once
 * per click; caching a world-space copy would cost memory on every part for
 * a saving nobody can perceive at click rate.
 */
function rayMeshDistance(origin, dir, draw) {
  const positions = draw.pickPositions;
  if (!positions) {
    /* No geometry retained: fall back to the box, and say so by returning
       its entry distance rather than pretending the mesh was tested. */
    return rayBoxSpan(origin, dir, draw.min, draw.max);
  }
  const m = draw.model;
  const indices = draw.pickIndices;
  const triangles = indices ? indices.length / 3 : positions.length / 9;
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
  const vertex = (slot, index) => {
    const o = index * 3;
    const x = positions[o], y = positions[o + 1], z = positions[o + 2];
    slot[0] = m[0]*x + m[4]*y + m[8]*z + m[12];
    slot[1] = m[1]*x + m[5]*y + m[9]*z + m[13];
    slot[2] = m[2]*x + m[6]*y + m[10]*z + m[14];
  };
  let nearest = null;
  for (let t = 0; t < triangles; t++) {
    const i0 = indices ? indices[t * 3] : t * 3;
    const i1 = indices ? indices[t * 3 + 1] : t * 3 + 1;
    const i2 = indices ? indices[t * 3 + 2] : t * 3 + 2;
    vertex(a, i0); vertex(b, i1); vertex(c, i2);
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    const px = dir[1]*e2z - dir[2]*e2y;
    const py = dir[2]*e2x - dir[0]*e2z;
    const pz = dir[0]*e2y - dir[1]*e2x;
    const det = e1x*px + e1y*py + e1z*pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const tx = origin[0] - a[0], ty = origin[1] - a[1], tz = origin[2] - a[2];
    const u = (tx*px + ty*py + tz*pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = ty*e1z - tz*e1y;
    const qy = tz*e1x - tx*e1z;
    const qz = tx*e1y - ty*e1x;
    const v = (dir[0]*qx + dir[1]*qy + dir[2]*qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const hit = (e2x*qx + e2y*qy + e2z*qz) * inv;
    if (hit > 1e-9 && (nearest === null || hit < nearest)) nearest = hit;
  }
  return nearest;
}

/**
 * Project a world point to CSS pixels, so an HTML overlay can be anchored
 * to geometry. Returns null when the point is behind the camera — a label
 * pinned to something you cannot see is worse than no label.
 */
function worldToScreen(renderer, state, canvas, point) {
  const rect = canvas.getBoundingClientRect();
  const cam = cameraFor(renderer, state);
  const b = cam.bounds;
  const planes = viewFrustum(state, b);
  const proj = perspective(FOV_Y, rect.width / Math.max(1, rect.height), planes.near, planes.far);
  const view = lookAt(cam.eye, cam.target, [0, 1, 0]);
  const m = mul(proj, view);
  const x = point[0], y = point[1], z = point[2];
  const cx = m[0]*x + m[4]*y + m[8]*z + m[12];
  const cy = m[1]*x + m[5]*y + m[9]*z + m[13];
  const cw = m[3]*x + m[7]*y + m[11]*z + m[15];
  /* The NEAR PLANE, not a token epsilon. w is the view depth, so a point
     between the camera and the near plane passes any small-epsilon test and
     then divides into coordinates in the tens of thousands. Nothing nearer
     than the near plane is on screen, so nothing nearer may be given a
     screen position. */
  if (!(cw >= planes.near)) return null;
  return { x: ((cx / cw) * 0.5 + 0.5) * rect.width, y: (1 - ((cy / cw) * 0.5 + 0.5)) * rect.height };
}

/** Centre of a draw's world bounds. */
function drawCenter(draw) {
  return [
    (draw.min[0] + draw.max[0]) / 2,
    (draw.min[1] + draw.max[1]) / 2,
    (draw.min[2] + draw.max[2]) / 2,
  ];
}

/**
 * Parts whose bounds touch or nearly touch the given part.
 *
 * "Nearly" is scaled to the PAIR being compared, not to the scene.
 *
 * It used to be 2% of the whole scene's bounding radius, on the reasoning
 * that a 1mm gap is contact on a crate and a chasm on a rivet. The reasoning
 * is right and the scale was wrong: in a 10m scene that slack became 20cm,
 * so two rivets a hand's width apart reported as touching — and the same two
 * rivets in a small scene did not. Scaling to the smaller of the two parts
 * keeps the intent, tolerance proportional to what is being measured, while
 * making the answer independent of how much else happens to be in the file.
 *
 * The gap is the real per-axis surface separation, negative where boxes
 * overlap — so a caller can state how far apart two things are instead of
 * reaching for a centre distance, which is not a gap at all.
 */
function touchingParts(renderer, name, slack) {
  const self = renderer.draws.find((d) => d.name === name);
  if (!self) return [];
  const centre = drawCenter(self);
  const span = (d) => Math.min(d.max[0]-d.min[0], d.max[1]-d.min[1], d.max[2]-d.min[2]);
  const selfSpan = span(self);
  const out = [];
  for (const d of renderer.draws) {
    if (d === self) continue;
    // Bounded at both ends: a degenerate part must not collapse the
    // tolerance to zero, and a large one must not swallow its neighbours.
    const pad = slack === undefined
      ? Math.max(0.0005, Math.min(0.01, 0.02 * Math.min(selfSpan, span(d))))
      : slack;
    let touches = true;
    let gap = -Infinity;
    for (let a = 0; a < 3; a++) {
      const apart = Math.max(d.min[a] - self.max[a], self.min[a] - d.max[a]);
      if (apart > pad) { touches = false; break; }
      if (apart > gap) gap = apart;
    }
    if (!touches) continue;
    const c = drawCenter(d);
    out.push({
      name: d.name,
      gap: gap,
      distance: Math.hypot(c[0]-centre[0], c[1]-centre[1], c[2]-centre[2]),
    });
  }
  // Closest surfaces first; centre distance only breaks ties.
  out.sort((a, b) => a.gap - b.gap || a.distance - b.distance);
  return out;
}

/** Size of a draw in metres, for the in-world readout. */
function drawSize(draw) {
  return [draw.max[0]-draw.min[0], draw.max[1]-draw.min[1], draw.max[2]-draw.min[2]];
}

function render(renderer, state) {
  // Stashed so an async texture upload can repaint the exact same frame.
  renderer._lastState = state;
  const gl = renderer.gl;
  const canvas = gl.canvas;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  gl.viewport(0, 0, canvas.width, canvas.height);
  // X-ray energizes the stage to a deep near-black as it comes in. Additive
  // spectral light needs a dark ground to bloom against — on the page's own
  // pale background it would only wash brighter, which is the whitewash by
  // another name. xrayMix carries the transition so the ground crossfades in
  // and out with the ghost rather than snapping.
  const xm = state.xrayMix || 0;
  if (xm > 0.001) gl.clearColor(0.03 * xm, 0.035 * xm, 0.05 * xm, xm);
  else gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const cam = cameraFor(renderer, state);
  const b = cam.bounds;
  const target = cam.target;
  const eye = cam.eye;
  const d = state.distance;
  const planes = viewFrustum(state, b);
  const proj = perspective(FOV_Y, canvas.width / canvas.height, planes.near, planes.far);
  const view = lookAt(eye, target, [0, 1, 0]);
  gl.uniformMatrix4fv(renderer.u.uProj, false, proj);
  gl.uniformMatrix4fv(renderer.u.uView, false, view);
  gl.uniform3f(renderer.u.uEye, eye[0], eye[1], eye[2]);
  // Front pass. It carries the x-ray mix so the surface can crossfade into
  // the spectral skin, but uGhost keeps it on the opaque, depth-tested path
  // rather than the additive reveal.
  gl.uniform1f(renderer.u.uGhost, 0);
  gl.uniform1f(renderer.u.uXray, state.xrayMix || 0);
  // The colour mode, set once for both the front skin and the ghost reveal.
  // Curvature and inverted-normals read from screen-space derivatives and
  // gl_FrontFacing; clearance reads the per-part uHeat set in the loop — none
  // need a per-frame normalisation constant.
  gl.uniform1f(renderer.u.uMode, state.xrayMode || 0);
  const drawOne = (draw) => {
    gl.bindVertexArray(draw.vao);
    gl.uniformMatrix4fv(renderer.u.uModel, false, draw.model);
    gl.uniform1f(renderer.u.uHeat, draw.heat || 0);
    // Selection brightens the part by a fixed multiple, which leaves hue
    // and saturation exactly where they were. Blending toward another
    // colour — white or a selection blue — drags every warm material
    // toward grey, hiding the one thing the user selected it to look at.
    // The gizmo is the unambiguous signal; this only has to say "this one".
    // Hover is deliberately a fraction of selection's lift: enough to
    // answer "this one is under your cursor", not enough to be mistaken
    // for a selection that has already happened.
    const selected = state.selection && state.selection.has(draw.name);
    const gain = selected ? 1.3 : state.hover === draw.name ? 1.12 : 1;
    gl.uniform4f(
      renderer.u.uColor,
      Math.min(1, draw.color[0] * gain),
      Math.min(1, draw.color[1] * gain),
      Math.min(1, draw.color[2] * gain),
      draw.color[3],
    );
    gl.uniform1f(renderer.u.uMetallic, draw.metallic);
    gl.uniform1f(renderer.u.uRough, draw.rough);
    const em = draw.emissive;
    const emitting = em && (em[0] > 0 || em[1] > 0 || em[2] > 0);
    gl.uniform3f(renderer.u.uEmissive, emitting ? em[0] : 0, emitting ? em[1] : 0,
      emitting ? em[2] : 0);
    if (draw.emTex && emitting) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, draw.emTex.tex);
      gl.uniform1f(renderer.u.uHasEm, 1);
    } else {
      gl.uniform1f(renderer.u.uHasEm, 0);
    }
    const gate = draw.mrTex && draw.mrGate ? draw.mrGate : [0, 0];
    if (gate[0] || gate[1]) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, draw.mrTex.tex);
    }
    gl.uniform2f(renderer.u.uMrGate, gate[0], gate[1]);
    if (draw.tex) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, draw.tex.tex);
      gl.uniform1f(renderer.u.uHasMap, 1);
    } else {
      gl.uniform1f(renderer.u.uHasMap, 0);
    }
    if (draw.indexType) gl.drawElements(gl.TRIANGLES, draw.count, draw.indexType, 0);
    else gl.drawArrays(gl.TRIANGLES, 0, draw.count);
  };
  /* Two passes: opaque first, then genuinely transparent surfaces blended
     over them back-to-front with depth writes off — the standard forward
     transparency recipe, and the difference between the water in a kit
     reading as glass versus painted concrete. A material is transparent
     because its data says so (alphaMode BLEND or an alpha factor under 1),
     never because of a display state. */
  const transparent = [];
  for (const draw of renderer.draws) {
    if (draw.blend || draw.color[3] < 0.999) transparent.push(draw);
    else drawOne(draw);
  }
  if (transparent.length) {
    transparent.sort((a, b) =>
      viewDepth(renderer, state, drawCenter(b)) - viewDepth(renderer, state, drawCenter(a)));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for (const draw of transparent) drawOne(draw);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
  // The ghost pass sets its own colour language; emissive and the MR map
  // must not leak into it from whichever draw happened to run last.
  gl.uniform3f(renderer.u.uEmissive, 0, 0, 0);
  gl.uniform1f(renderer.u.uHasEm, 0);
  gl.uniform2f(renderer.u.uMrGate, 0, 0);

  /*
   * X-ray pass — the reveal of what is behind the opaque spectral surface.
   *
   * The front pass above wrote the opaque skin AND the depth of the nearest
   * surface. This pass runs with the depth test flipped to GREATER, so it
   * draws ONLY fragments that are genuinely occluded — the interior and back
   * faces behind what you can see. That is the whole trick that keeps the
   * readable surface pristine: the reveal never re-draws the front skin, so it
   * can no longer stack a closed solid's layers to white. It finds the
   * geometry that should not be there — a part buried inside another, a
   * duplicate hiding behind its twin, an interior face nobody meant to keep.
   *
   * Additive blend accumulates the few genuinely-hidden layers into a quiet
   * luminous mist; the fragment shader keeps each faint (structure, silhouette
   * and the clearance alarm only — never the fill) so the accumulation stays
   * gentle. Order-independent, so no sort and no turn-flicker.
   */
  const xrayMix = state.xrayMix || 0;
  if (xrayMix > 0.001) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    // GREATER, not disabled: draw only where something nearer already sits in
    // the depth buffer, i.e. the occluded interior. Writes stay off so the
    // hidden layers do not occlude one another.
    gl.depthFunc(gl.GREATER);
    gl.depthMask(false);
    gl.uniform1f(renderer.u.uHasMap, 0);
    gl.uniform1f(renderer.u.uGhost, 1);
    gl.uniform1f(renderer.u.uXray, xrayMix);
    for (const draw of renderer.draws) {
      gl.bindVertexArray(draw.vao);
      gl.uniformMatrix4fv(renderer.u.uModel, false, draw.model);
      gl.uniform1f(renderer.u.uHeat, draw.heat || 0);
      if (draw.indexType) gl.drawElements(gl.TRIANGLES, draw.count, draw.indexType, 0);
      else gl.drawArrays(gl.TRIANGLES, 0, draw.count);
    }
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.uniform1f(renderer.u.uXray, 0);
  }
}
`;
