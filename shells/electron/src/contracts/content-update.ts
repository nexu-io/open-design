export const ELECTRON_CONTENT_UPDATE_CHANNELS = Object.freeze({
  apply: "od:content-update:apply:v1",
  prepare: "od:content-update:prepare:v1",
});

export type ElectronContentUpdateProjection = Readonly<{
  schemaVersion: 1;
  state: "applied" | "blocked" | "current" | "failed" | "prepared" | "shell-update-required";
  generationId?: string;
  releaseVersion?: string;
  authorized?: boolean;
  reason?: "occupied" | "transition-active" | "unavailable";
  blockedBy?: readonly Readonly<{ attachmentId: string; shellType: string }>[];
  minimumShellVersion?: string | null;
  error?: Readonly<{ code: "content-update-failed" }>;
}>;
