import * as fs from "node:fs";
import * as path from "node:path";
import { Issue } from "../types.js";
import { ISSUE_CODES } from "../errors.js";

/**
 * The glTF conformance oracle.
 *
 * Everywhere else the compiler measures with Blender and judges with the
 * contract. Here it does neither: it hands the EXPORTED `.glb` — the actual
 * bytes that ship — to Khronos's own reference validator and adopts its
 * verdict, mapping each message onto a stable S3D code. Our own parser can
 * confirm a file has the parts we authored; only the reference validator can
 * say the bytes are conformant (accessor bounds, matrix decomposability,
 * normalized weights, image encodings). Two judges disagreeing is itself a
 * signal, so this runs in addition to — never instead of — the built-in rules.
 *
 * It is additive and never fatal to run: if the validator cannot load, that
 * is a warning about the check, not an error about the asset.
 */

// Messages the reference validator emits for output Blender's exporter
// produces BY DESIGN — benign, and left unsuppressed they would paint every
// normal-mapped or multi-UV asset yellow until the codes get tuned out
// entirely (the failure mode fable warned about). Extend deliberately, with a
// reason per line; never suppress an error severity.
const SUPPRESSED = new Set<string>([
  // Blender omits tangents on export; runtimes generate them. A portability
  // note, not a defect, and it fires on every normal-mapped mesh we ship.
  "MESH_PRIMITIVE_GENERATED_TANGENT_SPACE",
]);

interface ValidatorMessage {
  code: string;
  message: string;
  severity: number; // 0 error, 1 warning, 2 info, 3 hint
  pointer?: string;
}

/** Validate one exported `.glb` and return the oracle's verdict as issues. */
export async function validateGltf(projectDir: string, rel: string): Promise<Issue[]> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(fs.readFileSync(path.join(projectDir, rel)));
  } catch {
    return []; // the export stage already reported anything unreadable
  }
  let messages: ValidatorMessage[];
  try {
    const mod = (await import("gltf-validator")) as unknown as {
      validateBytes?: (b: Uint8Array) => Promise<{ issues: { messages: ValidatorMessage[] } }>;
      default?: { validateBytes: (b: Uint8Array) => Promise<{ issues: { messages: ValidatorMessage[] } }> };
    };
    const validateBytes = mod.validateBytes ?? mod.default?.validateBytes;
    if (!validateBytes) throw new Error("validateBytes export missing");
    const report = await validateBytes(bytes);
    messages = report.issues.messages;
  } catch (err) {
    return [
      {
        code: ISSUE_CODES.GLTF_UNCHECKED,
        severity: "warning",
        message: `glTF conformance could not be checked: ${(err as Error).message}`,
        file: rel,
      },
    ];
  }

  const issues: Issue[] = [];
  for (const m of messages) {
    if (SUPPRESSED.has(m.code)) continue;
    if (m.severity === 0) {
      issues.push({
        code: ISSUE_CODES.GLTF_INVALID,
        severity: "error",
        message: `${m.code}: ${m.message}`,
        file: rel,
        detail: { validator: m.code, ...(m.pointer ? { pointer: m.pointer } : {}) },
      });
    } else if (m.severity === 1) {
      issues.push({
        code: ISSUE_CODES.GLTF_WARNING,
        severity: "warning",
        message: `${m.code}: ${m.message}`,
        file: rel,
        detail: { validator: m.code, ...(m.pointer ? { pointer: m.pointer } : {}) },
      });
    }
    // severity 2 (info) / 3 (hint) are not compile-worthy — the report leads
    // with what must change, and a hint is neither an error nor a warning.
  }
  return issues;
}
