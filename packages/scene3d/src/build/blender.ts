import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { PartTweak } from "../types.js";

/** Sentinel framing for the Blender runner protocol:
 *  the python side prints one line `###SCENE3D###<base64 json>###`. */
const SENTINEL_START = "###SCENE3D###";
const SENTINEL_END = "###";

export interface RunnerResult {
  ok: boolean;
  errorCode?: string;
  error?: string;
  data?: unknown;
}

export interface BlenderProbe {
  mode: "blender" | "python";
  bin: string;
  version: string;
}

let probeCache: BlenderProbe | null | undefined;

/**
 * Locate the shipped `scripts/` directory from a module directory.
 *
 * The package runs from two layouts and they sit at different depths:
 * `src/build/` when the package's own tests import source, and `dist/` when
 * a consumer imports the esbuild bundle. Probing for the runner instead of
 * hard-coding one depth is what keeps the two honest — a hard-coded
 * `../../scripts` resolves to a sibling of the package when bundled, which
 * only ever fails at a consumer's call site, never in this package's tests.
 */
export function resolveScriptsDir(moduleDir: string): string {
  const candidates = [
    path.join(moduleDir, "..", "scripts"), // dist/index.mjs
    path.join(moduleDir, "..", "..", "scripts"), // src/build/blender.ts
    path.join(moduleDir, "..", "..", "..", "scripts"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "blender", "runner.py"))) return candidate;
  }
  return candidates[0]!;
}

export function scriptsDir(): string {
  const override = process.env.SCENE3D_SCRIPTS_DIR;
  if (override) return override;
  return resolveScriptsDir(path.dirname(fileURLToPath(import.meta.url)));
}

export function runnerPath(): string {
  return path.join(scriptsDir(), "blender", "runner.py");
}

/** Resolve and probe the Blender runtime once per process. */
export async function probeBlender(options: {
  blenderBin?: string;
  pythonBin?: string;
}): Promise<BlenderProbe | null> {
  if (probeCache !== undefined) return probeCache;

  const blenderBin = options.blenderBin ?? process.env.SCENE3D_BLENDER_BIN;
  if (blenderBin) {
    probeCache = await probe(bin(blenderBin), ["--version"], "blender") ?? null;
    return probeCache;
  }

  const pythonBin = options.pythonBin ?? process.env.SCENE3D_PYTHON_BIN ?? "python";
  probeCache = await probe(pythonBin, ["-c", "import bpy; print(bpy.app.version_string)"], "python");
  return probeCache;
}

export function clearProbeCache(): void {
  probeCache = undefined;
}

async function probe(bin: string, args: string[], mode: "blender" | "python"): Promise<BlenderProbe | null> {
  try {
    const out = await runCapture(bin, args, 30_000);
    const first = out.stdout.trim().split(/\r?\n/)[0] ?? "";
    if (out.code === 0 && first.length > 0 && first.length < 200) {
      return { mode, bin, version: first };
    }
    return null;
  } catch {
    return null;
  }
}

function bin(value: string): string {
  return value.replace(/^"|"$/g, "");
}

interface CaptureResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCapture(bin: string, args: string[], timeoutMs: number): Promise<CaptureResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`command timed out after ${timeoutMs}ms: ${bin} ${args.join(" ")}`));
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

export interface RunnerJob {
  mode: "build" | "proof" | "export";
  projectDir: string;
  buildScript?: string;
  usdaFiles?: string[];
  blendFile?: string;
  /** Real asset files (.glb/.gltf/.obj/.fbx) imported as the scene. */
  meshFiles?: string[];
  /** Run the (costly) wall-thickness ray-cast during the census — on only for
   *  a 3d_print contract that will judge it. */
  measureThickness?: boolean;
  /** The voxel authoring grid in metres (1 pixel of a block), against which
   *  grid deviation is measured. Absent = no grid was declared, so that one
   *  fact is not measured; the oriented box itself is measured for every mesh
   *  regardless, being a fact about a shape rather than about Minecraft. */
  voxelGrid?: number;
  /** Assembled GPU kernels to compile, execute, and bake at load time. */
  shaders?: Array<{
    name: string;
    size: number;
    outputs: string[];
    frames?: number;
    motionVectors?: boolean;
    uniforms: Array<{ name: string; type: string; value: number[] }>;
    fragmentSource: string;
    vertexSource: string;
  }>;
  /** Material -> baked-shader-texture wiring applied after the bake. */
  shaderBindings?: Array<{ material: string; shader: string; outputs: string[] }>;
  outDir: string;
  proof?: {
    engine: string;
    resolution: number;
    turntable: boolean;
    turntableSteps: number;
    respectSceneCamera: boolean;
    background?: string;
    filepaths: string[];
  };
  /** Viewport edits keyed by part name, replayed after the build —
   *  transform deltas plus the absolute material channel. */
  tweaks?: Record<string, PartTweak>;
  formats?: string[];
  /** LOD triangle-keep ratios (0,1); each authors a scene.lod<N>.glb. */
  lodRatios?: number[];
  /** Contract up-axis the exporter should rotate the stage to. */
  upAxis?: string;
  /** Contract metres-per-unit the exported stage must declare. Without this
   *  the runner always wrote 1, so any project that declared millimetres
   *  (every 3D print, every centimetre-native engine) failed S3D-E-403 on
   *  every compile with no way to satisfy it. */
  metersPerUnit?: number;
  /** Asset identity written into the exported stage's assetInfo. */
  assetName?: string;
}

