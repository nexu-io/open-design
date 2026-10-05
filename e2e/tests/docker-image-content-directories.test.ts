import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

// The daemon resolves several content directories relative to the project root
// at runtime. Anything it reads that way has to be COPYed into the image, in
// both the build stage and the runtime stage, or the deployment loses that
// content with no error — the daemon simply finds nothing and carries on.
//
// `data/plugin-previews/manifest.json` is the case that motivated this test: it
// is committed by the bake pipeline and is what `resolvePluginPreviewsDir()`
// looks for. Without it, `loadManifest()` returns `{}` and every plugin falls
// back to the live-iframe preview path, which is exactly the GPU cost the bakes
// exist to avoid.

const dockerfile = new URL("../../deploy/Dockerfile", import.meta.url);

function stageSections(content: string): { build: string; runtime: string } {
  // The runtime stage is the last `FROM`; everything before it is the build.
  const lastFrom = content.lastIndexOf("\nFROM ");
  expect(lastFrom).toBeGreaterThan(0);
  return { build: content.slice(0, lastFrom), runtime: content.slice(lastFrom) };
}

describe("deploy/Dockerfile content directories", () => {
  it("copies the self-contained postinstall consumer", async () => {
    const content = await readFile(dockerfile, "utf8");
    const { build } = stageSections(content);

    expect(build).toMatch(/^COPY scripts\/postinstall\.mjs \.\/scripts\/$/m);
  });

  it("copies every runtime-resolved content directory into both stages", async () => {
    const content = await readFile(dockerfile, "utf8");
    const { build, runtime } = stageSections(content);

    // `assets` is copied wholesale in build but selectively in runtime, so it is
    // matched loosely; the rest are whole-directory copies in both stages.
    for (const dir of ["skills", "design-systems", "craft", "prompt-templates", "data"]) {
      expect(build, `build stage should COPY ${dir}`).toMatch(
        new RegExp(`^COPY ${dir} \\./${dir}$`, "m"),
      );
      expect(runtime, `runtime stage should COPY ${dir}`).toMatch(
        new RegExp(`^COPY --from=build [^\\n]*/app/${dir} \\./${dir}$`, "m"),
      );
    }
  });

  it("ships the checked-in plugin preview manifest", async () => {
    // Narrower than the directory check above and stated separately: this is the
    // file whose absence is silent, so it is worth failing on its own terms
    // rather than only as part of a directory list.
    const content = await readFile(dockerfile, "utf8");
    const { build, runtime } = stageSections(content);

    expect(build).toMatch(/^COPY data \.\/data$/m);
    expect(runtime).toMatch(/^COPY --from=build [^\n]*\/app\/data \.\/data$/m);
  });
});

// `next build` type-checks apps/web in a worker that outgrows V8's default heap
// ceiling, which is at most 2 GB on hosts with less than 15 GiB of RAM. CI's
// 16 GB runners get 4 GB and never fail; an 8 GiB Docker Desktop VM does. The
// build stage raises the ceiling the way tools/pack does (#8212).
describe("deploy/Dockerfile web build heap", () => {
  it("raises the V8 heap ceiling for the web build without dropping inherited NODE_OPTIONS", async () => {
    const content = await readFile(dockerfile, "utf8");
    const { build } = stageSections(content);

    // Ours first, so an inherited --max-old-space-size still wins (Node keeps the last one).
    expect(build).toMatch(
      /^\s*NODE_OPTIONS="--max-old-space-size=4096 \$\{NODE_OPTIONS:-\}" pnpm --filter @open-design\/web build(?=\s)/m,
    );
  });
});
