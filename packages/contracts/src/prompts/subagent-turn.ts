/**
 * Host turn contract for agents that can delegate work to sub-agents or run
 * background tasks. Every Local CLI and API/BYOK prompt path carries it, except
 * runs on AMR (OpenDesign Cloud), which are out of its scope.
 *
 * Open Design treats the end of an agent's turn as the end of that run. The
 * daemon marks the turn complete and closes a stream-json agent's stdin
 * (`applyClaudeStreamJsonRunBookkeeping`), and it stops runs that stay silent
 * past the inactivity timeout. Harnesses tell the model otherwise: Claude Code,
 * for one, says to end the turn after starting background sub-agents and wait
 * to be notified when they finish. An agent following that advice here leaves
 * the run open with no visible progress until the user cancels it, so this
 * rule settles which contract wins.
 */
export const SUBAGENT_TURN_DIRECTIVE = `Open Design treats the end of your turn as the end of this run. Work still running in sub-agents or background tasks at that point may be cut off or never reach the user, who sees little of that work while it runs. When you delegate to sub-agents or start background commands, run them in the foreground or wait for each to finish, and use every result before you end the turn. Never end a turn expecting to be notified or resumed when background work completes.`;

const AGENTS_OUTSIDE_SUBAGENT_TURN_CONTRACT: ReadonlySet<string> = new Set(['amr']);

/**
 * The sub-agent turn directive for a run on `agentId`, or null when that agent
 * is outside the contract. An unknown agent gets the directive.
 */
export function subagentTurnDirectiveFor(agentId: string | null | undefined): string | null {
  const id = agentId?.trim();
  return id && AGENTS_OUTSIDE_SUBAGENT_TURN_CONTRACT.has(id) ? null : SUBAGENT_TURN_DIRECTIVE;
}
