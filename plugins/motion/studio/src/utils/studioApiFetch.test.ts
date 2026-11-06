import { afterEach, describe, expect, it, vi } from "vitest";

async function loadWithEnv(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import("./studioApiFetch");
}

describe("studioApiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("sends Studio's requests without credentials, keeping the caller's options", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const { studioApiFetch } = await loadWithEnv({});
    const signal = new AbortController().signal;

    await studioApiFetch("/api/projects/demo/history/step", { method: "POST", signal });

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/demo/history/step", {
      method: "POST",
      signal,
      credentials: "omit",
    });
  });

  it.each([
    ["the CLI or Studio dev server", "http://localhost:5190/"],
    ["Desktop's own server", "http://127.0.0.1:43117/"],
    ["IPv6 loopback", "http://[::1]:8080/"],
  ])("leaves cookies out when Studio is served from %s", async (_, page) => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", new URL(page));
    const { studioApiFetch } = await loadWithEnv({});

    await studioApiFetch("/api/projects/demo/files/index.html");

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/demo/files/index.html", {
      credentials: "omit",
    });
  });

  it("keeps same-origin cookies off loopback, where a proxy or tunnel may authenticate with them", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", new URL("https://studio.example.com/editor"));
    const { studioApiFetch } = await loadWithEnv({});

    await studioApiFetch("/api/projects/demo/files/index.html");

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/demo/files/index.html", {
      credentials: "same-origin",
    });
  });

  it("sends same-origin credentials on loopback for a host that opted out", async () => {
    vi.stubGlobal("location", new URL("http://localhost:5190/"));
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const { studioApiFetch } = await loadWithEnv({
      VITE_STUDIO_API_SAME_ORIGIN_CREDENTIALS: "true",
    });

    await studioApiFetch("/api/projects/demo/files/index.html");

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/demo/files/index.html", {
      credentials: "same-origin",
    });
  });
});
