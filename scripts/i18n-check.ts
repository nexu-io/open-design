import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { LOCALE_LABEL, LOCALES, type Locale } from "../apps/web/src/i18n/types.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const localesDirectory = path.join(repoRoot, "apps/web/src/i18n/locales");
const i18nIndexPath = path.join(repoRoot, "apps/web/src/i18n/index.tsx");
// English canonical docs (README.md, CONTRIBUTING.md, ...) stay at repo root for
// GitHub project-page visibility; their translations live under docs/i18n/.
const translationsDir = "docs/i18n";

type CheckResult = {
  name: string;
  errors: string[];
};

type ReadmeSwitcherEntry = {
  label: string;
  href: string | null;
  bold: boolean;
};

type CoreDocLink = {
  label: string;
  target: string;
  syntax: "html" | "markdown";
};

const coreDocTargetPattern =
  "((?:(?:\\.\\./\\.\\./|docs/i18n/))?(?:QUICKSTART(?:\\.[A-Za-z0-9-]+)?\\.md|CONTRIBUTING(?:\\.[A-Za-z0-9-]+)?\\.md))";

function repositoryPath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function localeFileName(locale: string): string {
  return `${locale}.ts`;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

function extractDictKeys(indexSource: string): string[] {
  const match = indexSource.match(/const DICTS:\s*Record<Locale, Dict>\s*=\s*{([\s\S]*?)};/);
  if (!match?.[1]) return [];

  return Array.from(match[1].matchAll(/["']([^"']+)["']\s*:/g))
    .map((entry) => entry[1])
    .filter((entry): entry is string => entry != null && entry.length > 0);
}

async function checkUiLocaleRegistration(): Promise<CheckResult> {
  const errors: string[] = [];
  const localeSet = new Set<string>(LOCALES);
  const localeFiles = (await readdir(localesDirectory)).filter((fileName) => fileName.endsWith(".ts")).sort();
  const localeFileSet = new Set(localeFiles);
  const dictKeys = extractDictKeys(await readFile(i18nIndexPath, "utf8"));
  const dictKeySet = new Set(dictKeys);

  for (const locale of LOCALES) {
    const fileName = localeFileName(locale);
    if (!localeFileSet.has(fileName)) {
      errors.push(`${locale} is listed in LOCALES but ${repositoryPath(path.join(localesDirectory, fileName))} is missing.`);
    }

    if (!(locale in LOCALE_LABEL)) {
      errors.push(`${locale} is listed in LOCALES but LOCALE_LABEL has no entry.`);
    }

    if (!dictKeySet.has(locale)) {
      errors.push(`${locale} is listed in LOCALES but DICTS has no entry in ${repositoryPath(i18nIndexPath)}.`);
    }
  }

  for (const fileName of localeFiles) {
    const locale = fileName.replace(/\.ts$/, "");
    if (!localeSet.has(locale)) {
      errors.push(`${repositoryPath(path.join(localesDirectory, fileName))} exists but ${locale} is not listed in LOCALES.`);
    }
  }

  for (const dictKey of dictKeys) {
    if (!localeSet.has(dictKey)) {
      errors.push(`DICTS contains ${dictKey}, but ${dictKey} is not listed in LOCALES.`);
    }
  }

  return { name: "UI locale registration", errors };
}

// README.md (English) lives at repo root; README.<locale>.md live under docs/i18n/.
// Returns canonical names (README.md, README.zh-CN.md, ...) sorted with English first.
async function rootReadmeFiles(): Promise<string[]> {
  const names = new Set<string>();
  const rootEntries = await readdir(repoRoot, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (entry.isFile() && entry.name === "README.md") names.add(entry.name);
  }
  const translationEntries = await readdir(path.join(repoRoot, translationsDir), { withFileTypes: true });
  for (const entry of translationEntries) {
    if (entry.isFile() && /^README\.[A-Za-z0-9-]+\.md$/.test(entry.name)) names.add(entry.name);
  }
  return Array.from(names).sort((left, right) =>
    left === "README.md" ? -1 : right === "README.md" ? 1 : left.localeCompare(right),
  );
}

// Physical path of a canonical doc name: English (no locale) at root, translations under docs/i18n/.
function docPhysicalPath(canonicalName: string): string {
  const isEnglish = /^(README|CONTRIBUTING|QUICKSTART|MAINTAINERS)\.md$/.test(canonicalName);
  return isEnglish ? path.join(repoRoot, canonicalName) : path.join(repoRoot, translationsDir, canonicalName);
}

// The href a document at `fromName` should use to link to canonical doc `toName`.
// Same directory (both translations, or both root English) → bare name.
// Translation → English root → ../../NAME. English root → translation → docs/i18n/NAME.
function expectedDocHref(fromName: string, toName: string): string {
  const fromEnglish = /^(README|CONTRIBUTING|QUICKSTART|MAINTAINERS)\.md$/.test(fromName);
  const toEnglish = /^(README|CONTRIBUTING|QUICKSTART|MAINTAINERS)\.md$/.test(toName);
  if (fromEnglish === toEnglish) return toName;
  if (!fromEnglish && toEnglish) return `../../${toName}`;
  return `${translationsDir}/${toName}`;
}

// Strip any docs/i18n/ or ../../ prefix to recover the canonical doc name from a link target.
function canonicalDocName(target: string): string {
  return target.replace(/^(?:\.\.\/\.\.\/|docs\/i18n\/)/, "");
}

function extractReadmeSwitcher(source: string): ReadmeSwitcherEntry[] | null {
  const line = source.split("\n").find((candidate) => candidate.includes('<p align="center">') && candidate.includes("README"));
  if (!line) return null;

  const entries: ReadmeSwitcherEntry[] = [];
  const tokenPattern = /<a\s+href="([^"]+)">([^<]+)<\/a>|<b>([^<]+)<\/b>/g;

  for (const match of line.matchAll(tokenPattern)) {
    const href = match[1] ?? null;
    const label = match[2] ?? match[3];
    if (!label) continue;
    entries.push({ label, href, bold: href == null });
  }

  return entries;
}

