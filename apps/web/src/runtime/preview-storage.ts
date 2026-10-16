/** Local preview progress only. Never exposes the host's storage namespace. */
export const PREVIEW_STORAGE_MAX_CHARS = 256 * 1024;
const PREFIX = 'od:artifact-local-storage:v1:';
export type PreviewStorageSnapshot = Record<string, string>;

export function previewStorageKey(authority: string | null, project: string, file: string): string | null {
  return authority ? PREFIX + JSON.stringify([authority, project, file]) : null;
}

export function validatePreviewStorage(value: unknown): PreviewStorageSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = Object.create(null) as PreviewStorageSnapshot;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') return null;
    result[key] = item;
  }
  return JSON.stringify(result).length <= PREVIEW_STORAGE_MAX_CHARS ? result : null;
}

export function readPreviewStorage(key: string | null): PreviewStorageSnapshot {
  if (!key) return {};
  try {
    return validatePreviewStorage(JSON.parse(window.localStorage.getItem(key) ?? '{}')) ?? {};
  } catch { return {}; }
}

export function savePreviewStorageMessage(
  event: MessageEvent,
  frameWindow: Window | null,
  generation: string,
  key: string | null,
): boolean {
  if (!key || !frameWindow || event.source !== frameWindow) return false;
  const message = event.data;
  if (message?.type !== 'od:preview-local-storage' || message.generation !== generation) return false;
  const snapshot = validatePreviewStorage(message.values);
  if (!snapshot) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(snapshot));
    return true;
  } catch { return false; }
}

/** Runs before authored scripts, after the shell receives this frame's seed. */
export function buildPreviewStorageBridge(): string {
  return `<script data-od-preview-storage>(function(){
    var seed = window.__odPreviewStorageSeed;
    try { delete window.__odPreviewStorageSeed; } catch (_) {}
    if (!seed || typeof seed.generation !== 'string' || !seed.values) return;
    var values = Object.assign(Object.create(null), seed.values);
    function commit(next){
      if (JSON.stringify(next).length > ${PREVIEW_STORAGE_MAX_CHARS}) {
        throw new DOMException('Preview storage quota exceeded', 'QuotaExceededError');
      }
      values = next;
      window.parent.postMessage({type:'od:preview-local-storage',generation:seed.generation,values:values}, '*');
    }
    var storage = {
      getItem:function(key){key=String(key);return Object.prototype.hasOwnProperty.call(values,key)?values[key]:null;},
      setItem:function(key,value){var next=Object.assign(Object.create(null),values);next[String(key)]=String(value);commit(next);},
      removeItem:function(key){var next=Object.assign(Object.create(null),values);delete next[String(key)];commit(next);},
      clear:function(){commit(Object.create(null));},
      key:function(index){return Object.keys(values)[index] || null;}
    };
    Object.defineProperty(storage,'length',{get:function(){return Object.keys(values).length;}});
    Object.defineProperty(window,'localStorage',{configurable:true,value:storage});
  })();</script>`;
}
