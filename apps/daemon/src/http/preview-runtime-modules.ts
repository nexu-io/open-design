import type { PreviewRuntimeCapability } from '@open-design/contracts/runtime/preview-runtime';
import {
  buildDeckStageFallbackScript,
  htmlUsesDeckStageElement,
} from '@open-design/contracts/runtime/deck-stage-fallback';
import {
  buildDeckBridgeAssets,
  buildDeckKeydownRegistryHook,
  detectArtifactKeyboardNavigation,
  type DeckBridgeOptions,
} from '@open-design/preview-runtime/srcdoc';
import {
  buildManualEditBridge,
  buildManualEditBridgeStyle,
  buildManualEditKeyboardGuard,
} from '@open-design/preview-runtime/manual-edit';
import type { PreviewRuntimeModuleSource } from './preview-runtime-bootstrap.js';

function scriptBody(scriptTag: string): string {
  const match = scriptTag.match(/^<script\b[^>]*>([\s\S]*)<\/script>$/iu);
  if (!match?.[1]) throw new TypeError('preview runtime module must be built from one script element');
  return match[1];
}

function styleBody(styleTag: string): string {
  const match = styleTag.match(/^<style\b[^>]*>([\s\S]*)<\/style>$/iu);
  if (!match?.[1]) throw new TypeError('preview runtime module must be built from one style element');
  return match[1];
}

/** Install a passive bridge before authored startup and expose its negotiated identity. */
export function buildInstalledScriptRuntimeModule(
  capability: PreviewRuntimeCapability,
  scriptTag: string,
  marker: string,
): PreviewRuntimeModuleSource {
  return {
    capabilities: [capability],
    source: `/* ${marker} */\n${scriptBody(scriptTag)}\n`
      + `register(${JSON.stringify(capability)},function(){return {enable:function(){},disable:function(){}};});`,
  };
}

/** Install an interaction bridge at first enable; subsequent toggles never reinstall listeners. */
export function buildLazyScriptRuntimeModule(
  capability: PreviewRuntimeCapability,
  scriptTag: string,
  marker: string,
): PreviewRuntimeModuleSource {
  return {
    capabilities: [capability],
    source: `/* ${marker} */\nregister(${JSON.stringify(capability)},function(){\n`
      + `var installed=false;return {enable:function(){if(installed)return;installed=true;\n`
      + `${scriptBody(scriptTag)}\n},disable:function(){}};});`,
  };
}

/**
 * Install one interaction script when any capability in a shared bridge is
 * first enabled. Each capability remains independently negotiable, while the
 * underlying listeners are installed exactly once for the document.
 */
export function buildSharedLazyScriptRuntimeModule(
  capabilities: readonly PreviewRuntimeCapability[],
  scriptTag: string,
  marker: string,
): PreviewRuntimeModuleSource {
  if (capabilities.length === 0) {
    throw new TypeError('shared preview runtime module needs at least one capability');
  }
  const installFunction = `function installSharedBridge(){if(sharedBridgeInstalled)return;sharedBridgeInstalled=true;\n`
    + `${scriptBody(scriptTag)}\n}`;
  return {
    capabilities,
    source: `/* ${marker} */\nvar sharedBridgeInstalled=false;\n${installFunction}\n`
      + capabilities.map((capability) => (
        `register(${JSON.stringify(capability)},function(){return {enable:installSharedBridge,disable:function(){}};});`
      )).join('\n'),
  };
}

/**
 * Install the keyboard guard before authored startup, then activate the exact
 * production edit bridge only while the host negotiates the edit capability.
 * Source identities are provided by the streamed HTML transform rather than
 * by a browser DOMParser pass.
 */
