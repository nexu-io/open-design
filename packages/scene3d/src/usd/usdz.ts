import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

/**
 * Package a master USD stage and its referenced files as USDZ.
 *
 * USDZ is a zip with two extra rules (Pixar's packaging spec): entries are
 * STORED, never compressed, and every file's data must start on a 64-byte
 * boundary — achieved by padding the local header's extra field. The root
 * layer must be the first entry.
 *
 * Packaged HERE, after `authorStageModel`, not in the Blender runner: the
 * kind/purpose/assetInfo semantics are authored onto the .usda on this
 * side of the process boundary, and a package produced before that step
 * ships a stage that disagrees with the file it claims to contain — the
 * exact two-deliverables-two-answers defect the stage-model module exists
 * to prevent (found by adversarial review, then confirmed by inspecting a
 * runner-packaged archive: no kind, no assetInfo).
 */
export function packageUsdz(masterAbs: string, targetAbs: string): void {
  const masterDir = path.dirname(masterAbs);
  const files: string[] = [masterAbs];
  const text = fs.readFileSync(masterAbs, "utf8");
  for (const match of new Set([...text.matchAll(/@([^@\n]+)@/g)].map((m) => m[1]!))) {
    if (/^[a-zA-Z]:|^[\\/]/.test(match)) continue; // absolute refs cannot ride a package
    const candidate = path.normalize(path.join(masterDir, match));
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile() && !files.includes(candidate)) {
      files.push(candidate);
    }
  }

  const chunks: Buffer[] = [];
  let offset = 0;
  const write = (buffer: Buffer): void => {
    chunks.push(buffer);
    offset += buffer.length;
  };
  const entries: Array<{ name: Buffer; crc: number; size: number; headerOffset: number }> = [];

  for (const abs of files) {
    const name = Buffer.from(
      path.relative(masterDir, abs).replace(/\\/g, "/"),
      "utf8",
    );
    const data = fs.readFileSync(abs);
    const headerOffset = offset;
    const dataStart = headerOffset + 30 + name.length;
    const pad = (64 - (dataStart % 64)) % 64;
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(pad, 28);
    write(local);
    write(name);
    write(Buffer.alloc(pad));
    write(data);
    entries.push({ name, crc, size: data.length, headerOffset });
  }

  const centralStart = offset;
  for (const entry of entries) {
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt32LE(entry.crc, 16);
    central.writeUInt32LE(entry.size, 20);
    central.writeUInt32LE(entry.size, 24);
    central.writeUInt16LE(entry.name.length, 28);
    central.writeUInt32LE(entry.headerOffset, 42);
    write(central);
    write(entry.name);
  }
  const centralSize = offset - centralStart;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralStart, 16);
  write(end);

  fs.writeFileSync(targetAbs, Buffer.concat(chunks));
}
