import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readCards(): Array<{ id: string; section: string; preview?: string }> {
  const html = readFileSync("overview.html", "utf8");
  const match = html.match(/const CARDS = (\[[\s\S]*?\n\]);/);
  assert.ok(match, "overview.html should include a serialized CARDS array");
  const serializedCards = match[1];
  assert.ok(serializedCards, "overview.html should serialize CARDS as JSON");
  return JSON.parse(serializedCards);
}

test("overview exposes embedded previews and product UI project views", () => {
  const html = readFileSync("overview.html", "utf8");

  assert.match(html, /id="product-ui-projects"/);
  assert.match(html, /const PRODUCT_UI_PROJECTS = /);
  assert.match(html, /\.embedded-preview/);
  assert.match(html, /data-preview-src/);
  assert.match(html, /IntersectionObserver/);
  assert.match(html, /renderProductUiProjects/);
});

test("overview uses top navigation page views instead of masonry-only sections", () => {
  const html = readFileSync("overview.html", "utf8");

  assert.match(html, /class="top-nav"/);
  assert.match(html, /data-catalog-page-link="templates"/);
  assert.match(html, /data-catalog-page="product-ui-projects"/);
  assert.match(html, /function setCatalogPage\(/);
  assert.match(html, /\.catalog-page\.active/);
  assert.doesNotMatch(html, /\.card-grid\s*\{[^}]*[;{]\s*columns\s*:/);
  assert.doesNotMatch(html, /\.blog-grid\s*\{[^}]*[;{]\s*columns\s*:/);
  assert.doesNotMatch(html, /\.ds-grid\s*\{[^}]*[;{]\s*columns\s*:/);
});

test("every design template card has a local embedded preview source", () => {
  const cards = readCards();
  const templates = cards.filter((card) => card.section === "templates");
  const missing = templates.filter((card) => !card.preview).map((card) => card.id);
  const external = templates
    .filter((card) => /^https?:/i.test(card.preview ?? ""))
    .map((card) => `${card.id}:${card.preview}`);

  assert.equal(missing.length, 0, `template cards missing previews: ${missing.join(", ")}`);
  assert.equal(external.length, 0, `template cards should only embed local previews: ${external.join(", ")}`);
});
