/**
 * Desktop-auth registration shared by the direct and packaged entries
 * (OPEND-5170, folding in #8600). A busy daemon or the native Windows picker
 * can acknowledge after 800 ms; on-demand registration must tolerate that,
 * while the startup call, which blocks window load, stays one short attempt.
 */
import { describe, expect, it, vi } from "vitest";

import {
  DESKTOP_AUTH_STARTUP_TIMEOUT_MS,
  DESKTOP_AUTH_TIMEOUT_MS,
  registerDesktopAuthWithDaemon,
} from "../../src/main/register-desktop-auth.js";

const SECRET = Buffer.from("super-secret-value-0123456789abcdef");
const noSleep = async () => {};

function client(...outcomes: Array<boolean | Error>) {
  const invoke = vi.fn(async (_app: string, _action: string, _input: unknown, _options: unknown) => {
    const next = outcomes.shift();
    if (next instanceof Error) throw next;
    return { accepted: next === true };
  });
  return { invoke: invoke as unknown as Parameters<typeof registerDesktopAuthWithDaemon>[0]["invoke"], calls: invoke };
}

describe("registerDesktopAuthWithDaemon", () => {
  it("startup: one attempt with the short deadline, no sleep", async () => {
    const c = client(new Error("timed out"));
    const sleep = vi.fn(noSleep);
    const logger = { warn: vi.fn() };

    await expect(registerDesktopAuthWithDaemon(c, SECRET, { logger, sleep })).resolves.toBe(false);

    expect(c.calls).toHaveBeenCalledTimes(1);
    expect(c.calls.mock.calls[0]?.[3]).toEqual({ timeoutMs: DESKTOP_AUTH_STARTUP_TIMEOUT_MS });
    expect(sleep).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("desktop auth handshake with the daemon failed", {
      attempts: 1,
      reason: "timed out",
      timeoutMs: DESKTOP_AUTH_STARTUP_TIMEOUT_MS,
    });
  });

  it("on demand: waits the longer deadline and succeeds on retry", async () => {
    const c = client(new Error("timed out"), true);
    const sleep = vi.fn(noSleep);
    const logger = { warn: vi.fn() };

    await expect(
      registerDesktopAuthWithDaemon(c, SECRET, { retry: true, logger, sleep, retryDelayMs: 250 }),
    ).resolves.toBe(true);

    expect(c.calls).toHaveBeenCalledTimes(2);
    expect(c.calls.mock.calls[0]?.[3]).toEqual({ timeoutMs: DESKTOP_AUTH_TIMEOUT_MS });
    expect(sleep).toHaveBeenCalledWith(250);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("on demand: a rejection is retried, and a second rejection resolves false with a log", async () => {
    const c = client(false, false);
    const logger = { warn: vi.fn() };

    await expect(registerDesktopAuthWithDaemon(c, SECRET, { retry: true, logger, sleep: noSleep })).resolves.toBe(false);

    expect(c.calls).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0]?.[1]).toMatchObject({ attempts: 2, reason: "not accepted" });
  });

  it("sends the secret base64-encoded and never logs it", async () => {
    const c = client(new Error("pipe closed"), new Error("pipe closed"));
    const logger = { warn: vi.fn() };

    await registerDesktopAuthWithDaemon(c, SECRET, { retry: true, logger, sleep: noSleep });

    expect(c.calls.mock.calls[0]?.[2]).toEqual({ secret: SECRET.toString("base64") });
    const logged = JSON.stringify(logger.warn.mock.calls);
    expect(logged).not.toContain(SECRET.toString("base64"));
    expect(logged).not.toContain(SECRET.toString());
  });

  it("first-attempt success does not sleep or log", async () => {
    const c = client(true);
    const sleep = vi.fn(noSleep);
    const logger = { warn: vi.fn() };

    await expect(registerDesktopAuthWithDaemon(c, SECRET, { retry: true, logger, sleep })).resolves.toBe(true);

    expect(sleep).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
