import { useI18n } from "../../i18n/I18n";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  googleFontStylesheetUrl,
  POPULAR_GOOGLE_FONT_FAMILIES,
  renderAliasFor,
} from "./fontCatalog";
import { fontFamilyFromAssetPath, importedFontFaceCss, type ImportedFontAsset } from "./fontAssets";
import {
  DEFAULT_FONT_FAMILIES,
  FIELD,
  GENERIC_FONT_FAMILIES,
  LABEL,
  localFontSortScore,
  sanitizeFontFilePart,
  sortFontOptions,
  uniqueFontFamilies,
  uniqueFontOptions,
  type FontOption,
  type LocalFontData,
} from "./propertyPanelHelpers";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import { runWhenInputIdle } from "./overlayFrameLoop";
import { studioApiFetch } from "../../utils/studioApiFetch";

/* ------------------------------------------------------------------ */
/*  Font helper functions                                              */
/* ------------------------------------------------------------------ */

function splitFontFamilies(value: string): string[] {
  const families: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (const char of value) {
    if ((char === '"' || char === "'") && !quote) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = null;
      continue;
    }
    if (char === "," && !quote) {
      if (current.trim()) families.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) families.push(current.trim());
  return families.map((f) => f.replace(/^["']|["']$/g, "").trim()).filter(Boolean);
}

function primaryFontFamily(value: string): string {
  return splitFontFamilies(value)[0] ?? "inherit";
}

function quoteFontFamily(family: string): string {
  const trimmed = family.trim();
  if (GENERIC_FONT_FAMILIES.has(trimmed.toLowerCase())) return trimmed;
  return `"${trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function buildFontFamilyValue(family: string): string {
  const trimmed = family.trim();
  if (!trimmed) return "inherit";
  if (GENERIC_FONT_FAMILIES.has(trimmed.toLowerCase())) return trimmed;
  return `${quoteFontFamily(trimmed)}, ui-sans-serif, system-ui, sans-serif`;
}

function collectDocumentFontFamilies(): string[] {
  if (typeof document === "undefined") return [];
  const fontSet = document.fonts;
  if (!fontSet) return [];
  return Array.from(fontSet, (ff) => ff.family.replace(/^["']|["']$/g, "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function fontSearchKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function fontMatchesQuery(family: string, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  if (family.toLowerCase().includes(normalizedQuery)) return true;
  return fontSearchKey(family).includes(fontSearchKey(normalizedQuery));
}

function loadGoogleFontStylesheet(family: string): void {
  if (typeof document === "undefined") return;
  const trimmed = family.trim();
  if (!trimmed) return;
  const id = `studio-google-font-${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  if (document.getElementById(id)) return;
  const preconnect = document.querySelector('link[data-studio-google-font-preconnect="true"]');
  if (!preconnect) {
    const el = document.createElement("link");
    el.setAttribute("data-studio-google-font-preconnect", "true");
    el.rel = "preconnect";
    el.href = "https://fonts.gstatic.com";
    el.crossOrigin = "anonymous";
    document.head.appendChild(el);
  }
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = googleFontStylesheetUrl(trimmed);
  document.head.appendChild(link);
}

function loadImportedFontStylesheet(asset: ImportedFontAsset): void {
  if (typeof document === "undefined") return;
  const id = `studio-imported-font-${asset.family.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = importedFontFaceCss(asset);
  document.head.appendChild(style);
}

type FontLists = {
  loaded: boolean;
  google: readonly string[];
  googleKeys: ReadonlySet<string>;
  installed: string[];
};

let fontLists: FontLists = {
  loaded: false,
  google: POPULAR_GOOGLE_FONT_FAMILIES,
  googleKeys: new Set(POPULAR_GOOGLE_FONT_FAMILIES.map((f) => f.toLowerCase())),
  installed: [],
};
let fontListsRequest: Promise<void> | null = null;
const fontListListeners = new Set<() => void>();

async function fetchFontList(url: string): Promise<string[]> {
  const data = (await (await studioApiFetch(url)).json()) as { fonts?: unknown };
  if (!Array.isArray(data.fonts)) throw new Error(`${url} returned no font list`);
  return data.fonts as string[];
}

function loadFontLists(): void {
  if (fontLists.loaded) return;
  fontListsRequest ??= Promise.all([
    fetchFontList("/api/fonts"),
    fetchFontList("/api/fonts/google"),
  ])
    .then(([installed, google]) => {
      const names = google.concat(POPULAR_GOOGLE_FONT_FAMILIES);
      const families: string[] = [];
      const googleKeys = new Set<string>();
      let next = 0;
      runWhenInputIdle((timeLeft) => {
        while (next < names.length && timeLeft() > 0) {
          const batch = names.slice(next, next + 200);
          next += batch.length;
          families.push(...uniqueFontFamilies(batch, googleKeys));
        }
        if (next < names.length) return false;
        fontLists = { loaded: true, google: families, googleKeys, installed };
        for (const listener of fontListListeners) listener();
        return true;
      });
    })
    .catch(() => {
      fontListsRequest = null;
    });
}

function subscribeFontLists(listener: () => void): () => void {
  fontListListeners.add(listener);
  loadFontLists();
  return () => fontListListeners.delete(listener);
}

/* ------------------------------------------------------------------ */
/*  FontFamilyField                                                    */
/* ------------------------------------------------------------------ */

export function FontFamilyField({
  value,
  disabled,
  flat,
  importedFonts,
  onImportFonts,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  flat?: boolean;
  importedFonts: ImportedFontAsset[];
  onImportFonts?: (files: FileList | File[]) => Promise<ImportedFontAsset[]>;
  onCommit: (nextValue: string) => void;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  const currentFamily = primaryFontFamily(value);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fontInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [localFonts, setLocalFonts] = useState<string[]>([]);
  const [localFontData, setLocalFontData] = useState<LocalFontData[]>([]);
  const lists = useSyncExternalStore(subscribeFontLists, () => fontLists);
  const [loadingLocalFonts, setLoadingLocalFonts] = useState(false);
  const [importingFonts, setImportingFonts] = useState(false);
  const [fontNotice, setFontNotice] = useState<string | null>(null);
  const canQueryLocalFonts =
    typeof window !== "undefined" && typeof window.queryLocalFonts === "function";
  const commitFontFamily = (nextValue: string) => {
    if (nextValue !== value) track("select", "Font family");
    onCommit(nextValue);
  };

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!containerRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (open) loadFontLists();
  }, [open]);

  useEffect(() => {
    if (lists.googleKeys.has(currentFamily.toLowerCase())) {
      loadGoogleFontStylesheet(currentFamily);
    }
    const imported = importedFonts.find(
      (f) => f.family.toLowerCase() === currentFamily.toLowerCase(),
    );
    if (imported) loadImportedFontStylesheet(imported);
  }, [currentFamily, lists, importedFonts]);

  const loadBrowserLocalFonts = async () => {
    if (!canQueryLocalFonts || !window.queryLocalFonts) {
      setFontNotice("This browser does not expose installed fonts. Import a font file instead.");
      return;
    }
    setLoadingLocalFonts(true);
    setFontNotice(null);
    try {
      const fonts = await window.queryLocalFonts();
      const sorted = [...fonts].sort((a, b) => localFontSortScore(a) - localFontSortScore(b));
      const families = sorted
        .map((f) => f.family)
        .filter((name): name is string => Boolean(name))
        .map((name) => fontFamilyFromAssetPath(`${name}.ttf`));
      setLocalFontData(sorted);
      setLocalFonts((cur) => uniqueFontFamilies([...cur, ...families]));
      setFontNotice(fonts.length === 0 ? "No browser-local fonts were returned." : null);
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      setFontNotice(
        name === "NotAllowedError"
          ? "Local font access was denied. Import a font file instead."
          : "Local font access is unavailable. Import a font file instead.",
      );
    } finally {
      setLoadingLocalFonts(false);
    }
  };

  const handleImportFonts = async (files: FileList | File[] | null) => {
    if (!files?.length || !onImportFonts) return;
    setImportingFonts(true);
    setFontNotice(null);
    try {
      const imported = await onImportFonts(files);
      for (const font of imported) loadImportedFontStylesheet(font);
      const first = imported[0];
      if (first) {
        commitFontFamily(buildFontFamilyValue(first.family));
        setQuery("");
        setOpen(false);
      } else {
        setFontNotice("No supported font files were imported.");
      }
    } catch {
      setFontNotice("Font import failed. The files were not added. Try again.");
    } finally {
      setImportingFonts(false);
    }
  };

  const projectFontAssets = useMemo(
    () =>
      uniqueFontOptions(
        importedFonts.map((f): FontOption => ({ family: f.family, source: "Imported" })),
      ),
    [importedFonts],
  );

  const options = useMemo(() => {
    if (!open) return [];
    const documentFonts = collectDocumentFontFamilies();
    return sortFontOptions(
      uniqueFontOptions([
        { family: currentFamily, source: "Current" },
        ...documentFonts.map((f): FontOption => ({ family: f, source: "Document" })),
        ...projectFontAssets,
        ...lists.google.map((f): FontOption => ({ family: f, source: "Google" })),
        ...[...lists.installed, ...localFonts].map(
          (f): FontOption => ({ family: f, source: "Local" }),
        ),
        ...DEFAULT_FONT_FAMILIES.map((f): FontOption => ({ family: f, source: "System" })),
      ]),
    );
  }, [open, currentFamily, lists, localFonts, projectFontAssets]);

  const filteredOptions = useMemo(() => {
    const matches = options.filter((o) => fontMatchesQuery(o.family, query));
    if (query.trim()) return matches.slice(0, 200);
    const bySource = new Map<string, FontOption[]>();
    for (const m of matches) {
      const list = bySource.get(m.source) ?? [];
      list.push(m);
      bySource.set(m.source, list);
    }
    const result: FontOption[] = [];
    for (const s of ["Current", "Document", "Imported"]) result.push(...(bySource.get(s) ?? []));
    result.push(...(bySource.get("Google") ?? []).slice(0, 100));
    result.push(...(bySource.get("Local") ?? []).slice(0, 80));
    result.push(...(bySource.get("System") ?? []));
    return result;
  }, [options, query]);

  const importLocalFont = async (family: string): Promise<ImportedFontAsset | null> => {
    if (!onImportFonts) return null;
    const candidates = localFontData
      .filter((f) => fontFamilyFromAssetPath(`${f.family}.ttf`) === family)
      .sort((a, b) => localFontSortScore(a) - localFontSortScore(b));
    const font = candidates.find((entry) => typeof entry.blob === "function");
    if (!font?.blob) return null;
    const blob = await font.blob();
    const style = sanitizeFontFilePart(font.style ?? "Regular") || "Regular";
    const name = sanitizeFontFilePart(`${family} ${style}`) || family;
    const file = new File([blob], `${name}.ttf`, { type: blob.type || "font/ttf" });
    const imported = await onImportFonts([file]);
    return (
      imported.find((a) => a.family.toLowerCase() === family.toLowerCase()) ?? imported[0] ?? null
    );
  };

  const importSystemFont = async (family: string): Promise<ImportedFontAsset | null> => {
    if (!onImportFonts) return null;
    const response = await studioApiFetch(`/api/fonts/file?family=${encodeURIComponent(family)}`);
    if (!response.ok) return null;
    const blob = await response.blob();
    const ext = response.headers.get("Content-Disposition")?.match(/\.(\w+)"?$/)?.[1] ?? "ttf";
    const file = new File([blob], `${family}.${ext}`, { type: blob.type || "font/ttf" });
    const imported = await onImportFonts([file]);
    return (
      imported.find((a) => a.family.toLowerCase() === family.toLowerCase()) ?? imported[0] ?? null
    );
  };

  const commitFamily = async (option: FontOption) => {
    const needsImport =
      option.source === "Local" ||
      (option.source === "System" && !GENERIC_FONT_FAMILIES.has(option.family.toLowerCase()));

    if (needsImport) {
      setImportingFonts(true);
      setFontNotice(null);
      try {
        const imported =
          option.source === "Local"
            ? await importLocalFont(option.family)
            : await importSystemFont(option.family);
        if (imported) {
          loadImportedFontStylesheet(imported);
          commitFontFamily(buildFontFamilyValue(imported.family));
          setQuery("");
          setOpen(false);
        } else {
          // Committing an un-imported family would render a silent fallback,
          // so surface the failure and keep the current font instead.
          setFontNotice(`Couldn't import "${option.family}", so the font was not applied.`);
        }
      } catch {
        setFontNotice(`Couldn't import "${option.family}", so the font was not applied.`);
      } finally {
        setImportingFonts(false);
      }
      return;
    }
    if (option.source === "Google") loadGoogleFontStylesheet(option.family);
    const imported = importedFonts.find(
      (f) => f.family.toLowerCase() === option.family.toLowerCase(),
    );
    if (imported) loadImportedFontStylesheet(imported);
    commitFontFamily(buildFontFamilyValue(option.family));
    setQuery("");
    setOpen(false);
  };

  const dropdown = open && (
    <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-neutral-700 bg-neutral-950 shadow-2xl">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 border-b border-neutral-800 p-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled}
          placeholder={lists.loaded ? t("Search fonts") : t("Loading Google Fonts...")}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
              return;
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (filteredOptions.length === 0) return;
              const delta = e.key === "ArrowDown" ? 1 : -1;
              const next =
                activeIndex < 0 && delta === 1
                  ? 0
                  : (activeIndex + delta + filteredOptions.length) % filteredOptions.length;
              setActiveIndex(next);
              document
                .querySelector(`[data-font-option-index="${next}"]`)
                ?.scrollIntoView({ block: "nearest" });
              return;
            }
            const target = filteredOptions[activeIndex] ?? filteredOptions[0];
            if (e.key === "Enter" && target) {
              e.preventDefault();
              commitFamily(target);
            }
          }}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          className="min-w-0 rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-2 text-[11px] font-medium text-neutral-100 outline-hidden placeholder:text-neutral-600 focus:border-neutral-600"
        />
        {canQueryLocalFonts && (
          <button
            type="button"
            disabled={disabled || loadingLocalFonts}
            onClick={loadBrowserLocalFonts}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 text-[10px] font-medium text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-100 disabled:cursor-not-allowed disabled:text-text-off"
          >
            {loadingLocalFonts ? "..." : t("Local")}
          </button>
        )}
        <button
          type="button"
          disabled={disabled || importingFonts || !onImportFonts}
          onClick={() => fontInputRef.current?.click()}
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 text-[10px] font-medium text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-100 disabled:cursor-not-allowed disabled:text-text-off"
        >
          {importingFonts ? "..." : t("Import")}
        </button>
        <input
          ref={fontInputRef}
          type="file"
          accept=".ttf,.otf,.ttc,.woff,.woff2,.eot,font/*"
          multiple
          aria-label={t("Import local font files")}
          disabled={disabled || importingFonts || !onImportFonts}
          className="hidden"
          onChange={async (event) => {
            await handleImportFonts(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      {fontNotice && (
        <div className="border-b border-neutral-800 px-3 py-2 text-[10px] leading-4 text-neutral-500">
          {fontNotice}
        </div>
      )}
      <div className="max-h-64 overflow-y-auto p-1">
        {filteredOptions.length === 0 ? (
          <div className="px-2 py-3 text-[11px] text-neutral-500">{t("No fonts found.")}</div>
        ) : (
          filteredOptions.map((option, index) => (
            <button
              key={`${option.source}-${option.family}`}
              type="button"
              data-font-option-index={index}
              onClick={() => commitFamily(option)}
              className={`flex w-full min-w-0 items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-[11px] transition-colors ${
                index === activeIndex
                  ? "bg-neutral-800 text-neutral-50"
                  : option.family === currentFamily
                    ? "bg-studio-accent/15 text-neutral-50"
                    : "text-neutral-300 hover:bg-neutral-900 hover:text-neutral-100"
              }`}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-medium" style={{ fontFamily: `"${option.family}"` }}>
                  {option.family}
                </span>
                {renderAliasFor(option.family) && (
                  <span className="shrink-0 text-[9px] text-neutral-500">
                    → {renderAliasFor(option.family)}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[9px] uppercase tracking-[0.14em] text-neutral-600">
                {option.source}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );

  if (flat) {
    return (
      <div ref={containerRef} className="relative flex min-h-[30px] items-center justify-between">
        <span className="text-[11px] text-panel-text-2">{t("Font")}</span>
        <button
          type="button"
          data-flat-font-trigger="true"
          disabled={disabled}
          onClick={() => setOpen((next) => !next)}
          className="flex items-center gap-1.5 disabled:cursor-not-allowed"
        >
          <span
            className="max-w-[200px] truncate font-mono text-[11px] text-panel-text-0"
            style={{ fontFamily: value }}
          >
            {currentFamily}
          </span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="currentColor"
            className="shrink-0 text-panel-text-5"
          >
            <path d="M2 3l3 4 3-4z" />
          </svg>
        </button>
        {dropdown}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative grid min-w-0 gap-1.5">
      <span className={LABEL}>{t("Font family")}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((next) => !next)}
        className={`${FIELD} flex h-10 items-center justify-between gap-3 text-left hover:border-neutral-700 disabled:cursor-not-allowed`}
      >
        <span
          className="min-w-0 flex-1 truncate text-[11px] font-medium text-neutral-100"
          style={{ fontFamily: value }}
        >
          {currentFamily}
        </span>
        <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-neutral-600">
          {t("Font")}</span>
      </button>
      {dropdown}
    </div>
  );
}
