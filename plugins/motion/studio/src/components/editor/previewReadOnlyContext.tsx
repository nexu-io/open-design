import { useContext, useMemo, type ReactNode } from "react";
import { createStableContext } from "../../utils/hmrStableContext";

interface PreviewReadOnlyValue {
  readOnly: boolean;
  reason: string;
}

const DEFAULT_REASON = "Preview is read-only.";

// Real default (not a throwing required-provider context): most existing
// mounts render with no wrapper at all and must stay editable, exactly as today.
const PreviewReadOnlyContext = createStableContext<PreviewReadOnlyValue>("PreviewReadOnlyContext", {
  readOnly: false,
  reason: DEFAULT_REASON,
});

export function PreviewReadOnlyProvider({
  readOnly,
  reason,
  children,
}: {
  readOnly: boolean;
  reason?: string;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ readOnly, reason: reason ?? DEFAULT_REASON }), [readOnly, reason]);
  return <PreviewReadOnlyContext value={value}>{children}</PreviewReadOnlyContext>;
}

export function usePreviewReadOnly(): boolean {
  return useContext(PreviewReadOnlyContext).readOnly;
}

/** Short host-supplied text for why a hand-edit control is disabled. */
export function usePreviewReadOnlyReason(): string {
  return useContext(PreviewReadOnlyContext).reason;
}

interface ManualEditCapabilities {
  canApplyManualOffset: boolean;
  canApplyManualSize: boolean;
  canApplyManualRotation: boolean;
}

/**
 * The manual X/Y/W/H/rotation fields' disabled state: capability, or preview read-only.
 * Call unconditionally, even with no selection — `capabilities` may be null/undefined.
 */
export function useManualEditDisabledFlags(
  capabilities: ManualEditCapabilities | null | undefined,
  offset = { x: 0, y: 0 },
) {
  const { readOnly } = useContext(PreviewReadOnlyContext);
  const unreadable = !Number.isFinite(offset.x) || !Number.isFinite(offset.y);
  return {
    manualOffsetEditingDisabled: !capabilities?.canApplyManualOffset || readOnly || unreadable,
    manualSizeEditingDisabled: !capabilities?.canApplyManualSize || readOnly,
    manualRotationEditingDisabled: !capabilities?.canApplyManualRotation || readOnly,
  };
}
