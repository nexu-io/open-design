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
export function packageUsdz(
  masterAbs: string,
  targetAbs: string,
): { missing: string[]; unscanned: string[] } {
  // The root resolves to its REAL path up front: a symlinked master would
  // otherwise anchor masterDir at the link's directory while every read
  // follows the target — splitting the containment frame in two.
  masterAbs = fs.realpathSync(masterAbs);
  const masterDir = path.dirname(masterAbs);
  const files: string[] = [masterAbs];
  const missing: string[] = [];
  const unscanned: string[] = [];
  /** True when the file's leading bytes are USDA's text magic. The suffix
   *  never decides — `.usd` is either encoding. The descriptor closes in
   *  finally, or a failing read would leak one per unreadable layer. */
  const isUsdaText = (abs: string): boolean => {
    const head = Buffer.alloc(5);
    let fd: number | undefined;
    try {
      fd = fs.openSync(abs, "r");
      const got = fs.readSync(fd, head, 0, 5, 0);
      return head.subarray(0, got).toString("latin1") === "#usda";
    } catch {
      return false;
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
  };
  /* TRANSITIVE collection: a referenced layer's own references (its
     textures, its sublayers) must ride the package too, or the USDZ
     "succeeds" and fails to resolve in the consumer — one hop used to be
     the whole walk. Only .usda layers are scanned for further refs (a
     binary ref carries none this scanner can read); a queue with a seen
     set bounds the walk against reference cycles. Missing files are
     RETURNED, never swallowed: an archive that silently lacks what its
     root layer names is the two-deliverables-two-answers defect again. */
  const queue: string[] = [masterAbs];
  const scanned = new Set<string>();
  while (queue.length > 0) {
    const layerAbs = queue.pop()!;
    if (scanned.has(layerAbs)) continue;
    scanned.add(layerAbs);
    const layerDir = path.dirname(layerAbs);
    // Sniffed at SCAN time so the root gets the same treatment as every
    // referenced layer: a binary .usd/.usdc read as UTF-8 yields garbage
    // matches. Binary layers are packaged and NAMED unscanned instead.
    if (!isUsdaText(layerAbs)) {
      const relName =
        path.relative(masterDir, layerAbs).replace(/\\/g, "/") || path.basename(layerAbs);
      if (!unscanned.includes(relName)) unscanned.push(relName);
      continue;
    }
    const text = fs.readFileSync(layerAbs, "utf8");
    // The @...@ walk is deliberately NOT a USDA parser: it over-approximates.
    // A false candidate that exists is packaged (a harmless extra file); one
    // that does not lands in `missing` (a visible, wrong-able warning). Both
    // failure modes are LOUD — a syntax-aware collector that missed a real
    // reference would fail silently, which is the worse trade.
    for (const match of new Set([...text.matchAll(/@([^@\n]+)@/g)].map((m) => m[1]!))) {
      if (/^[a-zA-Z]:|^[\\/]/.test(match)) {
        // An absolute reference cannot ride a package, and skipping it
        // SILENTLY ships an archive that "succeeds" while depending on a
        // file no consumer machine has — report it like any other gap.
        const label = `${match} (absolute reference — not packageable)`;
        if (!missing.includes(label)) missing.push(label);
        continue;
      }
      const candidate = path.normalize(path.join(layerDir, match));
      // Containment: a `../` reference resolving OUTSIDE the master's
      // directory would become an archive entry literally named "../x" —
      // rejected by strict consumers and a path-traversal write for naive
      // extractors. Not packageable, so it is reported, not smuggled.
      // "Starts with .." alone is the classic containment slip: a file
      // legitimately NAMED `..hidden.png` matches it while sitting inside
      // the root. Escape means the FIRST SEGMENT is exactly `..`.
      const escapes = (r: string): boolean =>
        r === ".." || r.startsWith(`..${path.sep}`) || path.isAbsolute(r);
      const rel = path.relative(masterDir, candidate);
      if (escapes(rel)) {
        const label = `${match} (escapes the package root — not packageable)`;
        if (!missing.includes(label)) missing.push(label);
        continue;
      }
      if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
        if (!missing.includes(match)) missing.push(match);
        continue;
      }
      // The lexical check above cannot see a SYMLINK inside the root that
      // points outside it — readFileSync follows it and would embed external
      // content under an innocent-looking name. Real paths on both sides.
      try {
        const realCandidate = fs.realpathSync(candidate);
        // masterDir is already real (the root was realpathed at entry).
        const realRel = path.relative(masterDir, realCandidate);
        if (escapes(realRel)) {
          const label = `${match} (resolves outside the package root via a link — not packageable)`;
          if (!missing.includes(label)) missing.push(label);
          continue;
        }
      } catch {
        if (!missing.includes(match)) missing.push(match);
        continue;
      }
      if (!files.includes(candidate)) files.push(candidate);
      // Any USD-suffixed layer queues; the pop-side sniff above decides
      // whether it scans as text or is named unscanned — one mechanism for
      // the root and every reference alike.
      if (/\.(usda|usd|usdc)$/i.test(candidate)) queue.push(candidate);
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
    // USDZ requires every file's data to begin 64-byte aligned, and ZIP's only
    // place to absorb that is the local header's extra field. But an extra
    // field is not free bytes: it is a sequence of (headerId:2, size:2, data)
    // records, so 1..3 bytes cannot form one. Padding by the raw remainder
    // shipped structurally malformed headers — three archives in the test
    // corpus carried 1- and 3-byte extra fields, readable only because every
    // reader we happened to use ignores the field it cannot parse.
    //
    // Rounding up by another 64 keeps the alignment exact (64 % 64 == 0) and
    // buys room for a real record: id 0, then the remaining bytes as its
    // payload. Costs at most 64 bytes once per file.
    let pad = (64 - (dataStart % 64)) % 64;
    if (pad > 0 && pad < 4) pad += 64;
    const extra = Buffer.alloc(pad);
    if (pad > 0) extra.writeUInt16LE(pad - 4, 2); // id stays 0; size is the rest
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    // Bit 11: entry names are UTF-8. They ARE encoded as UTF-8 below, and
    // without the flag a reader is entitled to decode them as CP437 — a
    // non-ASCII asset filename then fails to match its @reference@.
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(pad, 28);
    write(local);
    write(name);
    write(extra);
    write(data);
    entries.push({ name, crc, size: data.length, headerOffset });
  }

  const centralStart = offset;
  for (const entry of entries) {
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8); // same UTF-8 name flag as the local header
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
  return { missing, unscanned };
}
