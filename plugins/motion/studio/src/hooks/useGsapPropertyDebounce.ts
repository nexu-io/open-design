import { useCallback, useEffect, useRef } from "react";
import type { Composition } from "@hyperframes/sdk";
import { parseGsapScriptAcorn } from "@hyperframes/core/gsap-parser-acorn";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import {
  sdkGsapTweenPersist,
  sdkGsapRemovePropertyPersist,
  cutoverCommittedOrThrow,
  type CutoverDeps,
} from "../utils/sdkCutover";
import { extractGsapScriptText } from "../utils/gsapSoftReload";
import { PROPERTY_DEFAULTS } from "./gsapScriptCommitHelpers";
import type { SafeGsapCommitMutation } from "./gsapScriptCommitTypes";

const DEBOUNCE_MS = 150;

/**
 * The SDK `setGsapTween` 'set' path REPLACES a tween's editable property set
 * (engine `handleSetGsapTween` → `updateAnimationInScript`), so sending only the
 * single edited key would silently drop the tween's other animated props. Mirror
 * the legacy server path (`{ ...anim.properties, [property]: val }`): read the
 * tween's CURRENT properties from the in-memory SDK doc and merge the one edit in,
 * so REPLACE semantics preserve siblings. Returns the single-key map unchanged
 * when the tween/script can't be found (best-effort; before===after then falls
 * back to the server path).
 */
export function mergeTweenProperties(
  sdkSession: Composition,
  animationId: string,
  edited: Record<string, number | string>,
  kind: "to" | "from",
): Record<string, number | string> {
  try {
    const script = extractGsapScriptText(sdkSession.serialize());
    if (!script) return { ...edited };
    const anim = parseGsapScriptAcorn(script).animations.find((a) => a.id === animationId);
    if (!anim) return { ...edited };
    const existing = kind === "from" ? (anim.fromProperties ?? {}) : anim.properties;
    return { ...existing, ...edited };
  } catch {
    return { ...edited };
  }
}

interface SdkPropertyDeps {
  sdkSession?: Composition | null;
  sdkDeps?: CutoverDeps | null;
  activeCompPath?: string | null;
  onFlushError?: (
    error: unknown,
    selection: DomEditSelection,
    mutation: Record<string, unknown>,
    label: string,
  ) => void;
}

