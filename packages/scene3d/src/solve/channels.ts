/**
 * The material channels — one table, consumed by everything.
 *
 * A material is not a fixed handful of knobs; it is a set of BINDINGS onto a
 * surface model's inputs, and each binding is either a constant or a baked
 * shader output. That is the whole primitive. `roughness: 0.4` and
 * `roughness: { shader: "shd_rust", output: "roughness" }` are the same field
 * answered two ways, and every channel below accepts both — which is what
 * makes clearcoat, transmission, sheen, anisotropy, iridescence and directly
 * authored normals fall out of one concept rather than arriving as eight more
 * one-off fields.
 *
 * The vocabulary is the Principled BSDF's own, because that is what both
 * OpenUSD and glTF lower from: a channel set here is a channel that survives
 * the export into an engine. Socket NAMES are Blender's and have been renamed
 * across versions (`Coat Weight` was `Clearcoat`, `Transmission Weight` was
 * `Transmission`), so each channel carries a candidate list and the runner
 * binds the first one the build actually has — and REPORTS the ones it could
 * not, since a channel that silently did not bind is a material that quietly
 * shipped wrong.
 *
 * This table is the single source of truth. It is shipped to the runner in
 * the job rather than duplicated in Python, so there is no second list to
 * drift: the compiler decides what a channel means, and the runner applies
 * what it is handed.
 */

/** How a channel's constant is written, which decides its validation. */
export type ChannelKind =
  /** A single number in [min, max]. */
  | "scalar"
  /** Linear RGB, three numbers in 0-1. */
  | "color"
  /** Three numbers, each in [min, max] — a radius or a direction. */
  | "vector"
  /**
   * A texture-only channel: it has no meaningful constant, because the value
   * is a per-texel direction. Only a binding is legal.
   */
  | "map";

export interface ChannelDef {
  /** The authoring name, as written in `scene.json`. */
  name: ChannelName;
  /**
   * Blender socket names to try, in order. More than one because the
   * Principled BSDF's sockets were renamed between versions and a build may
   * be either; the first that exists wins.
   */
  sockets: string[];
  kind: ChannelKind;
  /** Inclusive bounds for `scalar`/`vector` constants. */
  min?: number;
  max?: number;
  /**
   * True when a baked texture for this channel carries DATA rather than
   * colour, so it must be sampled without the sRGB transfer. Getting this
   * wrong bends every value in the map.
   */
  nonColor?: boolean;
  /** One line for the error text, so a refusal teaches the channel. */
  note: string;
}

/**
 * Every channel, in authoring order. Adding a row here is the whole of adding
 * a material capability: the type, the validator, the emitter and the runner
 * all read this list.
 */
/** Every channel name, as literals — the source of both the table below and
 *  the `ChannelName` type, so the vocabulary is closed at compile time. */
export const CHANNEL_NAMES = [
  "baseColor", "roughness", "metallic", "ior", "alpha", "normal",
  "emission", "emissionStrength", "specular", "specularTint",
  "diffuseRoughness", "anisotropic", "anisotropicRotation",
  "transmission", "subsurface", "subsurfaceRadius", "subsurfaceScale",
  "coat", "coatRoughness", "coatIor", "coatTint", "coatNormal",
  "sheen", "sheenRoughness", "sheenTint",
  "thinFilmThickness", "thinFilmIor",
] as const;

export type ChannelName = (typeof CHANNEL_NAMES)[number];

/** A field a shader may be bound to — a channel, or a non-channel routing
 *  target (`displacement`, `occlusion`). This is what `channel` on a
 *  ShaderBinding carries, and what the runner routes on. */
export type BindableField = ChannelName | "displacement" | "occlusion";

