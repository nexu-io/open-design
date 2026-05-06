import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { LOCALE_LABEL, LOCALES, type Locale } from "../apps/web/src/i18n/types.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const localesDirectory = path.join(repoRoot, "apps/web/src/i18n/locales");
const i18nIndexPath = path.join(repoRoot, "apps/web/src/i18n/index.tsx");

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

const coreDocTargetPattern = "(QUICKSTART(?:\\.[A-Za-z0-9-]+)?\\.md|CONTRIBUTING(?:\\.[A-Za-z0-9-]+)?\\.md)";

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

async function rootReadmeFiles(): Promise<string[]> {
  const entries = await readdir(repoRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /^README(?:\.[A-Za-z0-9-]+)?\.md$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => (left === "README.md" ? -1 : right === "README.md" ? 1 : left.localeCompare(right)));
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
  const canonicalSource = await readFile(path.join(repoRoot, canonicalName), "utf8");
  const canonicalEntries = extractReadmeSwitcher(canonicalSource);

  if (!canonicalEntries) {
    return { name: "root README language switchers", errors: [`${canonicalName} has no root README language switcher.`] };
  }

  const canonicalTargets = canonicalEntries.map((entry) => entry.href ?? canonicalName);
  const expectedTargets = new Set(readmes.map(readmeTarget));
  const canonicalTargetSet = new Set(canonicalTargets);

  if (
    canonicalTargetSet.size !== expectedTargets.size ||
    canonicalTargets.some((target) => !expectedTargets.has(target)) ||
    Array.from(expectedTargets).some((target) => !canonicalTargetSet.has(target))
  ) {
    errors.push(
      `${canonicalName} switcher targets differ from root README files. Expected ${Array.from(expectedTargets).join(", ")}; found ${canonicalTargets.join(", ")}.`,
    );
  }

  for (const readme of readmes) {
    const source = await readFile(path.join(repoRoot, readme), "utf8");
    const entries = extractReadmeSwitcher(source);
    if (!entries) {
      errors.push(`${readme} has no root README language switcher.`);
      continue;
    }

    const targets = entries.map((entry) => entry.href ?? readme);
    if (targets.join("\n") !== canonicalTargets.join("\n")) {
      errors.push(`${readme} switcher order differs. Expected ${canonicalTargets.join(", ")}; found ${targets.join(", ")}.`);
    }

    const boldEntries = entries.filter((entry) => entry.bold);
    if (boldEntries.length !== 1) {
      errors.push(`${readme} must have exactly one bold current-language entry; found ${boldEntries.length}.`);
    }

    for (const entry of entries) {
      if (entry.href == null) continue;
      if (!readmeSet.has(entry.href)) {
        errors.push(`${readme} links to missing root README ${entry.href}.`);
      }
    }
  }

  return { name: "root README language switchers", errors };
}

async function checkCoreDocLinks(): Promise<CheckResult> {
  const errors: string[] = [];
  const readmes = await rootReadmeFiles();

  for (const readme of readmes) {
    const source = await readFile(path.join(repoRoot, readme), "utf8");
    const locale = readmeLocale(readme);
    const links = extractCoreDocLinks(source);
    const linkedTargets = new Set(links.map((link) => link.target));

    for (const link of links) {
      const target = link.target;
      if (!(await pathExists(path.join(repoRoot, target)))) {
        errors.push(`${readme} links to missing core doc ${target}.`);
      }

      if (locale == null) continue;

      const sourceName = coreDocSourceName(target);
      if (sourceName == null || target !== sourceName || isExplicitEnglishCoreDocLink(link)) continue;

      const localizedName = localizedCoreDocName(sourceName, locale);
      if (await pathExists(path.join(repoRoot, localizedName))) {
        errors.push(`${readme} links to ${sourceName}, but ${localizedName} exists for this README locale.`);
      }
    }

    if (locale == null) continue;
    for (const sourceName of ["QUICKSTART.md", "CONTRIBUTING.md"] as const) {
      const localizedName = localizedCoreDocName(sourceName, locale);
      if ((await pathExists(path.join(repoRoot, localizedName))) && links.some((link) => coreDocSourceName(link.target) === sourceName)) {
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
