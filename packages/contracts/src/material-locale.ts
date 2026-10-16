/** Frozen V3 authoring codes; this table does not grant placement capabilities. */
export const materialLocales = [
	"en", "id", "de", "zh-CN", "zh-TW", "pt", "es", "ru", "fa", "ar",
	"ja", "ko", "pl", "hu", "fr", "uk", "tr", "th", "it",
] as const;
export type CanonicalMaterialLocale = (typeof materialLocales)[number];
export type ContentLocaleMode = "canonical-material-v3" | "legacy-manifest";

const normalizeHint = (value: string) => value.trim().replace(/_/g, "-").toLowerCase();

/** Only aliases already defined by V3 authoring; regional base matching is legacy. */
export function normalizeCanonicalMaterialLocale(requested: string): CanonicalMaterialLocale | undefined {
	const normalized = normalizeHint(requested);
	const alias = normalized === "en-us" ? "en" : normalized === "pt-br" ? "pt"
		: normalized === "es-es" ? "es" : undefined;
	return alias ?? materialLocales.find((locale) => locale.toLowerCase() === normalized);
}

/** Select one whole translation, returning its declared spelling or no resource. */
export function selectDeclaredContentLocale(
	declared: readonly string[],
	requested: string,
	mode: ContentLocaleMode,
): string | undefined {
	const findDeclared = (candidate: string | undefined) => candidate === undefined
		? undefined
		: declared.find((locale) => locale.toLowerCase() === candidate.toLowerCase());
	if (mode === "canonical-material-v3") {
		return findDeclared(normalizeCanonicalMaterialLocale(requested)) ?? findDeclared("en");
	}
	const normalized = normalizeHint(requested);
	if (!normalized) return undefined;
	const baseLanguage = normalized.split("-")[0];
	const alias = normalized === "pt" || normalized === "pt-pt" ? "pt-BR"
		: normalized === "es" ? "es-ES"
		: /^zh-(hk|hant)(-|$)/.test(normalized) ? "zh-TW"
		: undefined;
	for (const candidate of [normalized, baseLanguage, alias, "en-US", "en"]) {
		const match = findDeclared(candidate);
		if (match !== undefined) return match;
	}
	return undefined;
}