export function buildManualEditRuntimeModule(): PreviewRuntimeModuleSource {
  return {
    capabilities: ['edit'],
    source: `${scriptBody(buildManualEditKeyboardGuard())}
var editStyle=document.createElement('style');
editStyle.setAttribute('data-od-edit-bridge-style','');
editStyle.textContent=${JSON.stringify(styleBody(buildManualEditBridgeStyle()))};
(document.head||document.documentElement).appendChild(editStyle);
var editBridgeInstalled=false;
function setEditMode(enabled){
  if(!editBridgeInstalled&&enabled){editBridgeInstalled=true;
${scriptBody(buildManualEditBridge(false))}
  }
  if(!editBridgeInstalled)return;
  window.dispatchEvent(new MessageEvent('message',{data:{type:'od-edit-mode',enabled:!!enabled},source:parent}));
}
register('edit',function(){return {
  enable:function(){setEditMode(true);},
  disable:function(){setEditMode(false);}
};});`,
  };
}

/**
 * Reuse the exact production Deck bridge in a real-URL document. The listener
 * registry hook and layout fix install before authored startup; the bridge
 * itself waits for both host negotiation and DOM readiness, so existing deck
 * controls are present before it binds them.
 */
export function buildDeckRuntimeModule(
  artifactHtml: string,
  options: DeckBridgeOptions & { hasDeckStageElement?: boolean } = {},
): PreviewRuntimeModuleSource {
  const hasDeckStageElement = options.hasDeckStageElement
    ?? htmlUsesDeckStageElement(artifactHtml);
  const assets = buildDeckBridgeAssets(artifactHtml, {
    ...options,
    artifactHasKeydownNavigation: options.artifactHasKeydownNavigation
      ?? detectArtifactKeyboardNavigation(artifactHtml),
  });
  return {
    capabilities: ['deck'],
    source: `${hasDeckStageElement ? `${scriptBody(buildDeckStageFallbackScript())}\n` : ''}`
      + `${scriptBody(buildDeckKeydownRegistryHook())}\n`
      + `var deckStyle=document.createElement('style');\n`
      + `deckStyle.setAttribute('data-od-deck-fix','');\n`
      + `deckStyle.textContent=${JSON.stringify(styleBody(assets.styleTag))};\n`
      + `(document.head||document.documentElement).appendChild(deckStyle);\n`
      + `var deckEnabled=false;var deckInstalled=false;\n`
      + `function installDeckBridge(){if(!deckEnabled||deckInstalled)return;deckInstalled=true;\n`
      + `${scriptBody(assets.scriptTag)}\n}\n`
      + `function scheduleDeckBridge(){\n`
      + `if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installDeckBridge,{once:true});\n`
      + `else installDeckBridge();}\n`
      + `register('deck',function(){return {\n`
      + `enable:function(){deckEnabled=true;scheduleDeckBridge();},\n`
      + `disable:function(){deckEnabled=false;}\n`
      + `};});`,
  };
}

/**
 * Scroll restoration and content measurement share DOM observers, so they are
 * installed as one module while retaining independently negotiated switches.
 */
