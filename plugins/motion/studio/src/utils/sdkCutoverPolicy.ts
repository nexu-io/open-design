export const STUDIO_SDK_OPERATION_FAMILIES = [
  "dom",
  "timing",
  "gsap-animation",
  "gsap-keyframe",
  "lifecycle",
] as const;

export type StudioSdkOperationFamily = (typeof STUDIO_SDK_OPERATION_FAMILIES)[number];

interface StudioSdkFamilyStatus {
  owner: string;
  deadline: string;
  parityEvidence: string;
  graduated: boolean;
}

const STUDIO_SDK_FAMILY_STATUS = {
  dom: {
    owner: "studio-foundations",
    deadline: "2026-09-30",
    parityEvidence: "sdkCutoverParity.test.ts",
    graduated: false,
  },
  timing: {
    owner: "studio-foundations",
    deadline: "2026-10-15",
    parityEvidence: "sdkCutover.test.ts timing corpus",
    graduated: false,
  },
  "gsap-animation": {
    owner: "studio-foundations",
    deadline: "2026-10-31",
    parityEvidence: "sdkCutover.test.ts GSAP animation corpus",
    graduated: false,
  },
  "gsap-keyframe": {
    owner: "studio-foundations",
    deadline: "2026-11-15",
    parityEvidence: "sdkCutover.test.ts GSAP keyframe corpus",
    graduated: false,
  },
  lifecycle: {
    owner: "studio-foundations",
    deadline: "2026-11-30",
    parityEvidence: "sdkCutover.test.ts lifecycle corpus",
    graduated: false,
  },
} as const satisfies Record<StudioSdkOperationFamily, StudioSdkFamilyStatus>;

export function resolveEnabledSdkFamilies(
  env: Record<string, boolean | string | undefined>,
  masterEnabled: boolean,
): ReadonlySet<StudioSdkOperationFamily> {
  if (!masterEnabled) return new Set();
  const raw = env["VITE_STUDIO_SDK_CUTOVER_FAMILIES"];
  // Unset/blank = every family. The list exists to RESTRICT (kill switch per family).
  if (typeof raw !== "string" || raw.trim() === "") return new Set(STUDIO_SDK_OPERATION_FAMILIES);
  const requested = raw
    .split(",")
    .map((family) => family.trim())
    .filter(Boolean);
  const known = new Set<string>(STUDIO_SDK_OPERATION_FAMILIES);
  const unknown = requested.filter((family) => !known.has(family));
  if (unknown.length > 0) {
    throw new Error(`Unknown Studio SDK cutover families: ${unknown.join(", ")}`);
  }
  return new Set(requested as StudioSdkOperationFamily[]);
}

export function isSdkFamilyEnabled(
  masterEnabled: boolean,
  configured: ReadonlySet<StudioSdkOperationFamily> | undefined,
  family: StudioSdkOperationFamily,
): boolean {
  // `undefined` preserves compatibility for isolated tests/embedders that mock
  // only the historical master flag. Production always supplies an explicit set.
  return masterEnabled && (configured?.has(family) ?? true);
}

export function renderStudioSdkCutoverReport(): string {
  const rows = STUDIO_SDK_OPERATION_FAMILIES.map((family) => {
    const status = STUDIO_SDK_FAMILY_STATUS[family];
    return `| ${family} | ${status.owner} | ${status.deadline} | ${status.parityEvidence} | ${status.graduated ? "yes" : "no"} |`;
  });
  return [
    "# Studio SDK cutover report",
    "",
    "Default: SDK persist ON for every family. Kill switches:",
    "  `VITE_STUDIO_SDK_CUTOVER_ENABLED=false` (all families → server path)",
    "  `VITE_STUDIO_SDK_CUTOVER_FAMILIES=dom,timing` (only listed families → SDK; rest → server)",
    "",
    "A family graduates only after zero unexplained resolver/serialization divergences over its agreed corpus and soak window.",
    "",
    "| Family | Owner | Deadline | Parity evidence | Graduated |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}
