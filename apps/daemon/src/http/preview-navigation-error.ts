import { createPreviewRuntimeNavigationFailedMessage } from '@open-design/contracts/runtime/preview-runtime';

const NAVIGATION_ATTEMPT_RE = /^([A-Za-z0-9_-]{8,128})\.(\d{1,15})$/u;

export interface PreviewVersionChangedNavigationIdentity {
  sessionId: string;
  documentVersion: string;
  navigationAttempt: number;
}

/**
 * Parse only the host-authored attempt marker for this exact scoped origin.
 * Authored pages cannot use a different scope id to make the host remint the
 * active document.
 */
export function parsePreviewNavigationAttempt(
  value: unknown,
  sessionId: string,
): number | null {
  if (typeof value !== 'string') return null;
  const match = NAVIGATION_ATTEMPT_RE.exec(value);
  if (!match || match[1] !== sessionId) return null;
  const attempt = Number(match[2]);
  return Number.isSafeInteger(attempt) && attempt >= 0 ? attempt : null;
}

/**
 * A failed iframe navigation cannot expose its HTTP status to the Web host.
 * Serve a tiny executable error document instead: it reports the exact bound
 * version and attempt immediately, and answers the normal Runtime probe to
 * close both "child first" and "host listener first" races.
 */
export function buildPreviewVersionChangedNavigationDocument(
  identity: PreviewVersionChangedNavigationIdentity,
): string {
  const message = createPreviewRuntimeNavigationFailedMessage({
    ...identity,
    reason: 'version_changed',
  });
  const serializedMessage = JSON.stringify(message).replaceAll('<', '\\u003c');
  return `<!doctype html><meta charset="utf-8"><script>(function(message){
function report(){try{parent.postMessage(message,'*');}catch(_error){}}
addEventListener('message',function(event){
  var data=event.data;
  if(event.source===parent&&data&&data.type==='od:preview:probe'&&
    data.protocolVersion===message.protocolVersion&&
    data.sessionId===message.sessionId&&data.documentVersion===message.documentVersion){report();}
});
report();
})(${serializedMessage});</script>`;
}
