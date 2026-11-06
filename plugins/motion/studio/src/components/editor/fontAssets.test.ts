// @vitest-environment jsdom
import { expect, it } from "vitest";
import { importedFontFaceCssFor, injectPreviewImportedFont } from "../../utils/studioFontHelpers";
import { importedFontFaceCss, type ImportedFontAsset } from "./fontAssets";

const face = (file: string, extra: Partial<ImportedFontAsset> = {}): ImportedFontAsset => ({
  family: "Poppins",
  path: `assets/fonts/Poppins/${file}`,
  url: `/preview/assets/fonts/Poppins/${file}`,
  ...extra,
});

it("a face with no weight or style is written as before", () => {
  expect(importedFontFaceCss(face("Poppins-Bold.ttf"))).toBe(
    '@font-face { font-family: "Poppins"; src: url("/preview/assets/fonts/Poppins/Poppins-Bold.ttf"); font-display: swap; }',
  );
});

it("a face says which weight and style it draws, a variable file its weight range", () => {
  expect(
    importedFontFaceCss(face("Poppins-BoldItalic.ttf", { weight: "700", style: "italic" })),
  ).toBe(
    '@font-face { font-family: "Poppins"; src: url("/preview/assets/fonts/Poppins/Poppins-BoldItalic.ttf"); font-weight: 700; font-style: italic; font-display: swap; }',
  );
  expect(
    importedFontFaceCss(face("Roboto-Variable.ttf", { weight: "100 900", style: "normal" })),
  ).toContain("font-weight: 100 900; font-style: normal;");
  expect(importedFontFaceCss(face("x.ttf", { weight: "700; color: red" }))).not.toContain(
    "font-weight",
  );
});

it("two weights of one family are both drawn in the preview", () => {
  const bold = face("Poppins-Bold.ttf", { weight: "700", style: "normal" });
  const regular = face("Poppins-Regular.ttf", { weight: "400", style: "normal" });
  injectPreviewImportedFont(document, bold);
  injectPreviewImportedFont(document, regular);
  injectPreviewImportedFont(document, bold);
  expect(document.head.querySelectorAll("style")).toHaveLength(2);
});

it("the saved rule points at the font from the file that uses it", () => {
  const bold = face("Poppins-Bold.ttf");
  expect(importedFontFaceCssFor(bold, "index.html")).toContain(
    'url("assets/fonts/Poppins/Poppins-Bold.ttf")',
  );
  expect(importedFontFaceCssFor(bold, "compositions/intro.html")).toContain(
    'url("../assets/fonts/Poppins/Poppins-Bold.ttf")',
  );
});

it("a weight the browser would drop is left out, and a family cannot close the style block", () => {
  for (const weight of ["0", "5000", "bold", "700;}"])
    expect(importedFontFaceCss(face("x.ttf", { weight }))).not.toContain("font-weight");
  expect(importedFontFaceCss(face("x.ttf", { weight: "1000" }))).toContain("font-weight: 1000;");
  expect(importedFontFaceCss({ ...face("x.ttf"), family: "</style><b>x" })).not.toContain(
    "</style>",
  );
});
