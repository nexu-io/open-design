// Transport adapters for the connector-memory flow: discovering connectors and
// asking the daemon to suggest memories from the selected connected apps.
import type {
  ConnectorDetail,
  ConnectorDiscoveryResponse,
  ConnectorMemorySuggestionResponse,
} from '@open-design/contracts';

import { fetchConnectorDiscoveryResponse } from '../registry';
import { requiredField } from './response-fields';

export async function fetchMemoryConnectors(): Promise<ConnectorDetail[]> {
  const resp = await fetchConnectorDiscoveryResponse('?hydrateTools=false');
  if (!resp.ok) {
    throw new Error(`Connector discovery request failed (${resp.status})`);
  }
  const json = (await resp.json()) as ConnectorDiscoveryResponse;
  return requiredField(json, 'connectors', 'Connector discovery request');
}

export async function suggestConnectorMemories(
  connectorIds: string[],
  context: { chatAgentId?: string | null; chatModel?: string | null } = {},
): Promise<ConnectorMemorySuggestionResponse | null> {
  const body: {
    connectorIds: string[];
    chatAgentId?: string;
    chatModel?: string;
  } = { connectorIds };
  if (context.chatAgentId) body.chatAgentId = context.chatAgentId;
  if (context.chatModel) body.chatModel = context.chatModel;
  const resp = await fetch('/api/memory/connectors/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) return null;
  const json = (await resp.json()) as ConnectorMemorySuggestionResponse;
  // A successful scan always has all four fields. Do not let a malformed 2xx
  // become a plausible empty scan; callers need an explicit failure instead.
  return {
    suggestions: requiredField(json, 'suggestions', 'Connector memory suggestion request'),
    attemptedLLM: requiredField(json, 'attemptedLLM', 'Connector memory suggestion request'),
    connectors: requiredField(json, 'connectors', 'Connector memory suggestion request'),
    contextBytes: requiredField(json, 'contextBytes', 'Connector memory suggestion request'),
  };
}
