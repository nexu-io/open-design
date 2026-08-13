import type {
  StandaloneLifecycleOccupant,
  StandaloneLifecyclePort,
  StandaloneLifecycleTransition,
} from "@open-design/standalone/protocol";

export type UpdateRestartSafety =
  | { occupantCount: 0; state: "clear" }
  | { occupantCount: number; occupants: readonly StandaloneLifecycleOccupant[]; state: "blocked" }
  | { occupantCount: null; reason: string; state: "unknown" };

export const UPDATE_RESTART_BLOCKED_ERROR_CODE = "standalone-lifecycle-occupied";
export const UPDATE_RESTART_UNKNOWN_ERROR_CODE = "standalone-lifecycle-unavailable";

export type DesktopUpdateTransition = Readonly<{
  release(): Promise<void>;
}>;

export function updateRestartSafetyError(safety: Exclude<UpdateRestartSafety, { state: "clear" }>): {
  code: string;
  details: { occupantCount: number | null; occupants?: readonly StandaloneLifecycleOccupant[] };
  message: string;
} {
  if (safety.state === "blocked") {
    return {
      code: UPDATE_RESTART_BLOCKED_ERROR_CODE,
      details: { occupantCount: safety.occupantCount, occupants: safety.occupants },
      message: safety.occupants.length === 0
        ? "Another Open Design Shell is already coordinating an update."
        : `Open Design is still in use by ${safety.occupants.map((entry) => entry.key).join(", ")}.`,
    };
  }
  return {
    code: UPDATE_RESTART_UNKNOWN_ERROR_CODE,
    details: { occupantCount: null },
    message: "Open Design could not acquire the Standalone lifecycle transition.",
  };
}

export async function beginDesktopUpdateTransition(
  lifecycle: StandaloneLifecyclePort | null | undefined,
): Promise<
  | Readonly<{ state: "acquired"; transition: DesktopUpdateTransition }>
  | Readonly<{ safety: Exclude<UpdateRestartSafety, { state: "clear" }>; state: "blocked" }>
> {
  if (lifecycle == null) {
    return { safety: { occupantCount: null, reason: "Standalone lifecycle is unavailable", state: "unknown" }, state: "blocked" };
  }
  try {
    const result = await lifecycle.beginTransition("apply-shell-update");
    if (result.state === "acquired") {
      return { state: "acquired", transition: result.transition };
    }
    return {
      safety: result.reason === "occupied"
        ? { occupantCount: result.occupants.length, occupants: result.occupants, state: "blocked" }
        : { occupantCount: null, reason: "Another update transition is active", state: "unknown" },
      state: "blocked",
    };
  } catch (error) {
    return {
      safety: {
        occupantCount: null,
        reason: error instanceof Error ? error.message : String(error),
        state: "unknown",
      },
      state: "blocked",
    };
  }
}

export class DesktopUpdateTransitionOwner {
  private acquisition: Promise<UpdateRestartSafety> | null = null;
  private transition: StandaloneLifecycleTransition | null = null;

  constructor(private readonly lifecycle: StandaloneLifecyclePort | null | undefined) {}

  async acquire(): Promise<UpdateRestartSafety> {
    if (this.transition != null) return { occupantCount: 0, state: "clear" };
    if (this.acquisition != null) return await this.acquisition;
    this.acquisition = (async () => {
      const result = await beginDesktopUpdateTransition(this.lifecycle);
      if (result.state === "blocked") return result.safety;
      this.transition = result.transition;
      return { occupantCount: 0, state: "clear" } as const;
    })();
    try {
      return await this.acquisition;
    } finally {
      this.acquisition = null;
    }
  }

  async release(): Promise<void> {
    await this.acquisition?.catch(() => undefined);
    const transition = this.transition;
    this.transition = null;
    await transition?.release().catch(() => undefined);
  }
}
