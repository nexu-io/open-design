/**
 * Pure helpers for promote-to-variable from the Design panel. Kept free of React
 * and the SDK session so the binding-detection and id logic can be unit-tested.
 */

import type { CompositionVariable } from "@hyperframes/sdk";
import type { BindAction } from "../components/panels/VariablesBindElement";

export type PromoteChannel = { kind: "text" } | { kind: "src" } | { kind: "style"; prop: string };

/** Minimal element shape needed to read a binding — mirrors the SDK snapshot. */
export interface BindingSource {
  attributes: Readonly<Record<string, string>>;
  inlineStyles: Readonly<Record<string, string>>;
}

/** "font-family" → "fontFamily" to index inlineStyles (camelCase, per SDK convention). */
export function toCamel(prop: string): string {
  return prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * "var(--headline-color)" → "headline-color". Tolerates a fallback
 * ("var(--id, #fff)") and a trailing "!important"; anything else → null.
 */
export function parseVarId(value: string | undefined): string | null {
  if (!value) return null;
  const m = /^var\(\s*--([A-Za-z0-9_-]+)\s*(?:,[^)]*)?\)\s*(?:!important)?\s*$/.exec(value.trim());
  return m ? m[1] : null;
}

export function matchAction(actions: BindAction[], channel: PromoteChannel): BindAction | null {
  if (channel.kind === "style") {
    return actions.find((a) => a.kind === "style" && a.styleProp === channel.prop) ?? null;
  }
  return actions.find((a) => a.kind === channel.kind) ?? null;
}

/** Id of the variable this channel is bound to on the element, or null. */
export function readBindingFrom(source: BindingSource, channel: PromoteChannel): string | null {
  if (channel.kind === "text") return source.attributes["data-var-text"] ?? null;
  if (channel.kind === "src") return source.attributes["data-var-src"] ?? null;
  return parseVarId(source.inlineStyles[toCamel(channel.prop)]);
}

/** Unique id from a suggested base, avoiding collisions with existing declarations. */
export function uniqueId(base: string, existing: CompositionVariable[]): string {
  const taken = new Set(existing.map((d) => d.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
