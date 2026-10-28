import { describe, expect, it } from "vitest";
import { materialLocales, normalizeCanonicalMaterialLocale, selectDeclaredContentLocale, type ContentLocaleMode } from "../src/index.js";

// Shared material-locale-golden.json vectors, copied locally so tests need no sibling repo.
const golden: Array<{ name: string; declared: string[]; requested: string; mode: ContentLocaleMode; selected: string | null }> = [
	{"name": "canonical-material-v3-en-fallback", "declared": ["en"], "requested": "fr", "mode": "canonical-material-v3", "selected": "en"},
	{"name": "canonical-material-v3-actual-case", "declared": ["EN"], "requested": "fr", "mode": "canonical-material-v3", "selected": "EN"},
	{"name": "canonical-material-v3-no-english", "declared": ["ko"], "requested": "fr", "mode": "canonical-material-v3", "selected": null},
	{"name": "canonical-material-v3-exact-zh", "declared": ["en", "zh-CN", "zh-TW"], "requested": "zh-TW", "mode": "canonical-material-v3", "selected": "zh-TW"},
	{"name": "canonical-material-v3-no-zh-cross", "declared": ["en", "zh-CN"], "requested": "zh-TW", "mode": "canonical-material-v3", "selected": "en"},
	{"name": "canonical-material-v3-empty", "declared": [], "requested": "en", "mode": "canonical-material-v3", "selected": null},
	{"name": "legacy-manifest-en-fallback", "declared": ["en"], "requested": "fr", "mode": "legacy-manifest", "selected": "en"},
	{"name": "legacy-manifest-actual-case", "declared": ["EN"], "requested": "fr", "mode": "legacy-manifest", "selected": "EN"},
	{"name": "legacy-manifest-no-english", "declared": ["ko"], "requested": "fr", "mode": "legacy-manifest", "selected": null},
	{"name": "legacy-manifest-exact-zh", "declared": ["en", "zh-CN", "zh-TW"], "requested": "zh-TW", "mode": "legacy-manifest", "selected": "zh-TW"},
	{"name": "legacy-manifest-no-zh-cross", "declared": ["en", "zh-CN"], "requested": "zh-TW", "mode": "legacy-manifest", "selected": "en"},
	{"name": "legacy-manifest-empty", "declared": [], "requested": "en", "mode": "legacy-manifest", "selected": null},
	{"name": "canonical-ko-regional", "declared": ["en", "ko"], "requested": "ko-KR", "mode": "canonical-material-v3", "selected": "en"},
	{"name": "legacy-ko-regional", "declared": ["en", "ko"], "requested": "ko-KR", "mode": "legacy-manifest", "selected": "ko"},
	{"name": "canonical-en-US", "declared": ["en", "de"], "requested": "en-US", "mode": "canonical-material-v3", "selected": "en"},
	{"name": "canonical-pt-BR", "declared": ["en", "pt"], "requested": "pt-BR", "mode": "canonical-material-v3", "selected": "pt"},
	{"name": "canonical-es-ES", "declared": ["en", "es"], "requested": "es-ES", "mode": "canonical-material-v3", "selected": "es"},
	{"name": "legacy-en-US", "declared": ["en-US", "de"], "requested": "fr", "mode": "legacy-manifest", "selected": "en-US"},
	{"name": "legacy-english-preference", "declared": ["en", "en-US"], "requested": "fr", "mode": "legacy-manifest", "selected": "en-US"},
	{"name": "legacy-pt", "declared": ["en-US", "pt-BR"], "requested": "pt", "mode": "legacy-manifest", "selected": "pt-BR"},
	{"name": "legacy-zh-HK", "declared": ["en-US", "zh-TW"], "requested": "zh-HK", "mode": "legacy-manifest", "selected": "zh-TW"},
];

describe("declared content locale contract", () => {
	it.each(golden)("$name", ({ declared, requested, mode, selected }) => {
		expect(selectDeclaredContentLocale(declared, requested, mode) ?? null).toBe(selected);
	});

	it("keeps the frozen authoring table and only its approved regional aliases", () => {
		expect(materialLocales).toEqual(["en", "id", "de", "zh-CN", "zh-TW", "pt", "es", "ru", "fa", "ar", "ja", "ko", "pl", "hu", "fr", "uk", "tr", "th", "it"]);
		for (const requested of ["ko-KR", "pt-PT", "zh-HK", "zh-Hant-TW", "en-GB", "constructor", ""]) {
			expect(normalizeCanonicalMaterialLocale(requested)).toBeUndefined();
			expect(selectDeclaredContentLocale(["en", "ko", "pt", "zh-TW"], requested, "canonical-material-v3")).toBe("en");
		}
		expect(selectDeclaredContentLocale(["en-US"], "fr", "canonical-material-v3")).toBeUndefined();
	});

	it.each([
		[" PT_br ", ["en", "PT"], "canonical-material-v3", "PT"],
		["KO_kr", ["en-US", "KO"], "legacy-manifest", "KO"],
		["zh-Hant-TW", ["en-US", "zh", "zh-TW", "zh-Hant-TW"], "legacy-manifest", "zh-Hant-TW"],
		["zh-Hant-TW", ["en-US", "zh", "zh-TW"], "legacy-manifest", "zh"],
		["pt-PT", ["en-US", "pt-BR"], "legacy-manifest", "pt-BR"],
		["es", ["en-US", "es-ES"], "legacy-manifest", "es-ES"],
		["fr", ["EN-us", "en"], "legacy-manifest", "EN-us"],
		["en", ["en-US", "en"], "legacy-manifest", "en"],
		["@@@", ["en-US"], "legacy-manifest", "en-US"],
		[" ", ["en-US"], "legacy-manifest", undefined],
	] as const)("selects %s with actual spelling", (requested, declared, mode, selected) => {
		expect(selectDeclaredContentLocale(declared, requested, mode)).toBe(selected);
	});
});
