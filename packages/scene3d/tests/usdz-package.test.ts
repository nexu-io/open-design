import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { packageUsdz } from "../src/usd/usdz.js";

/**
 * The USDZ container, read back as bytes — no Blender, no USD library.
 *
 * USDZ's two packaging rules (STORED entries, 64-byte-aligned data) are met by
 * padding the local header's EXTRA FIELD, and that field is not free space: the
 * ZIP spec defines it as a sequence of `(headerId:2, size:2, data)` records, so
 * 1..3 bytes of padding cannot form a legal one. Padding by the raw remainder
 * shipped exactly that — three archives in this package's own test corpus
 * carried 1- and 3-byte extra fields, and every reader that touched them
 * happened to ignore the field rather than parse it.
 *
 * These pin both halves at once, because they trade against each other: it is
 * trivial to make the extra field well-formed by breaking alignment, or to
 * align by writing a malformed field. Name lengths are swept so the padding
 * lands on every residue class rather than whichever one today's fixtures hit.
 */

interface LocalEntry {
  name: string;
  dataStart: number;
  extraLength: number;
  stored: boolean;
}

/** Walk the local file headers, which is where alignment actually lives — the
 *  central directory carries its own independent extra field. */
function localEntries(archive: Buffer): LocalEntry[] {
  const out: LocalEntry[] = [];
  let at = 0;
  while (at + 30 <= archive.length && archive.readUInt32LE(at) === 0x04034b50) {
    const compression = archive.readUInt16LE(at + 8);
    const size = archive.readUInt32LE(at + 18);
    const nameLength = archive.readUInt16LE(at + 26);
    const extraLength = archive.readUInt16LE(at + 28);
    const dataStart = at + 30 + nameLength + extraLength;
    out.push({
      name: archive.subarray(at + 30, at + 30 + nameLength).toString("utf8"),
      dataStart,
      extraLength,
      stored: compression === 0,
    });
    at = dataStart + size;
  }
  return out;
}

function pack(names: string[]): Buffer {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s3d-usdz-"));
  const refs = names.map((n) => `        asset inputs:file = @${n}@`).join("\n");
  fs.writeFileSync(
    path.join(dir, "scene.usda"),
    `#usda 1.0\n\ndef Material "M"\n{\n    def Shader "S"\n    {\n${refs}\n    }\n}\n`,
  );
  for (const name of names) {
    fs.mkdirSync(path.join(dir, path.dirname(name)), { recursive: true });
    // Distinct, non-empty payloads so a mis-parsed offset cannot read as valid.
    fs.writeFileSync(path.join(dir, name), Buffer.alloc(name.length * 7 + 3, name.length & 0xff));
  }
  const target = path.join(dir, "scene.usdz");
  packageUsdz(path.join(dir, "scene.usda"), target);
  return fs.readFileSync(target);
}

