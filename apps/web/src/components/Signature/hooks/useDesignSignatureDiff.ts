import { useEffect, useMemo, useRef, useState } from 'react';
import {
  computeDesignSignatureFromText,
  diffDesignSignatures,
  type DesignSignature,
  type DesignSignatureDiff,
} from '@open-design/contracts/design-signature';

/**
 * Thin consumer of the #4358 engine (now in contracts). Computes the current
 * artifact's signature in-browser and diffs it against the previous signature
 * for the same artifact id. "Previous" is session-local (a ref keyed by id);
 * persistent cross-reload history is future work tracked by #1241.
 */
export function useDesignSignatureDiff(
  artifactHtml: string | null | undefined,
  artifactId: string,
): { signature: DesignSignature | null; diff: DesignSignatureDiff | null } {
  const signature = useMemo<DesignSignature | null>(
    () => (artifactHtml ? computeDesignSignatureFromText(artifactHtml) : null),
    [artifactHtml],
  );
  const prevByIdRef = useRef<Map<string, DesignSignature>>(new Map());
  const [diff, setDiff] = useState<DesignSignatureDiff | null>(null);

  useEffect(() => {
    if (!signature) {
      setDiff(null);
      return;
    }
    const prev = prevByIdRef.current.get(artifactId);
    setDiff(prev ? diffDesignSignatures(prev, signature) : null);
    prevByIdRef.current.set(artifactId, signature);
  }, [signature, artifactId]);

  return { signature, diff };
}
