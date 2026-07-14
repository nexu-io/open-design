// Feature-local hook for the `/`-command popover: the open/query state, the
// active-index for keyboard nav, and the catalogue of available slash
// commands (external MCP servers + `/search` when research is available).
// Pure UI state - no port, no transport. The catalogue depends on values the
// orchestrator owns (research availability, i18n, the MCP catalogue), so
// they're taken as hook inputs rather than closed over.
//
// Picking a command still needs the Lexical editor ref, which is shared
// across every popover/cluster and stays orchestrator-owned — so `pickSlash`
// itself lives in actions.ts (deps-bag), not here; this hook only exposes
// the state that action needs.
import { useMemo, useState } from 'react';
import type { McpServerConfig } from '@open-design/contracts';
import type { SlashCommand, TranslateFn } from '../types';

export interface SlashPopoverParams {
  researchAvailable?: boolean;
  t: TranslateFn;
  // Raw MCP server list (filtered to enabled internally) rather than an
  // orchestrator-memoized `enabledMcpServers`, so this hook can be called
  // early in the orchestrator's render — before the state that memo is
  // itself derived from other clusters' data is available.
  mcpServers: McpServerConfig[];
  onOpenMcpSettings?: () => void;
}

export interface SlashPopoverController {
  slash: { q: string } | null;
  setSlash: (value: { q: string } | null) => void;
  slashIndex: number;
  setSlashIndex: React.Dispatch<React.SetStateAction<number>>;
  slashCommands: SlashCommand[];
  filteredSlash: SlashCommand[];
}

export function useSlashPopover({
  researchAvailable,
  t,
  mcpServers,
  onOpenMcpSettings,
}: SlashPopoverParams): SlashPopoverController {
  const [slash, setSlash] = useState<{ q: string } | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);

  const enabledMcpServers = useMemo(
    () => mcpServers.filter((s) => s.enabled),
    [mcpServers],
  );

  // Catalog of supported slash commands. Each entry shows up in the popover
  // when the user types `/` in the composer. The `insert` value is what we
  // drop into the draft when the user picks the entry — usually the
  // canonical command form with a trailing space ready for an argument.
  const slashCommands = useMemo<SlashCommand[]>(() => {
    const list: SlashCommand[] = [];
    // External MCP servers — `/mcp` opens settings, `/mcp <id>` inserts a
    // prompt-side hint nudging the model to use that server's tools. The
    // hint flows through to the agent verbatim; the daemon already wired the
    // MCP config into the agent's launch so the tools are callable.
    if (onOpenMcpSettings) {
      list.push({
        id: 'mcp',
        label: '/mcp',
        insert: '/mcp ',
        descKey: 'pet.slashPet',
        icon: 'sliders',
        argHint: 'open settings · <server-id> to insert hint',
      });
    }
    for (const s of enabledMcpServers) {
      list.push({
        id: `mcp-${s.id}`,
        label: `/mcp ${s.id}`,
        insert: `Use the \`${s.id}\` MCP server tools. `,
        descKey: 'pet.slashPet',
        icon: 'sparkles',
        argHint: s.label || s.transport,
      });
    }
    if (researchAvailable) {
      list.push({
        id: 'search',
        label: '/search',
        insert: '/search ',
        descKey: 'pet.slashSearch',
        icon: 'sparkles',
        argHint: t('pet.slashSearchArg'),
      });
    }
    return list;
  }, [researchAvailable, t, enabledMcpServers, onOpenMcpSettings]);

  const filteredSlash = useMemo(() => {
    if (!slash) return [] as SlashCommand[];
    const q = slash.q.toLowerCase();
    if (!q) return slashCommands;
    return slashCommands.filter((c) => c.label.toLowerCase().includes(q));
  }, [slash, slashCommands]);

  return { slash, setSlash, slashIndex, setSlashIndex, slashCommands, filteredSlash };
}
