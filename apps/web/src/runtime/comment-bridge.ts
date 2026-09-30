import { findRealTagOffset, HTML_TAG_PATTERNS } from '@open-design/contracts/runtime/html-injection-points';
import { ANNOTATED_SELECTOR_HELPERS } from './annotated-selector';

/**
 * Share-safe comment selection bridge. It deliberately owns only the comment
 * postMessage protocol; inspect controls stay in srcdoc's full editor bridge.
 */
export function injectCommentBridge(doc: string, initialCommentMode = false): string {
  const script = `<script data-od-comment-bridge>(function(){
  var commentEnabled = ${initialCommentMode ? 'true' : 'false'};
  var mode = 'picker';
  var drawing = false;
  var stroke = [];
  function visible(el){ try { var r=el.getBoundingClientRect(); return r.width >= 1 && r.height >= 1; } catch (_) { return false; } }
  function esc(value){ return String(value).replace(/"/g, String.fromCharCode(92) + '"'); }
${ANNOTATED_SELECTOR_HELPERS}
  function targetFrom(el){ var id=el && annotatedElementIdFor(el); var selector=el && annotatedSelectorFor(el, esc); if(!id || !selector || !visible(el)) return null; var rect=el.getBoundingClientRect(); return { type:'od:comment-target', elementId:id, selector:selector, label:(el.tagName || 'element').toLowerCase(), text:(el.textContent || '').replace(/\s+/g,' ').trim().slice(0,160), position:{x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)}, htmlHint:(el.outerHTML || '').replace(/\s+/g,' ').match(/^<[^>]+>/)?.[0]?.slice(0,180) || '', style:null }; }
  function allTargets(){ var nodes=document.querySelectorAll('[data-od-id], [data-screen-label]'); var targets=[]; for(var i=0;i<nodes.length;i++){ var target=targetFrom(nodes[i]); if(target) targets.push(target); } return targets; }
  function postTargets(){ if(commentEnabled) window.parent.postMessage({type:'od:comment-targets',targets:allTargets()},'*'); }
  function postScroll(){ var el=document.querySelector('.design-canvas') || document.scrollingElement || document.documentElement; var frame=document.scrollingElement || document.documentElement; window.parent.postMessage({type:'od:preview-scroll',canvasLeft:Math.round(el.scrollLeft||0),canvasTop:Math.round(el.scrollTop||0),frameLeft:Math.round(frame.scrollLeft||0),frameTop:Math.round(frame.scrollTop||0)},'*'); }
  window.addEventListener('message',function(ev){ var data=ev && ev.data; if(!data || !data.type) return; if(data.type==='od:comment-mode'){ commentEnabled=!!data.enabled; mode=data.mode==='pod'?'pod':'picker'; document.documentElement.toggleAttribute('data-od-comment-mode',commentEnabled); if(commentEnabled) postTargets(); return; } if(data.type==='od:comment-active-target'){ var el=null; try { el=data.selector && document.querySelector(String(data.selector)); } catch (_) {} if(!el && data.elementId) el=document.querySelector('[data-od-id="'+String(data.elementId).replace(/"/g,'\\"')+'"], [data-screen-label="'+String(data.elementId).replace(/"/g,'\\"')+'"]'); var target=targetFrom(el); if(target) window.parent.postMessage(Object.assign({},target,{type:'od:comment-active-target-update'}),'*'); return; } if(data.type==='od:preview-scroll-capture'){ postScroll(); return; } if(data.type==='od:preview-scroll-by'){ var scroll=document.querySelector('.design-canvas') || document.scrollingElement || document.documentElement; scroll.scrollBy({left:Number(data.left)||0,top:Number(data.top)||0,behavior:'auto'}); postScroll(); } });
  document.addEventListener('click',function(ev){ if(!commentEnabled || mode==='pod') return; var el=ev.target && ev.target.closest && ev.target.closest('[data-od-id], [data-screen-label]'); var target=targetFrom(el); if(!target) return; ev.preventDefault(); ev.stopPropagation(); window.parent.postMessage(target,'*'); },true);
  document.addEventListener('pointerdown',function(ev){ if(!commentEnabled || mode!=='pod' || ev.button!==0) return; drawing=true; stroke=[{x:Math.round(ev.clientX),y:Math.round(ev.clientY)}]; window.parent.postMessage({type:'od:pod-stroke',points:stroke.slice()},'*'); },true);
  document.addEventListener('pointermove',function(ev){ if(!drawing) return; stroke.push({x:Math.round(ev.clientX),y:Math.round(ev.clientY)}); window.parent.postMessage({type:'od:pod-stroke',points:stroke.slice()},'*'); },true);
  document.addEventListener('pointerup',function(){ if(!drawing) return; drawing=false; window.parent.postMessage({type:'od:pod-select',points:stroke.slice()},'*'); },true);
  document.addEventListener('scroll',function(){ postTargets(); postScroll(); },true);
  if(commentEnabled) setTimeout(postTargets,0);
})();</script>`;
  const bodyClose = findRealTagOffset(doc, HTML_TAG_PATTERNS.bodyClose);
  return bodyClose >= 0 ? doc.slice(0, bodyClose) + script + doc.slice(bodyClose) : doc + script;
}