export function buildScrollAndMeasurementRuntimeModule(): PreviewRuntimeModuleSource {
  return {
    capabilities: ['content_measurement', 'scroll'],
    source: String.raw`
var scrollEnabled=false;
var measurementEnabled=false;
var scrollPending=false;
var measurementPending=false;
var lastMeasurementRequest=null;
var documentEpoch='';
try{documentEpoch=new URLSearchParams(window.location.search).get('odPreviewEpoch')||'';}catch(_){}
function numberValue(value){var next=Number(value||0);return Number.isFinite(next)?next:0;}
function scrollElement(){return document.querySelector('.design-canvas')||document.scrollingElement||document.documentElement;}
function postScroll(requestId){
  if(!scrollEnabled)return;
  var canvas=scrollElement();
  if(!canvas)return;
  var frame=document.scrollingElement||document.documentElement;
  var payload={
    canvasLeft:Math.round(canvas.scrollLeft||0),canvasTop:Math.round(canvas.scrollTop||0),
    frameLeft:Math.round(frame.scrollLeft||0),frameTop:Math.round(frame.scrollTop||0)
  };
  // An answered capture must carry the id the host is waiting on. Unsolicited
  // reports carry none, and the host treats those two very differently.
  if(requestId)payload.requestId=requestId;
  send('od:preview-scroll',payload);
}

function scheduleScroll(){
  if(!scrollEnabled||scrollPending)return;
  scrollPending=true;
  requestAnimationFrame(function(){scrollPending=false;postScroll();});
}
function measureContentSize(){
  var root=document.documentElement;
  var body=document.body||root;
  if(!root)return null;
  var scrollWidth=Math.max(numberValue(root.scrollWidth),numberValue(body&&body.scrollWidth));
  var clientWidth=Math.max(numberValue(root.clientWidth),numberValue(body&&body.clientWidth));
  return {
    scrollWidth:scrollWidth>0?Math.ceil(scrollWidth):null,
    clientWidth:clientWidth>0?Math.ceil(clientWidth):null
  };
}

function postMeasurement(){
  if(!measurementEnabled||!lastMeasurementRequest)return;
  var size=measureContentSize();
  send('od:preview-content-size',{
    measurementId:lastMeasurementRequest.measurementId,
    generation:lastMeasurementRequest.generation,
    documentEpoch:documentEpoch,
    scrollWidth:size&&size.scrollWidth,
    clientWidth:size&&size.clientWidth
  });
}
function scheduleMeasurement(){
  if(!measurementEnabled||measurementPending)return;
  measurementPending=true;
  requestAnimationFrame(function(){measurementPending=false;postMeasurement();});
}
function setScroll(el,left,top){
  if(!el)return;
  if(typeof el.scrollTo==='function')el.scrollTo(numberValue(left),numberValue(top));
  else{el.scrollLeft=numberValue(left);el.scrollTop=numberValue(top);}
}
function moveScroll(el,left,top){
  if(!el)return;
  var dx=numberValue(left),dy=numberValue(top);
  if(!dx&&!dy)return;
  if(typeof el.scrollBy==='function')el.scrollBy({left:dx,top:dy,behavior:'auto'});
  else{el.scrollLeft=(el.scrollLeft||0)+dx;el.scrollTop=(el.scrollTop||0)+dy;}
}
function requestRestore(){if(scrollEnabled)send('od:preview-scroll-request');}
window.addEventListener('message',function(event){
  if(event.source!==parent)return;
  var data=event.data;
  if(!data||!data.type)return;
  // The host cannot read scroll out of an opaque-origin document, so it asks
  // and waits on a 120ms budget. Only the legacy srcDoc bridge answered this;
  // on the converged transport every capture timed out and silently degraded
  // to the last unsolicited report.
  if(data.type==='od:preview-scroll-capture'&&scrollEnabled){
    postScroll(typeof data.requestId==='string'?data.requestId:undefined);
    return;
  }
  if(data.type==='od:preview-scroll-restore'&&scrollEnabled){
    setScroll(document.scrollingElement||document.documentElement,data.frameLeft,data.frameTop);
    setScroll(scrollElement(),data.canvasLeft,data.canvasTop);
    setTimeout(postScroll,0);
    return;
  }
  if(data.type==='od:preview-scroll-by'&&scrollEnabled){
    moveScroll(scrollElement(),data.left,data.top);
    scheduleScroll();
    scheduleMeasurement();
    return;
  }
  if(data.type==='od:preview-content-size-request'&&measurementEnabled){
    if(typeof data.measurementId!=='string'||typeof data.generation!=='string')return;
    lastMeasurementRequest={measurementId:data.measurementId,generation:data.generation};
    scheduleMeasurement();
  }
});
window.addEventListener('scroll',scheduleScroll,true);
document.addEventListener('scroll',scheduleScroll,true);
window.addEventListener('resize',function(){scheduleScroll();scheduleMeasurement();});
if(typeof ResizeObserver!=='undefined'){
  try{
    var observer=new ResizeObserver(scheduleMeasurement);
    observer.observe(document.documentElement);
    if(document.body)observer.observe(document.body);
    else document.addEventListener('DOMContentLoaded',function(){if(document.body)observer.observe(document.body);},{once:true});
  }catch(_){}
}
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(scheduleMeasurement).catch(function(){});
register('scroll',function(){return {
  enable:function(){scrollEnabled=true;requestRestore();scheduleScroll();},
  disable:function(){scrollEnabled=false;}
};});
register('content_measurement',function(){return {
  enable:function(){measurementEnabled=true;scheduleMeasurement();setTimeout(scheduleMeasurement,80);setTimeout(scheduleMeasurement,260);},
  disable:function(){measurementEnabled=false;lastMeasurementRequest=null;}
};});
`,
  };
}

