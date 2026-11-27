import { runModelId } from '@open-design/contracts';
import type { ChatMessage } from '../../types';

export function modelProvenance(events: ChatMessage['events'] = []) {
  let agentId: string | undefined;
  let requested: string | undefined;
  let dispatched: string | undefined;
  let reported: string | undefined;

  for (const event of events) {
    if (event.kind !== 'status') continue;
    if (event.label === 'starting') {
      agentId = event.agentId;
      requested = event.requestedModel;
      dispatched = event.dispatchedModel;
      reported = undefined;
    } else if (event.label === 'model_fallback' && event.dispatchedModel) {
      if (dispatched !== event.dispatchedModel) reported = undefined;
      dispatched = event.dispatchedModel;
    } else if (event.label === 'provider_model') {
      reported = runModelId(event.detail);
    }
  }
  return { agentId, requested, dispatched, reported };
}
