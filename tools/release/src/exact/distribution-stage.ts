/** Observe release-owned work without logging credentials, object URLs or
 * command arguments. Native signing/notary stages remain owned by the Shell. */
export async function distributionStage<T>(stage: string, operation: () => Promise<T>): Promise<T> {
  const started = performance.now();
  let status = "failure";
  try {
    const result = await operation();
    status = "success";
    return result;
  } finally {
    console.log(JSON.stringify({ event: "release.distribution.stage", stage,
      durationMs: Math.round(performance.now() - started), status }));
  }
}
