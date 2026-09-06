import { Census } from "../types.js";

/**
 * Validate a census payload produced by the Blender runner. The census is
 * machine-generated, but it crosses a process boundary and a failed parse
 * must surface as a structured issue (S3D-E-204), not a thrown crash.
 */
export function validateCensus(value: unknown): Census {
  // Guard the whole payload BEFORE reading any field: a null/non-object census
  // must surface as the structured S3D-E-204 verdict this function exists to
  // give, not a raw TypeError from dereferencing `v.objects` on null. The
  // caller catches and reports `err.message`, so a bare TypeError would replace
  // the itemized field list with an opaque engine-specific string.
  if (value === null || typeof value !== "object") {
    const err = new Error("invalid census: census is not an object") as Error & { code?: string };
    err.code = "S3D-E-204";
    throw err;
  }
  const v = value as Partial<Census>;
  const problems: string[] = [];
  if (!Array.isArray(v.objects)) problems.push("census.objects missing");
  if (!Array.isArray(v.meshes)) problems.push("census.meshes missing");
  if (!Array.isArray(v.materials)) problems.push("census.materials missing");
  if (!Array.isArray(v.textures)) problems.push("census.textures missing");
  if (!Array.isArray(v.zFightingPairs)) problems.push("census.zFightingPairs missing");
  if (!Array.isArray(v.offCameraObjects)) problems.push("census.offCameraObjects missing");
  if (!Array.isArray(v.uvObjectsWithoutLayers)) problems.push("census.uvObjectsWithoutLayers missing");
  if (!Array.isArray(v.objectsWithoutMaterial)) problems.push("census.objectsWithoutMaterial missing");
  if (!v.camera || typeof v.camera !== "object") problems.push("census.camera missing");
  if (!v.animation || typeof v.animation !== "object") problems.push("census.animation missing");
  if (!v.blenderVersion || typeof v.blenderVersion !== "string") problems.push("census.blenderVersion missing");
  if (problems.length > 0) {
    const err = new Error(`invalid census: ${problems.join("; ")}`) as Error & { code?: string };
    err.code = "S3D-E-204";
    throw err;
  }
  return v as Census;
}

/** Number arithmetic that must never be NaN in a census. */
export function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function censusMeshByObject(census: Census, objectName: string) {
  return census.meshes.find((m) => m.object === objectName);
}