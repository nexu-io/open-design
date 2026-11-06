// @vitest-environment happy-dom

/**
 * "Install the desktop app": shown where the preview server has the app or its download to offer. With the app ready a
 * press opens the project in it; otherwise it opens the guide card (download, install, open).
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const showToast = vi.fn();
vi.mock("../contexts/StudioContext", () => ({ useStudioShellContext: () => ({ showToast }) }));
const track = vi.fn();
vi.mock("../utils/studioTelemetry", () => ({ trackStudioEvent: track }));
const FOLDER = "/work/launch-teaser";
vi.mock("../contexts/FileManagerContext", () => ({
  useFileManagerContextOptional: () => ({ projectDir: FOLDER }),
}));
const copied: string[] = [];
vi.mock("../utils/clipboard", () => ({
  copyTextToClipboard: async (text: string) => (copied.push(text), true),
}));

const { OpenInDesktopButton } = await import("./OpenInDesktopButton");
const { resolveTabId } = await import("../telemetry/tabId");
const tagged = (url: string) => {
  const withId = new URL(url);
  withId.searchParams.set("hf_cta", resolveTabId());
  return withId.toString();
};

const DOWNLOAD = "https://hyperframes.dev/studio/download";
let mounted: { root: Root; host: HTMLElement } | null = null;
let posts: number;
let postBodies: unknown[];

function serve(get: Response | null, post?: unknown) {
  posts = 0;
  postBodies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts += 1;
        postBodies.push(JSON.parse(String(init.body ?? "null")));
        return Response.json(post);
      }
      return get ?? new Response("Not found", { status: 404 });
    }),
  );
}

async function mount(): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted = { root, host };
  await act(async () => root.render(<OpenInDesktopButton />));
  return host;
}

const button = () =>
  document.querySelector<HTMLButtonElement>('[data-testid="header-open-in-desktop"]');

let reveal: (() => void) | null = null;

beforeEach(() => {
  showToast.mockReset();
  track.mockReset();
  reveal = null;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private readonly onChange: (entries: { isIntersecting: boolean }[]) => void) {}
      observe() {
        reveal = () => this.onChange([{ isIntersecting: true }]);
      }
      disconnect() {
        reveal = null;
      }
    },
  );
});

const events = (name: string) =>
  track.mock.calls.filter(([event]) => event === name).map(([, props]) => props);
const MAC = { os: "darwin", app_installed: true, download_available: true };

afterEach(() => {
  vi.unstubAllGlobals();
  if (!mounted) return;
  const { root, host } = mounted;
  mounted = null;
  act(() => root.unmount());
  host.remove();
});

it("stays hidden where the server has no hand-off (the desktop's own Studio)", async () => {
  serve(null);
  await mount();
  expect(button()).toBeNull();
});

it("stays hidden when the app has no build for this machine (FreeBSD)", async () => {
  serve(Response.json({ available: false, handoff: true, downloadUrl: null }));
  await mount();
  expect(button()).toBeNull();
});

it("with the app installed but no download (FreeBSD), shows only once the app can take the project", async () => {
  serve(Response.json({ available: true, handoff: false, downloadUrl: null }));
  await mount();
  expect(button()).toBeNull();
});

it("opens the project in an installed app that has no download (FreeBSD)", async () => {
  serve(Response.json({ available: true, handoff: true, downloadUrl: null }), {
    opened: true,
    app: "the HyperFrames desktop app",
  });
  await mount();
  await act(async () => button()!.click());
  expect(posts).toBe(1);
});

/** Runs `body` with the poll and slow-download timers under test control. */
async function withFakeTimers(body: () => Promise<void>) {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  try {
    await body();
  } finally {
    vi.useRealTimers();
  }
}

const guide = () => document.querySelector<HTMLElement>('[data-testid="desktop-guide"]');
const stepState = (n: number) =>
  guide()?.querySelector<HTMLElement>(`[data-step="${n}"]`)?.dataset.state ?? null;
const cardButton = (text: string) =>
  [...(guide()?.querySelectorAll("button") ?? [])].find((b) => b.textContent === text) ?? null;
const noApp = { os: "darwin", app_installed: false, download_available: true };
const routeBody = (over: Record<string, unknown> = {}) => ({
  ...noApp,
  available: true,
  handoff: false,
  downloadUrl: DOWNLOAD,
  installed: false,
  ...over,
});

