import { afterEach, expect, it, vi } from "vitest";
import { readElectronSilentUpdatePreference } from "@/adapters/updater/silent-preference.js";

afterEach(() => { vi.unstubAllGlobals(); });

it.each([true, false])("respects explicit %s without a write", async value => {
  const request = vi.fn(async () => Response.json({ config: { allowSilentUpdates: value } }));
  vi.stubGlobal("fetch", request);
  await expect(readElectronSilentUpdatePreference("http://localhost:1234", new AbortController().signal)).resolves.toBe(value);
  expect(request).toHaveBeenCalledTimes(1);
});

it("initializes only the missing field through the public API", async () => {
  const request = vi.fn().mockResolvedValueOnce(Response.json({ config: { onboardingCompleted: true } }))
    .mockResolvedValueOnce(Response.json({ ok: true }));
  vi.stubGlobal("fetch", request);
  await expect(readElectronSilentUpdatePreference("http://localhost:1234", new AbortController().signal)).resolves.toBe(true);
  expect(request.mock.calls[1]![1]).toMatchObject({ method: "PUT", body: '{"allowSilentUpdates":true}' });
});

it.each([{ config: null }, { config: [] }, { config: { allowSilentUpdates: "true" } }, {}])("rejects malformed preference responses", async body => {
  const request = vi.fn(async () => Response.json(body));
  vi.stubGlobal("fetch", request);
  await expect(readElectronSilentUpdatePreference("http://localhost:1234", new AbortController().signal)).rejects.toThrow("invalid silent update preference");
  expect(request).toHaveBeenCalledTimes(1);
});

it("does not grant permission when persistence fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ config: {} }))
    .mockResolvedValueOnce(new Response(null, { status: 500 })));
  await expect(readElectronSilentUpdatePreference("http://localhost:1234", new AbortController().signal)).rejects.toThrow("initialization failed");
});
