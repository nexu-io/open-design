import { liveArtifactTabId, type AgentEvent } from '../types';

/** Only daemon registration/refresh events establish a delivered live artifact. */
export function liveArtifactDeliveries(events: readonly AgentEvent[] = []) {
  const artifacts = new Map<string, { id: string; title: string; tabId: string }>();
  for (const event of events) {
    if (event.kind === 'live_artifact') {
      if (event.action === 'deleted') artifacts.delete(event.artifactId);
      else artifacts.set(event.artifactId, { id: event.artifactId, title: event.title ?? '', tabId: liveArtifactTabId(event.artifactId) });
    } else if (event.kind === 'live_artifact_refresh' && event.phase === 'succeeded') {
      artifacts.set(event.artifactId, { id: event.artifactId, title: event.title ?? artifacts.get(event.artifactId)?.title ?? '', tabId: liveArtifactTabId(event.artifactId) });
    }
  }
  return [...artifacts.values()];
}

/** template.html is the live input, not the daemon-rendered result. Source stays
 * available in Design Files; independent HTML outputs remain in the turn. */
export function withLiveArtifactDeliveries(
  selection: { open: readonly string[]; focused: string | null },
  events: readonly AgentEvent[] = [],
): { open: string[]; focused: string | null } {
  const live = liveArtifactDeliveries(events);
  if (!live.length) return { open: [...selection.open], focused: selection.focused };
  const files = selection.open.filter(name => name !== 'template.html');
  return {
    open: [...new Set([...files, ...live.map(item => item.tabId)])],
    focused: selection.focused && selection.focused !== 'template.html' ? selection.focused : live.at(-1)!.tabId,
  };
}
