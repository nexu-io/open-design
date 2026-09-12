import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalBytes, describeFile, checkedFile, readObject, writeObject, type JsonObject } from "./control-common.ts";
import { stageArtifactProduct } from "./artifact-staging.ts";

export type VersionInputStore = Readonly<{
  read: () => Promise<JsonObject | undefined>;
  create: (snapshot: JsonObject) => Promise<void>;
}>;

/** A release-owned input snapshot, not a workload identity. The caller supplies
 * verified product selections and public trust; no secret keys are persisted. */
export async function freezeVersionInput(input: Readonly<{
  directory: string;
  selection: JsonObject;
  previousContentFile?: string;
  acquirePrevious: () => Promise<Buffer | null>;
  store?: VersionInputStore;
}>) {
  const receiptFile = join(input.directory, "version-input.json");
  let saved: JsonObject | undefined;
  try { saved = await readObject(receiptFile); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (saved == null && input.store != null) {
    const remote = await input.store.read();
    if (remote != null) {
      if (!canonicalBytes(remote.input?.selection).equals(canonicalBytes(input.selection))) throw new Error("Frozen version input differs from requested selection");
      await stageArtifactProduct(input.directory, async stage => {
        if (remote.input.previousContent != null) {
          if (typeof remote.previousContent !== "string") throw new Error("Frozen version snapshot lacks compatibility bytes");
          await writeFile(join(stage, "previous-content.json"), Buffer.from(remote.previousContent, "base64"), { flag: "wx" });
          await checkedFile(remote.input.previousContent, "Frozen compatibility baseline", join(stage, "previous-content.json"));
        }
        await writeObject(join(stage, "version-input.json"), remote.input);
      });
      saved = await readObject(receiptFile);
    }
  }
  if (saved != null) {
    if (Object.keys(saved).sort().join(",") !== "operation,previousContent,schemaVersion,selection"
      || saved.schemaVersion !== 1 || saved.operation !== "exact.version.input"
      || !canonicalBytes(saved.selection).equals(canonicalBytes(input.selection))) {
      throw new Error("Frozen version input differs from requested selection");
    }
    const previous = saved.previousContent == null ? undefined
      : await checkedFile(saved.previousContent, "Frozen compatibility baseline", join(input.directory, "previous-content.json"));
    if (input.previousContentFile != null) {
      const supplied = await describeFile(input.previousContentFile);
      if (supplied.sha256 !== saved.previousContent?.sha256 || supplied.size !== saved.previousContent?.size) {
        throw new Error("Frozen compatibility baseline differs from explicit input");
      }
    }
    if (input.store != null) await input.store.create({ input: saved, previousContent: previous == null ? null : (await readFile(previous)).toString("base64") });
    return previous;
  }
  const previous = input.previousContentFile == null ? await input.acquirePrevious() : await readFile(input.previousContentFile);
  await stageArtifactProduct(input.directory, async stage => {
    let previousContent: JsonObject | null = null;
    if (previous != null) {
      const file = join(stage, "previous-content.json"); await writeFile(file, previous, { flag: "wx" });
      const { sha256, size } = await describeFile(file);
      previousContent = { file: "previous-content.json", sha256, size };
    }
    const snapshot = {
      schemaVersion: 1, operation: "exact.version.input", selection: input.selection, previousContent,
    };
    if (input.store != null) await input.store.create({ input: snapshot, previousContent: previous?.toString("base64") ?? null });
    await writeObject(join(stage, "version-input.json"), snapshot);
  });
  return previous == null ? undefined : join(input.directory, "previous-content.json");
}
