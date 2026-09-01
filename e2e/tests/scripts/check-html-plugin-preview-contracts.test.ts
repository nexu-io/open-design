import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import {
  checkHtmlPluginPreviewContracts,
  validateHtmlPluginPreviewContract,
} from "../../../scripts/check-html-plugin-preview-contracts.ts";

const REFERENCE_HTML = "<!doctype html>\n<html>\n  <body>Report</body>\n</html>\n";

function validManifest(): unknown {
  return {
    od: {
      scenario: "documents",
      preview: { type: "html", entry: "./example.html", motion: "scroll" },
      useCase: { exampleOutputs: [{ path: "./example.html", title: "Report" }] },
      context: { assets: ["./template.json", "./example.html", "./example.webp"] },
    },
  };
}

function htmlTemplate(): unknown {
  return { format: "html", surface: "document", referenceHtml: REFERENCE_HTML };
}

test("accepts a document whose canonical preview is materialized from referenceHtml", () => {
  assert.deepEqual(validateHtmlPluginPreviewContract({
    pluginId: "document-report",
    manifest: validManifest(),
    template: htmlTemplate(),
    exampleHtml: REFERENCE_HTML,
  }), []);
});

test("ignores a template whose actual output is not HTML", () => {
  assert.deepEqual(validateHtmlPluginPreviewContract({
    pluginId: "image-poster",
    manifest: { od: { preview: { type: "image", poster: "./example.webp" } } },
    template: { format: "png", surface: "image" },
    exampleHtml: undefined,
  }), []);
});

test("rejects the image-placeholder shape that makes an HTML document bake as a 404 skip", () => {
  const violations = validateHtmlPluginPreviewContract({
    pluginId: "document-report",
    manifest: {
      od: {
        scenario: "documents",
        preview: { type: "image", poster: "./example.webp" },
        useCase: { exampleOutputs: [{ path: "./example.webp" }] },
        context: { assets: ["./template.json", "./example.webp"] },
      },
    },
    template: htmlTemplate(),
    exampleHtml: undefined,
  });

  assert.equal(violations.length, 5);
  assert.ok(violations.some((violation) => /preview must use type "html"/.test(violation)));
  assert.ok(violations.some((violation) => /motion "scroll"/.test(violation)));
  assert.ok(violations.some((violation) => /exampleOutputs must include/.test(violation)));
  assert.ok(violations.some((violation) => /context\.assets must include/.test(violation)));
  assert.ok(violations.some((violation) => /must ship a non-empty canonical preview/.test(violation)));
});

test("rejects example.html content that drifts from referenceHtml", () => {
  const violations = validateHtmlPluginPreviewContract({
    pluginId: "document-report",
    manifest: validManifest(),
    template: htmlTemplate(),
    exampleHtml: "<!doctype html><html><body>Different report</body></html>",
  });
  assert.deepEqual(violations, [
    "plugins/_official/examples/document-report/example.html: content has drifted from template.json referenceHtml",
  ]);
});

test("allows line-ending and trailing-whitespace normalization without treating the preview as drifted", () => {
  const exampleWithFormattingNoise = REFERENCE_HTML
    .replace(/\n/g, "\r\n")
    .replace("<body>Report</body>", "<body>Report</body>   ");
  assert.deepEqual(validateHtmlPluginPreviewContract({
    pluginId: "document-report",
    manifest: validManifest(),
    template: htmlTemplate(),
    exampleHtml: exampleWithFormattingNoise,
  }), []);
});

test("fails closed when a template path exists but cannot be read as a file", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "open-design-html-preview-contract-"));
  const templatePath = path.join(
    repoRoot,
    "plugins/_official/examples/document-report/template.json",
  );
  try {
    await mkdir(templatePath, { recursive: true });
    assert.equal(await checkHtmlPluginPreviewContracts(repoRoot), false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
