import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function emitBuildRecord(record: unknown, path?: string): void {
  const json = `${JSON.stringify(record, null, 2)}\n`;
  if (path != null) {
    if (path.length === 0) throw new Error("--build-json requires a nonempty path");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, json, "utf8");
  }
  process.stdout.write(json);
}
