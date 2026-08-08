export const TOOL_PACK_SHELLS = Object.freeze({
  electron: Object.freeze({
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