function readmeTarget(fileName: string): string {
  return fileName === "README.md" ? "README.md" : fileName;
}

function readmeLocale(fileName: string): string | null {
  if (fileName === "README.md") return null;
  const match = fileName.match(/^README\.([A-Za-z0-9-]+)\.md$/);
  return match?.[1] ?? null;
}

function coreDocSourceName(target: string): "QUICKSTART.md" | "CONTRIBUTING.md" | null {
  if (target.startsWith("QUICKSTART")) return "QUICKSTART.md";
  if (target.startsWith("CONTRIBUTING")) return "CONTRIBUTING.md";
  return null;
}

function localizedCoreDocName(sourceName: "QUICKSTART.md" | "CONTRIBUTING.md", locale: string): string {
  return sourceName.replace(/\.md$/, `.${locale}.md`);
}

function isExplicitEnglishCoreDocLink(link: CoreDocLink): boolean {
  return link.syntax === "markdown" && link.label.trim() === "English";
}

function extractCoreDocLinks(source: string): CoreDocLink[] {
  const links: CoreDocLink[] = [];
  const markdownPattern = new RegExp(`\\[([^\\]]*)\\]\\(${coreDocTargetPattern}\\)`, "g");
  const htmlHrefPattern = new RegExp(`<a\\b[^>]*\\bhref=(["'])${coreDocTargetPattern}\\1[^>]*>`, "g");

  for (const match of source.matchAll(markdownPattern)) {
    const label = match[1];
    const target = match[2];
    if (label == null || target == null) continue;
    links.push({ label, target, syntax: "markdown" });
  }

  for (const match of source.matchAll(htmlHrefPattern)) {
    const target = match[2];
    if (target == null) continue;
    links.push({ label: "", target, syntax: "html" });
  }

  return links;
}

