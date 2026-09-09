import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pack } from "@open-design/archive/build";

export type ZipFixtureEntries = Record<string, string | Buffer>;

/** Small native ZIP fixtures; no persistent files or JS compression backend. */
export async function zipFixture(entries: ZipFixtureEntries): Promise<Buffer> {
  const scratch = await mkdtemp(join(tmpdir(), "release-zip-fixture-"));
  try {
    const source = join(scratch, "source"); await mkdir(source);
    for (const [name, bytes] of Object.entries(entries)) {
      if (name.startsWith("/") || name.includes("\\") || name.split("/").some(part => !part || part === "." || part === "..")) throw new Error("unsafe fixture name");
      const target = join(source, name); await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }
    const archive = await pack(source, join(scratch, "fixture.zip"), { reproducible: true, permissions: "portable" });
    return await readFile(archive.file);
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
