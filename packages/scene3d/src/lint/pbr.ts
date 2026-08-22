import { Issue } from "../types.js";
import { ISSUE_CODES } from "../errors.js";
import { LintContext } from "./naming.js";

/**
 * PBR material discipline. The rules target the failure modes a generative
 * loop actually produces: mid-range metallic values that cannot render
 * correctly, principled nodes left at factory defaults, textures with no UV
 * layer, and materials that exist but are bound to nothing.
 */
export function lintPbr(ctx: LintContext, issues: Issue[]): void {
  const census = ctx.census;
  if (!census) return;

  for (const mat of census.materials) {
    if (mat.usedByObjectCount === 0) {
      issues.push({
        code: ISSUE_CODES.MATERIAL_UNUSED,
        severity: "warning",
        message: `material '${mat.name}' is not assigned to any object`,
        hint: "bind the material or delete it",
        target: mat.name,
      });
    }
    if (!mat.principled.present) continue;
    const p = mat.principled;

    // An EMPTY allowlist means unconstrained — the inspection posture for
    // ingested third-party assets, which use fractional metallic freely
    // (a real downloaded kit carried metallic 0.02 on 291 materials).
    // Authored scenes keep the default [0, 1] discipline.
    if (
      p.metallic !== null &&
      ctx.contract.metallicValues.length > 0 &&
      !ctx.contract.metallicValues.includes(p.metallic)
    ) {
      issues.push({
        code: ISSUE_CODES.METALLIC_VALUE,
        severity: "error",
        message: `material '${mat.name}' metallic ${p.metallic} is not in ${ctx.contract.metallicValues.join(", ")}`,
        hint: "use a metalness map or a metallic value of 0/1",
        target: mat.name,
        detail: { metallic: p.metallic },
      });
    }

    if (p.roughness !== null) {
      const [lo, hi] = ctx.contract.roughnessRange;
      if (p.roughness < lo || p.roughness > hi) {
        issues.push({
          code: ISSUE_CODES.ROUGHNESS_RANGE,
          severity: "error",
          message: `material '${mat.name}' roughness ${p.roughness} outside [${lo}, ${hi}]`,
          target: mat.name,
          detail: { roughness: p.roughness },
        });
      }
    }

    if (p.ior !== null) {
      const [lo, hi] = ctx.contract.iorRange;
      if (p.ior < lo || p.ior > hi) {
        issues.push({
          code: ISSUE_CODES.IOR_RANGE,
          severity: "warning",
          message: `material '${mat.name}' IOR ${p.ior} outside [${lo}, ${hi}]`,
          target: mat.name,
          detail: { ior: p.ior },
        });
      }
    }

    if (p.untouchedDefault) {
      issues.push({
        code: ISSUE_CODES.UNTOUCHED_DEFAULT_MATERIAL,
        severity: "warning",
        message: `material '${mat.name}' is still at Principled factory defaults`,
        hint: "author base color, roughness and metallic explicitly",
        target: mat.name,
      });
    }
  }

  // When conventions.uv is active, the uv lint reports textured-without-UV
  // as an error (S3D-E-441); the legacy warning only fires with UV rules off
  // so one defect never carries two codes.
  if (ctx.contract.uv.require === "off") {
    for (const name of census.uvObjectsWithoutLayers) {
      issues.push({
        code: ISSUE_CODES.TEXTURE_WITHOUT_UV,
        severity: "warning",
        message: `object '${name}' uses textured materials but has no UV layer`,
        hint: "unwrap the mesh before texturing",
        target: name,
      });
    }
  }

  // The real premise is "a render-target part has no shading source", not "no
  // material slot": a low-poly / MagicaVoxel part shades from a vertex-colour
  // attribute. So a material-less mesh is only unshaded when it ALSO carries no
  // colour attribute.
  const coloured = new Set(
    census.meshes.filter((m) => m.hasColorAttribute).map((m) => m.object),
  );
  for (const name of census.objectsWithoutMaterial) {
    if (coloured.has(name)) continue;
    issues.push({
      code: ISSUE_CODES.OBJECT_WITHOUT_MATERIAL,
      severity: "warning",
      message: `object '${name}' has no material and no vertex-colour attribute — nothing shades it`,
      hint: "assign a material, or add a colour attribute for a vertex-coloured low-poly look",
      target: name,
    });
  }

  /* ---- textures as FILES -------------------------------------------- */
  const texRules = ctx.contract.textures;
  for (const tex of census.textures) {
    if (tex.fileMissing === true) {
      issues.push({
        code: ISSUE_CODES.TEXTURE_FILE_MISSING,
        severity: "error",
        message: `texture '${tex.name}' points at a file that does not exist (${tex.filepath})`,
        hint: "fix the path or pack the image; a missing texture renders magenta and fails engine import",
        target: tex.name,
        detail: { filepath: tex.filepath },
      });
      // Size rules on a file that is not there would be noise.
      continue;
    }
    if (tex.width <= 0 || tex.height <= 0) continue;
    if (texRules.requirePowerOfTwo && (!isPowerOfTwo(tex.width) || !isPowerOfTwo(tex.height))) {
      issues.push({
        code: ISSUE_CODES.TEXTURE_NOT_POWER_OF_TWO,
        severity: "warning",
        message: `texture '${tex.name}' is ${tex.width}x${tex.height} — not power-of-two`,
        hint: "resize to a power of two for mipmaps and GPU block compression, or set conventions.textures.requirePowerOfTwo false",
        target: tex.name,
        detail: { width: tex.width, height: tex.height },
      });
    }
    if (Math.max(tex.width, tex.height) > texRules.maxSize) {
      issues.push({
        code: ISSUE_CODES.TEXTURE_TOO_LARGE,
        severity: "warning",
        message: `texture '${tex.name}' is ${tex.width}x${tex.height} (limit ${texRules.maxSize}px per edge)`,
        hint: "downsize the texture or raise conventions.textures.maxSize",
        target: tex.name,
        detail: { width: tex.width, height: tex.height, limit: texRules.maxSize },
      });
    }
  }

  /* ---- duplicate materials — one look, two draw calls ---------------- */
  if (texRules.flagDuplicateMaterials) {
    const byFingerprint = new Map<string, string[]>();
    for (const mat of census.materials) {
      if (mat.usedByObjectCount === 0 || !mat.principled.present) continue;
      const p = mat.principled;
      // Two materials are duplicates only if they SHADE the same, and the
      // authority on that is the node graph — not a list of properties.
      // Calibrating against the Khronos corpus caught this rule proposing a
      // visibly-wrong merge three times in a row, each time over a distinction
      // the property list did not carry: alpha mode (MASK vs OPAQUE), then the
      // alpha cutoff (0.25 vs 0.75), then iridescence. Enumerating properties
      // loses that race by construction — every glTF extension the importer
      // supports adds another one.
      //
      // The properties stay in the fingerprint because they are what the
      // MESSAGE talks about and they cover materials with no node tree; the
      // graph signature is what makes the verdict trustworthy.
      const fingerprint = JSON.stringify([
        p.metallic, p.roughness, p.ior, p.baseColor,
        p.emission ?? null, p.emissionStrength ?? null, p.alpha ?? null,
        mat.blendMethod ?? null, mat.alphaCutoff ?? null, mat.graph ?? null,
        [...(mat.textureNames ?? [])].sort(),
      ]);
      const group = byFingerprint.get(fingerprint) ?? [];
      group.push(mat.name);
      byFingerprint.set(fingerprint, group);
    }
    for (const group of byFingerprint.values()) {
      if (group.length < 2) continue;
      issues.push({
        code: ISSUE_CODES.DUPLICATE_MATERIALS,
        severity: "warning",
        message: `materials ${group.map((n) => `'${n}'`).join(", ")} are identical (same parameters and textures)`,
        hint: "merge them into one material — identical materials cost draw calls for nothing",
        target: group[0]!,
        detail: { materials: group },
      });
    }
  }

  /* ---- partial face assignment --------------------------------------- */
  if (texRules.requireFaceAssignment) {
    for (const mesh of census.meshes) {
      if ((mesh.facesWithoutMaterial ?? 0) > 0) {
        issues.push({
          code: ISSUE_CODES.FACES_WITHOUT_MATERIAL,
          severity: "warning",
          message: `mesh '${mesh.object}' has ${mesh.facesWithoutMaterial} face(s) with no material slot — engines render them with a default material`,
          hint: "assign every face a slot, or clear the empty slots",
          target: mesh.object,
          detail: { facesWithoutMaterial: mesh.facesWithoutMaterial },
        });
      }
    }
  }
}

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}