/** Run a job through the headless Blender runner with sentinel framing. */
export async function runRunner(
  probe: BlenderProbe,
  job: RunnerJob,
  timeoutMs: number,
  extraEnv: Record<string, string> = {},
): Promise<RunnerResult> {
  const jobFile = path.join(os.tmpdir(), `scene3d-job-${crypto.randomUUID()}.json`);
  fs.writeFileSync(jobFile, JSON.stringify(job));
  try {
    const args =
      probe.mode === "blender"
        ? ["--background", "--python", runnerPath(), "--", jobFile]
        : [runnerPath(), jobFile];
    return await spawnRunner(probe.bin, args, timeoutMs, extraEnv);
  } finally {
    try {
      fs.unlinkSync(jobFile);
    } catch {
      /* ignore */
    }
  }
}

function spawnRunner(
  bin: string,
  args: string[],
  timeoutMs: number,
  extraEnv: Record<string, string>,
): Promise<RunnerResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      windowsHide: true,
      env: { ...process.env, ...extraEnv },
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({ ok: false, errorCode: "S3D-E-203", error: `stage timed out after ${timeoutMs}ms` });
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() ?? "";
      for (const line of lines) {
        const marker = line.indexOf(SENTINEL_START);
        if (marker !== -1) {
          const payload = line.slice(marker + SENTINEL_START.length);
          const end = payload.indexOf(SENTINEL_END);
          if (end !== -1) {
            settled = true;
            clearTimeout(timer);
            try {
              const parsed = JSON.parse(Buffer.from(payload.slice(0, end), "base64").toString("utf8"));
              child.kill();
              resolve(parsed as RunnerResult);
            } catch {
              // A sentinel-framed payload that does not parse is a broken
              // runner, and it must FAIL, not un-settle: the timeout timer
              // is already cleared, so resetting `settled` here left the
              // promise pending forever — a compile hung past its own
              // timeout on one corrupt line.
              child.kill();
              resolve({
                ok: false,
                errorCode: "S3D-E-202",
                error: "runner emitted a sentinel payload that does not parse",
              });
            }
          }
        }
      }
    });
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, errorCode: "S3D-E-202", error: `failed to spawn runner: ${err.message}` });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ ok: false, errorCode: "S3D-E-202", error: "runner exited without a result sentinel" });
      } else {
        const tail = stderr.trim().split(/\r?\n/).slice(-8).join("\n");
        resolve({
          ok: false,
          errorCode: "S3D-E-202",
          error: `blender exited with code ${code}: ${tail || "no stderr output"}`,
        });
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/* Content-hash stage cache                                            */
/* ------------------------------------------------------------------ */

export function hashFiles(files: string[]): string {
  const hash = crypto.createHash("sha256");
  for (const file of [...files].sort()) {
    try {
      const content = fs.readFileSync(file);
      // Domain-separate present-vs-missing so a real file whose bytes happen to
      // equal the old `"__missing__"` sentinel can't hash identically to that
      // path being absent. The separators differ, so no content can bridge the
      // two branches.
      hash.update(file).update("\0present\0").update(content);
    } catch {
      hash.update(file).update("\0missing\0");
    }
  }
  return hash.digest("hex").slice(0, 24);
}

export function hashJson(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}

export interface CacheEntry {
  artifacts: string[];
  data: unknown;
}

export function cacheDir(projectDir: string): string {
  return path.join(projectDir, ".scene3d", "cache");
}

export function readCache(projectDir: string, stage: string, hash: string): CacheEntry | null {
  const file = path.join(cacheDir(projectDir), `${stage}.${hash}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as CacheEntry;
  } catch {
    return null;
  }
}

export function writeCache(projectDir: string, stage: string, hash: string, entry: CacheEntry): void {
  const dir = cacheDir(projectDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${stage}.${hash}.json`), JSON.stringify(entry));
}