/**
 * Tweaks must install its hide style before the authored body parses, otherwise
 * a default-visible panel flashes before the host can negotiate capabilities.
 *
 * That hide style is scoped to `.tw-panel` only. The artifact owns its own
 * `.tw-restore` affordance — hidden until its close handler adds `tw-show` —
 * and this runtime must not override it. Forcing `.tw-restore` hidden (which
 * it used to, back when a host toolbar offered a competing entry point) leaves
 * a closed panel with no pointer-reachable way to reopen it.
 */
export function buildTweaksRuntimeModule(): PreviewRuntimeModuleSource {
  return {
    capabilities: ['tweaks'],
    source: String.raw`
var tweaksEnabled=false;
var tweaksReady=false;
var suppressTweaksEcho=false;
var tweaksObserver=null;
var tweaksStyle=document.createElement('style');
tweaksStyle.setAttribute('data-od-tweaks-bridge-style','');
tweaksStyle.textContent='[data-od-tweaks-hidden] .tw-panel{transform:translateX(calc(100% + 32px))!important;opacity:0!important;pointer-events:none!important}';
(document.head||document.documentElement).appendChild(tweaksStyle);
document.documentElement.setAttribute('data-od-tweaks-hidden','');
function tweaksPanel(){return document.querySelector('.tw-panel');}
function applyTweaksPanelClass(visible){var panel=tweaksPanel();if(panel)panel.classList.toggle('tw-hidden',!visible);}
function postTweaksAvailability(){
  if(!tweaksEnabled||!tweaksReady)return;
  send('od:tweaks-available',{available:!!tweaksPanel()});
}
function postTweaksState(){
  if(!tweaksEnabled||!tweaksReady)return;
  var panel=tweaksPanel();
  if(panel)send('od:tweaks-panel-state',{visible:!panel.classList.contains('tw-hidden')});
}
function setTweaksPanelVisible(visible){
  suppressTweaksEcho=true;
  document.documentElement.toggleAttribute('data-od-tweaks-hidden',!visible);
  applyTweaksPanelClass(visible);
  Promise.resolve().then(function(){suppressTweaksEcho=false;});
}
function attachTweaksObserver(){
  var panel=tweaksPanel();
  if(!panel||tweaksObserver)return;
  tweaksObserver=new MutationObserver(function(){if(!suppressTweaksEcho)postTweaksState();});
  tweaksObserver.observe(panel,{attributes:true,attributeFilter:['class']});
}
function prepareTweaks(){
  var panel=tweaksPanel();
  var initialVisible=!!panel&&!panel.classList.contains('tw-hidden');
  document.documentElement.toggleAttribute('data-od-tweaks-hidden',!initialVisible);
  applyTweaksPanelClass(initialVisible);
  tweaksReady=true;
  attachTweaksObserver();
  postTweaksAvailability();
  postTweaksState();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',prepareTweaks,{once:true});else prepareTweaks();
window.addEventListener('message',function(event){
  if(event.source!==parent||!tweaksEnabled)return;
  var data=event.data;
  if(!data||data.type!=='od:tweaks-panel-visible')return;
  setTweaksPanelVisible(!!data.visible);
});
register('tweaks',function(){return {
  enable:function(){tweaksEnabled=true;postTweaksAvailability();postTweaksState();},
  disable:function(){tweaksEnabled=false;}
};});
`,
  };
}

