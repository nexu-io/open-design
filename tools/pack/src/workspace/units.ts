/** Execution catalogue only. Workflow input identities and skip policy belong to Plan. */
export const WORKSPACE_BUILD_PACKAGES = [
  { directory: "packages/release", name: "@open-design/release" },
  { directory: "packages/components", name: "@open-design/components" },
  { directory: "packages/contracts", name: "@open-design/contracts" },
  { directory: "packages/registry-protocol", name: "@open-design/registry-protocol" },
  { directory: "packages/sidecar-proto", name: "@open-design/sidecar-proto" },
  { directory: "packages/launcher-proto", name: "@open-design/launcher-proto" },
  { directory: "packages/platform", name: "@open-design/platform" },
  { directory: "packages/sidecar", name: "@open-design/sidecar" },
  { directory: "packages/download", name: "@open-design/download" },
  { directory: "packages/standalone", name: "@open-design/standalone" },
  { directory: "packages/host", name: "@open-design/host" },
  { directory: "packages/agui-adapter", name: "@open-design/agui-adapter" },
  { directory: "packages/plugin-runtime", name: "@open-design/plugin-runtime" },
  { directory: "packages/diagnostics", name: "@open-design/diagnostics" },
  { directory: "packages/dsh-runtime", name: "@open-design/dsh-runtime" },
  { directory: "apps/daemon", name: "@open-design/daemon" },
  { directory: "apps/web", name: "@open-design/web" },
  { directory: "apps/desktop", name: "@open-design/desktop" },
  { directory: "apps/packaged", name: "@open-design/packaged" },
] as const;

export const WORKSPACE_BUILD_UNITS = ["packages", "daemon", "web", "shell"] as const;
export type WorkspaceBuildUnit = typeof WORKSPACE_BUILD_UNITS[number];

export function parseWorkspaceBuildUnit(value: string): WorkspaceBuildUnit {
  if (!WORKSPACE_BUILD_UNITS.some((unit) => unit === value)) {
    throw new Error(`unsupported workspace build unit: ${value}`);
  }
  return value as WorkspaceBuildUnit;
}

export function workspaceUnitPackages(unit: WorkspaceBuildUnit) {
  return WORKSPACE_BUILD_PACKAGES.filter(({ directory }) => {
    if (unit === "packages") return directory.startsWith("packages/");
    if (unit === "shell") return directory === "apps/desktop" || directory === "apps/packaged";
    return directory === `apps/${unit}`;
  });
}

type BuildCommand = { args: string[]; env?: readonly string[] };

export const WORKSPACE_BUILD_COMMANDS_BY_UNIT: Record<WorkspaceBuildUnit, BuildCommand[]> = {
  packages: [{ args: [
    ...workspaceUnitPackages("packages").flatMap(({ name }) => ["--filter", name]),
    "--workspace-concurrency=1", "--if-present", "run", "build",
  ] }],
  daemon: [{ args: ["--filter", "@open-design/daemon", "run", "build"] }],
  web: [
    { args: ["--filter", "@open-design/web", "run", "build"], env: ["OD_WEB_OUTPUT_MODE"] },
    { args: ["--filter", "@open-design/web", "run", "build:sidecar"] },
  ],
  shell: [
    { args: ["--filter", "@open-design/desktop", "run", "build"] },
    { args: ["--filter", "@open-design/packaged", "run", "build"] },
  ],
};

export const WORKSPACE_BUILD_COMMANDS = WORKSPACE_BUILD_UNITS.flatMap((unit) => WORKSPACE_BUILD_COMMANDS_BY_UNIT[unit]);
