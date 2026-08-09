export const TOOL_PACK_SHELLS = Object.freeze({
  electron: Object.freeze({
    buildCommand: Object.freeze(["--filter", "@open-design/shell-electron...", "build"]),
    buildPackages: Object.freeze([
      { directory: "packages/release", name: "@open-design/release" },
      { directory: "packages/contracts", name: "@open-design/contracts" },
      { directory: "packages/sidecar-proto", name: "@open-design/sidecar-proto" },
      { directory: "packages/launcher-proto", name: "@open-design/launcher-proto" },
      { directory: "packages/sidecar", name: "@open-design/sidecar" },
      { directory: "packages/platform", name: "@open-design/platform" },
      { directory: "packages/download", name: "@open-design/download" },
      { directory: "packages/host", name: "@open-design/host" },
      { directory: "packages/diagnostics", name: "@open-design/diagnostics" },
      { directory: "packages/standalone-runtime", name: "@open-design/standalone-runtime" },
      { directory: "packages/standalone-proto", name: "@open-design/standalone-proto" },
      { directory: "packages/closure-proto", name: "@open-design/closure-proto" },
      { directory: "packages/closure-store", name: "@open-design/closure-store" },
      { directory: "packages/closure-update", name: "@open-design/closure-update" },
      { directory: "shells/electron", name: "@open-design/shell-electron" },
    ]),
    directory: "shells/electron",
    entryPackage: "@open-design/shell-electron",
    packageName: "@open-design/shell-electron",
  }),
} as const);

export type ToolPackShell = keyof typeof TOOL_PACK_SHELLS;
export type ToolPackShellDefinition = (typeof TOOL_PACK_SHELLS)[ToolPackShell];

export function resolveToolPackShell(value: string | undefined): ToolPackShell {
  if (value == null || value.length === 0 || value === "electron") return "electron";
  throw new Error(`unsupported --shell value: ${value}`);
}

export function toolPackShellDefinition(shell: ToolPackShell): ToolPackShellDefinition {
  return TOOL_PACK_SHELLS[shell];
}
