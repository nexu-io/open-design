/**
 * The render route answers a refusal with `{ error, hint }` naming the exact
 * cause and how to fix it. Studio used to print the bare status code and drop
 * that body, which is why the most common Studio export failure reached users
 * as "Server error (503)" with no mention of the missing FFmpeg the server had
 * already diagnosed. The status code is the fallback now, not the message.
 */
export async function readServerError(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (typeof body === "object" && body !== null) {
      const { error, hint } = body as { error?: unknown; hint?: unknown };
      if (typeof error === "string" && error) {
        return typeof hint === "string" && hint ? `${error}. ${hint}` : error;
      }
    }
  } catch {
    // Not JSON, or the body was already consumed — fall through to the status.
  }
  return `Server error (${res.status}). Check the terminal for details.`;
}