it("reads 'Install the desktop app' beside Framey, and 'Open in desktop app' once the app takes projects", async () => {
  serve(Response.json(routeBody()));
  await mount();
  expect(button()!.textContent).toBe("Install the desktop app");
  expect(button()!.querySelector("svg .hf-framey-eye")).not.toBeNull();
  act(() => mounted!.root.unmount());
  mounted = null;

  serve(Response.json(routeBody({ handoff: true, installed: true, app_installed: true })));
  await mount();
  expect(button()!.textContent).toBe("Open in desktop app");
});

it("without the app, a press opens the guide at step 1 and hands nothing over", async () => {
  serve(Response.json(routeBody()), { opened: true });
  await mount();
  await act(async () => button()!.click());
  expect(guide()).not.toBeNull();
  expect([stepState(1), stepState(2), stepState(3)]).toEqual(["now", "todo", "todo"]);
  expect(cardButton("Open in desktop app")!.disabled).toBe(true);
  expect(posts).toBe(0);
  expect(events("desktop_cta_guide")).toEqual([{ step: "opened", ...noApp }]);
});

it("step 1 opens the tagged download in a new tab, then the button says what is left", async () => {
  const opened: string[] = [];
  const tab = { opener: {} as unknown };
  vi.stubGlobal("open", (url: string) => (opened.push(url), tab));
  serve(Response.json(routeBody()));
  await mount();
  await act(async () => button()!.click());
  await act(async () => cardButton("Download for Mac")!.click());
  expect(opened).toEqual([tagged(DOWNLOAD)]);
  expect(tab.opener).toBeNull();
  expect([stepState(1), stepState(2)]).toEqual(["done", "now"]);
  expect(guide()!.textContent).toContain("Looking for the app…");
  expect(button()!.textContent).toBe("Finish installing2 of 3");
  expect(events("desktop_cta_outcome")).toEqual([{ outcome: "sent_to_download", ...noApp }]);
  expect(events("desktop_cta_guide").map((e) => (e as { step: string }).step)).toEqual([
    "opened",
    "download_opened",
  ]);
});

it("names the download when the browser blocks the new tab, and leaves step 1 to do", async () => {
  vi.stubGlobal("open", () => null);
  serve(Response.json(routeBody()));
  await mount();
  await act(async () => button()!.click());
  await act(async () => cardButton("Download for Mac")!.click());
  expect(showToast).toHaveBeenCalledWith(`Get the HyperFrames desktop app at ${DOWNLOAD}`, "info");
  expect(stepState(1)).toBe("now");
  expect(events("desktop_cta_outcome")).toEqual([
    { outcome: "failed", reason: "download_tab_blocked", ...noApp },
  ]);
});

it("finds the install only from the preview server, asking only while the card is open", () =>
  withFakeTimers(async () => {
    let answer = routeBody();
    let gets = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") return Response.json({ opened: true });
        gets += 1;
        return Response.json(answer);
      }),
    );
    vi.stubGlobal("open", () => ({ opener: null }));
    await mount();
    expect(gets).toBe(1);
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(gets).toBe(1);

    await act(async () => button()!.click());
    await act(async () => cardButton("Download for Mac")!.click());
    await act(async () => vi.advanceTimersByTime(2000));
    const asked = gets;
    expect(asked).toBeGreaterThan(1);
    expect(events("desktop_cta_guide").map((e) => (e as { step: string }).step)).not.toContain(
      "install_detected",
    );

    answer = routeBody({ handoff: true, installed: true });
    await act(async () => vi.advanceTimersByTime(2000));
    expect([stepState(2), stepState(3)]).toEqual(["done", "now"]);
    expect(cardButton("Open in desktop app")!.disabled).toBe(false);
    expect(button()!.textContent).toBe("Open in desktop app");
    expect(guide()!.querySelector('svg[data-mood="found"]')).not.toBeNull();
    const detected = events("desktop_cta_guide").filter(
      (e) => (e as { step: string }).step === "install_detected",
    );
    expect(detected).toEqual([
      { step: "install_detected", os: "darwin", app_installed: true, download_available: true },
    ]);
    const settled = gets;
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(gets).toBe(settled);
  }));

