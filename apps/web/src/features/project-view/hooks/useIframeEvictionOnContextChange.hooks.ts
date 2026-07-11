// Feature-local hook for the prompt-context-signature/iframe-eviction
// cluster: derives a stable signature of the project's active skill +
// design-system prompt context, and evicts the project's cached preview
// iframe (`IframeKeepAlivePool`) whenever that signature changes — so a
// stale-context iframe isn't reused after the user swaps the active skill or
// design system. No transport; reads only the props/derived values passed in.
import { useEffect, useMemo, useRef } from 'react';
import type { DesignSystemSummary, SkillSummary } from '../../../types';
import type { useIframeKeepAlivePool } from '../../../components/IframeKeepAlivePool';
import { promptContextSignature } from '../rules';

export function useIframeEvictionOnContextChange(
  projectId: string,
  skillId: string | null | undefined,
  skills: SkillSummary[],
  designTemplates: SkillSummary[],
  designSystems: DesignSystemSummary[],
  designSystemId: string | null | undefined,
  iframeKeepAlivePool: ReturnType<typeof useIframeKeepAlivePool>,
): void {
  const activePromptContextSignature = useMemo(
    () => promptContextSignature(skillId, skills, designTemplates, designSystems, designSystemId),
    [skillId, skills, designTemplates, designSystems, designSystemId],
  );
  const previousPromptContextSignatureRef = useRef(activePromptContextSignature);
  useEffect(() => {
    if (previousPromptContextSignatureRef.current === activePromptContextSignature) return;
    previousPromptContextSignatureRef.current = activePromptContextSignature;
    iframeKeepAlivePool.evictProject(projectId, { includeActive: true });
  }, [activePromptContextSignature, iframeKeepAlivePool, projectId]);
}
