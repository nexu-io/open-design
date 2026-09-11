import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

// The Node base image is pinned to a minor so an image rebuilt from unchanged
// sources keeps the runtime it was validated on (see the rationale in
// deploy/Dockerfile, and #6462 for what a floating tag cost).
//
// A pin is only worth as much as its least-pinned caller. The Dockerfile's ARG
// defaults apply only to callers that pass nothing, and both repository-owned
// publish paths pass their own values — so pinning the Dockerfile alone left
// the paths that actually publish images still floating. These specs assert all
// three agree, so the next caller that hardcodes a base image fails here rather
// than by shipping a Node nobody chose.

const dockerfile = new URL("../../deploy/Dockerfile", import.meta.url);
const dockerWorkflow = new URL("../../.github/workflows/docker-image.yml", import.meta.url);
const publishScript = new URL("../../deploy/scripts/publish-images.sh", import.meta.url);

/** Strip `#` comments so prose about the floating tag is not mistaken for a use of it. */
function withoutComments(content: string): string {
  return content
    .split("\n")
    .map((line) => line.replace(/(^|\s)#.*$/, "$1"))
    .join("\n");
}

async function pinnedNodeTag(): Promise<string> {
  const content = await readFile(dockerfile, "utf8");
  const matches = [...content.matchAll(/^ARG (?:NODE_IMAGE|RUNTIME_IMAGE)=\S+?:(\S+)$/gm)];
  expect(matches, "deploy/Dockerfile should declare both base image ARGs").toHaveLength(2);
  const tags = new Set(matches.map((match) => match[1]!));
  expect([...tags], "both ARGs should pin the same tag").toHaveLength(1);
  return [...tags][0]!;
}

describe("Node base image pin", () => {
  it("pins a concrete minor rather than a floating major tag", async () => {
    const tag = await pinnedNodeTag();
    expect(tag).toMatch(/^\d+\.\d+\.\d+-/);
  });

  it("is not overridden by the repository-owned build and publish paths", async () => {
    const tag = await pinnedNodeTag();

    for (const source of [dockerWorkflow, publishScript]) {
      const content = withoutComments(await readFile(source, "utf8"));
      const refs = [...content.matchAll(/\bnode:(\S+?)-alpine\b/g)].map((match) => match[1]!);
      expect(refs.length, `${source.pathname} should reference the Node base image`).toBeGreaterThan(0);
      for (const ref of refs) {
        expect(`${ref}-alpine`, `${source.pathname} must use the Dockerfile's pinned tag`).toBe(tag);
      }
    }
  });

  it("leaves no floating `node:24-alpine` reference in those paths", async () => {
    // Stated separately from the agreement check above because this is the
    // specific shape the regression took: a caller keeping its own default.
    for (const source of [dockerfile, dockerWorkflow, publishScript]) {
      const content = withoutComments(await readFile(source, "utf8"));
      expect(content, `${source.pathname} should not use a floating major tag`).not.toMatch(
        /\bnode:\d+-alpine\b/,
      );
    }
  });
});
