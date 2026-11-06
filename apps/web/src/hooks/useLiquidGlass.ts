// React binding for the SDF liquid-glass refraction (lib/liquid-glass.ts).
//
// Returns a CALLBACK REF rather than wiring an effect: refraction targets
// like the account menu are conditionally mounted, and a callback ref
// applies/destroys the filter exactly at mount/unmount without needing the
// host component to track open state for us.
//
// Gating: on browsers without `backdrop-filter: url()` (Safari/Firefox) or
// when the user prefers reduced transparency, the filter is never applied —
// the element simply stays in its `.od-glass-refract` base state, which is
// the plain frosted fallback defined in styles/material.css.

import { useCallback, useEffect, useRef } from 'react';
import {
  applyLiquidGlass,
  supportsSdfRefraction,
  type LiquidGlassHandle,
  type LiquidGlassOptions,
} from '../lib/liquid-glass';

// The SDF marker is a data attribute rather than a class on purpose: hosts
// often render dynamic className templates, and a React re-render rewrites
// className wholesale — wiping any class added imperatively. Attributes not
// present in JSX survive re-renders.
const SDF_ATTR = 'data-od-glass-sdf';
const REDUCED_TRANSPARENCY_QUERY = '(prefers-reduced-transparency: reduce)';

export interface UseLiquidGlassOptions extends LiquidGlassOptions {
  /** Allows callers to switch the effect off without unmounting. */
  enabled?: boolean;
}

export function useLiquidGlass<T extends HTMLElement>(
  options: UseLiquidGlassOptions = {},
): (node: T | null) => void {
  const { enabled = true, reach, strength } = options;
  const handleRef = useRef<LiquidGlassHandle | null>(null);
  const nodeRef = useRef<T | null>(null);

  const detach = useCallback(() => {
    handleRef.current?.destroy();
    handleRef.current = null;
    nodeRef.current?.removeAttribute(SDF_ATTR);
  }, []);

  const attach = useCallback(() => {
    const node = nodeRef.current;
    if (!node || handleRef.current) return;
    if (!enabled || !supportsSdfRefraction()) return;
    // supportsSdfRefraction() guarantees matchMedia exists past this point.
    if (window.matchMedia(REDUCED_TRANSPARENCY_QUERY).matches) return;
    handleRef.current = applyLiquidGlass(node, { reach, strength });
    node.setAttribute(SDF_ATTR, '');
  }, [enabled, reach, strength]);

  // Live gate: turning "reduce transparency" on tears the filter down at
  // once; turning it off restores refraction on the mounted element.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(REDUCED_TRANSPARENCY_QUERY);
    const onChange = () => {
      detach();
      attach();
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [attach, detach]);

  return useCallback(
    (node: T | null) => {
      if (node === nodeRef.current) return;
      detach();
      nodeRef.current = node;
      if (node) attach();
    },
    [attach, detach],
  );
}
