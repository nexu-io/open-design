import { editsPlainCss } from "../../hooks/gsapRuntimeKeyframes";
import type { DomEditSelection } from "./domEditingTypes";
import { readStudioBoxSize } from "./manualEdits";
import { readMoveOffset, UNREADABLE_TRANSLATE } from "./plainTranslate";
import { parsePxMetricValue, type PropertyPanelProps } from "./propertyPanelHelpers";

interface TransformCommitDeps {
  element: DomEditSelection;
  styles: Record<string, string>;
  hasGsapAnimation: boolean;
  gsapAnimId: string | null;
  gsapKeyframes: unknown;
  currentPct: number;
  onCommitAnimatedProperty: PropertyPanelProps["onCommitAnimatedProperty"];
  onAddKeyframe: PropertyPanelProps["onAddKeyframe"];
  onSetManualOffset: PropertyPanelProps["onSetManualOffset"];
  onSetManualSize: PropertyPanelProps["onSetManualSize"];
  onSetManualRotation: PropertyPanelProps["onSetManualRotation"];
  showToast?: (message: string, tone?: "error" | "info") => void;
}

/**
 * Build the X/Y, W/H and rotation field commit handlers for the property panel.
 * Each handler routes the value into the GSAP animation when the element is
 * animated (matching the drag gesture and keyframe buttons), and otherwise
 * falls through to the manual transform setter.
 */
// fallow-ignore-next-line unit-size
export function createTransformCommitHandlers({
  element,
  styles,
  hasGsapAnimation,
  gsapAnimId,
  gsapKeyframes,
  currentPct,
  onCommitAnimatedProperty,
  onAddKeyframe,
  onSetManualOffset,
  onSetManualSize,
  onSetManualRotation,
  showToast,
}: TransformCommitDeps) {
  // Route a transform value into the GSAP animation (or a new keyframe) when the
  // element is animated. Returns true when handled, so callers fall through to
  // the manual-transform path only for non-animated elements.
  const commitAnimatedTransformValue = async (
    property: string,
    value: number,
    noCallbacksMessage: string,
  ): Promise<boolean> => {
    if (onCommitAnimatedProperty && hasGsapAnimation) {
      await onCommitAnimatedProperty(element, property, value);
      return true;
    }
    if (gsapKeyframes && gsapAnimId && onAddKeyframe) {
      const pct = Math.max(0, Math.min(100, Math.round(currentPct * 10) / 10));
      onAddKeyframe(gsapAnimId, pct, property, value);
      return true;
    }
    if (hasGsapAnimation) {
      showToast?.(noCallbacksMessage);
      return true;
    }
    return false;
  };

  const commitManualOffset = async (axis: "x" | "y", nextValue: string) => {
    const parsed = parsePxMetricValue(nextValue);
    if (parsed == null) return;
    if (
      await commitAnimatedTransformValue(
        axis,
        parsed,
        "This element's position can't be edited here yet: its animation drives it",
      )
    )
      return;
    const plainTranslate = editsPlainCss(element.element, "move");
    const current = readMoveOffset(element.element, plainTranslate);
    if (!Number.isFinite(current.x) || !Number.isFinite(current.y))
      return void showToast?.(UNREADABLE_TRANSLATE);
    await Promise.resolve(
      onSetManualOffset(
        element,
        { x: axis === "x" ? parsed : current.x, y: axis === "y" ? parsed : current.y },
        { plainTranslate },
      ),
    );
  };

  // fallow-ignore-next-line complexity
  const commitManualSize = async (axis: "width" | "height", nextValue: string) => {
    const parsed = parsePxMetricValue(nextValue);
    if (parsed == null || parsed <= 0) return;
    if (onCommitAnimatedProperty && hasGsapAnimation) {
      await onCommitAnimatedProperty(element, axis, parsed);
      return;
    }
    if (hasGsapAnimation) {
      showToast?.("This element's size can't be edited here yet: its animation drives it");
      return;
    }
    const current = readStudioBoxSize(element.element);
    const width =
      current.width > 0
        ? current.width
        : (parsePxMetricValue(styles.width ?? "") ?? element.boundingBox.width);
    const height =
      current.height > 0
        ? current.height
        : (parsePxMetricValue(styles.height ?? "") ?? element.boundingBox.height);
    await Promise.resolve(
      onSetManualSize(element, {
        width: axis === "width" ? parsed : width,
        height: axis === "height" ? parsed : height,
      }),
    );
  };

  const commitManualRotation = async (nextValue: string) => {
    const parsed = Number.parseFloat(nextValue);
    if (!Number.isFinite(parsed)) return;
    if (
      await commitAnimatedTransformValue(
        "rotation",
        parsed,
        "This element's rotation can't be edited here yet: its animation drives it",
      )
    )
      return;
    await Promise.resolve(onSetManualRotation(element, { angle: parsed }));
  };

  return { commitManualOffset, commitManualSize, commitManualRotation };
}
