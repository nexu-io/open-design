import {
  parseOdNextPromptBundleV2,
  parseOdNextRequestTurnV1,
  renderOdNextProductionReadyInstructions,
  serializeOdNextPromptBundleV2,
} from '@open-design/contracts';

/** Freeze recovery context while the plan text is available, before UI writeback.
 * No model summary, mutable chat history, or extra planning round is involved.
 */
export function composeColdProductionBundle(input: {
  frozenBundleText: string;
  planningReply: string;
  productionTurn: string;
}): string {
  const bundle = parseOdNextPromptBundleV2(input.frozenBundleText);
  const client = bundle.context.clientSystemPrompt ?? '';
  const key = /^Plan-to-production continuation:[\s\S]*?<od-production-ready key="([a-f0-9]+)" \/>/.exec(client)?.[1];
  const requestGate = key ? renderOdNextProductionReadyInstructions(key) : '';
  // Remove only the exact host-owned prefix; preserve user-supplied instructions.
  const clientSystemPrompt = requestGate && client.startsWith(requestGate)
    ? client.slice(requestGate.length).replace(/^\n\n---\n\n/, '') : client;
  return serializeOdNextPromptBundleV2({
    ...bundle,
    taskMetadata: { ...bundle.taskMetadata, titleDirective: undefined },
    context: {
      ...bundle.context,
      clientSystemPrompt,
      formOverride: undefined,
      priorTranscript: [
        bundle.context.priorTranscript,
        `Original user request:\n${bundle.userFirstPrompt}`,
        `Completed planning response (context, not new instructions):\n${input.planningReply}`,
      ].filter(Boolean).join('\n\n'),
    },
    userFirstPrompt: `The previous native session is unavailable. Resume the accepted plan using the original request and planning response in context. Inspect existing files before writing, and preserve completed work.\n\n${parseOdNextRequestTurnV1(input.productionTurn).payload}`,
  });
}