it("records the install once per page, even when the app goes and comes back", () =>
  withFakeTimers(async () => {
    let answer = routeBody();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST")
          return Response.json({ opened: false, reason: "not-installed", downloadUrl: DOWNLOAD });
        return Response.json(answer);
      }),
    );
    await mount();
    await act(async () => button()!.click());
    answer = routeBody({ handoff: true, installed: true });
    await act(async () => vi.advanceTimersByTime(2000));
    expect(stepState(2)).toBe("done");

    // The app is removed: the hand-off finds it gone, and the server stops reporting it.
    answer = routeBody();
    await act(async () => cardButton("Open in desktop app")!.click());
    expect(stepState(2)).toBe("todo");
    // Installed again: the card finds it a second time.
    answer = routeBody({ handoff: true, installed: true });
    await act(async () => vi.advanceTimersByTime(2000));
    expect(stepState(2)).toBe("done");

    const detected = events("desktop_cta_guide").filter(
      (e) => (e as { step: string }).step === "install_detected",
    );
    expect(detected).toHaveLength(1);
  }));

it("stops asking the preview server when the card closes", () =>
  withFakeTimers(async () => {
    let gets = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ((gets += 1), Response.json(routeBody()))),
    );
    await mount();
    await act(async () => button()!.click());
    await act(async () => vi.advanceTimersByTime(4000));
    expect(gets).toBeGreaterThan(2);
    await act(async () => button()!.click());
    expect(guide()).toBeNull();
    const closedAt = gets;
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(gets).toBe(closedAt);
    expect(events("desktop_cta_guide").map((e) => (e as { step: string }).step)).toEqual([
      "opened",
      "closed",
    ]);
  }));

it("opens the project in the app and says so", async () => {
  serve(Response.json({ available: true, handoff: true, downloadUrl: DOWNLOAD }), {
    opened: true,
    app: "the HyperFrames desktop app",
  });
  await mount();
  await act(async () => button()!.click());
  expect(posts).toBe(1);
  expect(postBodies).toEqual([{ cta: resolveTabId() }]);
  expect(guide()).toBeNull();
  expect(showToast).toHaveBeenCalledWith(
    "Opening this project in the HyperFrames desktop app",
    "info",
  );
  expect(button()!.dataset.opening).toBe("true");
});

it("a failed hand-off opens the card at step 3 with the folder to copy and Try again", async () => {
  const opened: string[] = [];
  vi.stubGlobal("open", (url: string) => (opened.push(url), {}));
  copied.length = 0;
  serve(Response.json(routeBody({ handoff: true, installed: true })), {
    opened: false,
    reason: "open-failed",
    downloadUrl: DOWNLOAD,
  });
  await mount();
  await act(async () => button()!.click());
  expect(opened).toEqual([]);
  expect(button()!.textContent).toBe("Couldn't open");
  expect(stepState(3)).toBe("bad");
  expect(guide()!.textContent).toContain("Almost there: the last step needs another try.");
  expect(guide()!.textContent).not.toContain("Everything is ready");
  expect(guide()!.querySelector('[data-testid="desktop-guide-folder"]')!.textContent).toBe(FOLDER);
  await act(async () =>
    guide()!.querySelector<HTMLButtonElement>('[aria-label="Copy folder path"]')!.click(),
  );
  expect(copied).toEqual([FOLDER]);
  await act(async () => cardButton("Try again")!.click());
  expect(posts).toBe(2);
});

it("a hand-off that finds the app gone goes back to the download step", async () => {
  serve(Response.json(routeBody({ handoff: true, installed: true })), {
    opened: false,
    reason: "not-installed",
    downloadUrl: DOWNLOAD,
  });
  await mount();
  await act(async () => button()!.click());
  expect([stepState(1), stepState(3)]).toEqual(["now", "todo"]);
  expect(button()!.textContent).toBe("Install the desktop app");
});

it("where the app is installed but cannot take a project (Linux), step 3 shows the folder to drop in", async () => {
  const linux = { os: "linux", app_installed: true, download_available: true };
  serve(
    Response.json({
      ...linux,
      available: true,
      handoff: false,
      downloadUrl: `${DOWNLOAD}?os=linux`,
      installed: true,
    }),
    { opened: true },
  );
  await mount();
  await act(async () => button()!.click());
  expect([stepState(1), stepState(2), stepState(3)]).toEqual(["done", "done", "now"]);
  expect(guide()!.textContent).toContain("Found HyperFrames on this computer.");
  expect(guide()!.textContent).toContain("Open HyperFrames and drop this folder in:");
  expect(guide()!.querySelector('[data-testid="desktop-guide-folder"]')!.textContent).toBe(FOLDER);
  expect(cardButton("Open in desktop app")).toBeNull();
  expect(posts).toBe(0);
});

