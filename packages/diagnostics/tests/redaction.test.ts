import { describe, expect, it } from "vitest";

import { redactJsonText, redactJsonValue, redactText } from "../src/redaction.js";

describe("redactJsonValue", () => {
  it("masks sensitive string values by key name", () => {
    const input = {
      apiKey: "sk-abc123",
      password: "hunter2",
      nested: { authToken: "xyz", harmless: "data" },
      list: [{ secret: "shh" }, { plain: "ok" }],
    };
    const out = redactJsonValue(input) as typeof input;
    expect(out.apiKey).toBe("[REDACTED]");
    expect(out.password).toBe("[REDACTED]");
    expect(out.nested.authToken).toBe("[REDACTED]");
    expect(out.nested.harmless).toBe("data");
    expect(out.list[0]?.secret).toBe("[REDACTED]");
    expect(out.list[1]?.plain).toBe("ok");
  });

  it("does not mask non-string sensitive values", () => {
    const out = redactJsonValue({ keyId: 42, tokenCount: 0 }) as Record<string, unknown>;
    expect(out.keyId).toBe(42);
    expect(out.tokenCount).toBe(0);
  });
});

describe("redactText", () => {
  it("masks URL query secrets", () => {
    const line = "GET https://api.example.com/v1/foo?token=abc123&page=2";
    expect(redactText(line)).toContain("token=[REDACTED]");
    expect(redactText(line)).toContain("page=2");
  });

  it("masks Bearer / Token / Basic auth credentials, not just the scheme", () => {
    const bearer = redactText("X-Custom: Bearer sk-abc.DEF-123/xyz");
    expect(bearer).toContain("Bearer [REDACTED]");
    expect(bearer).not.toContain("sk-abc");

    const token = redactText("X-Custom: Token deadbeef0123");
    expect(token).toContain("Token [REDACTED]");
    expect(token).not.toContain("deadbeef0123");

    const basic = redactText("X-Custom: Basic dXNlcjpwYXNz");
    expect(basic).toContain("Basic [REDACTED]");
    expect(basic).not.toContain("dXNlcjpwYXNz");

    // When the scheme follows `Authorization:`, BARE_SECRET_RE also
    // double-redacts that prefix. Either way, the actual credential never
    // makes it into the export.
    const auth = redactText("Authorization: Bearer sk-abc.DEF-123/xyz");
    expect(auth).not.toContain("sk-abc");
    expect(auth).toContain("[REDACTED]");
  });

  it("masks auth-scheme credentials case-insensitively (RFC 7235)", () => {
    // Proxies and curl-style logs often emit lowercase or mixed-case
    // header names. The redactor must catch all of them.
    const lower = redactText("authorization: bearer sk-abc.DEF-123");
    expect(lower).not.toContain("sk-abc");
    expect(lower).toContain("[REDACTED]");

    const mixed = redactText("X-Custom: bEaReR deadbeef0123");
    expect(mixed).not.toContain("deadbeef0123");
    expect(mixed).toContain("[REDACTED]");

    // RFC 6750 token68 includes `~`; the redactor must consume the whole
    // token, not stop at the first `~` and leak the tail.
    const tilde = redactText("Authorization: Bearer abcd~efgh");
    expect(tilde).not.toContain("efgh");
    expect(tilde).not.toContain("~");

    const lowerBasic = redactText("X-Custom: basic dXNlcjpwYXNz");
    expect(lowerBasic).not.toContain("dXNlcjpwYXNz");
    expect(lowerBasic).toContain("[REDACTED]");
  });

  it("masks access_token / refresh_token / id_token in bare and URL form", () => {
    const url = redactText("POST https://oauth/token?access_token=abc&refresh_token=xyz");
    expect(url).toContain("access_token=[REDACTED]");
    expect(url).toContain("refresh_token=[REDACTED]");

    const bare = redactText("env: access_token=abc.def refresh_token=ghi");
    expect(bare).toContain("access_token=[REDACTED]");
    expect(bare).toContain("refresh_token=[REDACTED]");
    expect(bare).not.toContain("abc.def");
  });

  it("replaces user home path with placeholder", () => {
    const line = "open file /Users/alice/Documents/work.txt failed";
    expect(redactText(line, { username: "alice" })).toBe("open file /Users/<USER>/Documents/work.txt failed");
  });

  it("leaves other users' paths untouched", () => {
    const line = "saw /Users/bob/code while user is alice";
    expect(redactText(line, { username: "alice" })).toContain("/Users/bob/code");
  });

  it("handles short or empty username safely", () => {
    expect(redactText("/Users/a/x", { username: "" })).toContain("/Users/a/x");
    expect(redactText("/Users/a/x", { username: "a" })).toContain("/Users/a/x");
  });
});

describe("redactJsonText", () => {
  it("pretty-prints redacted JSON", () => {
    const text = JSON.stringify({ token: "x", body: "ok" });
    const out = redactJsonText(text);
    expect(out).toContain("[REDACTED]");
    expect(out).toContain("\n");
  });

  it("falls back to text redaction for invalid JSON", () => {
    const text = "not json but token=xyz here";
    expect(redactJsonText(text)).toContain("token=[REDACTED]");
  });
});