export const MATERIAL_CHANNELS: readonly ChannelDef[] = [
  { name: "baseColor", sockets: ["Base Color"], kind: "color", note: "the surface's albedo" },
  { name: "roughness", sockets: ["Roughness"], kind: "scalar", min: 0, max: 1, nonColor: true, note: "0 mirror, 1 fully diffuse" },
  { name: "metallic", sockets: ["Metallic"], kind: "scalar", min: 0, max: 1, nonColor: true, note: "0 dielectric, 1 conductor" },
  { name: "ior", sockets: ["IOR"], kind: "scalar", min: 1, max: 3, nonColor: true, note: "index of refraction; glass ~1.45, water 1.33" },
  { name: "alpha", sockets: ["Alpha"], kind: "scalar", min: 0, max: 1, nonColor: true, note: "opacity" },
  { name: "normal", sockets: ["Normal"], kind: "map", nonColor: true, note: "a tangent-space normal map; bind a shader output, there is no constant" },
  { name: "emission", sockets: ["Emission Color", "Emission"], kind: "color", note: "the colour this surface emits" },
  { name: "emissionStrength", sockets: ["Emission Strength"], kind: "scalar", min: 0, max: 10000, nonColor: true, note: "how much of the emission colour leaves the surface" },
  { name: "specular", sockets: ["Specular IOR Level", "Specular"], kind: "scalar", min: 0, max: 1, nonColor: true, note: "dielectric reflectance at normal incidence" },
  { name: "specularTint", sockets: ["Specular Tint"], kind: "color", note: "tints the specular reflection" },
  { name: "diffuseRoughness", sockets: ["Diffuse Roughness"], kind: "scalar", min: 0, max: 1, nonColor: true, note: "Oren-Nayar roughness of the diffuse lobe" },
  { name: "anisotropic", sockets: ["Anisotropic"], kind: "scalar", min: 0, max: 1, nonColor: true, note: "stretches the highlight — brushed metal, hair" },
  { name: "anisotropicRotation", sockets: ["Anisotropic Rotation"], kind: "scalar", min: 0, max: 1, nonColor: true, note: "turns the anisotropic highlight, 0-1 = a full turn" },
  { name: "transmission", sockets: ["Transmission Weight", "Transmission"], kind: "scalar", min: 0, max: 1, nonColor: true, note: "how much light passes THROUGH — real glass, not alpha" },
  { name: "subsurface", sockets: ["Subsurface Weight", "Subsurface"], kind: "scalar", min: 0, max: 1, nonColor: true, note: "light scattering under the surface — skin, wax, marble" },
  { name: "subsurfaceRadius", sockets: ["Subsurface Radius"], kind: "vector", min: 0, max: 100, nonColor: true, note: "per-channel scatter distance in metres" },
  { name: "subsurfaceScale", sockets: ["Subsurface Scale"], kind: "scalar", min: 0, max: 100, nonColor: true, note: "scales the scatter radius" },
  { name: "coat", sockets: ["Coat Weight", "Clearcoat"], kind: "scalar", min: 0, max: 1, nonColor: true, note: "a clear lacquer over the surface — car paint, varnish" },
  { name: "coatRoughness", sockets: ["Coat Roughness", "Clearcoat Roughness"], kind: "scalar", min: 0, max: 1, nonColor: true, note: "how polished the clear coat is" },
  { name: "coatIor", sockets: ["Coat IOR", "Clearcoat IOR"], kind: "scalar", min: 1, max: 3, nonColor: true, note: "index of refraction of the coat" },
  { name: "coatTint", sockets: ["Coat Tint", "Clearcoat Tint"], kind: "color", note: "tints light passing through the coat" },
  { name: "coatNormal", sockets: ["Coat Normal", "Clearcoat Normal"], kind: "map", nonColor: true, note: "a normal map for the coat alone — orange peel over smooth paint" },
  { name: "sheen", sockets: ["Sheen Weight", "Sheen"], kind: "scalar", min: 0, max: 1, nonColor: true, note: "retroreflective rim — cloth, velvet, dust" },
  { name: "sheenRoughness", sockets: ["Sheen Roughness"], kind: "scalar", min: 0, max: 1, nonColor: true, note: "how tight the sheen rim is" },
  { name: "sheenTint", sockets: ["Sheen Tint"], kind: "color", note: "colours the sheen" },
  { name: "thinFilmThickness", sockets: ["Thin Film Thickness"], kind: "scalar", min: 0, max: 100000, nonColor: true, note: "iridescence film thickness in nanometres — soap, oil, beetle shell" },
  { name: "thinFilmIor", sockets: ["Thin Film IOR"], kind: "scalar", min: 1, max: 3, nonColor: true, note: "index of refraction of the iridescent film" },
];

/** Channel lookup by authoring name. */
export const CHANNEL_BY_NAME: ReadonlyMap<string, ChannelDef> = new Map(
  MATERIAL_CHANNELS.map((c) => [c.name, c]),
);

/**
 * What a kernel may bake: every channel, plus `height` and `occlusion`.
 *
 * Those two are bakeable without being surface inputs — a height field is the
 * scalar the compiler DERIVES a normal map and displacement from, and
 * occlusion is carried beside the material rather than into it. Every other
 * entry is a channel, which is what makes "bake it" and "bind it" one
 * vocabulary: anything a material can wear, a kernel can write.
 */
export const SHADER_OUTPUTS = [
  ...MATERIAL_CHANNELS.map((c) => c.name),
  "height",
  "occlusion",
] as readonly ChannelName[] as readonly ShaderOutputName[];

/**
 * The output vocabulary as a TYPE, so a caller constructing a spec or a job
 * directly is checked by the compiler rather than only by the validator —
 * `kernelFunctionFor` interpolates this into a generated function name, and a
 * bad one produces a kernel that cannot exist.
 */
export type ShaderOutputName = ChannelName | "height" | "occlusion";

/**
 * How a material's alpha is meant to be read by an engine.
 *
 * Separate from the `alpha` channel because they answer different questions:
 * `alpha` is the value, this is what a renderer does with it. glTF and USD
 * both carry this distinction, and collapsing them is why a cut-out leaf has
 * to be authored as a blended one and then sorts wrong in every engine.
 */
export type AlphaMode = "opaque" | "mask" | "blend";
export const ALPHA_MODES: readonly AlphaMode[] = ["opaque", "mask", "blend"];