describe("usdz packaging", () => {
  it("aligns every file's data to 64 bytes for every entry-name length", () => {
    // One name per residue class mod 64: whatever the header arithmetic does,
    // some length in here lands on each possible remainder.
    const names = Array.from({ length: 64 }, (_, i) => `textures/${"a".repeat(i + 1)}.png`);
    const entries = localEntries(pack(names));
    expect(entries.length).toBe(names.length + 1); // the stage plus every ref
    for (const entry of entries) {
      expect(entry.dataStart % 64, `${entry.name} starts at ${entry.dataStart}`).toBe(0);
    }
  });

  it("never writes an extra field too short to hold a record", () => {
    // One archive per name length. Within a single archive every entry's
    // offset depends on all the payloads before it, so a name sweep does NOT
    // reliably produce the 1..3 residues — the first version of this test
    // passed against the unfixed packer for exactly that reason. Separate
    // archives move the second entry's header one byte at a time instead.
    const entries: LocalEntry[] = [];
    for (let length = 1; length <= 128; length++) {
      entries.push(...localEntries(pack([`textures/${"b".repeat(length)}.png`])));
    }

    // Coverage before verdict. The fix adds 64 to sub-4 padding, so the
    // pre-fix value is recoverable as `extraLength % 64`; if the sweep never
    // reaches 1..3, this test proves nothing and must say so.
    const rawPadding = entries.map((e) => e.extraLength % 64);
    expect(
      rawPadding.some((p) => p >= 1 && p <= 3),
      "sweep never needed 1..3 bytes of padding — the case under test is not covered",
    ).toBe(true);

    for (const entry of entries) {
      // 0 (absent) is fine; 1..3 cannot express `(headerId:2, size:2)`.
      expect(
        entry.extraLength === 0 || entry.extraLength >= 4,
        `${entry.name} has a ${entry.extraLength}-byte extra field`,
      ).toBe(true);
    }
  });

  it("declares an extra field whose record length matches the bytes present", () => {
    const names = Array.from({ length: 64 }, (_, i) => `textures/${"c".repeat(i + 1)}.png`);
    const archive = pack(names);
    let checked = 0;
    for (const entry of localEntries(archive)) {
      if (entry.extraLength === 0) continue;
      // The record's own size field must account for exactly the remainder,
      // or a reader walking records runs off the end of the field.
      const recordSize = archive.readUInt16LE(entry.dataStart - entry.extraLength + 2);
      expect(recordSize, `${entry.name}`).toBe(entry.extraLength - 4);
      checked++;
    }
    expect(checked, "the sweep must produce padded entries at all").toBeGreaterThan(0);
  });

  it("stores entries uncompressed and leads with the root layer", () => {
    const entries = localEntries(pack(["textures/one.png", "textures/two.png"]));
    expect(entries[0]!.name).toBe("scene.usda");
    for (const entry of entries) expect(entry.stored, `${entry.name}`).toBe(true);
  });
});

describe("usdz reference containment (bug-shaker round)", () => {
  function tmp(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "s3d-usdz-c-"));
  }

  it("reports an absolute reference instead of silently omitting it", () => {
    // Red before the fix: the loop `continue`d past absolute refs with no
    // diagnostic — the archive "succeeded" while depending on a file no
    // consumer machine has.
    const dir = tmp();
    fs.writeFileSync(
      path.join(dir, "scene.usda"),
      `#usda 1.0\n\ndef Shader "S"\n{\n    asset inputs:file = @C:/elsewhere/tex.png@\n}\n`,
    );
    const { missing } = packageUsdz(path.join(dir, "scene.usda"), path.join(dir, "scene.usdz"));
    expect(missing.some((m) => m.includes("C:/elsewhere/tex.png") && m.includes("absolute"))).toBe(
      true,
    );
  });

  it("refuses to mint '../' archive entries for refs escaping the package root", () => {
    // A `../outside.usda` reference resolved and packaged used to become an
    // entry literally named "../outside.usda" — a path-traversal write for
    // naive extractors. It is reported as unpackageable instead.
    const dir = tmp();
    const root = path.join(dir, "pkg");
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(dir, "outside.png"), Buffer.from("png-ish"));
    fs.writeFileSync(
      path.join(root, "scene.usda"),
      `#usda 1.0\n\ndef Shader "S"\n{\n    asset inputs:file = @../outside.png@\n}\n`,
    );
    const { missing } = packageUsdz(path.join(root, "scene.usda"), path.join(root, "scene.usdz"));
    expect(missing.some((m) => m.includes("../outside.png") && m.includes("escapes"))).toBe(true);
    const entries = localEntries(fs.readFileSync(path.join(root, "scene.usdz")));
    expect(entries.every((e) => !e.name.startsWith(".."))).toBe(true);
  });

  it("names binary layers it packaged but could not scan for transitive refs", () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, "part.usdc"), Buffer.from("PXR-USDC-binary-ish"));
    fs.writeFileSync(
      path.join(dir, "scene.usda"),
      `#usda 1.0\n(\n    subLayers = [@./part.usdc@]\n)\n`,
    );
    const { missing, unscanned } = packageUsdz(
      path.join(dir, "scene.usda"),
      path.join(dir, "scene.usdz"),
    );
    expect(missing).toEqual([]);
    expect(unscanned).toEqual(["part.usdc"]);
  });
});

