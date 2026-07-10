// Public API of the MCP client slice. The orchestrator (`McpClientSection`,
// which lives outside the slice) imports ONLY from here — never from the
// slice's internal files. Barrels mark boundaries: this is the slice boundary,
// and `scripts/check-web-slice-boundaries.ts` fails any outside-in deep import
// that reaches past it (ADR 0002).

// UI types the orchestrator's props/handle are built from.
export type {
  DraftRow,
  McpClientSectionProps,
  McpClientSectionHandle,
  McpClientSurface,
} from './types';

// Hooks (with their controller/options types) the orchestrator wires.
export {
  useWiredMcpServers,
  type McpServersController,
  type UseMcpServersOptions,
} from './hooks/useMcpServers.hooks';
export { useWiredMcpAgents } from './hooks/useMcpAgents.hooks';

// Dumb components the orchestrator composes.
export { McpAgentSupportBanner } from './components/McpAgentSupportBanner';
export { McpPickerPanel } from './components/McpPickerPanel';
export { McpServerRow } from './components/McpServerRow';
