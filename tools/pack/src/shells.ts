export const TOOL_PACK_SHELLS = Object.freeze({
  electron: Object.freeze({
    buildCommand: Object.freeze(["--filter", "@open-design/shell-electron...", "build"]),
    buildPackages: Object.freeze([
      { directory: "packages/release", name: "@open-design/release" },
      { directory: "packages/contracts", name: "@open-design/contracts" },
      { directory: "packages/sidecar", name: "@open-design/sidecar" },
      {
        directory: "packages/shell",
        name: "@open-design/shell",
        requiredDistPaths: Object.freeze(["update/index.mjs", "update/index.d.ts"]),
      },
      { directory: "packages/platform", name: "@open-design/platform" },
      { directory: "packages/download", name: "@open-design/download" },
      { directory: "packages/host", name: "@open-design/host" },
      { directory: "packages/diagnostics", name: "@open-design/diagnostics" },
      {
        directory: "apps/standalone",
        name: "@open-design/standalone",
        sourcePaths: Object.freeze([
          "package.json",
          "esbuild.config.ts",
          "tsconfig.json",
          "src/protocol",
          "src/runtime",
          "src/bootloader.ts",
          "src/bootstrap-entry.ts",
          "src/bootstrap.ts",
          "src/fossil-bootloader.ts",
          "src/generation-bootloader.ts",
          "src/launcher-bootstrap.ts",
          "src/launcher.ts",
          "src/native-loader.ts",
          "src/process-bridge.ts",
        ]),
      },
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