describe("usdz layer-encoding + link containment (bug-shaker round 4)", () => {
  function tmp(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "s3d-usdz-d-"));
  }

  it("scans an ASCII layer under the .usd extension — the magic decides, not the suffix", () => {
    // OpenUSD's .usd is either encoding. Red before the fix: a text .usd
    // was packaged unscanned, so its own missing refs went unreported.
    const dir = tmp();
    fs.writeFileSync(
      path.join(dir, "part.usd"),
      `#usda 1.0\n\ndef Shader "S"\n{\n    asset inputs:file = @./gone.png@\n}\n`,
    );
    fs.writeFileSync(
      path.join(dir, "scene.usda"),
      `#usda 1.0\n(\n    subLayers = [@./part.usd@]\n)\n`,
    );
    const { missing, unscanned } = packageUsdz(
      path.join(dir, "scene.usda"),
      path.join(dir, "scene.usdz"),
    );
    expect(unscanned).toEqual([]);
    expect(missing).toContain("./gone.png");
  });

  it("refuses a symlink inside the root that resolves outside it", (ctx) => {
    // The lexical containment check cannot see links; readFileSync follows
    // them and would embed external content under an innocent name.
    const dir = tmp();
    const root = path.join(dir, "pkg");
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(dir, "secret.png"), Buffer.from("outside-bytes"));
    try {
      fs.symlinkSync(path.join(dir, "secret.png"), path.join(root, "tex.png"), "file");
    } catch {
      ctx.skip(); // symlink creation needs privileges this environment lacks
      return;
    }
    fs.writeFileSync(
      path.join(root, "scene.usda"),
      `#usda 1.0\n\ndef Shader "S"\n{\n    asset inputs:file = @./tex.png@\n}\n`,
    );
    const { missing } = packageUsdz(path.join(root, "scene.usda"), path.join(root, "scene.usdz"));
    expect(missing.some((m) => m.includes("./tex.png") && m.includes("via a link"))).toBe(true);
    const bytes = fs.readFileSync(path.join(root, "scene.usdz"));
    expect(bytes.includes(Buffer.from("outside-bytes"))).toBe(false);
  });
});

describe("binary root layers (bug-shaker round 5)", () => {
  it("names a binary master unscanned instead of text-scanning garbage", () => {
    // The root used to skip the magic sniff entirely: a binary .usd master
    // was read as UTF-8, its matches were noise, and unscanned stayed
    // empty — an apparently complete package with unreported blind spots.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s3d-usdz-e-"));
    const master = path.join(dir, "scene.usd");
    fs.writeFileSync(master, Buffer.from("PXR-USDC\x00binary payload"));
    const { unscanned } = packageUsdz(master, path.join(dir, "scene.usdz"));
    expect(unscanned).toEqual(["scene.usd"]);
  });
});

describe("containment predicate exactness (bug-shaker round 6)", () => {
  it("packages a file legitimately NAMED with a leading double dot", () => {
    // `..hidden.png` matched startsWith("..") and was reported as escaping
    // the root while sitting inside it. Escape means the first SEGMENT is
    // exactly `..`.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s3d-usdz-f-"));
    fs.writeFileSync(path.join(dir, "..hidden.png"), Buffer.from("dotty"));
    fs.writeFileSync(
      path.join(dir, "scene.usda"),
      `#usda 1.0\n\ndef Shader "S"\n{\n    asset inputs:file = @./..hidden.png@\n}\n`,
    );
    const { missing } = packageUsdz(path.join(dir, "scene.usda"), path.join(dir, "scene.usdz"));
    expect(missing).toEqual([]);
    const entries = localEntries(fs.readFileSync(path.join(dir, "scene.usdz")));
    expect(entries.some((e) => e.name === "..hidden.png")).toBe(true);
  });
});
