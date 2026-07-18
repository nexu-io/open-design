// Shared "example preset" seed logic — the short, human-readable, editable
// hook that lands in the composer when a user picks a plugin's example.
//
// This is the SINGLE source of truth for that seed so the Home example-prompt
// cards (HomeHero) and the plugin detail modal's prompt-loading "Use"
// action (HomeView) stay in lockstep. They used to diverge: the cards surfaced
// a friendly description while the detail modal dumped the raw
// `od.useCase.query` — which for many plugins is a generator-facing
// meta-instruction ("follow the en field verbatim; start from example.html"),
// useless as a human seed.
//
// `examplePresetSeedPrompt` deliberately does NOT return the full build spec —
// that rides along as plugin context (SKILL.md + example.html) once the plugin
// is applied, so the output still faithfully recreates the reference.

import type { InstalledPluginRecord } from '@open-design/contracts';
import type { Locale } from '../../i18n';
import { localizePluginDescription } from './localization';

const INPUT_PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}/g;

const HOME_ESCAPED_ARGUMENT_PLACEHOLDER_PATTERN =
  /\{argument\s+name=\\"([^"]+)\\"\s+default=\\"([^"]*)\\"[^}]*\}/g;

const HOME_ARGUMENT_PLACEHOLDER_PATTERN =
  /\{argument\s+name=(?:"([^"]+)"|'([^']+)')\s+default=(?:"([^"]*)"|'([^']*)')[^}]*\}/g;

export type PromptLocaleKind = 'zh' | 'ja' | 'en';

export function promptLocaleKind(locale: Locale): PromptLocaleKind {
  if (locale === 'zh-CN' || locale === 'zh-TW') return 'zh';
  if (locale === 'ja') return 'ja';
  return 'en';
}

export function pluginPresetQuery(
  record: InstalledPluginRecord,
  locale: Locale,
): string | null {
  const query = record.manifest?.od?.useCase?.query;
  if (typeof query === 'string') return query;
  if (query && typeof query === 'object') {
    const localized = query as Record<string, unknown>;
    const exact = localized[locale];
    if (typeof exact === 'string') return exact;
    const language = locale.split('-')[0];
    const languageMatch = Object.entries(localized).find(([key, value]) => (
      key.toLowerCase().startsWith(`${language}-`) && typeof value === 'string'
    ));
    if (typeof languageMatch?.[1] === 'string') return languageMatch[1];
    for (const key of ['zh-CN', 'en', 'default']) {
      if (typeof localized[key] === 'string') return localized[key];
    }
    const first = Object.values(localized).find((value) => typeof value === 'string');
    if (typeof first === 'string') return first;
  }
  return null;
}

export function renderPluginPresetQuery(
  record: InstalledPluginRecord,
  query: string,
): string {
  const fields = record.manifest?.od?.inputs ?? [];
  const valueByName = new Map<string, string>();
  for (const field of fields) {
    const value = field.default ?? field.placeholder ?? field.label ?? field.name;
    valueByName.set(field.name, String(value));
  }
  return query
    .replace(
      HOME_ESCAPED_ARGUMENT_PLACEHOLDER_PATTERN,
      (_placeholder, _name: string | undefined, defaultValue: string | undefined) => defaultValue ?? '',
    )
    .replace(
      HOME_ARGUMENT_PLACEHOLDER_PATTERN,
      (
        _placeholder,
        _doubleName: string | undefined,
        _singleName: string | undefined,
        doubleDefault: string | undefined,
        singleDefault: string | undefined,
      ) => doubleDefault ?? singleDefault ?? '',
    )
    .replace(INPUT_PLACEHOLDER_PATTERN, (_placeholder, key: string) => (
      valueByName.get(key) ?? key
    ));
}

export function firstPromptParagraph(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';
  // First paragraph = text up to the first blank line / markdown rule fence.
  const [head] = normalized.split(/\n\s*\n/);
  return (head ?? normalized).trim();
}

export function isMetaInstructionSeed(value: string): boolean {
  return /逐字注入|以\s*en\s*字段为准|verbatim|example\.html/iu.test(value);
}

// Markers that introduce a source-provenance sentence ("Based on …", "移植自 …").
const ATTRIBUTION_MARKERS = [
  'Based on', 'Adapted from', 'Ported from', 'Inspired by',
  '移植自', '改编自', '基于', '源自', '参考自',
];

