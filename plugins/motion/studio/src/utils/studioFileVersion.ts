// A token is marked before the request starts, so its lifetime must cover slow writes,
// retries, and the subsequent file-change echo without retaining abandoned tokens forever.
const WRITE_TOKEN_TTL_MS = 5 * 60_000;
const studioWriteTokens = new Map<string, number>();
let fileRevision = 0;

/** One step per write Studio claims: a copy of the project read at a lower revision is stale. */
export function studioFileRevision(): number {
  return fileRevision;
}

function pruneStudioWriteTokens(now: number): void {
  for (const [token, createdAt] of studioWriteTokens) {
    if (now - createdAt >= WRITE_TOKEN_TTL_MS) studioWriteTokens.delete(token);
  }
}

/** Marked by the Studio file writer introduced in external-change stack PR #2990. */
export function markStudioWriteToken(token: string, now: number = Date.now()): void {
  pruneStudioWriteTokens(now);
  studioWriteTokens.set(token, now);
  fileRevision += 1;
}

/** Consumed by the external-change coordinator introduced in stack PR #2991. */
export function consumeStudioWriteToken(token: string | null, now: number = Date.now()): boolean {
  pruneStudioWriteTokens(now);
  if (!token || !studioWriteTokens.has(token)) return false;
  studioWriteTokens.delete(token);
  return true;
}

/** Resets module-level echo identity between PR #2991 coordinator tests. */
export function resetStudioWriteTokens(): void {
  studioWriteTokens.clear();
}

/** Browser-safe SHA-256 version matching studio-server's strong ETag format. */
export async function studioFileContentVersion(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
  return `"sha256:${hex}"`;
}

/** Prefer an explicit content precondition, then the version observed during the read. */
export async function studioExpectedFileVersion(
  versions: ReadonlyMap<string, string | null>,
  path: string,
  expectedContent?: string,
): Promise<string | null | undefined> {
  if (expectedContent !== undefined) return studioFileContentVersion(expectedContent);
  return versions.get(path);
}

export function createStudioWriteToken(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === "function") return webCrypto.randomUUID();
  if (typeof webCrypto?.getRandomValues !== "function") {
    throw new Error("Web Crypto getRandomValues is required for Studio write identity");
  }

  const bytes = webCrypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Headers that claim the write a mutation request is about to make as our own.
 *
 * The token is marked BEFORE the request goes out on purpose: the server writes
 * the file and the watcher broadcasts it while the request is still in flight, so
 * a token marked from the response can arrive after the echo it was meant to
 * match. An unmatched echo reads as an external change and costs a full preview
 * reload, which the user sees as a flash right after their own edit.
 */
export function studioWriteHeaders(): Record<string, string> {
  const token = createStudioWriteToken();
  markStudioWriteToken(token);
  return { "X-Hyperframes-Write-Token": token };
}
