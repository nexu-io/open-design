import { readFileSync } from "node:fs";
import path from "node:path";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const repoRoot = process.cwd();
const catalogPath = path.join(repoRoot, "design-templates", "product-ui-projects", "references", "catalog.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as unknown;
const errors: string[] = [];

if (!isRecord(catalog)) {
  errors.push("catalog must be an object");
} else if (!Array.isArray(catalog.entries)) {
  errors.push("catalog.entries must be an array");
} else {
  for (const entry of catalog.entries) {
    if (!isRecord(entry)) continue;
    const id = asString(entry.id) || "<missing id>";
    const surfaces = asArray(entry.surfaces);
    const capture = isRecord(entry.capture) ? entry.capture : {};
    const depth = asString(capture.captureDepth);
    const sourceLinks = asArray(capture.sourceLinks).map(asString).filter(Boolean);

    if (!["single-page-lead", "surface-suite", "flow-suite", "full-product-reference"].includes(depth)) {
      errors.push(`${id}: capture.captureDepth must be single-page-lead, surface-suite, flow-suite, or full-product-reference`);
    }

    if (depth !== "single-page-lead" && surfaces.length < 3) {
      errors.push(`${id}: ${depth} requires at least 3 concrete surfaces`);
    }

    if (["surface-suite", "flow-suite", "full-product-reference"].includes(depth) && sourceLinks.length < 3) {
      errors.push(`${id}: ${depth} requires at least 3 sourceLinks`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Product UI project catalog is valid.");
