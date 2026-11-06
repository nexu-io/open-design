import { googleFontStylesheetUrl } from "../components/editor/fontCatalog";
import { importedFontFaceCss, type ImportedFontAsset } from "../components/editor/fontAssets";
import { toRelativeProjectAssetPath } from "./studioHelpers";

const GENERIC_FONT_FAMILIES = new Set([
  "inherit",
  "initial",
  "revert",
  "revert-layer",
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "ui-rounded",
  "emoji",
  "math",
  "fangsong",
]);

function primaryFontFamilyFromCss(value: string): string {
  const first = value.split(",")[0] ?? "";
  return first.trim().replace(/^["']|["']$/g, "");
}

export function primaryFontFamilyValue(value: string): string {
  return (
    value
      .split(",")[0]
      ?.trim()
      .replace(/^["']|["']$/g, "")
      .trim() ?? ""
  );
}

export function injectPreviewGoogleFont(doc: Document, fontFamilyValue: string): void {
  const family = primaryFontFamilyFromCss(fontFamilyValue);
  if (!family || GENERIC_FONT_FAMILIES.has(family.toLowerCase())) return;

  const id = `studio-preview-google-font-${family.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  if (doc.getElementById(id)) return;

  const link = doc.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = googleFontStylesheetUrl(family);
  doc.head.appendChild(link);
}

export function injectPreviewImportedFont(doc: Document, asset: ImportedFontAsset): void {
  const id = `studio-imported-font-${asset.path.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  if (doc.getElementById(id)) return;
  const style = doc.createElement("style");
  style.id = id;
  style.textContent = importedFontFaceCss(asset);
  doc.head.appendChild(style);
}

export function importedFontFaceCssFor(asset: ImportedFontAsset, sourceFile: string): string {
  return importedFontFaceCss(asset, toRelativeProjectAssetPath(sourceFile, asset.path));
}
