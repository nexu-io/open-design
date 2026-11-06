import { findRealTagOffset, HTML_TAG_PATTERNS } from '@open-design/contracts/runtime/html-injection-points';
import { ANNOTATED_SELECTOR_HELPERS } from './annotated-selector';
import { COMMENT_IDENTITY_HELPERS } from '@open-design/contracts';

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
${COMMENT_IDENTITY_HELPERS}
  function targetFrom(el, useIdentity){ var id=el && annotatedElementIdFor(el); var selector=el && annotatedSelectorFor(el, esc); if(useIdentity !== false && el && el.hasAttribute('data-od-comment-id')) { var identity=ownCommentIdentity(el); if(!identity) return null; id=identity.elementId; selector=identity.selector; } if(!id || !selector || !visible(el)) return null; var rect=el.getBoundingClientRect(); return { type:'od:comment-target', elementId:id, selector:selector, label:(el.tagName || 'element').toLowerCase(), text:(el.textContent || '').replace(/\s+/g,' ').trim().slice(0,160), position:{x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)}, htmlHint:(el.outerHTML || '').replace(/\s+/g,' ').match(/^<[^>]+>/)?.[0]?.slice(0,180) || '', style:null }; }
  function allTargets(){ var nodes=document.querySelectorAll('[data-od-id], [data-screen-label], [data-od-comment-id]'); var targets=[]; for(var i=0;i<nodes.length;i++){ var target=targetFrom(nodes[i]); if(target) targets.push(target); } return targets; }
  function postTargets(){ if(commentEnabled) window.parent.postMessage({type:'od:comment-targets',targets:allTargets()},'*'); }
  function postScroll(){ var el=document.querySelector('.design-canvas') || document.scrollingElement || document.documentElement; var frame=document.scrollingElement || document.documentElement; window.parent.postMessage({type:'od:preview-scroll',canvasLeft:Math.round(el.scrollLeft||0),canvasTop:Math.round(el.scrollTop||0),frameLeft:Math.round(frame.scrollLeft||0),frameTop:Math.round(frame.scrollTop||0)},'*'); }
  window.addEventListener('message',function(ev){ var data=ev && ev.data; if(!data || !data.type) return; if(data.type==='od:comment-mode'){ commentEnabled=!!data.enabled; mode=data.mode==='pod'?'pod':'picker'; document.documentElement.toggleAttribute('data-od-comment-mode',commentEnabled); if(commentEnabled) postTargets(); return; } if(data.type==='od:comment-active-target'){ var el=null; try { el=data.selector && document.querySelector(String(data.selector)); } catch (_) {} if(!el && data.elementId) el=document.querySelector('[data-od-id="'+String(data.elementId).replace(/"/g,'\\"')+'"], [data-screen-label="'+String(data.elementId).replace(/"/g,'\\"')+'"]'); if(String(data.elementId || '').indexOf('cmt:')===0 || commentSelectorClaimsIdentity(data.selector)) el=strictCommentNode(data.elementId,data.selector); var target=targetFrom(el); if(target && data.locate) { try { el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}); } catch(_) {} target=targetFrom(el); } if(target) window.parent.postMessage(Object.assign({},target,{type:'od:comment-active-target-update',requestId:data.requestId}),'*'); else if(data.locate && data.requestId) window.parent.postMessage({type:'od:comment-location-missing',requestId:data.requestId},'*'); return; } if(data.type==='od:preview-scroll-capture'){ postScroll(); return; } if(data.type==='od:preview-scroll-by'){ var scroll=document.querySelector('.design-canvas') || document.scrollingElement || document.documentElement; scroll.scrollBy({left:Number(data.left)||0,top:Number(data.top)||0,behavior:'auto'}); postScroll(); } });
  document.addEventListener('click',function(ev){ if(!commentEnabled || mode==='pod') return; var clicked=ev.target; var el=clicked && clicked.hasAttribute && clicked.hasAttribute('data-od-comment-id') ? clicked : clicked && clicked.closest && clicked.closest('[data-od-id], [data-screen-label]'); var target=targetFrom(el, el === clicked); if(!target) return; ev.preventDefault(); ev.stopPropagation(); window.parent.postMessage(target,'*'); },true);
  document.addEventListener('pointerdown',function(ev){ if(!commentEnabled || mode!=='pod' || ev.button!==0) return; drawing=true; stroke=[{x:Math.round(ev.clientX),y:Math.round(ev.clientY)}]; window.parent.postMessage({type:'od:pod-stroke',points:stroke.slice()},'*'); },true);
  document.addEventListener('pointermove',function(ev){ if(!drawing) return; stroke.push({x:Math.round(ev.clientX),y:Math.round(ev.clientY)}); window.parent.postMessage({type:'od:pod-stroke',points:stroke.slice()},'*'); },true);
  document.addEventListener('pointerup',function(){ if(!drawing) return; drawing=false; window.parent.postMessage({type:'od:pod-select',points:stroke.slice()},'*'); },true);
  document.addEventListener('scroll',function(){ postTargets(); postScroll(); },true);
  if(commentEnabled) setTimeout(postTargets,0);
})();</script>`;
  const bodyClose = findRealTagOffset(doc, HTML_TAG_PATTERNS.bodyClose);
  return bodyClose >= 0 ? doc.slice(0, bodyClose) + script + doc.slice(bodyClose) : doc + script;
}
