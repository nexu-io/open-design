import {
  PREVIEW_RUNTIME_PROTOCOL_VERSION,
  normalizePreviewRuntimeCapabilities,
  type PreviewRuntimeCapability,
  type PreviewRuntimeDocumentIdentity,
} from '@open-design/contracts/runtime/preview-runtime';

export const PREVIEW_RUNTIME_BOOTSTRAP_MARKER = 'data-od-preview-runtime';

export interface PreviewRuntimeModuleSource {
  capabilities: readonly PreviewRuntimeCapability[];
  /**
   * Trusted, product-owned JavaScript executed inside the bootstrap closure.
   * It may call `register(capability, { enable, disable })`; authored content
   * must never be passed through this field.
   */
  source: string;
}

export interface PreviewRuntimeBootstrapOptions extends PreviewRuntimeDocumentIdentity {
  availableCapabilities?: readonly PreviewRuntimeCapability[];
  modules?: readonly PreviewRuntimeModuleSource[];
}

function safeInlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</gu, '\\u003c')
    .replace(/\u2028/gu, '\\u2028')
    .replace(/\u2029/gu, '\\u2029');
}

function assertIdentity(value: string, field: string): void {
  if (!value || value.length > 200 || value.trim() !== value) {
    throw new TypeError(`${field} must be a non-empty bounded string`);
  }
}

function normalizeModuleSources(
  modules: readonly PreviewRuntimeModuleSource[],
): PreviewRuntimeModuleSource[] {
  const capabilities = new Set<PreviewRuntimeCapability>();
  const normalized: PreviewRuntimeModuleSource[] = [];
  for (const module of modules) {
    const normalizedCapabilities = normalizePreviewRuntimeCapabilities(module.capabilities);
    if (normalizedCapabilities.length !== module.capabilities.length || normalizedCapabilities.length === 0) {
      throw new TypeError('preview runtime module capabilities must be known and non-empty');
    }
    for (const capability of normalizedCapabilities) {
      if (capabilities.has(capability)) {
        throw new TypeError(`preview runtime module capability must be unique: ${capability}`);
      }
      capabilities.add(capability);
    }
    if (!module.source.trim() || /<\/script/iu.test(module.source)) {
      throw new TypeError(`preview runtime module source is invalid: ${normalizedCapabilities.join(',')}`);
    }
    normalized.push({ capabilities: normalizedCapabilities, source: module.source });
  }
  return normalized;
}

/**
 * Build the transport-independent bootstrap injected before authored startup
 * scripts. Capability modules are deliberately supplied separately: until a
 * module has URL-runtime parity, it must not appear in availableCapabilities.
 */
export function buildPreviewRuntimeBootstrap(
  options: PreviewRuntimeBootstrapOptions,
): string {
  assertIdentity(options.sessionId, 'sessionId');
  assertIdentity(options.documentVersion, 'documentVersion');
  const identity = {
    protocolVersion: PREVIEW_RUNTIME_PROTOCOL_VERSION,
    sessionId: options.sessionId,
    documentVersion: options.documentVersion,
  };
  const availableCapabilities = normalizePreviewRuntimeCapabilities(
    options.availableCapabilities ?? [],
  );
  const modules = normalizeModuleSources(options.modules ?? []);
  const moduleSources = modules.map(({ source }) =>
    `(function(){\n${source}\n})();`,
  ).join('\n');

  return `<script ${PREVIEW_RUNTIME_BOOTSTRAP_MARKER}>(function(){
var identity=${safeInlineJson(identity)};
var available=${safeInlineJson(availableCapabilities)};
var availableSet=new Set(available);
var modules=Object.create(null);
var activeSet=new Set();
var readySent=false;
function send(type,extra){parent.postMessage(Object.assign({type:type},identity,extra||{}),'*');}
function announce(){send('od:preview:hello',{availableCapabilities:available});}
function normalize(input){if(!Array.isArray(input))return [];return available.filter(function(capability){return input.indexOf(capability)!==-1&&availableSet.has(capability);});}
function register(capability,create){
  if(!availableSet.has(capability)||modules[capability])return;
  var hooks=create({identity:identity,send:send})||{};
  modules[capability]={enable:typeof hooks.enable==='function'?hooks.enable:function(){},disable:typeof hooks.disable==='function'?hooks.disable:function(){}};
}
function applyCapabilities(input){
  var requested=normalize(input);
  var requestedSet=new Set(requested);
  available.forEach(function(capability){
    var shouldEnable=requestedSet.has(capability);
    var isEnabled=activeSet.has(capability);
    if(shouldEnable===isEnabled)return;
    var hooks=modules[capability];
    try {
      if(hooks){if(shouldEnable)hooks.enable();else hooks.disable();}
      if(shouldEnable)activeSet.add(capability);else activeSet.delete(capability);
    } catch (_) {}
  });
  return available.filter(function(capability){return activeSet.has(capability);});
}
${moduleSources}
window.addEventListener('message',function(event){
  if(event.source!==parent)return;
  var data=event.data;
  if(data&&data.type==='od:preview:probe'&&data.protocolVersion===identity.protocolVersion&&data.sessionId===identity.sessionId&&data.documentVersion===identity.documentVersion){
    announce();
    if(readySent)send('od:preview:ready');
    return;
  }
  if(data&&data.type==='od:preview:presentation-state-barrier'&&data.protocolVersion===identity.protocolVersion&&data.sessionId===identity.sessionId&&data.documentVersion===identity.documentVersion&&Number.isSafeInteger(data.revision)&&data.revision>0){
    // Host messages sent to this window are dispatched in order. Reaching the
    // barrier proves the preceding Deck/edit/comment/scroll state messages
    // have run; it says nothing about whether authored content looks valid.
    send('od:preview:presentation-state-applied',{revision:data.revision});
    return;
  }
  if(!data||data.type!=='od:preview:set-capabilities'||data.protocolVersion!==identity.protocolVersion||data.sessionId!==identity.sessionId||data.documentVersion!==identity.documentVersion)return;
  send('od:preview:capabilities-applied',{enabledCapabilities:applyCapabilities(data.enabledCapabilities)});
});
announce();
function ready(){
  readySent=true;
  send('od:preview:ready');
}
if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',ready,{once:true});else queueMicrotask(ready);
})();</script>`;
}
