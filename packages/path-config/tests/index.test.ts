import { describe, expect, it } from "vitest";

import { createPathConfig, normalizeBasePath, rewriteKnownInternalBrowserPaths } from "../src/index.js";

describe("normalizeBasePath", () => {
  it.each([
    [undefined, ""],
    ["", ""],
    ["open-design", "/open-design"],
    ["/open-design/", "/open-design"],
    ["/team/design", "/team/design"],
    ["/settings", "/settings"],
  ])("normalizes %j", (input, expected) => {
    expect(normalizeBasePath(input)).toBe(expected);
  });

  it.each(["/", "https://example.com/open-design", "//open-design", "/a//b", "/a/../b", "/a/%2e%2e/b", "/a\\b", "/a?x=1", "/a#section", "/a/%2Fb", "/a/%ZZ"]) (
    "rejects unsafe value %j",
    (input) => {
      expect(() => normalizeBasePath(input)).toThrow();
    },
  );

  it.each([
    "/api",
    "/api/v2",
    "/API",
    "/_next",
    "/_next/static",
    "/artifacts",
    "/artifacts/shared",
    "/frames",
    "/frames/shared",
  ])("rejects reserved browser namespace %j", (input) => {
    expect(() => normalizeBasePath(input)).toThrow(/reserved browser namespace/);
  });
});

describe("createPathConfig", () => {
  it("adds and strips a fixed prefix without crossing path boundaries", () => {
    const paths = createPathConfig("/open-design");

    expect(paths.withBasePath("/")).toBe("/open-design/");
    expect(paths.withBasePath("/api/projects?x=1")).toBe("/open-design/api/projects?x=1");
    expect(paths.withBasePath("/open-design/api/projects")).toBe("/open-design/open-design/api/projects");
    expect(paths.ensureBasePath("/open-design/api/projects")).toBe("/open-design/api/projects");
    expect(paths.ensureBasePath("/api/projects?x=1")).toBe("/open-design/api/projects?x=1");
    expect(paths.stripBasePath("/open-design")).toBe("/");
    expect(paths.stripBasePath("/open-design/projects/1")).toBe("/projects/1");
    expect(paths.stripBasePath("/open-designx/projects/1")).toBeNull();
    expect(paths.hasBasePath("/open-design/projects")).toBe(true);
    expect(paths.hasBasePath("/open-designx/projects")).toBe(false);
  });

  it("builds API and public asset paths", () => {
    const paths = createPathConfig("/od");

    expect(paths.api()).toBe("/od/api");
    expect(paths.api("/projects")).toBe("/od/api/projects");
    expect(paths.asset("/artifacts/run/file.html")).toBe("/od/artifacts/run/file.html");
    expect(paths.publicPath("/app-icon.svg")).toBe("/od/app-icon.svg");
  });

  it("keeps root deployment paths unchanged", () => {
    const paths = createPathConfig();

    expect(paths.withBasePath("/api/projects")).toBe("/api/projects");
    expect(paths.ensureBasePath("/api/projects")).toBe("/api/projects");
    expect(paths.api("/projects")).toBe("/api/projects");
    expect(paths.stripBasePath("/anything")).toBe("/anything");
    expect(paths.hasBasePath("/anything")).toBe(true);
  });

  it("prefixes an internal UI path that collides with the configured prefix", () => {
    const paths = createPathConfig("/settings");

    expect(paths.withBasePath("/settings")).toBe("/settings/settings");
    expect(paths.ensureBasePath("/settings")).toBe("/settings");
  });
});

describe("rewriteKnownInternalBrowserPaths", () => {
  it("prefixes daemon/static URL namespaces without changing arbitrary document URLs", () => {
    const html = '<img src="/api/a.png"><link href="/frames/a.html"><div style="background:url(/artifacts/a.png)"><img srcset="/api/a 1x, /other 2x">';

    expect(rewriteKnownInternalBrowserPaths(html, "/open-design")).toBe(
      '<img src="/open-design/api/a.png"><link href="/open-design/frames/a.html"><div style="background:url(/open-design/artifacts/a.png)"><img srcset="/open-design/api/a 1x, /other 2x">',
    );
  });

  it("does not double-prefix an already public URL", () => {
    expect(rewriteKnownInternalBrowserPaths('<img src="/open-design/api/a.png">', "/open-design")).toBe(
      '<img src="/open-design/api/a.png">',
    );
  });

  it("does not rewrite executable script contents", () => {
    const html = '<script>const data = "/api/keep-root";</script><img src="/api/prefix-me">';

    expect(rewriteKnownInternalBrowserPaths(html, "/open-design")).toBe(
      '<script>const data = "/api/keep-root";</script><img src="/open-design/api/prefix-me">',
    );
  });
});
