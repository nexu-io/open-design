import type { AppliedPluginSnapshot, ChatSessionMode } from '@open-design/contracts';

/**
 * An applied snapshot carries `strategy` only when the daemon bound an internal
 * strategy package to the turn — `AppliedPluginSnapshotSchema.strategy` stays
 * unset for every ordinary plugin apply. The user never picked that package, so
 * its title and version are implementation detail rather than context they
 * attached to the message, and the chat must not surface either.
 */
export function isInternalStrategySnapshot(
  snapshot: Pick<AppliedPluginSnapshot, 'strategy'> | null | undefined,
): boolean {
  return Boolean(snapshot?.strategy);
}

/**
 * The session-mode chip labels a turn the user steered away from the default.
 * `Ask` and `Plan` are those opt-outs, so they stay labelled everywhere.
 * `Design` is the default every design project already runs in: labelling it
 * restates the default above every single prompt.
 *
 * It also cannot be resolved in time on the OD Next path. The daemon binds the
 * strategy to the turn only after the optimistic user message is on screen, so
 * a rule that asked "is this turn strategy-owned?" would show the chip, then
 * drop it a beat later when the snapshot lands — the flicker acceptance caught.
 * Keying on the mode alone is decided the moment the message renders.
 */
export function shouldShowSessionModeChip(
  sessionMode: ChatSessionMode | undefined,
): boolean {
  return Boolean(sessionMode) && sessionMode !== 'design';
}
