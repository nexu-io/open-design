import Mustache from "mustache";

import { readPackageResourceText, type PackageResourceRequest } from "./resources.js";

type MustacheToken = readonly [type: string, name: string, ...rest: unknown[]];

export type ScalarTemplateValues = Readonly<Record<string, string>>;

function parseScalarTokens(template: string): MustacheToken[] {
  const parsed = Mustache.parse(template) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Mustache returned an invalid token stream");
  return parsed as MustacheToken[];
}

/** Render a deliberately non-executable Mustache subset: text plus raw scalar interpolation only. */
export function renderScalarTemplate(input: Readonly<{
  template: string;
  values: ScalarTemplateValues;
}>): string {
  const tokens = parseScalarTokens(input.template);
  const used = new Set<string>();
  for (const token of tokens) {
    if (token[0] === "text") continue;
    if (token[0] !== "&" || !/^[A-Z][A-Z0-9_]*$/u.test(token[1])) {
      throw new Error(`unsupported Mustache token in scalar template: ${token[0]}`);
    }
    if (!Object.hasOwn(input.values, token[1])) throw new Error(`missing scalar template value: ${token[1]}`);
    if (typeof input.values[token[1]] !== "string") throw new Error(`invalid scalar template value: ${token[1]}`);
    used.add(token[1]);
  }
  const unused = Object.keys(input.values).filter((name) => !used.has(name));
  if (unused.length > 0) throw new Error(`unused scalar template values: ${unused.join(", ")}`);
  return Mustache.render(input.template, Object.assign(Object.create(null) as Record<string, string>, input.values));
}

export async function renderPackageResourceTemplate(
  input: PackageResourceRequest & Readonly<{ values: ScalarTemplateValues }>,
): Promise<string> {
  return renderScalarTemplate({ template: await readPackageResourceText(input), values: input.values });
}