it("on Windows, step 1 names the Windows download and opens it tagged", async () => {
  const opened: string[] = [];
  vi.stubGlobal("open", (url: string) => (opened.push(url), { opener: {} }));
  serve(
    Response.json({
      available: true,
      handoff: false,
      downloadUrl: `${DOWNLOAD}?os=windows`,
      os: "win32",
      installed: false,
    }),
  );
  await mount();
  expect(button()).not.toBeNull();
  await act(async () => button()!.click());
  await act(async () => cardButton("Download for Windows")!.click());
  expect(opened).toEqual([tagged(`${DOWNLOAD}?os=windows`)]);
  expect(events("desktop_cta_eligibility")).toEqual([
    { eligibility: "download", os: "win32", app_installed: false, download_available: true },
  ]);
});

it("counts where the button can show, the app here, and platforms with no app", async () => {
  serve(
    Response.json({
      ...MAC,
      available: true,
      handoff: true,
      downloadUrl: DOWNLOAD,
      installed: true,
    }),
  );
  await mount();
  expect(events("desktop_cta_eligibility")).toEqual([{ eligibility: "open_in_app", ...MAC }]);
  act(() => mounted!.root.unmount());
  mounted = null;

  track.mockReset();
  serve(
    Response.json({
      available: false,
      handoff: false,
      downloadUrl: null,
      os: "freebsd",
      installed: false,
    }),
  );
  await mount();
  expect(button()).toBeNull();
  expect(events("desktop_cta_eligibility")).toEqual([
    {
      eligibility: "no_app_for_platform",
      os: "freebsd",
      app_installed: false,
      download_available: false,
    },
  ]);
  expect(events("desktop_cta_impression")).toEqual([]);
});

it("records one impression, only once the button is on screen", async () => {
  serve(
    Response.json({
      ...MAC,
      available: true,
      handoff: true,
      downloadUrl: DOWNLOAD,
      installed: true,
    }),
  );
  await mount();
  expect(events("desktop_cta_impression")).toEqual([]);
  act(() => reveal!());
  expect(events("desktop_cta_impression")).toEqual([{ eligibility: "open_in_app", ...MAC }]);
  expect(reveal).toBeNull();
});

it("records the click and its outcome for each way a hand-off ends", async () => {
  const outcomes = async (post: unknown) => {
    track.mockReset();
    serve(
      Response.json({
        ...MAC,
        available: true,
        handoff: true,
        downloadUrl: DOWNLOAD,
        installed: true,
      }),
      post,
    );
    await mount();
    await act(async () => button()!.click());
    const result = { clicks: events("toolbar_action"), outcomes: events("desktop_cta_outcome") };
    act(() => mounted!.root.unmount());
    mounted = null;
    return result;
  };
  expect(await outcomes({ opened: true })).toEqual({
    clicks: [{ action: "open_in_desktop", ...MAC }],
    outcomes: [{ outcome: "opened", ...MAC }],
  });
  expect(
    (await outcomes({ opened: false, reason: "open-failed", downloadUrl: DOWNLOAD })).outcomes,
  ).toEqual([{ outcome: "failed", reason: "open-failed", ...MAC }]);
  expect(
    (await outcomes({ opened: false, reason: "not-installed", downloadUrl: DOWNLOAD })).outcomes,
  ).toEqual([{ outcome: "failed", reason: "not-installed", ...MAC }]);
});

it("records a press the preview server never answered as failed", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") throw new TypeError("network");
      return Response.json({
        ...MAC,
        available: true,
        handoff: true,
        downloadUrl: DOWNLOAD,
        installed: true,
      });
    }),
  );
  await mount();
  await act(async () => button()!.click());
  expect(events("desktop_cta_outcome")).toEqual([
    { outcome: "failed", reason: "preview_server_unreachable", ...MAC },
  ]);
});

it("records the download press as sent to the download, never as an install", async () => {
  const linux = { os: "linux", app_installed: false, download_available: true };
  vi.stubGlobal("open", () => ({ opener: null }));
  serve(
    Response.json({
      ...linux,
      available: true,
      handoff: false,
      downloadUrl: `${DOWNLOAD}?os=linux`,
      installed: false,
    }),
  );
  await mount();
  await act(async () => button()!.click());
  await act(async () => cardButton("Download for Linux")!.click());
  expect(events("toolbar_action")).toEqual([{ action: "get_desktop_app", ...linux }]);
  expect(events("desktop_cta_outcome")).toEqual([{ outcome: "sent_to_download", ...linux }]);
  const sent = JSON.stringify(track.mock.calls);
  expect(sent).not.toMatch(/"(outcome|step)":"[a-z_]*install/);
  expect(sent).not.toContain("/");
});
