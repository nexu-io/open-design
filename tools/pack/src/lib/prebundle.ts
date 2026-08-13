import { readFile } from "node:fs/promises";

export type PrebundlePolicy = {
  allowedInputs?: readonly string[];
  forbiddenInputs: readonly string[];
  label: string;
};

function toPosixPath(value: string): string {
  return value.replaceAll("\\", "/");
}

export function findForbiddenPrebundleInputs(options: {
  allowedInputs?: readonly string[];
  forbiddenInputs: readonly string[];
  inputs: readonly string[];
}): string[] {
  return options.inputs
    .map(toPosixPath)
    .filter((input) => options.forbiddenInputs.some((forbidden) => input.includes(forbidden)))
    .filter((input) => !options.allowedInputs?.some((allowed) => input.includes(allowed)));
}

export async function assertPrebundleMetafile(options: {
  metafilePath: string;
  policy: PrebundlePolicy;
}): Promise<void> {
  const metafile = JSON.parse(await readFile(options.metafilePath, "utf8")) as { inputs?: Record<string, unknown> };
  const matched = findForbiddenPrebundleInputs({
    ...(options.policy.allowedInputs == null ? {} : { allowedInputs: options.policy.allowedInputs }),
    forbiddenInputs: options.policy.forbiddenInputs,
    inputs: Object.keys(metafile.inputs ?? {}),
  });
  if (matched.length > 0) {
    throw new Error(`${options.policy.label} prebundle included forbidden inputs: ${matched.join(", ")}`);
  }
}

export function renderPackagedMainEntry(usePrebundle: boolean): string {
  return usePrebundle
    ? 'import("./prebundled/packaged-main.mjs").catch((error) => {\n  console.error("packaged entry failed", error);\n  process.exit(1);\n});\n'
    : 'import("@open-design/shell-electron").catch((error) => {\n  console.error("Electron Shell entry failed", error);\n  process.exit(1);\n});\n';
}