/** Palette changes are DOM-local runtime state and never require navigation. */
export function buildPaletteRuntimeModule(): PreviewRuntimeModuleSource {
  return {
    capabilities: ['palette'],
    source: String.raw`
var paletteEnabled=false;
var paletteReady=document.readyState!=='loading';
var currentPalette=null;
var PALETTES={
  'coral':{hue:10,satFloor:0.55,mono:false},
  'electric':{hue:262,satFloor:0.55,mono:false},
  'acid-forest':{hue:142,satFloor:0.55,mono:false},
  'risograph':{hue:349,satFloor:0.60,mono:false},
  'mono-noir':{hue:0,satFloor:0,mono:true}
};
var paletteAttr='data-od-palette-fix';
var savedKey='__odPaletteSaved__';
var minSaturation=0.08;
var walkLimit=12000;
var styleRuleLimit=5000;
var rootSelector=/(^|,)\s*(:root|html|body|:host)\s*($|,)/;
var appliedVars=Object.create(null);
var colorProbe=null;
function parseRgb(value){
  var text=String(value||'').trim();
  if(!text||text==='transparent'||text==='none')return null;
  var match=text.match(/rgba?\(([^)]+)\)/);
  if(!match)return null;
  var parts=match[1].split(/[\s,/]+/).filter(Boolean).map(function(part){return parseFloat(part);});
  if(parts.length<3)return null;
  return {r:parts[0]||0,g:parts[1]||0,b:parts[2]||0,a:parts[3]==null?1:parts[3]};
}
function rgbToHsl(r,g,b){
  r/=255;g/=255;b/=255;
  var max=Math.max(r,g,b),min=Math.min(r,g,b),h=0,s=0,l=(max+min)/2;
  if(max!==min){
    var delta=max-min;
    s=l>0.5?delta/(2-max-min):delta/(max+min);
    if(max===r)h=(g-b)/delta+(g<b?6:0);
    else if(max===g)h=(b-r)/delta+2;
    else h=(r-g)/delta+4;
    h*=60;
  }
  return {h:h,s:s,l:l};
}
function hueToRgb(p,q,t){
  if(t<0)t+=1;if(t>1)t-=1;
  if(t<1/6)return p+(q-p)*6*t;
  if(t<1/2)return q;
  if(t<2/3)return p+(q-p)*(2/3-t)*6;
  return p;
}
function hslString(h,s,l){
  h=((h%360)+360)%360/360;
  var r,g,b;
  if(s===0)r=g=b=l;
  else{
    var q=l<0.5?l*(1+s):l+s-l*s;
    var p=2*l-q;
    r=hueToRgb(p,q,h+1/3);g=hueToRgb(p,q,h);b=hueToRgb(p,q,h-1/3);
  }
  return 'rgb('+Math.round(r*255)+','+Math.round(g*255)+','+Math.round(b*255)+')';
}
function chromatic(color){
  if(!color||color.a<0.3)return null;
  var hsl=rgbToHsl(color.r,color.g,color.b);
  if(hsl.s<minSaturation||hsl.l<0.04||hsl.l>0.98)return null;
  return hsl;
}
function shiftedColor(hsl,palette){
  if(palette.mono)return hslString(0,0,hsl.l);
  return hslString(palette.hue,Math.max(hsl.s,palette.satFloor*0.7),hsl.l);
}
function normalizedColor(value){
  var raw=String(value||'').trim();
  if(!raw)return null;
  var direct=parseRgb(raw);
  if(direct)return direct;
  if(raw.indexOf('var(')===0||raw.indexOf('--')===0)return null;
  if(!colorProbe){
    colorProbe=document.createElement('div');
    colorProbe.style.display='none';
    (document.body||document.documentElement).appendChild(colorProbe);
  }
  colorProbe.style.color='';
  try{colorProbe.style.color=raw;}catch(_){return null;}
  return colorProbe.style.color?parseRgb(colorProbe.style.color):null;
}
function walkStyleRules(rules,visit,budget){
  if(!rules||!budget.left)return;
  for(var i=0;i<rules.length&&budget.left>0;i++){
    var rule=rules[i];budget.left--;
    if(rule.selectorText&&rule.style&&rootSelector.test(String(rule.selectorText)))visit(rule);
    if(rule.cssRules&&rule.cssRules.length)walkStyleRules(rule.cssRules,visit,budget);
  }
}
function applyPaletteVars(palette){
  var sheets=document.styleSheets;
  if(!sheets||!sheets.length)return;
  var budget={left:styleRuleLimit};
  for(var i=0;i<sheets.length;i++){
    var rules=null;
    try{rules=sheets[i].cssRules;}catch(_){continue;}
    walkStyleRules(rules,function(rule){
      var declaration=rule.style;
      for(var j=0;j<declaration.length;j++){
        var name=declaration[j];
        if(name.indexOf('--')!==0)continue;
        var hsl=chromatic(normalizedColor(declaration.getPropertyValue(name)));
        if(!hsl)continue;
        document.documentElement.style.setProperty(name,shiftedColor(hsl,palette));
        appliedVars[name]=true;
      }
    },budget);
  }
}
function restorePalette(){
  for(var name in appliedVars)document.documentElement.style.setProperty(name,'');
  appliedVars=Object.create(null);
  var nodes=document.querySelectorAll('['+paletteAttr+']');
  for(var i=0;i<nodes.length;i++){
    var element=nodes[i],saved=element[savedKey];
    if(saved){
      if('bg' in saved)element.style.backgroundColor=saved.bg;
      if('color' in saved)element.style.color=saved.color;
      if('border' in saved)element.style.borderColor=saved.border;
      if('fill' in saved){if(saved.fill)element.setAttribute('fill',saved.fill);else element.removeAttribute('fill');}
      if('stroke' in saved){if(saved.stroke)element.setAttribute('stroke',saved.stroke);else element.removeAttribute('stroke');}
    }
    element.removeAttribute(paletteAttr);delete element[savedKey];
  }
}
function applyPalette(){
  restorePalette();
  if(!paletteEnabled||!paletteReady||!currentPalette||!PALETTES[currentPalette])return;
  var palette=PALETTES[currentPalette];
  applyPaletteVars(palette);
  var elements=document.body?document.body.querySelectorAll('*'):[];
  for(var i=0;i<elements.length&&i<walkLimit;i++){
    var element=elements[i],computed=getComputedStyle(element),saved={},changed=false;
    var bg=chromatic(parseRgb(computed.backgroundColor));
    if(bg){saved.bg=element.style.backgroundColor;element.style.setProperty('background-color',shiftedColor(bg,palette),'important');changed=true;}
    var fg=chromatic(parseRgb(computed.color));
    if(fg){saved.color=element.style.color;element.style.setProperty('color',shiftedColor(fg,palette),'important');changed=true;}
    var border=chromatic(parseRgb(computed.borderTopColor));
    if(border){saved.border=element.style.borderColor;element.style.setProperty('border-color',shiftedColor(border,palette),'important');changed=true;}
    var fill=element.getAttribute&&element.getAttribute('fill');
    if(fill){var fillHsl=chromatic(parseRgb(computed.fill));if(fillHsl){saved.fill=fill;element.setAttribute('fill',shiftedColor(fillHsl,palette));changed=true;}}
    var stroke=element.getAttribute&&element.getAttribute('stroke');
    if(stroke){var strokeHsl=chromatic(parseRgb(computed.stroke));if(strokeHsl){saved.stroke=stroke;element.setAttribute('stroke',shiftedColor(strokeHsl,palette));changed=true;}}
    if(changed){element[savedKey]=saved;element.setAttribute(paletteAttr,'1');}
  }
}
window.addEventListener('message',function(event){
  if(event.source!==parent)return;
  var data=event.data;
  if(!data||data.type!=='od:palette')return;
  currentPalette=data.palette?String(data.palette):null;
  applyPalette();
});
if(!paletteReady)document.addEventListener('DOMContentLoaded',function(){paletteReady=true;applyPalette();},{once:true});
register('palette',function(){return {
  enable:function(){paletteEnabled=true;applyPalette();},
  disable:function(){paletteEnabled=false;restorePalette();}
};});
`,
  };
}
