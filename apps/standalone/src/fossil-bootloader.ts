export const STANDALONE_FOSSIL_HANDOFF_ENTRY = "./baseline/launcher.mjs" as const;

/** Fossil rule: resolve one adjacent baseline entry and hand off at most once. */
export async function handoff(): Promise<unknown> {
  const target = new URL(STANDALONE_FOSSIL_HANDOFF_ENTRY, import.meta.url);
  const module = await import(target.href) as Readonly<Record<string, unknown>>;
  if (typeof module.handoffOnce !== "function") {
    throw new Error("Standalone baseline launcher must export handoffOnce()");
  }
  return await module.handoffOnce();
}

if (process.env.OD_STANDALONE_BOOTSTRAP_INPUT_V1 != null) {
  await handoff().catch((error: unknown) => {
    process.stderr.write(`open-design standalone fossil handoff failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
