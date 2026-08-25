import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { Issue } from "../types.js";
import { ISSUE_CODES } from "../errors.js";
import { scriptsDir } from "../build/blender.js";

/**
 * The USD conformance oracle.
 *
 * Like the glTF oracle, this adopts an external authority's verdict rather
 * than measuring anything itself — here OpenUSD's own runtime (pxr), run in a
 * short-lived subprocess so it never touches the Blender/bpy process. It
 * catches what our structure-only stage parser cannot: a stage that does not
 * COMPOSE, and — the silent trap — a material binding that resolves to a prim
 * that does not exist, which USD ignores without a word, leaving the surface
 * unshaded in every consumer.
 *
 * Additive and never fatal to run: if pxr is not installed, or the subprocess
 * cannot start, the result is an "unchecked" warning about the check, never an
 * error about the asset.
 */

interface OracleResult {
  unavailable?: boolean;
  ok?: boolean;
  error?: string | null;
  defaultPrim?: string | null;
  unresolvedBindings?: string[];
}

function pythonBin(): string {
  return process.env.SCENE3D_PYTHON_BIN ?? "python";
}

function runOracle(target: string): Promise<OracleResult> {
  const script = path.join(scriptsDir(), "blender", "usd_oracle.py");
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin(), [script, target], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("USD oracle timed out"));
    }, 30_000);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", () => {
      clearTimeout(timer);
      const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? "";
      try {
        resolve(JSON.parse(line) as OracleResult);
      } catch {
        reject(new Error(stderr.trim().split(/\r?\n/).slice(-1)[0] || "no JSON from USD oracle"));
      }
    });
  });
}

/** Validate one exported USD stage and return the oracle's verdict as issues. */
export async function validateUsd(projectDir: string, rel: string): Promise<Issue[]> {
  const target = path.join(projectDir, rel);
  if (!fs.existsSync(target)) return []; // export stage already reported anything unreadable

  let result: OracleResult;
  try {
    result = await runOracle(target);
  } catch (err) {
    return [
      {
        code: ISSUE_CODES.USD_UNCHECKED,
        severity: "warning",
        message: `USD conformance could not be checked: ${(err as Error).message}`,
        file: rel,
      },
    ];
  }

  if (result.unavailable) {
    return [
      {
        code: ISSUE_CODES.USD_UNCHECKED,
        severity: "warning",
        message: "USD conformance oracle unavailable — OpenUSD (pxr) is not installed on this host",
        file: rel,
      },
    ];
  }

  // An EXPLICIT verdict or no verdict at all: a response that says neither
  // `ok: true` nor `ok: false` (schema drift, a partial dict from a
  // crashed run that still printed JSON) used to fall through both
  // branches and read as a clean pass — the oracle's silence adopted as
  // its blessing.
  if (result.ok !== true && result.ok !== false) {
    return [
      {
        code: ISSUE_CODES.USD_UNCHECKED,
        severity: "warning",
        message: "USD oracle returned no verdict (response carries no ok field) — the stage was not conformance-checked",
        file: rel,
      },
    ];
  }

  const issues: Issue[] = [];
  if (result.ok === false) {
    issues.push({
      code: ISSUE_CODES.USD_COMPOSITION_ERROR,
      severity: "error",
      message: `USD stage did not compose: ${result.error ?? "unknown error"}`,
      file: rel,
    });
  }
  for (const binding of result.unresolvedBindings ?? []) {
    issues.push({
      code: ISSUE_CODES.USD_BINDING_UNRESOLVED,
      severity: "warning",
      message: `material binding resolves to nothing (${binding}) — USD silently ignores it, so the surface ships unshaded`,
      file: rel,
      detail: { binding },
    });
  }
  return issues;
}
