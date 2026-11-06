// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { patchElementInHtml } from "@hyperframes/studio-server/source-mutation";
import { describe, expect, it } from "vitest";
import { buildDomEditStylePatchOperation } from "./domEditing";

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../tests/e2e/fixtures/composition-reliability",
);

function fixture(path: string): string {
  return readFileSync(join(fixtureDir, path), "utf8");
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function inTemplate(document: Document, selector: string): Element | null {
  for (const template of Array.from(document.querySelectorAll("template"))) {
    const match = template.content.querySelector(selector);
    if (match) return match;
  }
  return null;
}

describe("composition reliability acceptance fixture", () => {
  const indexSource = fixture("index.html");
  const titleSource = fixture("compositions/title-card.html");
  const nestedSource = fixture("compositions/nested-shell.html");

  it("owns repeated root hosts, a nested host, transparent headline topology, and collisions", () => {
    const index = parse(indexSource);
    const repeated = Array.from(
      index.querySelectorAll('[data-composition-src="compositions/title-card.html"]'),
    );
    expect(repeated).toHaveLength(2);
    expect(repeated.map((host) => host.getAttribute("data-start"))).toEqual(["0", "4"]);
    expect(
      index.querySelector('[data-composition-src="compositions/nested-shell.html"]'),
    ).toBeTruthy();

    const nested = parse(nestedSource);
    const nestedHost = inTemplate(nested, '[data-composition-src="title-card.html"]');
    expect(nestedHost).toBeTruthy();
    const nestedDependency = nestedHost?.getAttribute("data-composition-src");
    expect(
      nestedDependency ? existsSync(resolve(fixtureDir, "compositions", nestedDependency)) : false,
    ).toBe(true);

    const title = parse(titleSource);
    const mask = inTemplate(title, ".hl-mask");
    const headline = inTemplate(title, ".hl-mask > .hl-text");
    expect(mask?.textContent).toContain("Reliable compositions");
    expect(inTemplate(title, "style")?.textContent).toMatch(
      /\.hl-mask\s*\{[^}]*overflow:\s*hidden;[^}]*background:\s*transparent;/,
    );
    expect(headline?.tagName).toBe("H1");

    const collisionA = index.querySelector('[data-hf-id="collision-a"]')!;
    const collisionB = index.querySelector('[data-hf-id="collision-b"]')!;
    const layered = index.querySelector('[data-hf-id="layer-overlap"]')!;
    expect(collisionA.getAttribute("data-track-index")).toBe(
      collisionB.getAttribute("data-track-index"),
    );
    expect(
      Number(collisionA.getAttribute("data-start")) +
        Number(collisionA.getAttribute("data-duration")),
    ).toBe(Number(collisionB.getAttribute("data-start")));
    expect(layered.getAttribute("data-start")).toBe(collisionB.getAttribute("data-start"));
    expect(layered.getAttribute("data-track-index")).not.toBe(
      collisionB.getAttribute("data-track-index"),
    );
  });

  it("keeps timeline host edits in the root source and headline color in the template source", () => {
    const moved = patchElementInHtml(indexSource, { hfId: "title-host-a" }, [
      { type: "attribute", property: "start", value: "5" },
      { type: "attribute", property: "duration", value: "2" },
    ]);
    expect(moved.matched).toBe(true);
    expect(moved.html).toContain('data-hf-id="title-host-a"');
    expect(moved.html).toContain('data-start="5"');
    expect(moved.html).toContain('data-duration="2"');
    expect(moved.html).not.toContain('data-hf-id="title-text"');
    expect(titleSource).not.toContain("#12b886");

    const recolored = patchElementInHtml(titleSource, { hfId: "title-text" }, [
      buildDomEditStylePatchOperation("color", "#12b886"),
    ]);
    expect(recolored.matched).toBe(true);
    const recoloredDocument = parse(recolored.html);
    expect(
      inTemplate(recoloredDocument, '[data-hf-id="title-text"]')?.getAttribute("style"),
    ).toContain("color: #12b886");
    expect(
      inTemplate(recoloredDocument, '[data-hf-id="title-mask"]')?.getAttribute("style"),
    ).toBeNull();
    expect(recolored.html).not.toContain('data-hf-id="title-host-a"');
    expect(indexSource).not.toContain("#12b886");
  });
});
