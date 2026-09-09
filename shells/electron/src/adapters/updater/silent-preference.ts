/** Read the daemon-owned preference over its public API. Missing is initialized
 * once; unavailable or malformed configuration never grants activation. */
export async function readElectronSilentUpdatePreference(daemonUrl: string, signal: AbortSignal): Promise<boolean> {
  const url = new URL("/api/app-config", daemonUrl);
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(5_000)]);
  const response = await fetch(url, { signal: requestSignal });
  if (!response.ok) throw new Error(`silent update preference read failed: HTTP ${response.status}`);
  const body: unknown = await response.json();
  if (body == null || typeof body !== "object" || !("config" in body)
    || body.config == null || typeof body.config !== "object" || Array.isArray(body.config)) {
    throw new Error("invalid silent update preference response");
  }
  const value = (body.config as { allowSilentUpdates?: unknown }).allowSilentUpdates;
  if (typeof value === "boolean") return value;
  if (value !== undefined) throw new Error("invalid silent update preference");
  const written = await fetch(url, { method: "PUT", signal: requestSignal,
    headers: { "content-type": "application/json" }, body: JSON.stringify({ allowSilentUpdates: true }) });
  if (!written.ok) throw new Error(`silent update preference initialization failed: HTTP ${written.status}`);
  return true;
}
