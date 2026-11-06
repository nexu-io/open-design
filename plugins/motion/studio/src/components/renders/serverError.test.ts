import { describe, expect, it } from "vitest";
import { readServerError } from "./serverError";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("readServerError", () => {
  // The regression this whole file exists for: the render route's 503 carries
  // "FFmpeg not found" plus the install command, and Studio used to show the
  // user "Server error (503)" instead.
  it("prefers the server's cause and remediation over the status code", async () => {
    const res = jsonResponse({ error: "FFmpeg not found", hint: "brew install ffmpeg" }, 503);

    await expect(readServerError(res)).resolves.toBe("FFmpeg not found. brew install ffmpeg");
  });

  it("uses the cause alone when the server sends no hint", async () => {
    const res = jsonResponse({ error: "FFmpeg not found" }, 503);

    await expect(readServerError(res)).resolves.toBe("FFmpeg not found");
  });

  it("falls back to the status code when the body is not JSON", async () => {
    const res = new Response("<html>502 Bad Gateway</html>", { status: 502 });

    await expect(readServerError(res)).resolves.toBe(
      "Server error (502). Check the terminal for details.",
    );
  });

  it("falls back to the status code when the JSON carries no error string", async () => {
    const res = jsonResponse({ hint: "brew install ffmpeg" }, 500);

    await expect(readServerError(res)).resolves.toBe(
      "Server error (500). Check the terminal for details.",
    );
  });

  it("ignores a non-string error rather than rendering it as an object", async () => {
    const res = jsonResponse({ error: { code: 17 } }, 500);

    await expect(readServerError(res)).resolves.toBe(
      "Server error (500). Check the terminal for details.",
    );
  });
});
