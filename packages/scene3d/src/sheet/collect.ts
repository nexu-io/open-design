import * as fs from "node:fs";
import * as path from "node:path";
import { decodePng, DecodedImage } from "./png.js";
import { measureSheet, SheetMeasurement } from "./measure.js";
import { SheetSpec } from "../lint/sheet.js";

export interface CollectedSheets {
  specs: SheetSpec[];
  measurements: Map<string, SheetMeasurement>;
  images: Map<string, DecodedImage>;
  missing: string[];
  unreadable: Map<string, string>;
}

/**
 * Read, decode and measure every declared sheet in a project.
 *
 * Decoding happens in-process, so this is milliseconds and needs no Blender
 * — 2D checks stay available on a machine that has no DCC installed, and in
 * CI, which is where they are most useful.
 *
 * A sheet that is declared but absent, or present but corrupt, is recorded
 * rather than thrown: a broken asset must produce an issue code the agent
 * can act on, not an exception that takes down the whole compile.
 */
export function collectSheets(projectDir: string, specs: SheetSpec[]): CollectedSheets {
  const measurements = new Map<string, SheetMeasurement>();
  const images = new Map<string, DecodedImage>();
  const missing: string[] = [];
  const unreadable = new Map<string, string>();

  for (const spec of specs) {
    const absolute = path.join(projectDir, spec.file);
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(absolute);
    } catch {
      missing.push(spec.file);
      continue;
    }
    try {
      const image = decodePng(new Uint8Array(bytes));
      images.set(spec.file, image);
      measurements.set(
        spec.file,
        measureSheet(spec.file, image, {
          ...(spec.grid ? { grid: spec.grid } : {}),
          ...(spec.inset !== undefined ? { inset: spec.inset } : {}),
        }),
      );
    } catch (err) {
      unreadable.set(spec.file, (err as Error).message);
    }
  }

  return { specs, measurements, images, missing, unreadable };
}