export function useGsapPropertyDebounce(
  commitMutationSafely: SafeGsapCommitMutation,
  sdk?: SdkPropertyDeps,
) {
  const pendingPropertyEditRef = useRef<{
    selection: DomEditSelection;
    animationId: string;
    property: string;
    value: number | string;
  } | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The caller passes `sdk` as a fresh object literal every render. Keying any
  // callback's deps on it (esp. flushPendingPropertyEdit, whose identity drives
  // the unmount-flush cleanup effect) re-fires the cleanup on EVERY parent
  // re-render — so a playhead tick mid-slider-drag would flush + record an undo
  // entry per render. Hold the latest value in a ref instead so every callback
  // reads current deps without re-subscribing on identity churn.
  const sdkRef = useRef(sdk);
  sdkRef.current = sdk;

  // fallow-ignore-next-line complexity
  const flushPendingPropertyEdit = useCallback(async () => {
    const pending = pendingPropertyEditRef.current;
    if (!pending) return;
    pendingPropertyEditRef.current = null;
    const { selection, animationId, property, value } = pending;
    const mutation = { type: "update-property", animationId, property, value };
    const label = `Edit GSAP ${property}`;
    try {
      // fallow-ignore-next-line code-duplication
      const { sdkSession, sdkDeps, activeCompPath } = sdkRef.current ?? {};
      if (sdkSession && sdkDeps) {
        const targetPath = selection.sourceFile || activeCompPath || "index.html";
        const handled = await sdkGsapTweenPersist(
          targetPath,
          {
            kind: "set",
            animationId,
            properties: {
              properties: mergeTweenProperties(
                sdkSession,
                animationId,
                { [property]: value },
                "to",
              ),
            },
          },
          sdkSession,
          sdkDeps,
          { label, coalesceKey: `gsap:${animationId}:${property}` },
        );
        if (cutoverCommittedOrThrow(handled)) return;
      }
      await commitMutationSafely(selection, mutation, {
        label,
        coalesceKey: `gsap:${animationId}:${property}`,
        softReload: true,
      });
    } catch (error) {
      sdkRef.current?.onFlushError?.(error, selection, mutation, label);
    }
  }, [commitMutationSafely]);

  const updateGsapProperty = useCallback(
    (
      selection: DomEditSelection,
      animationId: string,
      property: string,
      value: number | string,
    ) => {
      pendingPropertyEditRef.current = { selection, animationId, property, value };
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        void flushPendingPropertyEdit();
      }, DEBOUNCE_MS);
    },
    [flushPendingPropertyEdit],
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      void flushPendingPropertyEdit();
    };
  }, [flushPendingPropertyEdit]);

  // fallow-ignore-next-line complexity
  const addGsapProperty = useCallback(
    // fallow-ignore-next-line complexity
    async (selection: DomEditSelection, animationId: string, property: string) => {
      let defaultValue = PROPERTY_DEFAULTS[property] ?? 0;
      const el = selection.element;
      if (property === "width" || property === "height") {
        const rect = el.getBoundingClientRect();
        defaultValue = Math.round(property === "width" ? rect.width : rect.height);
      } else if (property === "opacity" || property === "autoAlpha") {
        const cs = el.ownerDocument.defaultView?.getComputedStyle(el);
        // Use `|| 1` only as a non-finite fallback, not a falsy fallback: an
        // element currently at opacity 0 must seed 0, not 1.
        const current = cs ? Number.parseFloat(cs.opacity) : Number.NaN;
        defaultValue = Number.isFinite(current) ? current : 1;
      }
      const { sdkSession, sdkDeps, activeCompPath } = sdkRef.current ?? {};
      if (sdkSession && sdkDeps) {
        const targetPath = selection.sourceFile || activeCompPath || "index.html";
        const handled = await sdkGsapTweenPersist(
          targetPath,
          {
            kind: "set",
            animationId,
            properties: {
              properties: mergeTweenProperties(
                sdkSession,
                animationId,
                { [property]: defaultValue },
                "to",
              ),
            },
          },
          sdkSession,
          sdkDeps,
          { label: `Add GSAP ${property}` },
        );
        if (cutoverCommittedOrThrow(handled)) return;
      }
      commitMutationSafely(
        selection,
        { type: "add-property", animationId, property, defaultValue },
        { label: `Add GSAP ${property}` },
      );
    },
    [commitMutationSafely],
  );

  const removeProperty = useCallback(
    async (selection: DomEditSelection, animationId: string, property: string, from: boolean) => {
      const { sdkSession, sdkDeps, activeCompPath } = sdkRef.current ?? {};
      if (sdkSession && sdkDeps) {
        const targetPath = selection.sourceFile || activeCompPath || "index.html";
        const handled = await sdkGsapRemovePropertyPersist(
          targetPath,
          animationId,
          property,
          from,
          sdkSession,
          sdkDeps,
          { label: `Remove GSAP ${from ? `from-${property}` : property}` },
        );
        if (cutoverCommittedOrThrow(handled)) return;
      }
      if (from) {
        commitMutationSafely(
          selection,
          { type: "remove-from-property", animationId, property },
          {
            label: `Remove GSAP from-${property}`,
          },
        );
      } else {
        commitMutationSafely(
          selection,
          { type: "remove-property", animationId, property },
          {
            label: `Remove GSAP ${property}`,
          },
        );
      }
    },
    [commitMutationSafely],
  );

  const removeGsapProperty = useCallback(
    (selection: DomEditSelection, animationId: string, property: string) =>
      removeProperty(selection, animationId, property, false),
    [removeProperty],
  );

  const updateGsapFromProperty = useCallback(
    async (
      selection: DomEditSelection,
      animationId: string,
      property: string,
      value: number | string,
    ) => {
      const { sdkSession, sdkDeps, activeCompPath } = sdkRef.current ?? {};
      if (sdkSession && sdkDeps) {
        const targetPath = selection.sourceFile || activeCompPath || "index.html";
        const handled = await sdkGsapTweenPersist(
          targetPath,
          {
            kind: "set",
            animationId,
            properties: {
              fromProperties: mergeTweenProperties(
                sdkSession,
                animationId,
                { [property]: value },
                "from",
              ),
            },
          },
          sdkSession,
          sdkDeps,
          {
            label: `Edit GSAP from-${property}`,
            coalesceKey: `gsap:${animationId}:from:${property}`,
          },
        );
        if (cutoverCommittedOrThrow(handled)) return;
      }
      commitMutationSafely(
        selection,
        { type: "update-from-property", animationId, property, value },
        {
          label: `Edit GSAP from-${property}`,
          coalesceKey: `gsap:${animationId}:from:${property}`,
        },
      );
    },
    [commitMutationSafely],
  );

  const addGsapFromProperty = useCallback(
    async (selection: DomEditSelection, animationId: string, property: string) => {
      const defaultValue = PROPERTY_DEFAULTS[property] ?? 0;
      const { sdkSession, sdkDeps, activeCompPath } = sdkRef.current ?? {};
      if (sdkSession && sdkDeps) {
        const targetPath = selection.sourceFile || activeCompPath || "index.html";
        const handled = await sdkGsapTweenPersist(
          targetPath,
          {
            kind: "set",
            animationId,
            properties: {
              fromProperties: mergeTweenProperties(
                sdkSession,
                animationId,
                { [property]: defaultValue },
                "from",
              ),
            },
          },
          sdkSession,
          sdkDeps,
          { label: `Add GSAP from-${property}` },
        );
        if (cutoverCommittedOrThrow(handled)) return;
      }
      commitMutationSafely(
        selection,
        { type: "add-from-property", animationId, property, defaultValue },
        { label: `Add GSAP from-${property}` },
      );
    },
    [commitMutationSafely],
  );

  const removeGsapFromProperty = useCallback(
    (selection: DomEditSelection, animationId: string, property: string) =>
      removeProperty(selection, animationId, property, true),
    [removeProperty],
  );

  return {
    updateGsapProperty,
    addGsapProperty,
    removeGsapProperty,
    updateGsapFromProperty,
    addGsapFromProperty,
    removeGsapFromProperty,
  };
}