async function checkReadmeSwitchers(): Promise<CheckResult> {
  const errors: string[] = [];
  const readmes = await rootReadmeFiles();
  const readmeSet = new Set(readmes);
  const canonicalName = "README.md";
  const canonicalSource = await readFile(docPhysicalPath(canonicalName), "utf8");
  const canonicalEntries = extractReadmeSwitcher(canonicalSource);

  if (!canonicalEntries) {
    return { name: "root README language switchers", errors: [`${canonicalName} has no root README language switcher.`] };
  }

  // Normalize each switcher entry's href to a canonical README name, so files in
  // different directories (root English vs docs/i18n translations) compare equal.
  const canonicalOrder = canonicalEntries.map((entry) => (entry.href == null ? canonicalName : canonicalDocName(entry.href)));
  const expectedTargets = new Set(readmes.map(readmeTarget));
  const canonicalTargetSet = new Set(canonicalOrder);

  if (
    canonicalTargetSet.size !== expectedTargets.size ||
    canonicalOrder.some((target) => !expectedTargets.has(target)) ||
    Array.from(expectedTargets).some((target) => !canonicalTargetSet.has(target))
  ) {
    errors.push(
      `${canonicalName} switcher targets differ from README files. Expected ${Array.from(expectedTargets).join(", ")}; found ${canonicalOrder.join(", ")}.`,
    );
  }

  for (const readme of readmes) {
    const source = await readFile(docPhysicalPath(readme), "utf8");
    const entries = extractReadmeSwitcher(source);
    if (!entries) {
      errors.push(`${readme} has no root README language switcher.`);
      continue;
    }

    const order = entries.map((entry) => (entry.href == null ? readme : canonicalDocName(entry.href)));
    if (order.join("\n") !== canonicalOrder.join("\n")) {
      errors.push(`${readme} switcher order differs. Expected ${canonicalOrder.join(", ")}; found ${order.join(", ")}.`);
    }

    const boldEntries = entries.filter((entry) => entry.bold);
    if (boldEntries.length !== 1) {
      errors.push(`${readme} must have exactly one bold current-language entry; found ${boldEntries.length}.`);
    }

    for (const entry of entries) {
      if (entry.href == null) continue;
      const targetName = canonicalDocName(entry.href);
      if (!readmeSet.has(targetName)) {
        errors.push(`${readme} links to missing README ${entry.href}.`);
        continue;
      }
      const expectedHref = expectedDocHref(readme, targetName);
      if (entry.href !== expectedHref) {
        errors.push(`${readme} switcher links to ${entry.href} but should use ${expectedHref} from its location.`);
      }
    }
  }

  return { name: "root README language switchers", errors };
}

async function checkCoreDocLinks(): Promise<CheckResult> {
  const errors: string[] = [];
  const readmes = await rootReadmeFiles();

  for (const readme of readmes) {
    const source = await readFile(docPhysicalPath(readme), "utf8");
    const locale = readmeLocale(readme);
    const links = extractCoreDocLinks(source);
    // Normalize link targets to canonical doc names, dropping any docs/i18n/ or ../../ prefix.
    const linkedTargets = new Set(links.map((link) => canonicalDocName(link.target)));

    for (const link of links) {
      const target = canonicalDocName(link.target);
      if (!(await pathExists(docPhysicalPath(target)))) {
        errors.push(`${readme} links to missing core doc ${link.target}.`);
      }

      if (locale == null) continue;

      const sourceName = coreDocSourceName(target);
      if (sourceName == null || target !== sourceName || isExplicitEnglishCoreDocLink(link)) continue;

      const localizedName = localizedCoreDocName(sourceName, locale);
      if (await pathExists(docPhysicalPath(localizedName))) {
        errors.push(`${readme} links to ${sourceName}, but ${localizedName} exists for this README locale.`);
      }
    }

    if (locale == null) continue;
    for (const sourceName of ["QUICKSTART.md", "CONTRIBUTING.md"] as const) {
      const localizedName = localizedCoreDocName(sourceName, locale);
      if ((await pathExists(docPhysicalPath(localizedName))) && links.some((link) => coreDocSourceName(canonicalDocName(link.target)) === sourceName)) {
        if (!linkedTargets.has(localizedName)) {
          errors.push(`${readme} links to ${sourceName} docs, but does not link to localized ${localizedName}.`);
        }
      }
    }
  }

  return { name: "core documentation links", errors };
}

const checks = [checkUiLocaleRegistration, checkReadmeSwitchers, checkCoreDocLinks];
const results: CheckResult[] = [];

for (const check of checks) {
  try {
    results.push(await check());
  } catch (error) {
    results.push({ name: check.name, errors: [`Unexpected check failure: ${String(error)}`] });
  }
}

const failures = results.flatMap((result) => result.errors.map((error) => ({ check: result.name, error })));

if (failures.length > 0) {
  console.error("i18n P0 check failed:");
  for (const failure of failures) {
    console.error(`- [${failure.check}] ${failure.error}`);
  }
  process.exitCode = 1;
} else {
  console.log("i18n P0 check passed: locale registration, README switchers, and core doc links are consistent.");
}