// Start index of the final sentence. A Latin '.'/'!'/'?' ends a sentence only
// when it terminates the string or is followed by whitespace, so tokens like
// "STYLE_PRESETS.md" or "github.com/foo" don't split mid-word; CJK enders
// (。！？) always split.
function lastSentenceStart(text: string): number {
  const bounds: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '。' || ch === '！' || ch === '？') bounds.push(i);
    else if (ch === '.' || ch === '!' || ch === '?') {
      const next = text[i + 1];
      if (next === undefined || /\s/.test(next)) bounds.push(i);
    }
  }
  if (bounds.length === 0) return 0;
  const last = bounds[bounds.length - 1]!;
  // If the last boundary is the final char, the trailing sentence starts after
  // the previous boundary; otherwise it starts after the last one.
  if (last === text.length - 1) {
    return bounds.length >= 2 ? bounds[bounds.length - 2]! + 1 : 0;
  }
  return last + 1;
}

// Drop a trailing source-attribution sentence ("…。移植自 foo/bar 的 baz 模板。")
// so the composer seed doesn't end on provenance boilerplate. Conservative: only
// fires when the FINAL sentence opens with an attribution marker AND real
// description precedes it — never blanks the whole text, and leaves attribution
// that is woven mid-description (followed by a use-case sentence) untouched.
export function stripAttributionTail(text: string): string {
  const trimmed = text.trimEnd();
  const start = lastSentenceStart(trimmed);
  if (start === 0) return text;
  const sentence = trimmed.slice(start).replace(/^\s+/, '');
  if (!ATTRIBUTION_MARKERS.some((m) => sentence.startsWith(m))) return text;
  const kept = trimmed.slice(0, start).trimEnd();
  return kept.length > 0 ? kept : text;
}

// Non-global twin of INPUT_PLACEHOLDER_PATTERN — `.test()` on a /g/ regex is
// stateful (lastIndex), so probing uses this one.
const HAS_INPUT_PLACEHOLDER_PATTERN = /\{\{\s*[a-zA-Z_][\w-]*\s*\}\}/;

function usableQueryHead(record: InstalledPluginRecord, query: string): string | null {
  const head = firstPromptParagraph(renderPluginPresetQuery(record, query));
  // Skip meta-instructions that reference fields/assets the model can't see
  // from the textarea.
  if (head && !isMetaInstructionSeed(head)) return head;
  return null;
}

export interface PresetSeed {
  text: string;
  // True when `text` is the rendered plugin query itself (a human-friendly,
  // non-meta-instruction query), so callers may keep the raw query template to
  // drive placeholder write-back into plugin inputs. False for description /
  // meta-instruction / fallback seeds, which carry no `{{...}}` to extract.
  fromRenderedQuery: boolean;
}

// The seed text dropped into the composer when a preset/example is picked.
// `fallback` supplies the last-resort seed when neither the description nor a
// human-friendly query paragraph is usable — callers inject their own (the
// Home cards reuse their structured-preview path; the detail modal falls back
// to the plugin description / title).
export function examplePresetSeedPrompt(
  record: InstalledPluginRecord,
  locale: Locale,
  fallback: () => string,
): PresetSeed {
  const description = stripAttributionTail(localizePluginDescription(locale, record).trim());
  // zh: the localized useCase.query is a generator-facing meta-instruction
  // ("follow the en field verbatim; start from example.html"), useless as a
  // human seed — surface the curated one-line description instead.
  if (promptLocaleKind(locale) === 'zh' && description) {
    return { text: description, fromRenderedQuery: false };
  }
  const query = pluginPresetQuery(record, locale);
  // Input-templated queries (raw `{{...}}` placeholders in the leading
  // paragraph) are authored as editable human seeds; keep the rendered head so
  // editing a hydrated value in the composer still writes back into the
  // plugin inputs.
  if (query && HAS_INPUT_PLACEHOLDER_PATTERN.test(firstPromptParagraph(query))) {
    const head = usableQueryHead(record, query);
    if (head) return { text: head, fromRenderedQuery: true };
  }
  // Otherwise prefer the curated natural-language description: for many
  // example plugins the en query opens with a generator-facing build spec
  // (stack/file-layout instructions, raw HTML, or a paragraph dangling "as
  // described below" whose referent was truncated away) that reads as noise
  // in the composer. The full spec still reaches the agent as plugin context
  // (SKILL.md + example.html) once the plugin is applied.
  if (description) return { text: description, fromRenderedQuery: false };
  if (query) {
    const head = usableQueryHead(record, query);
    if (head) return { text: head, fromRenderedQuery: true };
  }
  return { text: fallback(), fromRenderedQuery: false };
}
