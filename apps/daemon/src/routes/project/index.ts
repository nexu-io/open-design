import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { Express, Response } from 'express';
import {
  defaultScenarioPluginIdForProjectMetadata,
  type ChatSessionMode,
  type PluginManifest,
  type ProjectFile,
  type ProjectFileTextPreviewResponse,
  type ProjectFileVersion,
  type ProjectFileVersionPromptSource,
  type ProjectFileVersionSource,
  type ProjectFileVersionWarning,
} from '@open-design/contracts';
import { readMeta as readBrandMeta } from '../../brands/store.js';
import { createProjectArtifactFile } from '../../artifacts/create.js';
import { ArtifactPublicationBlockedError } from '../../artifacts/publication-guard.js';
import { ArtifactRegressionError } from '../../artifacts/stub-guard.js';
import {
  createProjectFileVersion,
  isProjectFileVersionPath,
  listProjectFileVersions,
  markProjectFileVersionStoreDeleted,
  readProjectFileVersion,
  renameProjectFileVersionStore,
  withProjectFileVersionLock,
} from '../../project-file-versions.js';
import {
  createUserDesignSystem,
  deleteUserDesignSystem,
  linkUserDesignSystemProject,
  listDesignSystems,
  propagateWorkspaceProjectRename,
} from '../../design-systems/index.js';
import {
  FIRST_PARTY_ATOMS,
  buildConnectorProbe,
  getInstalledPlugin,
  listInstalledPlugins,
  resolvePluginSnapshot,
} from '../../plugins/index.js';
import { connectorService } from '../../connectors/service.js';
import type { RouteDeps } from '../../server-context.js';
import { listSkills } from '../../skills.js';
import { isSafeId } from '../../projects.js';
import {
  BUILT_IN_PROJECT_LOCATION_ID,
  allProjectLocations,
  createLocationProjectDir,
  ensureProjectLocation,
  scanProjectLocation,
  writeProjectManifest,
} from '../../project-locations.js';
import { auditDesignSystemPackage } from '../../tools-connectors-cli.js';
import { parseOrchestratorWorkspace } from '../../workspace-contract.js';
import { registerProjectConversationRoutes } from './conversations.js';

export interface RegisterProjectRoutesDeps extends RouteDeps<'db' | 'design' | 'http' | 'paths' | 'projectStore' | 'projectFiles' | 'conversations' | 'templates' | 'status' | 'events' | 'ids' | 'telemetry' | 'appConfig' | 'agents' | 'validation'> {}

function projectDetailResolvedDir(
  projectsRoot: string,
  project: any,
  resolveProjectDir: (
    projectsRoot: string,
    projectId: string,
    metadata?: unknown,
    opts?: { allowUnavailableSandboxImportedProject?: boolean },
  ) => string,
): string {
  const baseDir = typeof project?.metadata?.baseDir === 'string'
    ? path.normalize(project.metadata.baseDir)
    : null;
  if (baseDir && path.isAbsolute(baseDir)) return baseDir;
  return resolveProjectDir(projectsRoot, project.id, project.metadata, {
    allowUnavailableSandboxImportedProject: true,
  });
}

/**
 * Materialize a *managed* project's folder before it is referenced as
 * read-only context for another run.
 *
 * Invariant: after this resolves for a managed project, `PROJECTS_DIR/<id>`
 * exists on disk. A brand-new project has a DB row but no on-disk directory
 * until its first file write, so without this a reference resolves to a path
 * that fails both the composer's existence probe and the daemon's
 * all-or-nothing linkedDirs validation. External / imported roots (an absolute
 * `metadata.baseDir`) are the user's own folders and are never created here.
 * Materialization failures are required failures: callers must surface them
 * instead of continuing with a resolvedDir that may not exist.
 */
export async function ensureReferencedProjectDir(
  projectsRoot: string,
  project: { id: string; metadata?: unknown },
  ensureProject: (projectsRoot: string, projectId: string, metadata?: unknown) => Promise<string>,
): Promise<void> {
  const metadata = (project?.metadata ?? null) as { baseDir?: unknown } | null;
  const baseDir = typeof metadata?.baseDir === 'string'
    ? path.normalize(metadata.baseDir)
    : null;
  const managedRoot = !(baseDir && path.isAbsolute(baseDir));
  if (!managedRoot) return;
  await ensureProject(projectsRoot, project.id, project.metadata);
}

const URL_PREVIEW_SCROLL_BRIDGE = `<script data-od-url-scroll-bridge>
(function(){
  if (window.__odUrlScrollBridge) return;
  window.__odUrlScrollBridge = true;
  var pending = false;
  function scrollElement(){
    return document.querySelector('.design-canvas') || document.scrollingElement || document.documentElement;
  }
  function num(value){
    var next = Number(value || 0);
    return Number.isFinite(next) ? next : 0;
  }
  function post(){
    var el = scrollElement();
    if (!el) return;
    var frame = document.scrollingElement || document.documentElement;
    window.parent.postMessage({
      type: 'od:preview-scroll',
      canvasLeft: Math.round(el.scrollLeft || 0),
      canvasTop: Math.round(el.scrollTop || 0),
      frameLeft: Math.round(frame.scrollLeft || 0),
      frameTop: Math.round(frame.scrollTop || 0)
    }, '*');
  }
  function schedule(){
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(function(){
      pending = false;
      post();
    });
  }
  function scrollTo(el, left, top){
    if (!el) return;
    if (typeof el.scrollTo === 'function') el.scrollTo(num(left), num(top));
    else {
      el.scrollLeft = num(left);
      el.scrollTop = num(top);
    }
  }
  function scrollBy(el, left, top){
    if (!el) return;
    var dx = num(left);
    var dy = num(top);
    if (!dx && !dy) return;
    if (typeof el.scrollBy === 'function') el.scrollBy({ left: dx, top: dy, behavior: 'auto' });
    else {
      el.scrollLeft = (el.scrollLeft || 0) + dx;
      el.scrollTop = (el.scrollTop || 0) + dy;
    }
  }
  function requestRestore(){
    window.parent.postMessage({ type: 'od:preview-scroll-request' }, '*');
  }
  window.addEventListener('message', function(ev){
    var data = ev && ev.data;
    if (!data || !data.type) return;
    if (data.type === 'od:preview-scroll-restore') {
      scrollTo(document.scrollingElement || document.documentElement, data.frameLeft, data.frameTop);
      scrollTo(scrollElement(), data.canvasLeft, data.canvasTop);
      setTimeout(post, 0);
      return;
    }
    if (data.type === 'od:preview-scroll-by') {
      scrollBy(scrollElement(), data.left, data.top);
      schedule();
    }
  });
  window.addEventListener('scroll', schedule, true);
  document.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){
      requestRestore();
      schedule();
    });
  } else {
    setTimeout(function(){
      requestRestore();
      schedule();
    }, 0);
  }
})();
</script>`;

function sameOrchestratorWorkspace(a: unknown, b: unknown): boolean {
  const parsedA = parseOrchestratorWorkspace(a);
  const parsedB = parseOrchestratorWorkspace(b);
  if (!parsedA.ok || !parsedB.ok) return false;
  return JSON.stringify(parsedA.value) === JSON.stringify(parsedB.value);
}

const URL_PREVIEW_SELECTION_BRIDGE = `<script data-od-url-selection-bridge>
(function(){
  if (window.__odUrlSelectionBridge) return;
  window.__odUrlSelectionBridge = true;
  var commentEnabled = false;
  var mode = 'picker';
  var hoveredId = null;
  var drawing = false;
  var stroke = [];
  var strokeFrame = null;
  var postTargetsPending = false;
  var postTargetsTimer = null;
  var activeCommentElementId = null;
  var activeCommentSelector = null;
  var activeTargetPending = false;
  function esc(value){
    try { return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\\\"'); }
    catch (_) { return String(value); }
  }
  function ensureStyle(){
    if (document.querySelector('style[data-od-url-selection-style]')) return;
    var style = document.createElement('style');
    style.setAttribute('data-od-url-selection-style', '');
    style.textContent =
      'html[data-od-comment-mode] body * { cursor: crosshair !important; }' +
      'html[data-od-comment-mode][data-od-comment-mode-kind="pod"] body * { cursor: cell !important; }' +
      'html[data-od-comment-mode] body iframe,html[data-od-comment-mode] body object,html[data-od-comment-mode] body embed { pointer-events: none !important; }';
    (document.head || document.documentElement).appendChild(style);
  }
  function active(){ return commentEnabled; }
  function annotatedSelectorFor(el){
    var id = el.getAttribute('data-od-id') || el.getAttribute('data-screen-label');
    if (!id) return null;
    return el.hasAttribute('data-od-id') ? '[data-od-id="' + esc(id) + '"]' : '[data-screen-label="' + esc(id) + '"]';
  }
  function domSelectorFor(el){
    if (!el || !el.tagName || el === document.documentElement || el === document.body) return null;
    var parts = [];
    var node = el;
    while (node && node !== document.documentElement && node !== document.body) {
      var tag = node.tagName ? node.tagName.toLowerCase() : '';
      if (!tag || /^(script|style|template|meta|link|title|noscript)$/.test(tag)) return null;
      var parent = node.parentElement;
      if (!parent) return null;
      var index = 1;
      var sibling = node.previousElementSibling;
      while (sibling) {
        if (sibling.tagName && sibling.tagName.toLowerCase() === tag) index++;
        sibling = sibling.previousElementSibling;
      }
      parts.unshift(tag + ':nth-of-type(' + index + ')');
      node = parent;
    }
    return parts.length ? 'body > ' + parts.join(' > ') : null;
  }
  function visibleTarget(el){
    if (!el || !el.getBoundingClientRect) return false;
    if (el === document.documentElement || el === document.body) return false;
    if (/^(script|style|template|meta|link|title|noscript)$/.test(el.tagName ? el.tagName.toLowerCase() : '')) return false;
    try {
      var rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      var cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') return false;
    } catch (_) { return false; }
    return true;
  }
  function meaningfulDomFallbackTarget(el){
    if (!visibleTarget(el)) return false;
    var tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (/^(a|button|input|textarea|select|label|img|video|canvas|h1|h2|h3|h4|h5|h6|p|li|td|th)$/.test(tag)) return true;
    if (el.getAttribute && (el.getAttribute('role') || el.getAttribute('aria-label') || el.getAttribute('title'))) return true;
    if (tag === 'svg') return !!(el.getAttribute && (el.getAttribute('role') || el.getAttribute('aria-label') || el.getAttribute('title')));
    var text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    if (!text) return false;
    if (/^(span|strong|em|b|i|small|code|mark)$/.test(tag)) return true;
    var meaningfulChildren = 0;
    for (var child = el.firstElementChild; child; child = child.nextElementSibling) {
      var childTag = child.tagName ? child.tagName.toLowerCase() : '';
      if (/^(script|style|template|meta|link|title|noscript)$/.test(childTag)) continue;
      if ((child.textContent || '').replace(/\\s+/g, ' ').trim() || /^(img|video|canvas|svg|input|textarea|select)$/.test(childTag)) {
        meaningfulChildren++;
        if (meaningfulChildren > 1) return false;
      }
    }
    return true;
  }
  function generatedRootAnnotation(el, id){
    return id === 'path-0' && el && el.parentElement === document.body && el.id === 'root';
  }
  function styleSnapshot(el){
    try {
      var cs = window.getComputedStyle(el);
      return {
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        paddingTop: cs.paddingTop,
        paddingRight: cs.paddingRight,
        paddingBottom: cs.paddingBottom,
        paddingLeft: cs.paddingLeft,
        borderRadius: cs.borderTopLeftRadius,
        textAlign: cs.textAlign,
        fontFamily: cs.fontFamily
      };
    } catch (_) { return null; }
  }
  function targetFrom(el, allowDomFallback, clickedEl, clickPoint){
    var id = el.getAttribute('data-od-id') || el.getAttribute('data-screen-label');
    if (allowDomFallback && id && generatedRootAnnotation(el, id)) return null;
    var selector = annotatedSelectorFor(el);
    if (!id && allowDomFallback && meaningfulDomFallbackTarget(el)) {
      selector = domSelectorFor(el);
      if (selector) id = 'dom:' + selector;
    }
    if (!id || !selector) return null;
    var rect = el.getBoundingClientRect();
    var tag = el.tagName ? el.tagName.toLowerCase() : 'element';
    var cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
    var html = '';
    try {
      var match = (el.outerHTML || '').replace(/\\s+/g, ' ').match(/^<[^>]+>/);
      html = match ? match[0] : '';
    } catch (_) {}
    var payload = {
      type: 'od:comment-target',
      elementId: id,
      selector: selector,
      label: tag + cls,
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 160),
      position: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      htmlHint: html.slice(0, 180),
      style: styleSnapshot(el)
    };
    if (clickPoint) payload.hoverPoint = { x: Math.round(clickPoint.x), y: Math.round(clickPoint.y) };
    if (clickedEl && clickedEl !== el) {
      var clickedTag = clickedEl.tagName ? clickedEl.tagName.toLowerCase() : 'element';
      var clickedCls = typeof clickedEl.className === 'string' && clickedEl.className.trim() ? '.' + clickedEl.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
      payload.clickedDescendant = {
        label: clickedTag + clickedCls,
        text: (clickedEl.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80)
      };
    }
    return payload;
  }
  function allTargets(){
    var includeDomFallback = commentEnabled && mode === 'picker';
    var nodes = includeDomFallback ? document.querySelectorAll('body *') : document.querySelectorAll('[data-od-id], [data-screen-label]');
    var items = [];
    var seen = Object.create(null);
    for (var i = 0; i < nodes.length; i++) {
      var item = targetFrom(nodes[i], includeDomFallback);
      if (item && !seen[item.elementId]) {
        seen[item.elementId] = true;
        items.push(item);
      }
    }
    return items;
  }
  function postTargets(){
    if (!active()) return;
    window.parent.postMessage({ type: 'od:comment-targets', targets: allTargets() }, '*');
  }
  function schedulePostTargets(){
    if (!active() || postTargetsPending) return;
    postTargetsPending = true;
    if (postTargetsTimer) window.clearTimeout(postTargetsTimer);
    postTargetsTimer = window.setTimeout(function(){
      window.requestAnimationFrame(function(){
        postTargetsPending = false;
        postTargetsTimer = null;
        postTargets();
      });
    }, 120);
  }
  function findCommentTargetByIdentity(elementId, selector){
    var el = null;
    if (selector) {
      try { el = document.querySelector(String(selector)); } catch (_) { el = null; }
    }
    if (!el && elementId) {
      try {
        var id = String(elementId).replace(/"/g, '\\\\"');
        el = document.querySelector('[data-od-id="' + id + '"], [data-screen-label="' + id + '"]');
      } catch (_) { el = null; }
    }
    return el;
  }
  function postActiveCommentTarget(){
    if (!active() || !activeCommentElementId) return;
    var el = findCommentTargetByIdentity(activeCommentElementId, activeCommentSelector);
    if (!el) return;
    var payload = targetFrom(el, commentEnabled && mode === 'picker');
    if (payload) window.parent.postMessage(Object.assign({}, payload, { type: 'od:comment-active-target-update' }), '*');
  }
  function schedulePostActiveCommentTarget(){
    if (!active() || !activeCommentElementId || activeTargetPending) return;
    activeTargetPending = true;
    window.requestAnimationFrame(function(){
      activeTargetPending = false;
      postActiveCommentTarget();
    });
  }
  function eventCandidateElements(event){
    var items = [];
    function push(node){
      if (!node || node.nodeType !== 1) return;
      if (items.indexOf(node) >= 0) return;
      items.push(node);
    }
    try {
      if (event && typeof event.composedPath === 'function') {
        var path = event.composedPath();
        for (var i = 0; i < path.length; i++) push(path[i]);
      }
    } catch (_) {}
    push(event && event.target);
    try {
      if (event && typeof event.clientX === 'number' && typeof event.clientY === 'number' && document.elementsFromPoint) {
        var stack = document.elementsFromPoint(event.clientX, event.clientY);
        for (var s = 0; s < stack.length; s++) push(stack[s]);
      } else if (event && typeof event.clientX === 'number' && typeof event.clientY === 'number' && document.elementFromPoint) {
        push(document.elementFromPoint(event.clientX, event.clientY));
      }
    } catch (_) {}
    return items;
  }
  function closestTarget(event){
    var candidates = eventCandidateElements(event);
    var allowDomFallback = commentEnabled && mode === 'picker';
    var annotatedFallback = null;
    for (var i = 0; i < candidates.length; i++) {
      var clicked = candidates[i];
      var el = clicked;
      while (el && el !== document.documentElement) {
        if (allowDomFallback && meaningfulDomFallbackTarget(el)) return { target: el, clicked: clicked };
        if (el.getAttribute && (el.hasAttribute('data-od-id') || el.hasAttribute('data-screen-label'))) {
          var id = el.getAttribute('data-od-id') || el.getAttribute('data-screen-label');
          if (allowDomFallback && generatedRootAnnotation(el, id)) {
            el = el.parentElement;
            continue;
          }
          if (allowDomFallback && !annotatedFallback) annotatedFallback = { target: el, clicked: clicked };
          if (allowDomFallback) break;
          return { target: el, clicked: clicked };
        }
        el = el.parentElement;
      }
    }
    return annotatedFallback;
  }
  function relativePoint(ev){ return { x: Math.round(ev.clientX), y: Math.round(ev.clientY) }; }
  function postStroke(type){ window.parent.postMessage({ type: type, points: stroke.slice() }, '*'); }
  function schedulePostStroke(){
    if (strokeFrame !== null) return;
    strokeFrame = requestAnimationFrame(function(){
      strokeFrame = null;
      postStroke('od:pod-stroke');
    });
  }
  window.addEventListener('message', function(ev){
    var data = ev && ev.data;
    if (!data || !data.type) return;
    if (data.type === 'od:url-selection-bridge-probe') {
      window.parent.postMessage({ type: 'od:url-selection-bridge-ready' }, '*');
      return;
    }
    if (data.type === 'od:comment-mode') {
      commentEnabled = !!data.enabled;
      mode = data.mode === 'pod' ? 'pod' : 'picker';
      document.documentElement.toggleAttribute('data-od-comment-mode', commentEnabled);
      document.documentElement.setAttribute('data-od-comment-mode-kind', mode);
      if (commentEnabled) setTimeout(postTargets, 0);
      else {
        hoveredId = null;
        activeCommentElementId = null;
        activeCommentSelector = null;
      }
      if (!commentEnabled || mode !== 'pod') {
        drawing = false;
        stroke = [];
        try { window.parent.postMessage({ type: 'od:pod-clear' }, '*'); } catch (_) {}
      }
      return;
    }
    if (data.type === 'od:comment-active-target') {
      activeCommentElementId = data.elementId ? String(data.elementId) : null;
      activeCommentSelector = data.selector ? String(data.selector) : null;
      schedulePostActiveCommentTarget();
    }
  });
  document.addEventListener('mouseover', function(ev){
    if (!commentEnabled || mode !== 'picker') return;
    var result = closestTarget(ev);
    if (!result) return;
    var payload = targetFrom(result.target, true);
    if (!payload || payload.elementId === hoveredId) return;
    hoveredId = payload.elementId;
    window.parent.postMessage(Object.assign({}, payload, { type: 'od:comment-hover' }), '*');
  }, true);
  document.addEventListener('mouseout', function(ev){
    if (!commentEnabled || mode !== 'picker') return;
    var result = closestTarget(ev);
    if (!result) return;
    var next = ev.relatedTarget;
    while (next && next !== document.documentElement) {
      if (next === result.target) return;
      next = next.parentElement;
    }
    hoveredId = null;
    window.parent.postMessage({ type: 'od:comment-leave' }, '*');
  }, true);
  document.addEventListener('click', function(ev){
    if (!commentEnabled || mode !== 'picker') return;
    var result = closestTarget(ev);
    if (result) {
      ev.preventDefault();
      ev.stopPropagation();
      var payload = targetFrom(result.target, true, result.clicked, { x: ev.clientX, y: ev.clientY });
      if (payload) {
        activeCommentElementId = payload.elementId || activeCommentElementId;
        activeCommentSelector = payload.selector || activeCommentSelector;
        window.parent.postMessage(payload, '*');
      }
      return;
    }
    var t = ev.target;
    var walk = t && t.nodeType === 1 ? t : null;
    while (walk && walk !== document.documentElement) {
      var tag = walk.tagName;
      if (tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'LABEL') return;
      if (walk.isContentEditable) return;
      walk = walk.parentElement;
    }
    ev.preventDefault();
    ev.stopPropagation();
    var pinX = Math.round(ev.clientX);
    var pinY = Math.round(ev.clientY);
    var pinId = 'pin-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
    window.parent.postMessage({
      type: 'od:comment-target',
      elementId: pinId,
      selector: '[data-od-pin="' + pinId + '"]',
      label: 'pin',
      text: '',
      position: { x: pinX - 12, y: pinY - 12, width: 24, height: 24 },
      hoverPoint: { x: pinX, y: pinY },
      htmlHint: '',
      style: null,
      freePin: true
    }, '*');
  }, true);
  document.addEventListener('pointerdown', function(ev){
    if (!commentEnabled || mode !== 'pod' || ev.button !== 0) return;
    drawing = true;
    stroke = [relativePoint(ev)];
    ev.preventDefault();
    ev.stopPropagation();
    postStroke('od:pod-stroke');
  }, true);
  document.addEventListener('pointermove', function(ev){
    if (!drawing || mode !== 'pod') return;
    var point = relativePoint(ev);
    var last = stroke[stroke.length - 1];
    if (last && Math.hypot(last.x - point.x, last.y - point.y) < 4) return;
    stroke.push(point);
    ev.preventDefault();
    ev.stopPropagation();
    schedulePostStroke();
  }, true);
  function finishStroke(ev){
    if (!drawing || mode !== 'pod') return;
    drawing = false;
    if (strokeFrame !== null) { cancelAnimationFrame(strokeFrame); strokeFrame = null; }
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    postStroke('od:pod-select');
  }
  document.addEventListener('pointerup', finishStroke, true);
  document.addEventListener('pointercancel', finishStroke, true);
  window.addEventListener('resize', schedulePostTargets);
  document.addEventListener('scroll', function(){
    schedulePostActiveCommentTarget();
    schedulePostTargets();
  }, true);
  var mo = new MutationObserver(schedulePostTargets);
  mo.observe(document.documentElement, { subtree: true, childList: true });
  ensureStyle();
  window.parent.postMessage({ type: 'od:url-selection-bridge-ready' }, '*');
})();
</script>`;

const URL_PREVIEW_SNAPSHOT_BRIDGE = `<script data-od-url-snapshot-bridge>
(function(){
  if (window.__odUrlSnapshotBridge) return;
  window.__odUrlSnapshotBridge = true;
  var SNAPSHOT_STYLE_PROPS = [
    'display','position','box-sizing','width','height','min-width','max-width','min-height','max-height',
    'margin','margin-top','margin-right','margin-bottom','margin-left',
    'padding','padding-top','padding-right','padding-bottom','padding-left',
    'border','border-top','border-right','border-bottom','border-left','border-radius',
    'font','font-family','font-size','font-weight','font-style','line-height','letter-spacing',
    'color','background-color','opacity','transform','transform-origin','overflow','overflow-x','overflow-y',
    'white-space','text-align','vertical-align','object-fit','object-position',
    'flex','flex-direction','flex-wrap','flex-grow','flex-shrink','flex-basis',
    'grid','grid-template-columns','grid-template-rows','grid-column','grid-row',
    'gap','row-gap','column-gap','align-items','align-content','align-self',
    'justify-items','justify-content','justify-self','inset','top','right','bottom','left',
    'z-index','box-shadow','text-shadow'
  ];
  function copyComputedStyle(source, target){
    if (!source || !target || source.nodeType !== 1 || target.nodeType !== 1) return;
    var computed = window.getComputedStyle(source);
    var style = target.getAttribute('style') || '';
    for (var i = 0; i < SNAPSHOT_STYLE_PROPS.length; i++){
      var prop = SNAPSHOT_STYLE_PROPS[i];
      var value = computed.getPropertyValue(prop);
      if (value) style += prop + ':' + value + ';';
    }
    target.setAttribute('style', style);
  }
  function syncElementState(source, target){
    var tag = source.tagName ? source.tagName.toLowerCase() : '';
    if (tag === 'img' && source.currentSrc) target.setAttribute('src', source.currentSrc);
    if (tag === 'input' || tag === 'textarea') target.setAttribute('value', source.value || '');
    if (tag === 'canvas') {
      try {
        var img = document.createElement('img');
        img.setAttribute('src', source.toDataURL('image/png'));
        img.setAttribute('style', target.getAttribute('style') || '');
        target.parentNode && target.parentNode.replaceChild(img, target);
      } catch (_) {}
    }
  }
  function inlineSnapshotStyles(originalRoot, cloneRoot){
    copyComputedStyle(originalRoot, cloneRoot);
    syncElementState(originalRoot, cloneRoot);
    var originals = originalRoot.querySelectorAll('*');
    var clones = cloneRoot.querySelectorAll('*');
    var count = Math.min(originals.length, clones.length, 3500);
    for (var i = 0; i < count; i++){
      copyComputedStyle(originals[i], clones[i]);
      syncElementState(originals[i], clones[i]);
    }
    var scripts = cloneRoot.querySelectorAll('script');
    for (var s = scripts.length - 1; s >= 0; s--) scripts[s].remove();
    var links = cloneRoot.querySelectorAll('link[rel~="stylesheet"], link[rel~="preload"], link[rel~="preconnect"]');
    for (var l = links.length - 1; l >= 0; l--) links[l].remove();
    var styles = cloneRoot.querySelectorAll('style');
    for (var st = 0; st < styles.length; st++) {
      styles[st].textContent = (styles[st].textContent || '')
        .replace(/@import[^;]+;/gi, '')
        .replace(/@font-face\\s*\\{[^}]*\\}/gi, '');
    }
  }
  function pruneHiddenSnapshotNodes(originalRoot, cloneRoot){
    var originals = originalRoot.querySelectorAll('*');
    var clones = cloneRoot.querySelectorAll('*');
    var count = Math.min(originals.length, clones.length);
    var removals = [];
    for (var i = 0; i < count; i++){
      var original = originals[i];
      var clone = clones[i];
      if (!original || !clone || !clone.parentNode) continue;
      var computed = window.getComputedStyle(original);
      if (computed && (computed.display === 'none' || computed.visibility === 'hidden')) removals.push(clone);
    }
    for (var r = removals.length - 1; r >= 0; r--) {
      if (removals[r].parentNode) removals[r].parentNode.removeChild(removals[r]);
    }
  }
  function waitForImages(){
    var imgs = Array.prototype.slice.call(document.images || []);
    return Promise.all(imgs.map(function(img){
      if (img.complete) return Promise.resolve();
      return new Promise(function(resolve){
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    }));
  }
  function scrollOffset(){
    var doc = document.documentElement;
    var body = document.body;
    return {
      x: Math.max(window.scrollX || 0, doc ? doc.scrollLeft || 0 : 0, body ? body.scrollLeft || 0 : 0),
      y: Math.max(window.scrollY || 0, doc ? doc.scrollTop || 0 : 0, body ? body.scrollTop || 0 : 0)
    };
  }
  function escapeAttribute(value){
    return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
  function snapshotBackgroundColor(){
    try {
      var probe = window.getComputedStyle(document.body || document.documentElement);
      var bg = probe && probe.backgroundColor || '';
      if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') return '#ffffff';
      return bg;
    } catch (_) { return '#ffffff'; }
  }
  function canvasLooksBlank(ctx, cw, ch){
    try {
      var data = ctx.getImageData(0, 0, cw, ch).data;
      var step = Math.max(4, Math.floor((cw * ch) / 4096)) * 4;
      var first = null, samples = 0;
      for (var i = 0; i + 3 < data.length; i += step){
        samples++;
        if (!first){ first = [data[i], data[i+1], data[i+2], data[i+3]]; continue; }
        if (Math.abs(data[i]-first[0]) > 6 || Math.abs(data[i+1]-first[1]) > 6 ||
            Math.abs(data[i+2]-first[2]) > 6 || Math.abs(data[i+3]-first[3]) > 6) return false;
      }
      return samples > 8;
    } catch (_) { return false; }
  }
  function renderSnapshot(id){
    var w = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    var h = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    var dpr = window.devicePixelRatio || 1;
    var bgColor = snapshotBackgroundColor();
    var docW = Math.max(w, document.documentElement.scrollWidth || 0, document.body ? document.body.scrollWidth : 0);
    var docH = Math.max(h, document.documentElement.scrollHeight || 0, document.body ? document.body.scrollHeight : 0);
    var clone = document.documentElement.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    inlineSnapshotStyles(document.documentElement, clone);
    pruneHiddenSnapshotNodes(document.documentElement, clone);
    var scroll = scrollOffset();
    var cloneBody = clone.querySelector('body');
    var rootStyle = clone.getAttribute('style') || '';
    var bodyStyle = cloneBody ? cloneBody.getAttribute('style') || '' : '';
    var bodyContent = cloneBody ? cloneBody.innerHTML : clone.innerHTML;
    var wrapperStyle = rootStyle + bodyStyle +
      'margin:0;position:relative;left:' + (-scroll.x) + 'px;top:' + (-scroll.y) + 'px;' +
      'width:' + docW + 'px;height:' + docH + 'px;overflow:visible;';
    var html = '<div xmlns="http://www.w3.org/1999/xhtml" style="' + escapeAttribute(wrapperStyle) + '">' + bodyContent + '</div>';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<foreignObject x="0" y="0" width="' + docW + '" height="' + docH + '">' + html + '</foreignObject></svg>';
    var img = new Image();
    img.onload = function(){
      try {
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(w * dpr));
        canvas.height = Math.max(1, Math.floor(h * dpr));
        var ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d context');
        ctx.scale(dpr, dpr);
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        if (canvasLooksBlank(ctx, canvas.width, canvas.height)) {
          window.parent.postMessage({ type: 'od:snapshot:result', id: id, error: 'empty-render' }, '*');
          return;
        }
        window.parent.postMessage({ type: 'od:snapshot:result', id: id, dataUrl: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height }, '*');
      } catch (err) {
        window.parent.postMessage({ type: 'od:snapshot:result', id: id, error: String(err && err.message || err) }, '*');
      }
    };
    img.onerror = function(){
      window.parent.postMessage({ type: 'od:snapshot:result', id: id, error: 'snapshot image failed' }, '*');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  window.addEventListener('message', function(ev){
    var data = ev && ev.data;
    if (!data || data.type !== 'od:snapshot' || !data.id) return;
    waitForImages().then(function(){ renderSnapshot(String(data.id)); });
  });
})();
</script>`;

function previewBridgeTokens(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(previewBridgeTokens);
  if (typeof value !== 'string') return [];
  return value.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
}

function wantsUrlPreviewScrollBridge(value: unknown): boolean {
  return previewBridgeTokens(value).some((token) => token === 'scroll' || token === '1' || token === 'true');
}

function wantsUrlPreviewSelectionBridge(value: unknown): boolean {
  return previewBridgeTokens(value).some((token) => token === 'selection' || token === 'comment' || token === 'comments' || token === 'annotation');
}

function wantsUrlPreviewSnapshotBridge(value: unknown): boolean {
  return previewBridgeTokens(value).some((token) => token === 'snapshot' || token === 'image' || token === 'capture');
}

function injectBeforeBodyClose(html: string, marker: string, injection: string): string {
  if (html.includes(marker)) return html;
  const bodyCloseIndex = html.search(/<\/body\s*>/i);
  if (bodyCloseIndex >= 0) {
    return `${html.slice(0, bodyCloseIndex)}${injection}${html.slice(bodyCloseIndex)}`;
  }
  return `${html}${injection}`;
}

function injectUrlPreviewBridge(html: string, bridge: 'scroll' | 'selection' | 'snapshot'): string {
  if (bridge === 'scroll') {
    return injectBeforeBodyClose(html, 'data-od-url-scroll-bridge', URL_PREVIEW_SCROLL_BRIDGE);
  }
  if (bridge === 'selection') {
    return injectBeforeBodyClose(html, 'data-od-url-selection-bridge', URL_PREVIEW_SELECTION_BRIDGE);
  }
  return injectBeforeBodyClose(html, 'data-od-url-snapshot-bridge', URL_PREVIEW_SNAPSHOT_BRIDGE);
}

// ---------------------------------------------------------------------------
// Teams-safe title sanitization for the URL-load preview path (issue #3918).
//
// When a user prints an HTML preview via Cmd+P → "Save as PDF", Chromium uses
// the iframe's document <title> as the default filename. The URL-load iframe
// uses sandbox="allow-scripts allow-downloads" (no allow-same-origin), so the
// host page cannot access contentDocument to rewrite the title after load.
// Instead we rewrite it here, in the daemon response, before the browser
// parses the document. The web srcDoc path has its own sanitizeTitleInDoc in
// apps/web/src/runtime/srcdoc.ts — keep the two in sync when the logic changes.
// ---------------------------------------------------------------------------

/** Named non-ASCII entities common in business/design document titles. */
const DAEMON_NAMED_ENTITY_MAP: Record<string, string> = {
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å',
  aelig: 'æ', ccedil: 'ç',
  egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë',
  igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï',
  eth: 'ð', ntilde: 'ñ',
  ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø',
  ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü',
  yacute: 'ý', thorn: 'þ', yuml: 'ÿ',
  Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å',
  AElig: 'Æ', Ccedil: 'Ç',
  Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë',
  Igrave: 'Ì', Iacute: 'Í', Icirc: 'Î', Iuml: 'Ï',
  ETH: 'Ð', Ntilde: 'Ñ',
  Ograve: 'Ò', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', Oslash: 'Ø',
  Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û', Uuml: 'Ü',
  Yacute: 'Ý', THORN: 'Þ',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', hellip: '…', trade: '™', reg: '®',
  copy: '©', deg: '°', euro: '€', pound: '£', yen: '¥',
};

function daemonSafeFromCodePoint(cp: number): string {
  if (cp < 0 || cp > 0x10ffff) return '�';
  return String.fromCodePoint(cp);
}

function daemonDecodeHtmlEntitiesForTitle(encoded: string): string {
  return encoded
    .replace(/&([A-Za-z]+);/g, (match: string, name: string) => DAEMON_NAMED_ENTITY_MAP[name] ?? match)
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_: string, n: string) => daemonSafeFromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_: string, h: string) => daemonSafeFromCodePoint(parseInt(h, 16)));
}

function daemonSanitizePreviewTitle(text: string): string {
  // Trim first so that leading whitespace cannot hide a ~$ prefix from the
  // anchor-based check below (e.g. "  ~$Invoice" would otherwise survive).
  let result = text.trim();
  // Remove every leading ~$ prefix. A single replace(/^~\$/, '') is not
  // enough when the prefix is doubled ("~$~$Doc"). Loop until stable, then
  // re-trim in case a space followed the prefix ("~$ Invoice" → " Invoice").
  let prev: string;
  do {
    prev = result;
    result = result.replace(/^~\$/, '').trim();
  } while (result !== prev);
  // Replace each disallowed character (or run of them) with a single hyphen.
  // Character class: : # % & * { } \ < > ? / + | "
  // eslint-disable-next-line no-useless-escape
  result = result.replace(/[:#%&*{}\\<>?/+|"]+/g, '-');
  // Final trim to remove any spaces exposed by the substitution.
  return result.trim();
}

/**
 * Find the offset of the first real `<title>` tag in html[0..searchLimit)
 * that is not inside an HTML comment or a `<script>`/`<style>` block.
 * Returns -1 if no real title is found.
 */
function daemonFindRealTitleOffset(html: string, searchLimit: number): number {
  let i = 0;
  const limit = Math.min(html.length, searchLimit);
  while (i < limit) {
    if (html.charCodeAt(i) === 60 /* < */ && html.slice(i, i + 4) === '<!--') {
      const end = html.indexOf('-->', i + 4);
      if (end < 0) return -1;
      i = end + 3;
      continue;
    }
    if (html.charCodeAt(i) === 60 /* < */) {
      const tagMatch = /^<(script|style)\b/i.exec(html.slice(i, i + 20));
      if (tagMatch) {
        const closingTag = `</${tagMatch[1]}`;
        const end = html.toLowerCase().indexOf(closingTag.toLowerCase(), i + tagMatch[0].length);
        if (end < 0) return -1;
        const closeEnd = html.indexOf('>', end);
        i = closeEnd >= 0 ? closeEnd + 1 : end + closingTag.length;
        continue;
      }
    }
    if (html.charCodeAt(i) === 60 /* < */) {
      if (/^<title[\s>]/i.test(html.slice(i, i + 8))) return i;
    }
    i++;
  }
  return -1;
}

/**
 * Rewrite the `<title>` in html so the resulting PDF filename is Teams-safe.
 * Only the real `<head>` title is changed; `<title>` inside comments or script
 * blocks is left untouched. Mirrors sanitizeTitleInDoc in srcdoc.ts.
 *
 * Exported for unit testing; not part of the public API surface.
 */
export function daemonSanitizeTitleInDoc(html: string): string {
  const lower = html.toLowerCase();
  const bodyStart = lower.indexOf('<body');
  const headEnd = lower.lastIndexOf('</head>', bodyStart >= 0 ? bodyStart - 1 : lower.length - 1);
  const searchLimit = headEnd >= 0
    ? headEnd + 7
    : bodyStart >= 0
      ? bodyStart
      : html.length;

  const titleStart = daemonFindRealTitleOffset(html, searchLimit);
  if (titleStart < 0) return html;

  const openTagEnd = html.indexOf('>', titleStart);
  if (openTagEnd < 0) return html;

  const closingTagStart = html.toLowerCase().indexOf('</title>', openTagEnd + 1);
  if (closingTagStart < 0) return html;

  const closingTagEnd = html.indexOf('>', closingTagStart);
  if (closingTagEnd < 0) return html;

  const openTag = html.slice(titleStart, openTagEnd + 1);
  const rawContent = html.slice(openTagEnd + 1, closingTagStart);
  const closeTag = html.slice(closingTagStart, closingTagEnd + 1);

  const decoded = daemonDecodeHtmlEntitiesForTitle(rawContent);
  const safe = daemonSanitizePreviewTitle(decoded);

  return html.slice(0, titleStart) + openTag + safe + closeTag + html.slice(closingTagEnd + 1);
}

function normalizeChatSessionMode(value: unknown): ChatSessionMode {
  return value === 'chat' || value === 'plan' ? value : 'design';
}

function isDesignSystemLikeProject(project: any): boolean {
  const metadata = project?.metadata;
  if (!metadata || typeof metadata !== 'object') return false;
  return (
    metadata.kind === 'brand' ||
    metadata.importedFrom === 'design-system' ||
    metadata.importedFrom === 'brand-extraction' ||
    (typeof metadata.brandDesignSystemId === 'string' && metadata.brandDesignSystemId.trim().length > 0)
  );
}

function normalizeDesignSystemCopyName(value: unknown, sourceProject: any): string {
  const explicit = typeof value === 'string' ? value.trim() : '';
  if (explicit) return explicit.slice(0, 160);
  const sourceName = typeof sourceProject?.name === 'string' && sourceProject.name.trim()
    ? sourceProject.name.trim()
    : 'Untitled';
  return /\bdesign system\b/i.test(sourceName)
    ? sourceName.slice(0, 160)
    : `${sourceName} Design System`.slice(0, 160);
}

function normalizeProjectDuplicateName(value: unknown, sourceProject: any): string {
  const explicit = typeof value === 'string' ? value.trim() : '';
  if (explicit) return explicit.slice(0, 160);
  const sourceName = typeof sourceProject?.name === 'string' && sourceProject.name.trim()
    ? sourceProject.name.trim()
    : 'Untitled';
  return `${sourceName} Copy`.slice(0, 160);
}

function normalizePendingPrompt(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cloneProjectMetadataForDuplicate(sourceProject: any): Record<string, unknown> {
  const sourceMetadata =
    sourceProject?.metadata && typeof sourceProject.metadata === 'object'
      ? { ...sourceProject.metadata }
      : {};
  delete sourceMetadata.baseDir;
  delete sourceMetadata.projectLocationId;
  delete sourceMetadata.fromTrustedPicker;
  delete sourceMetadata.orchestratorWorkspace;
  return {
    ...sourceMetadata,
    sourceProjectId: sourceProject.id,
    sourceProjectName: sourceProject.name,
  };
}

function buildDesignSystemCopySourceContext(input: {
  sourceProject: any;
  targetProjectId: string;
  designSystemId: string;
  copiedFiles: string[];
  skippedFiles: Array<{ name: string; reason: string }>;
}): string {
  const metadata =
    input.sourceProject?.metadata && typeof input.sourceProject.metadata === 'object'
      ? JSON.stringify(input.sourceProject.metadata, null, 2)
      : '{}';
  const copied = input.copiedFiles.length > 0
    ? input.copiedFiles.map((name) => `- ${name}`).join('\n')
    : '- (none)';
  const skipped = input.skippedFiles.length > 0
    ? input.skippedFiles.map((entry) => `- ${entry.name}: ${entry.reason}`).join('\n')
    : '- (none)';
  return [
    '# Source Project Context',
    '',
    'This design-system workspace was created from an existing Open Design project. Treat the copied project files as the primary source evidence for the generated design system.',
    '',
    '## Source project',
    '',
    `- Source project id: ${input.sourceProject.id}`,
    `- Source project name: ${input.sourceProject.name}`,
    `- New design-system project id: ${input.targetProjectId}`,
    `- New design-system id: ${input.designSystemId}`,
    `- Source skill id: ${input.sourceProject.skillId ?? '(none)'}`,
    `- Source design system id: ${input.sourceProject.designSystemId ?? '(none)'}`,
    '',
    '## Source metadata',
    '',
    '```json',
    metadata,
    '```',
    '',
    '## Copied files',
    '',
    copied,
    '',
    '## Skipped files',
    '',
    skipped,
    '',
    '## Generation contract',
    '',
    '- Read this file before editing design-system outputs.',
    '- Read the copied files directly from the project workspace; they are source evidence, not generated design-system output.',
    '- Preserve high-signal assets, source examples, UI surfaces, copy, tokens, typography, and interaction patterns from the copied project.',
    '- Generate a reusable Open Design design-system package in this same project: DESIGN.md, README.md, SKILL.md, colors_and_type.css, context/provenance, focused preview cards, preserved assets/build/fonts when available, and ui_kits/app/.',
    '- Before final response, run `"$OD_NODE_BIN" "$OD_BIN" tools connectors design-system-package-audit --path . --fail-on-warnings` and fix every actionable issue.',
    '',
  ].join('\n');
}

function buildDesignSystemCopyPendingPrompt(input: {
  sourceProject: any;
  targetProjectId: string;
  designSystemId: string;
  copiedFiles: string[];
}): string {
  const metadata =
    input.sourceProject?.metadata && typeof input.sourceProject.metadata === 'object'
      ? JSON.stringify(input.sourceProject.metadata, null, 2)
      : '{}';
  const visibleFiles = input.copiedFiles
    .slice(0, 140)
    .map((name) => `  - ${name}`);
  return [
    'Create this project as a complete Open Design design system workspace.',
    '',
    'Autonomy requirement:',
    '- Do not ask setup or clarification questions during design-system generation.',
    '- Do not emit `<question-form>`, "Quick brief — 30 seconds", direction cards, choice cards, or any UI that waits for user input.',
    '- The source project already contains the evidence. Choose sensible defaults where details are missing and begin generating the design-system artifacts immediately.',
    '',
    'Source project handoff:',
    `- Source project id: ${input.sourceProject.id}`,
    `- Source project name: ${input.sourceProject.name}`,
    `- New design-system project id: ${input.targetProjectId}`,
    `- New design-system id: ${input.designSystemId}`,
    '- Read `context/source-context.md` first. It lists the copied project files and original project metadata.',
    '- Treat every copied file, uploaded asset, reference image, browser snapshot, sketch, generated artifact, and context note in this workspace as design-system evidence.',
    '- Use the copied project outputs to infer real visual language, components, layout, interaction patterns, copy tone, tokens, typography, spacing, assets, and anti-patterns.',
    '- Do not create another project or another design-system id. Update this new design-system project in place.',
    '',
    'Source project metadata:',
    '```json',
    metadata,
    '```',
    '',
    'Copied files to inspect:',
    ...(visibleFiles.length > 0 ? visibleFiles : ['  - (none copied; rely on context/source-context.md and project metadata)']),
    input.copiedFiles.length > visibleFiles.length
      ? `  - ...and ${input.copiedFiles.length - visibleFiles.length} more files listed in context/source-context.md`
      : '',
    '',
    'Expected output:',
    '- A clear `DESIGN.md` with product context, visual foundations, color, type, spacing, layout, components, motion, voice, and anti-patterns.',
    '- A reusable package: `README.md`, `SKILL.md`, `colors_and_type.css`, provenance notes, `assets/`, `build/` when runtime icons exist, optional `fonts/`, focused `preview/` cards, preserved source examples, and `ui_kits/app/`.',
    '- Preserve real source assets when evidence provides them: logos, app icons, tray icons, avatars, wordmarks, imagery, and font files belong in `assets/`, `build/`, or `fonts/`, not only in prose.',
    '- Preserve high-signal source/component examples outside `context/` when copied files include substantial implementation or artifact code. Do not replace them with tiny stubs.',
    '- Split review previews into focused cards for colors, typography, spacing, radius/shadows, components, brand assets, and applied UI surfaces. Preview cards must visibly load preserved files when available.',
    '- Build `ui_kits/app/` as an applied interface kit that reflects the source project, with an index page and component files when the evidence supports them. Do not leave it as a generic static mock.',
    '- Keep `README.md`, `SKILL.md`, `DESIGN.md`, preview manifest text, and `ui_kits/app/README.md` synchronized with the final file structure.',
    '',
    'Completion gate:',
    '- Finish only after the project contains reviewable design-system artifacts and the right-side Design System tab can inspect them.',
    '- Before your final response, run `"$OD_NODE_BIN" "$OD_BIN" tools connectors design-system-package-audit --path . --fail-on-warnings`.',
    '- Fix every audit error and design-quality warning. If an issue cannot be fixed because source evidence is missing, explain that blocker instead of claiming the design system is ready.',
    '',
    'When finished, summarize the generated files and name the first previews reviewers should inspect.',
  ].filter(Boolean).join('\n');
}

export function registerProjectRoutes(app: Express, ctx: RegisterProjectRoutesDeps) {
  const { db, design } = ctx;
  const { sendApiError, createSseResponse } = ctx.http;
  const { DESIGN_SYSTEMS_DIR, PROJECTS_DIR, SKILLS_DIR, BRANDS_DIR, USER_DESIGN_SYSTEMS_DIR } = ctx.paths;
  const { readAppConfig, writeAppConfig } = ctx.appConfig;
  const { insertProject, validateLinkedDirs, getProject, updateProject, dbDeleteProject, removeProjectDir } = ctx.projectStore;
  const { writeProjectFile, readProjectFile, ensureProject, listFiles, listTabs, setTabs, resolveProjectDir } = ctx.projectFiles;
  const { insertConversation } = ctx.conversations;
  const { getTemplate, listTemplates, deleteTemplate, insertTemplate, findTemplateByNameAndProject, updateTemplate } = ctx.templates;
  const { listLatestProjectRunStatuses, listProjectsAwaitingInput, normalizeProjectDisplayStatus, composeProjectDisplayStatus, listProjects } = ctx.status;
  const { subscribeFileEvents, activeProjectEventSinks } = ctx.events;
  const { randomId } = ctx.ids;
  const { validateProjectDesignSystemId, validateProjectSkillId } = ctx.validation;
  async function loadPluginRegistryView() {
    const [skills, designSystems] = await Promise.all([
      listSkills(SKILLS_DIR),
      listDesignSystems(DESIGN_SYSTEMS_DIR),
    ]);
    return {
      skills: skills.map((s) => ({ id: s.id, title: s.name, description: s.description })),
      designSystems: designSystems.map((d) => ({ id: d.id, title: d.title })),
      craft: [],
      atoms: FIRST_PARTY_ATOMS.map((a) => ({ id: a.id, label: a.label })),
      scenarios: collectBundledScenarios(),
    };
  }

  function collectBundledScenarios() {
    type ScenarioEntry = {
      id: string;
      taskKind: 'new-generation' | 'figma-migration' | 'code-migration' | 'tune-collab';
      pipeline: NonNullable<NonNullable<PluginManifest['od']>['pipeline']>;
    };
    const byTaskKind = new Map<ScenarioEntry['taskKind'], ScenarioEntry>();
    try {
      const all = listInstalledPlugins(db);
      for (const row of all) {
        if (row.sourceKind !== 'bundled') continue;
        const od = row.manifest.od;
        if (!od || od.kind !== 'scenario') continue;
        if (!od.pipeline || !Array.isArray(od.pipeline.stages) || od.pipeline.stages.length === 0) continue;
        const taskKind = (od.taskKind ?? 'new-generation') as ScenarioEntry['taskKind'];
        if (
          taskKind !== 'new-generation' &&
          taskKind !== 'figma-migration' &&
          taskKind !== 'code-migration' &&
          taskKind !== 'tune-collab'
        ) {
          continue;
        }
        const entry: ScenarioEntry = { id: row.id, taskKind, pipeline: od.pipeline };
        const existing = byTaskKind.get(taskKind);
        if (!existing || entry.id === `od-${taskKind}`) {
          byTaskKind.set(taskKind, entry);
        }
      }
    } catch {
      return [];
    }
    return Array.from(byTaskKind.values());
  }

  async function configuredProjectLocations() {
    const config = await readAppConfig(ctx.paths.RUNTIME_DATA_DIR);
    const all = allProjectLocations(PROJECTS_DIR, config.projectLocations);
    const valid = all[0] ? [all[0]] : [];
    for (const location of all.slice(1)) {
      const validated = validateLinkedDirs([location.path]);
      if (validated.error) continue;
      const canonical = validated.dirs[0];
      if (!canonical) continue;
      if (locationOverlapsDaemonData(canonical)) continue;
      valid.push({ ...location, path: canonical });
    }
    return valid;
  }

  function locationOverlapsDaemonData(locationPath: string): boolean {
    const runtimeDir = ctx.paths.RUNTIME_DATA_DIR_CANONICAL || ctx.paths.RUNTIME_DATA_DIR;
    const projectsDir = path.join(runtimeDir, 'projects');
    const relativeToRuntime = pathRelative(runtimeDir, locationPath);
    const runtimeInsideLocation = pathRelative(locationPath, runtimeDir);
    const relativeToProjects = pathRelative(projectsDir, locationPath);
    const projectsInsideLocation = pathRelative(locationPath, projectsDir);
    return isInsideOrSame(relativeToRuntime) || isInsideOrSame(runtimeInsideLocation)
      || isInsideOrSame(relativeToProjects) || isInsideOrSame(projectsInsideLocation);
  }

  function pathRelative(from: string, to: string): string {
    return path.relative(from, to);
  }

  function isInsideOrSame(relative: string): boolean {
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }

  function projectBelongsToLocation(project: any, location: { id: string; path: string }): boolean {
    const metadata = project?.metadata;
    if (typeof metadata?.baseDir !== 'string') return metadata?.projectLocationId === location.id;
    const relative = path.relative(location.path, metadata.baseDir);
    return isInsideOrSame(relative) && relative !== '';
  }

  function isProjectLocationProject(project: any): boolean {
    const metadata = project?.metadata;
    return metadata?.importedFrom === 'project-location'
      || typeof metadata?.projectLocationId === 'string';
  }

  function projectVisibleForLocations(
    project: any,
    locations: Array<{ id: string; path: string; builtIn?: boolean }>,
  ): boolean {
    if (!isProjectLocationProject(project)) return true;
    return locations.some((location) => !location.builtIn && projectBelongsToLocation(project, location));
  }

  async function resolveCreateProjectLocationId(explicitProjectLocationId: unknown): Promise<string> {
    if (typeof explicitProjectLocationId === 'string' && explicitProjectLocationId.trim()) {
      return explicitProjectLocationId.trim();
    }
    const config = await readAppConfig(ctx.paths.RUNTIME_DATA_DIR);
    const configuredDefault = typeof config.defaultProjectLocationId === 'string'
      ? config.defaultProjectLocationId.trim()
      : '';
    if (!configuredDefault || configuredDefault === BUILT_IN_PROJECT_LOCATION_ID) {
      return BUILT_IN_PROJECT_LOCATION_ID;
    }
    const locations = await configuredProjectLocations();
    return locations.some((location) => !location.builtIn && location.id === configuredDefault)
      ? configuredDefault
      : BUILT_IN_PROJECT_LOCATION_ID;
  }

  function unregisterProjectsForRemovedLocations(
    previousLocations: Array<{ id: string; path: string; builtIn?: boolean }>,
    nextLocations: Array<{ id?: string; path: string }>,
  ): string[] {
    const nextIds = new Set(nextLocations.map((location) => location.id).filter(Boolean));
    const nextPaths = new Set(nextLocations.map((location) => location.path));
    const removed = previousLocations.filter(
      (location) => !location.builtIn && !nextIds.has(location.id) && !nextPaths.has(location.path),
    );
    if (removed.length === 0) return [];
    return listProjects(db)
      .filter((project: any) => removed.some((location) => projectBelongsToLocation(project, location)))
      .map((project: any) => project.id);
  }

  app.get('/api/project-locations', async (_req, res) => {
    try {
      const locations = await configuredProjectLocations();
      /** @type {import('@open-design/contracts').ProjectLocationsResponse} */
      const body = { locations };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  app.put('/api/project-locations', async (req, res) => {
    try {
      const requested = Array.isArray(req.body?.locations) ? req.body.locations : null;
      if (!requested) return sendApiError(res, 400, 'BAD_REQUEST', 'locations must be an array');
      const previousLocations = await configuredProjectLocations();
      const prepared = [];
      for (const loc of requested) {
        if (!loc || typeof loc !== 'object' || typeof loc.path !== 'string') continue;
        const canonicalPath = await ensureProjectLocation(loc.path);
        const validated = validateLinkedDirs([canonicalPath]);
        if (validated.error) return sendApiError(res, 400, 'BAD_REQUEST', validated.error);
        if (locationOverlapsDaemonData(canonicalPath)) {
          return sendApiError(res, 400, 'BAD_REQUEST', 'project location cannot overlap daemon data');
        }
        prepared.push({
          id: typeof loc.id === 'string' ? loc.id : undefined,
          name: typeof loc.name === 'string' ? loc.name : undefined,
          path: canonicalPath,
        });
      }
      const config = await writeAppConfig(ctx.paths.RUNTIME_DATA_DIR, { projectLocations: prepared });
      const locations = allProjectLocations(PROJECTS_DIR, config.projectLocations);
      const removedProjectIds = unregisterProjectsForRemovedLocations(previousLocations, config.projectLocations ?? []);
      /** @type {import('@open-design/contracts').ProjectLocationsResponse} */
      const body = { locations, removedProjectIds };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.post('/api/project-locations/scan', async (_req, res) => {
    try {
      const locations = (await configuredProjectLocations()).filter((loc: any) => !loc.builtIn);
      const imported = [];
      const existing: string[] = [];
      const skipped: Array<{ path: string; reason: string }> = [];
      let scanned = 0;
      const now = Date.now();
      for (const location of locations) {
        let found;
        try {
          found = await scanProjectLocation(location);
        } catch (err: any) {
          skipped.push({ path: location.path, reason: String(err?.message ?? err) });
          continue;
        }
        scanned += found.length;
        for (const entry of found) {
          const { manifest } = entry;
          if (getProject(db, manifest.id)) {
            existing.push(manifest.id);
            continue;
          }
          try {
            const project = insertProject(db, {
              id: manifest.id,
              name: manifest.name,
              skillId: manifest.skillId ?? null,
              designSystemId: manifest.designSystemId ?? null,
              pendingPrompt: null,
              metadata: {
                kind: 'prototype',
                baseDir: entry.dir,
                importedFrom: 'project-location',
                projectLocationId: location.id,
              },
              customInstructions: null,
              createdAt: manifest.createdAt,
              updatedAt: manifest.updatedAt,
            });
            insertConversation(db, {
              id: randomId(),
              projectId: manifest.id,
              title: null,
              createdAt: now,
              updatedAt: now,
            });
            if (project) imported.push(project);
          } catch (err: any) {
            skipped.push({ path: entry.dir, reason: String(err?.message ?? err) });
          }
        }
      }
      /** @type {import('@open-design/contracts').ScanProjectLocationsResponse} */
      const body = { scanned, imported, existing, skipped };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.get('/api/projects', async (_req, res) => {
    try {
      const locations = await configuredProjectLocations();
      const latestRunStatuses = listLatestProjectRunStatuses(db);
      const awaitingInputProjects = listProjectsAwaitingInput(db);
      const activeRunStatuses = new Map();
      for (const run of design.runs.list()) {
        if (!run.projectId) continue;
        const runStatus = projectStatusFromRun(run);
        if (design.runs.isTerminal(run.status)) {
          const existing = latestRunStatuses.get(run.projectId);
          if (!existing || run.updatedAt > (existing.updatedAt ?? 0)) {
            latestRunStatuses.set(run.projectId, runStatus);
          }
        } else {
          const existing = activeRunStatuses.get(run.projectId);
          if (!existing || run.updatedAt > (existing.updatedAt ?? 0)) {
            activeRunStatuses.set(run.projectId, runStatus);
          }
        }
      }
      /** @type {import('@open-design/contracts').ProjectsResponse} */
      const body = {
        projects: listProjects(db)
          .filter((project: any) => projectVisibleForLocations(project, locations))
          .map((project: any) => ({
            ...project,
            status: brandAwareProjectStatus(
              project,
              composeProjectDisplayStatus(
                activeRunStatuses.get(project.id) ??
                  latestRunStatuses.get(project.id) ?? { value: 'not_started' },
                awaitingInputProjects,
                project.id,
              ),
            ),
          })),
      };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  function projectStatusFromRun(run: any) {
    return {
      value: normalizeProjectDisplayStatus(run.status),
      updatedAt: run.updatedAt,
      runId: run.id,
    };
  }

  // Brand-extraction projects are driven by a brand lifecycle (extracting →
  // needs_input → ready / failed), not only by a chat run. When the run-derived
  // status would be `not_started` — e.g. the programmatic-first finalize ran
  // without a recorded chat run, or the daemon restarted and the in-memory run
  // aged out — fall back to the brand's own status so Home / Designs never show
  // a live brand extraction as "Not started". Run-derived status is kept
  // whenever it is meaningful (queued/running/succeeded/failed/awaiting_input).
  function brandAwareProjectStatus(project: any, status: { value: string; updatedAt?: number; runId?: string }) {
    if (status.value !== 'not_started') return status;
    const metadata = project?.metadata;
    if (metadata?.kind !== 'brand') return status;
    const brandId = typeof metadata.brandId === 'string' ? metadata.brandId : null;
    if (!brandId) return status;
    const brandMeta = readBrandMeta(BRANDS_DIR, brandId);
    if (!brandMeta) return status;
    const mapped =
      brandMeta.status === 'ready'
        ? 'succeeded'
        : brandMeta.status === 'failed'
          ? 'failed'
          : brandMeta.status === 'needs_input'
            ? 'awaiting_input'
            : 'running'; // 'extracting'
    return { ...status, value: mapped, updatedAt: status.updatedAt ?? brandMeta.updatedAt };
  }

  app.post('/api/projects', async (req, res) => {
    try {
      const { id, name, projectLocationId, skillId, designSystemId, pendingPrompt, metadata, customInstructions, skipDiscoveryBrief } =
        req.body || {};
      if (typeof id !== 'string' || !isSafeId(id)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'invalid project id');
      }
      if (typeof name !== 'string' || !name.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'name required');
      }
      // baseDir is privileged: it lets a project root directly inside the
      // user's filesystem. The /api/import/folder endpoint is the only
      // path that's allowed to set it, because that's where realpath() +
      // RUNTIME_DATA_DIR reentry checks live. Block client-supplied
      // metadata.baseDir on this generic create endpoint so an attacker
      // can't smuggle e.g. /etc through here. Same rule for
      // originalBaseDir / importedFrom='folder' — only the import path
      // owns those state fields.
      if (metadata && typeof metadata === 'object') {
        if ('baseDir' in metadata) {
          return sendApiError(
            res, 400, 'BAD_REQUEST',
            'baseDir can only be set via POST /api/import/folder',
          );
        }
        if ('fromTrustedPicker' in metadata) {
          return sendApiError(
            res, 400, 'BAD_REQUEST',
            'fromTrustedPicker can only be set via POST /api/import/folder',
          );
        }
        if ('orchestratorWorkspace' in metadata) {
          return sendApiError(
            res, 400, 'BAD_REQUEST',
            'orchestratorWorkspace can only be set via POST /api/import/folder or POST /api/projects/:id/working-dir',
          );
        }
        // Reject invalid linked working directories up front (consistent with
        // PATCH /api/projects/:id) instead of silently dropping them. The
        // caller promises the agent `--add-dir` access to this folder; if the
        // path is deleted/inaccessible/a system dir, fail loudly so the client
        // can surface it rather than creating a project + auto-running a turn
        // whose linked-dir access never materialises.
        if (Array.isArray(metadata.linkedDirs)) {
          const validated = validateLinkedDirs(metadata.linkedDirs);
          if (validated.error) {
            return sendApiError(res, 400, 'INVALID_LINKED_DIR', validated.error);
          }
        }
      }
      if (customInstructions !== undefined
          && typeof customInstructions !== 'string'
          && customInstructions !== null) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'customInstructions must be a string or null');
      }
      if (typeof customInstructions === 'string' && customInstructions.length > 5000) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'customInstructions exceeds 5 000 character limit');
      }
      if (skipDiscoveryBrief !== undefined && typeof skipDiscoveryBrief !== 'boolean') {
        return sendApiError(res, 400, 'BAD_REQUEST', 'skipDiscoveryBrief must be a boolean');
      }
      const designSystemValidation = await validateProjectDesignSystemId(designSystemId);
      if (!designSystemValidation.ok) {
        return sendApiError(
          res,
          400,
          designSystemValidation.code,
          designSystemValidation.message,
        );
      }
      const normalizedDesignSystemId = designSystemValidation.id;
      const skillValidation = await validateProjectSkillId(skillId);
      if (!skillValidation.ok) {
        return sendApiError(res, 400, skillValidation.code, skillValidation.message);
      }
      const normalizedSkillId = skillValidation.id;
      const selectedLocationId = await resolveCreateProjectLocationId(projectLocationId);
      let externalProjectDir: string | null = null;
      if (selectedLocationId !== BUILT_IN_PROJECT_LOCATION_ID) {
        const location = (await configuredProjectLocations()).find((loc: any) => loc.id === selectedLocationId);
        if (!location || location.builtIn) {
          return sendApiError(res, 400, 'BAD_REQUEST', 'unknown project location');
        }
        if (getProject(db, id)) {
          return sendApiError(res, 400, 'BAD_REQUEST', 'project id already exists');
        }
        externalProjectDir = await createLocationProjectDir(location, id);
      }
      const projectMetadata =
        metadata && typeof metadata === 'object'
          ? {
              ...metadata,
              ...(skipDiscoveryBrief === true ? { skipDiscoveryBrief: true } : {}),
              ...(externalProjectDir
                ? {
                    baseDir: externalProjectDir,
                    importedFrom: 'project-location',
                    projectLocationId: selectedLocationId,
                  }
                : {}),
              ...(Array.isArray(metadata.linkedDirs)
                ? (() => {
                    const v = validateLinkedDirs(metadata.linkedDirs);
                    return v.error ? {} : { linkedDirs: v.dirs };
                  })()
                : {}),
            }
          : skipDiscoveryBrief === true
            ? {
                skipDiscoveryBrief: true,
                ...(externalProjectDir
                  ? {
                      baseDir: externalProjectDir,
                      importedFrom: 'project-location',
                      projectLocationId: selectedLocationId,
                    }
                  : {}),
              }
            : externalProjectDir
              ? {
                  kind: 'prototype',
                  baseDir: externalProjectDir,
                  importedFrom: 'project-location',
                  projectLocationId: selectedLocationId,
                }
              : null;
      const now = Date.now();
      let project;
      try {
        if (externalProjectDir) {
          await writeProjectManifest(externalProjectDir, {
            schemaVersion: 1,
            id,
            name: name.trim(),
            createdAt: now,
            updatedAt: now,
            skillId: normalizedSkillId,
            designSystemId: normalizedDesignSystemId,
          });
        }
        project = insertProject(db, {
          id,
          name: name.trim(),
          skillId: normalizedSkillId,
          designSystemId: normalizedDesignSystemId,
          pendingPrompt: pendingPrompt || null,
          metadata: projectMetadata,
          customInstructions:
            typeof customInstructions === 'string'
              ? customInstructions
              : null,
          createdAt: now,
          updatedAt: now,
        });
      } catch (err) {
        if (externalProjectDir) {
          await rm(externalProjectDir, { recursive: true, force: true }).catch(() => {});
        }
        throw err;
      }
      // Seed a default conversation so the UI always has somewhere to write.
      const cid = randomId();
      const initialSessionMode = normalizeChatSessionMode(
        req.body?.conversationMode ?? req.body?.sessionMode,
      );
      insertConversation(db, {
        id: cid,
        projectId: id,
        title: null,
        sessionMode: initialSessionMode,
        createdAt: now,
        updatedAt: now,
      });
      const explicitPlugin =
        typeof req.body?.pluginId === 'string' && req.body.pluginId.trim().length > 0
          ? true
          : typeof req.body?.appliedPluginSnapshotId === 'string'
            && req.body.appliedPluginSnapshotId.trim().length > 0;
      let resolveBody =
        explicitPlugin ? (req.body as Record<string, unknown>) : null;
      if (!resolveBody && initialSessionMode === 'design') {
        const fallbackPluginId = defaultScenarioPluginIdForProjectMetadata(projectMetadata);
        if (fallbackPluginId && getInstalledPlugin(db, fallbackPluginId)) {
          resolveBody = { ...(req.body || {}), pluginId: fallbackPluginId };
        }
      }
      let resolvedSnapshot = null;
      if (resolveBody) {
        const registry = await loadPluginRegistryView();
        const resolved = resolvePluginSnapshot({
          db,
          body: resolveBody,
          projectId: id,
          conversationId: cid,
          registry,
          activeProjectDesignSystem:
            typeof normalizedDesignSystemId === 'string' && normalizedDesignSystemId.length > 0
              ? { id: normalizedDesignSystemId }
              : undefined,
          connectorProbe: buildConnectorProbe(connectorService),
        });
        if (resolved && !resolved.ok) {
          if (!explicitPlugin) {
            console.warn(
              `[plugins] default-scenario fallback skipped for project ${id}: ${resolved.body?.error?.code ?? 'unknown'}`,
            );
          } else {
            return res.status(resolved.status).json(resolved.body);
          }
        } else {
          resolvedSnapshot = resolved;
        }
      }
      // For "from template" projects, seed the chosen template's snapshot
      // HTML into the new project folder so the agent can Read/edit files
      // on disk (the system prompt also embeds them, but a real on-disk
      // copy lets the agent treat them as the project's working state).
      if (
        metadata &&
        typeof metadata === 'object' &&
        metadata.kind === 'template' &&
        typeof metadata.templateId === 'string'
      ) {
        const tpl = getTemplate(db, metadata.templateId);
        if (tpl && Array.isArray(tpl.files) && tpl.files.length > 0) {
          await ensureProject(PROJECTS_DIR, id, projectMetadata);
          for (const f of tpl.files) {
            if (
              !f ||
              typeof f.name !== 'string' ||
              typeof f.content !== 'string'
            ) {
              continue;
            }
            try {
              await writeProjectFile(
                PROJECTS_DIR,
                id,
                f.name,
                Buffer.from(f.content, 'utf8'),
                {},
                projectMetadata,
              );
            } catch {
              // Skip individual file failures — the template snapshot is
              // best-effort; the agent still has the embedded copy.
            }
          }
        }
      }
      /** @type {import('@open-design/contracts').CreateProjectResponse} */
      const body = {
        project: resolvedSnapshot?.ok ? getProject(db, id) ?? project : project,
        conversationId: cid,
        ...(resolvedSnapshot?.ok
          ? { appliedPluginSnapshotId: resolvedSnapshot.snapshotId }
          : {}),
      };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.post('/api/projects/:id/duplicate', async (req, res) => {
    const sourceProject = getProject(db, req.params.id);
    try {
      const locations = await configuredProjectLocations();
      if (!sourceProject || !projectVisibleForLocations(sourceProject, locations)) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
      }
      if (isDesignSystemLikeProject(sourceProject)) {
        return sendApiError(
          res,
          400,
          'PROJECT_ALREADY_DESIGN_SYSTEM',
          'project is already a design-system workspace',
        );
      }

      const targetProjectId = randomId();
      const targetName = normalizeProjectDuplicateName(req.body?.name, sourceProject);
      const metadata = cloneProjectMetadataForDuplicate(sourceProject);
      let insertedProject = false;
      try {
        await ensureProject(PROJECTS_DIR, targetProjectId, metadata);
        const sourceFiles = await listFiles(PROJECTS_DIR, sourceProject.id, {
          metadata: sourceProject.metadata,
        });
        const copiedFiles: string[] = [];
        for (const file of sourceFiles) {
          if (!file?.name || typeof file.name !== 'string') continue;
          const sourceFile = await readProjectFile(
            PROJECTS_DIR,
            sourceProject.id,
            file.name,
            sourceProject.metadata,
          );
          await writeProjectFile(
            PROJECTS_DIR,
            targetProjectId,
            sourceFile.name,
            sourceFile.buffer,
            {
              overwrite: true,
              ...(sourceFile.artifactManifest ? { artifactManifest: sourceFile.artifactManifest } : {}),
            },
            metadata,
          );
          copiedFiles.push(sourceFile.name);
        }

        const now = Date.now();
        const project = insertProject(db, {
          id: targetProjectId,
          name: targetName,
          skillId: sourceProject.skillId ?? null,
          designSystemId: sourceProject.designSystemId ?? null,
          pendingPrompt: null,
          metadata,
          customInstructions: sourceProject.customInstructions ?? null,
          createdAt: now,
          updatedAt: now,
        });
        insertedProject = true;
        const conversationId = randomId();
        insertConversation(db, {
          id: conversationId,
          projectId: targetProjectId,
          title: null,
          sessionMode: 'design',
          createdAt: now,
          updatedAt: now,
        });
        try {
          const tabs = listTabs(db, sourceProject.id);
          setTabs(db, targetProjectId, tabs);
        } catch {
          // Open-tabs state is convenience metadata; file duplication succeeds
          // without it.
        }
        /** @type {import('@open-design/contracts').DuplicateProjectResponse} */
        const body = {
          project,
          conversationId,
          copiedFiles,
        };
        res.json(body);
      } catch (err) {
        if (insertedProject) dbDeleteProject(db, targetProjectId);
        await removeProjectDir(PROJECTS_DIR, targetProjectId).catch(() => {});
        throw err;
      }
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.post('/api/projects/:id/design-system-copy', async (req, res) => {
    const sourceProject = getProject(db, req.params.id);
    try {
      const locations = await configuredProjectLocations();
      if (!sourceProject || !projectVisibleForLocations(sourceProject, locations)) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
      }
      if (isDesignSystemLikeProject(sourceProject)) {
        return sendApiError(
          res,
          400,
          'PROJECT_ALREADY_DESIGN_SYSTEM',
          'project is already a design-system workspace',
        );
      }

      const targetProjectId = randomId();
      const targetName = normalizeDesignSystemCopyName(req.body?.name, sourceProject);
      const requestedPendingPrompt = normalizePendingPrompt(req.body?.pendingPrompt);
      const sourceNotes = `Created from Open Design project "${sourceProject.name}" (${sourceProject.id}).`;
      let createdDesignSystemId: string | null = null;
      let insertedProject = false;
      try {
        const designSystem = await createUserDesignSystem(USER_DESIGN_SYSTEMS_DIR, {
          title: targetName,
          summary: sourceNotes,
          category: 'Project Design System',
          surface: 'web',
          status: 'draft',
          artifactMode: 'agent-managed',
          sourceNotes,
          provenance: {
            notes: sourceNotes,
            sourceNotes,
          },
        });
        createdDesignSystemId = designSystem.id;

        const metadata = {
          kind: 'other',
          importedFrom: 'design-system',
          entryFile: 'DESIGN.md',
          sourceFileName: designSystem.id,
          nameSource: 'generated',
          sourceProjectId: sourceProject.id,
          sourceProjectName: sourceProject.name,
        };
        await ensureProject(PROJECTS_DIR, targetProjectId, metadata);

        const sourceFiles = await listFiles(PROJECTS_DIR, sourceProject.id, {
          metadata: sourceProject.metadata,
        });
        const copiedFiles: string[] = [];
        for (const file of sourceFiles) {
          if (!file?.name || typeof file.name !== 'string') continue;
          const sourceFile = await readProjectFile(
            PROJECTS_DIR,
            sourceProject.id,
            file.name,
            sourceProject.metadata,
          );
          await writeProjectFile(
            PROJECTS_DIR,
            targetProjectId,
            sourceFile.name,
            sourceFile.buffer,
            {
              overwrite: true,
              ...(sourceFile.artifactManifest ? { artifactManifest: sourceFile.artifactManifest } : {}),
            },
            metadata,
          );
          copiedFiles.push(sourceFile.name);
        }

        const pendingPrompt = requestedPendingPrompt ?? buildDesignSystemCopyPendingPrompt({
          sourceProject,
          targetProjectId,
          designSystemId: designSystem.id,
          copiedFiles,
        });
        const now = Date.now();
        const project = insertProject(db, {
          id: targetProjectId,
          name: targetName,
          skillId: null,
          designSystemId: designSystem.id,
          pendingPrompt,
          metadata,
          customInstructions: null,
          createdAt: now,
          updatedAt: now,
        });
        insertedProject = true;
        const conversationId = randomId();
        insertConversation(db, {
          id: conversationId,
          projectId: targetProjectId,
          title: null,
          sessionMode: 'design',
          createdAt: now,
          updatedAt: now,
        });

        await writeProjectFile(
          PROJECTS_DIR,
          targetProjectId,
          'context/source-context.md',
          Buffer.from(
            buildDesignSystemCopySourceContext({
              sourceProject,
              targetProjectId,
              designSystemId: designSystem.id,
              copiedFiles,
              skippedFiles: [],
            }),
            'utf8',
          ),
          { overwrite: true },
          metadata,
        );
        await linkUserDesignSystemProject(USER_DESIGN_SYSTEMS_DIR, designSystem.id, targetProjectId);
        /** @type {import('@open-design/contracts').CreateDesignSystemProjectFromProjectResponse} */
        const body = {
          project,
          conversationId,
          designSystemId: designSystem.id,
          copiedFiles,
        };
        res.json(body);
      } catch (err) {
        if (insertedProject) dbDeleteProject(db, targetProjectId);
        await removeProjectDir(PROJECTS_DIR, targetProjectId).catch(() => {});
        if (createdDesignSystemId) {
          await deleteUserDesignSystem(USER_DESIGN_SYSTEMS_DIR, createdDesignSystemId).catch(() => false);
        }
        throw err;
      }
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.get('/api/projects/:id', async (req, res) => {
    const project = getProject(db, req.params.id);
    const locations = await configuredProjectLocations();
    if (!project || !projectVisibleForLocations(project, locations))
      return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
    // When a caller is about to *reference* this project (add it as read-only
    // context for another run), materialize its managed folder first so the
    // reference resolves to a real directory. See ensureReferencedProjectDir.
    if (req.query.ensureDir === '1' || req.query.ensureDir === 'true') {
      try {
        await ensureReferencedProjectDir(PROJECTS_DIR, project, ensureProject);
      } catch (err: any) {
        return sendApiError(
          res,
          500,
          'PROJECT_DIR_MATERIALIZATION_FAILED',
          String(err?.message || err),
        );
      }
    }
    const resolvedDir = projectDetailResolvedDir(PROJECTS_DIR, project, resolveProjectDir);
    /** @type {import('@open-design/contracts').ProjectResponse} */
    const body = { project, resolvedDir };
    res.json(body);
  });

  app.patch('/api/projects/:id', async (req, res) => {
    try {
      const patch = req.body || {};
      // baseDir / folder-import state is privileged: it's set only by the
      // import endpoint and otherwise immutable. Two failure modes to
      // guard against here:
      //   1. Explicit attempt to change baseDir → reject with 400.
      //   2. A regular metadata patch that *omits* baseDir (e.g. a UI
      //      that only edits linkedDirs sends `{ metadata: { kind, linkedDirs } }`).
      //      updateProject() replaces metadata wholesale, so without
      //      preservation the existing baseDir gets wiped and the project
      //      detaches from the user's folder — subsequent reads/writes
      //      silently fall back to .od/projects/<id>.
      // For case 2 we re-stamp the immutable fields from the existing
      // project record onto the incoming patch so the user can keep
      // patching other metadata without ever losing their import root.
      if (patch.metadata === null) {
        const existing = getProject(db, req.params.id);
        if (existing?.metadata?.baseDir) {
          return sendApiError(
            res,
            400,
            'BAD_REQUEST',
            'metadata cannot be cleared for imported projects',
          );
        }
      }
      if (patch.metadata && typeof patch.metadata === 'object') {
        const existing = getProject(db, req.params.id);
        const existingMeta = existing?.metadata;
        if ('fromTrustedPicker' in patch.metadata
            && patch.metadata.fromTrustedPicker !== existingMeta?.fromTrustedPicker) {
          return sendApiError(
            res, 400, 'BAD_REQUEST',
            'fromTrustedPicker can only be set via POST /api/import/folder',
          );
        }
        if ('orchestratorWorkspace' in patch.metadata) {
          const parsedOrchestratorWorkspace = parseOrchestratorWorkspace(
            patch.metadata.orchestratorWorkspace,
          );
          if (!parsedOrchestratorWorkspace.ok) {
            return sendApiError(
              res,
              400,
              'BAD_REQUEST',
              parsedOrchestratorWorkspace.message,
            );
          }
        }
        if (existingMeta?.baseDir) {
          if ('orchestratorWorkspace' in patch.metadata) {
            if (
              existingMeta.orchestratorWorkspace == null ||
              !sameOrchestratorWorkspace(
                patch.metadata.orchestratorWorkspace,
                existingMeta.orchestratorWorkspace,
              )
            ) {
              return sendApiError(
                res, 400, 'BAD_REQUEST',
                'orchestratorWorkspace is immutable after import; use the working-dir route to change it',
              );
            }
          }
          if ('baseDir' in patch.metadata && patch.metadata.baseDir !== existingMeta.baseDir) {
            return sendApiError(
              res, 400, 'BAD_REQUEST',
              'baseDir is immutable after import; use a new import to change it',
            );
          }
          patch.metadata = {
            ...patch.metadata,
            baseDir: existingMeta.baseDir,
            ...(existingMeta.importedFrom === 'folder'
              ? { importedFrom: 'folder' }
              : {}),
            ...(existingMeta.importedFrom === 'project-location'
              ? { importedFrom: 'project-location' }
              : {}),
            ...(typeof existingMeta.projectLocationId === 'string'
              ? { projectLocationId: existingMeta.projectLocationId }
              : {}),
            ...(existingMeta.fromTrustedPicker === true
              ? { fromTrustedPicker: true as const }
              : {}),
            ...(existingMeta.orchestratorWorkspace
              ? { orchestratorWorkspace: existingMeta.orchestratorWorkspace }
              : {}),
          };
        } else if ('baseDir' in patch.metadata) {
          // Non-imported project trying to acquire a baseDir → reject (only
          // /api/import/folder can set it).
          return sendApiError(
            res, 400, 'BAD_REQUEST',
            'baseDir can only be set via POST /api/import/folder',
          );
        } else if ('orchestratorWorkspace' in patch.metadata) {
          return sendApiError(
            res, 400, 'BAD_REQUEST',
            'orchestratorWorkspace can only be set via POST /api/import/folder or POST /api/projects/:id/working-dir',
          );
        }
      }
      if (patch.metadata?.linkedDirs) {
        const existing = getProject(db, req.params.id);
        const validated = validateLinkedDirs(patch.metadata.linkedDirs);
        if (validated.error) {
          return sendApiError(res, 400, 'INVALID_LINKED_DIR', validated.error);
        }
        patch.metadata.linkedDirs =
          existing?.metadata?.fromTrustedPicker === true
            ? patch.metadata.linkedDirs
            : validated.dirs;
      }
      if (patch.customInstructions !== undefined
          && typeof patch.customInstructions !== 'string'
          && patch.customInstructions !== null) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'customInstructions must be a string or null');
      }
      if (typeof patch.customInstructions === 'string' && patch.customInstructions.length > 5000) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'customInstructions exceeds 5 000 character limit');
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'designSystemId')) {
        const designSystemValidation = await validateProjectDesignSystemId(patch.designSystemId);
        if (!designSystemValidation.ok) {
          return sendApiError(
            res,
            400,
            designSystemValidation.code,
            designSystemValidation.message,
          );
        }
        patch.designSystemId = designSystemValidation.id;
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'skillId')) {
        const skillValidation = await validateProjectSkillId(patch.skillId);
        if (!skillValidation.ok) {
          return sendApiError(res, 400, skillValidation.code, skillValidation.message);
        }
        patch.skillId = skillValidation.id;
      }
      if (typeof patch.name === 'string' && patch.name.trim().length > 0) {
        // Design-system workspace projects mirror their design system's
        // title: the workspace ensure re-stamps the project name from the
        // registry on every open, so a rename applied only to the project
        // row silently reverts. Write the rename through to the design
        // system so both records agree.
        const existing = getProject(db, req.params.id);
        if (existing) {
          // Decide from the post-patch shape (updateProject merges the
          // patch shallowly over the row), so a PATCH that also rebinds
          // or detaches the design system only ever renames the system
          // the project remains bound to after this request.
          const propagation = await propagateWorkspaceProjectRename(
            USER_DESIGN_SYSTEMS_DIR,
            { ...existing, ...patch },
            patch.name,
          );
          if (propagation === 'failed') {
            return sendApiError(
              res, 409, 'CONFLICT',
              'rename could not be written through to the bound design system; project left unchanged',
            );
          }
        }
      }
      const project = updateProject(db, req.params.id, patch);
      if (!project)
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
      /** @type {import('@open-design/contracts').ProjectResponse} */
      const body = { project };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.delete('/api/projects/:id', async (req, res) => {
    try {
      dbDeleteProject(db, req.params.id);
      await removeProjectDir(PROJECTS_DIR, req.params.id).catch(() => {});
      /** @type {import('@open-design/contracts').OkResponse} */
      const body = { ok: true };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  // SSE stream of file-changed events for a project. Drives preview live-reload.
  // Receipt of a `file-changed` event triggers a file-list refresh, which
  // propagates new mtimes through to FileViewer iframes (the URL-load
  // `?v=${mtime}` cache-bust from PR #384 then reloads the iframe automatically).
  // Subscribers come and go as users open/close project tabs; the underlying
  // chokidar watcher is refcounted in project-watchers.ts so we never hold
  // descriptors for projects no UI is looking at.
  app.get('/api/projects/:id/events', (req, res) => {
    if (!getProject(db, req.params.id)) {
      return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
    }
    let sub: any;
    try {
      const sse = createSseResponse(res);
      const projectEventSink = (payload: any) => {
        sse.send(payload.type, payload);
      };
      let sinks = activeProjectEventSinks.get(req.params.id);
      if (!sinks) {
        sinks = new Set();
        activeProjectEventSinks.set(req.params.id, sinks);
      }
      sinks.add(projectEventSink);
      const watchProject = getProject(db, req.params.id);
      sub = subscribeFileEvents(PROJECTS_DIR, req.params.id, (evt: any) => {
        sse.send('file-changed', evt);
      }, { metadata: watchProject?.metadata });
      sub.ready.then(() => sse.send('ready', { projectId: req.params.id })).catch(() => {});
      const cleanup = () => {
        if (sub) {
          const { unsubscribe } = sub;
          sub = null;
          Promise.resolve(unsubscribe()).catch(() => {});
        }
        const currentSinks = activeProjectEventSinks.get(req.params.id);
        currentSinks?.delete(projectEventSink);
        if (currentSinks?.size === 0) activeProjectEventSinks.delete(req.params.id);
      };
      res.on('close', cleanup);
      res.on('finish', cleanup);
    } catch (err: any) {
      if (sub) Promise.resolve(sub.unsubscribe()).catch(() => {});
      if (!res.headersSent) sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
    }
  });

  registerProjectConversationRoutes(app, ctx);

  // ---- Tabs -----------------------------------------------------------------

  app.get('/api/projects/:id/tabs', (req, res) => {
    if (!getProject(db, req.params.id)) {
      return res.status(404).json({ error: 'project not found' });
    }
    res.json(listTabs(db, req.params.id));
  });

  app.put('/api/projects/:id/tabs', (req, res) => {
    if (!getProject(db, req.params.id)) {
      return res.status(404).json({ error: 'project not found' });
    }
    const { tabs = [], active = null, browserTabs = [] } = req.body || {};
    if (!Array.isArray(tabs) || !tabs.every((t) => typeof t === 'string')) {
      return res.status(400).json({ error: 'tabs must be string[]' });
    }
    if (!Array.isArray(browserTabs)) {
      return res.status(400).json({ error: 'browserTabs must be an array' });
    }
    const result = setTabs(
      db,
      req.params.id,
      {
        tabs,
        active: typeof active === 'string' ? active : null,
        browserTabs,
      },
    );
    res.json(result);
  });

  // ---- Templates ----------------------------------------------------------
  // User-saved snapshots of a project's HTML files. Surfaced in the
  // "From template" tab of the new-project panel so a user can spin up
  // a fresh project pre-seeded with another project's design as a
  // starting point. Created via the project's Share menu (snapshots
  // every .html file in the project folder at the moment of save).

  app.get('/api/templates', (_req, res) => {
    res.json({ templates: listTemplates(db) });
  });

  app.get('/api/templates/:id', (req, res) => {
    const t = getTemplate(db, req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });
    res.json({ template: t });
  });

  app.post('/api/templates', async (req, res) => {
    try {
      const { name, description, sourceProjectId } = req.body || {};
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name required' });
      }
      if (name.length > 100) {
        return res.status(400).json({ error: 'name must be 100 characters or fewer' });
      }
      if (typeof sourceProjectId !== 'string') {
        return res.status(400).json({ error: 'sourceProjectId required' });
      }
      const sourceProject = getProject(db, sourceProjectId);
      if (!sourceProject) {
        return res.status(404).json({ error: 'source project not found' });
      }
      // Snapshot every HTML / sketch / text file in the source project.
      // We deliberately skip binary uploads — templates are about the
      // generated design, not the user's reference imagery.
      const files = await listFiles(PROJECTS_DIR, sourceProjectId, {
        metadata: sourceProject.metadata,
      });
      const snapshot = [];
      for (const f of files) {
        if (f.kind !== 'html' && f.kind !== 'text' && f.kind !== 'code')
          continue;
        const entry = await readProjectFile(
          PROJECTS_DIR,
          sourceProjectId,
          f.name,
          sourceProject.metadata,
        );
        if (entry && Buffer.isBuffer(entry.buffer)) {
          snapshot.push({
            name: f.name,
            content: entry.buffer.toString('utf8'),
          });
        }
      }
      const trimmedName = name.trim();
      const descValue = typeof description === 'string' ? description : null;
      const existing = findTemplateByNameAndProject(db, trimmedName, sourceProjectId);
      let t;
      if (existing) {
        t = updateTemplate(db, existing.id, {
          description: descValue,
          files: snapshot,
        });
      } else {
        t = insertTemplate(db, {
          id: randomId(),
          name: trimmedName,
          description: descValue,
          sourceProjectId,
          files: snapshot,
          createdAt: Date.now(),
        });
      }
      res.json({ template: t });
    } catch (err: any) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.delete('/api/templates/:id', (req, res) => {
    deleteTemplate(db, req.params.id);
    res.json({ ok: true });
  });

}

export interface RegisterProjectArtifactRoutesDeps extends RouteDeps<'http' | 'uploads' | 'paths' | 'node' | 'artifacts'> {}

export function registerProjectArtifactRoutes(app: Express, ctx: RegisterProjectArtifactRoutesDeps) {
  const { upload } = ctx.uploads;
  const { ARTIFACTS_DIR } = ctx.paths;
  const { path, fs } = ctx.node;
  const { sanitizeSlug, lintArtifact, renderFindingsForAgent } = ctx.artifacts;
  app.post('/api/upload', upload.array('images', 8), (req, res) => {
    const files = ((req.files || []) as any[]).map((f: any) => ({
      name: f.originalname,
      path: f.path,
      size: f.size,
    }));
    res.json({ files });
  });

  // Persist a generated artifact (HTML) to disk so the user can re-open it
  // in their browser or hand it off. Returns the on-disk path + a served URL.
  // The body is also passed through the anti-slop linter; findings are
  // returned alongside the path so the UI can render a P0/P1 badge and the
  // chat layer can splice them into a system reminder for the agent.
  app.post('/api/artifacts/save', (req, res) => {
    try {
      const { identifier, title, html } = req.body || {};
      if (typeof html !== 'string' || html.length === 0) {
        return res.status(400).json({ error: 'html required' });
      }
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      const slug = sanitizeSlug(identifier || title || 'artifact');
      const dir = path.join(ARTIFACTS_DIR, `${stamp}-${slug}`);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, 'index.html');
      fs.writeFileSync(file, html, 'utf8');
      const findings = lintArtifact(html);
      res.json({
        path: file,
        url: `/artifacts/${path.basename(dir)}/index.html`,
        lint: findings,
      });
    } catch (err: any) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Standalone lint endpoint — POST raw HTML, get findings back.
  // The chat layer uses this to lint streamed-in artifacts without writing
  // them to disk first, so a P0 issue can be surfaced before save.
  app.post('/api/artifacts/lint', (req, res) => {
    try {
      const { html } = req.body || {};
      if (typeof html !== 'string' || html.length === 0) {
        return res.status(400).json({ error: 'html required' });
      }
      const findings = lintArtifact(html);
      res.json({
        findings,
        agentMessage: renderFindingsForAgent(findings),
      });
    } catch (err: any) {
      res.status(500).json({ error: String(err) });
    }
  });

}

export interface RegisterProjectFileRoutesDeps extends RouteDeps<'db' | 'http' | 'paths' | 'uploads' | 'node' | 'projectStore' | 'projectFiles' | 'documents' | 'artifacts' | 'projectPreviewScopes'> {}

export function registerProjectFileRoutes(app: Express, ctx: RegisterProjectFileRoutesDeps) {
  const { db } = ctx;
  const { sendApiError, sendMulterError } = ctx.http;
  const { PROJECTS_DIR } = ctx.paths;
  const { upload } = ctx.uploads;
  const { fs } = ctx.node;
  const { getProject } = ctx.projectStore;
  const { listFiles, listProjectFolders, createProjectFolder, deleteProjectFolder, searchProjectFiles, readProjectFile, resolveProjectDir, resolveProjectFilePath, parseByteRange, renameProjectFile, deleteProjectFile, writeProjectFile, sanitizeName, sanitizePath, ensureProject } = ctx.projectFiles;
  const { buildDocumentPreview } = ctx.documents;
  const { validateArtifactManifestInput } = ctx.artifacts;
  const { projectPreviewScopes } = ctx;
  const projectPreviewIframeSandbox = 'allow-scripts allow-forms';
  const HTML_PREVIEW_BRIDGE_MAX_BYTES = 2 * 1024 * 1024;
  const HTML_POWERED_PREVIEW_HINT_SCAN_MAX_BYTES = 128 * 1024 * 1024;
  const projectPreviewCsp = [
    `sandbox ${projectPreviewIframeSandbox}`,
    "default-src 'self' data: blob:",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');
  const previewScopeRe = /^[A-Za-z0-9_-]{8,128}$/u;

  function setProjectPreviewHeaders(res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', projectPreviewCsp);
  }

  // "Powered preview" headers — the opposite trade-off from setProjectPreviewHeaders.
  // Real WebGL / Web Worker / WASM sites (Gaussian-splat viewers, physics demos,
  // ffmpeg.wasm, threaded renderers) need capabilities the opaque-origin preview
  // sandbox blocks: same-origin Workers, real Web Storage, and — for threaded
  // WASM — SharedArrayBuffer, which requires the document to be crossOriginIsolated.
  //
  // `Document-Isolation-Policy: isolate-and-credentialless` grants the SERVED
  // document its own cross-origin-isolated agent cluster WITHOUT requiring the
  // embedding app to opt the whole page into COOP/COEP. That is the key that
  // unlocks SharedArrayBuffer for just this iframe. The `credentialless` variant
  // (vs `require-corp`) still lets artifacts pull no-cors cross-origin
  // subresources (CDN fonts/images) — those loads just drop credentials — so
  // enabling isolation does not blank out otherwise-working artifacts.
  //
  // The web host renders the powered iframe with `allow-same-origin` at the
  // daemon's host-swapped preview origin (see
  // apps/web/src/runtime/powered-preview.ts), so this document gets same-origin
  // Workers/storage for sibling /powered assets while the shared /api
  // middleware rejects browser requests from that origin to normal daemon APIs.
  function setPoweredPreviewHeaders(res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Document-Isolation-Policy', 'isolate-and-credentialless');
    // Let cross-origin-isolated contexts embed these bytes (the doc + its
    // worker/wasm/asset subresources under the same /powered prefix).
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // No CORS headers: powered documents and their relative subresources load
    // from the same /powered loopback origin. Foreign browser origins must not
    // get read access to project files by adding an Origin header.
    res.removeHeader('Content-Security-Policy');
  }

  function rejectInternalVersionPath(res: Response, value: unknown): boolean {
    if (!isProjectFileVersionPath(value)) return false;
    sendApiError(res, 404, 'FILE_NOT_FOUND', 'file not found');
    return true;
  }

  function normalizeProjectFileVersionSource(value: unknown): ProjectFileVersionSource | undefined {
    return value === 'ai' || value === 'manual' || value === 'restore' ? value : undefined;
  }

  function parseProjectFileVersionSourceInput(
    value: unknown,
    fieldName: 'source' | 'versionSource',
  ): ProjectFileVersionSource | undefined {
    if (value === undefined || value === null) return undefined;
    const normalized = normalizeProjectFileVersionSource(value);
    if (normalized) return normalized;
    throw new Error(`invalid ${fieldName}; expected one of: ai, manual, restore`);
  }

  function requestProjectFileVersionSource(value: unknown): ProjectFileVersionSource {
    return parseProjectFileVersionSourceInput(value, 'source') ?? 'manual';
  }

  function requestProjectFileVersionUploadSource(body: any): ProjectFileVersionSource {
    const hasVersionSource = body?.versionSource !== undefined && body?.versionSource !== null;
    return parseProjectFileVersionSourceInput(
      hasVersionSource ? body.versionSource : body?.source,
      hasVersionSource ? 'versionSource' : 'source',
    ) ?? 'manual';
  }

  function latestProjectPrompt(project: any): { prompt: string | null; promptSource?: Extract<ProjectFileVersionPromptSource, 'message' | 'project'> } {
    try {
      const row = db.prepare(
        `SELECT m.content
           FROM messages m
           JOIN conversations c ON c.id = m.conversation_id
          WHERE c.project_id = ?
            AND m.role = 'user'
            AND LENGTH(TRIM(m.content)) > 0
          ORDER BY COALESCE(m.ended_at, m.started_at, m.created_at, 0) DESC,
                   m.position DESC
          LIMIT 1`,
      ).get(project?.id) as { content?: string } | undefined;
      if (typeof row?.content === 'string' && row.content.trim()) {
        return { prompt: row.content.trim(), promptSource: 'message' };
      }
    } catch {
      // Prompt provenance is best-effort; versions still save without it.
    }
    if (typeof project?.pendingPrompt === 'string' && project.pendingPrompt.trim()) {
      return { prompt: project.pendingPrompt.trim(), promptSource: 'project' };
    }
    if (typeof project?.pending_prompt === 'string' && project.pending_prompt.trim()) {
      return { prompt: project.pending_prompt.trim(), promptSource: 'project' };
    }
    return { prompt: null };
  }

  type HtmlVersionOverride = {
    prompt?: string | null;
    promptSource?: ProjectFileVersionPromptSource;
    source?: ProjectFileVersionSource;
    label?: string | null;
  };

  function htmlVersionOptions(
    project: any,
    override?: HtmlVersionOverride,
  ): {
    prompt: string | null;
    promptSource?: ProjectFileVersionPromptSource;
    source?: ProjectFileVersionSource;
    label?: string;
  } {
    const fallbackPromptInfo = latestProjectPrompt(project);
    const prompt = override?.prompt !== undefined
      ? (typeof override.prompt === 'string' && override.prompt.trim() ? override.prompt.trim() : null)
      : (override?.source === 'manual' || override?.source === 'restore' ? null : fallbackPromptInfo.prompt);
    const promptSource = override?.promptSource
      ?? (override?.source === 'manual'
        ? 'manual'
        : override?.source === 'restore'
          ? 'restore'
          : fallbackPromptInfo.promptSource);
    const versionOptions: {
      prompt: string | null;
      promptSource?: ProjectFileVersionPromptSource;
      source?: ProjectFileVersionSource;
      label?: string;
    } = {
      prompt,
    };
    if (promptSource) versionOptions.promptSource = promptSource;
    if (override?.source) versionOptions.source = override.source;
    if (typeof override?.label === 'string' && override.label.trim()) {
      versionOptions.label = override.label.trim();
    }
    return versionOptions;
  }

  type HtmlVersionLock = {
    ensureCurrentVersion: (
      content: string,
      options?: ReturnType<typeof htmlVersionOptions>,
    ) => Promise<ProjectFileVersion | null>;
  };

  function htmlVersionCaptureWarning(err: unknown): ProjectFileVersionWarning {
    const message = err instanceof Error ? err.message : String(err);
    return {
      code: 'PROJECT_FILE_VERSION_CAPTURE_FAILED',
      message: `HTML version could not be saved: ${message}`,
    };
  }

  async function tryEnsureLockedHtmlCurrentVersion(
    project: any,
    fileName: string,
    content: string,
    ensureCurrentVersion: HtmlVersionLock['ensureCurrentVersion'],
    override?: HtmlVersionOverride,
  ): Promise<{ version: ProjectFileVersion | null; versionWarning?: ProjectFileVersionWarning }> {
    if (!/\.html?$/i.test(fileName)) return { version: null };
    try {
      return { version: await ensureCurrentVersion(content, htmlVersionOptions(project, override)) };
    } catch (err) {
      return { version: null, versionWarning: htmlVersionCaptureWarning(err) };
    }
  }

  function fileFromVersionHistory(fileName: string, versions: ProjectFileVersion[]): ProjectFile | null {
    const latest = versions.at(-1);
    if (!latest) return null;
    return {
      name: latest.fileName || fileName,
      path: latest.fileName || fileName,
      type: 'file',
      size: latest.size,
      mtime: latest.createdAt,
      kind: latest.kind,
      mime: latest.mime,
    };
  }

  // Lets a browser (or the desktop export window, which shares the same Chromium
  // session/cache as the web UI) reuse already-downloaded fonts/CSS/images
  // across loads instead of re-fetching them every time — covers, live preview,
  // and screenshot export all hit /raw/. The ETag/Last-Modified are derived from
  // the file's size+mtime, so any agent rewrite changes them and busts the cache
  // immediately; `no-cache` means "always revalidate" (never serve stale without
  // asking), so a 304 only happens when the bytes are genuinely unchanged.
  function setRawRevalidationHeaders(res: Response, meta: { size: number; mtime: number }): string {
    const mtime = Math.floor(meta.mtime);
    const etag = `W/"${meta.size.toString(16)}-${mtime.toString(16)}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', new Date(mtime).toUTCString());
    res.setHeader('Cache-Control', 'no-cache');
    return etag;
  }

  function rawRequestIsFresh(req: any, etag: string, mtimeMs: number): boolean {
    // If-None-Match is authoritative when present (RFC 9110 §13.1.3): freshness
    // is decided solely by whether the ETag matches — do NOT fall through to
    // If-Modified-Since. Otherwise a same-second rewrite (ETag changes
    // immediately, but Last-Modified is identical at HTTP-date second
    // granularity) would 304 stale-but-changed bytes when a client sends both a
    // non-matching ETag and the current If-Modified-Since.
    const ifNoneMatch = req.headers['if-none-match'];
    if (typeof ifNoneMatch === 'string') {
      return ifNoneMatch.split(',').some((tag) => tag.trim() === etag);
    }
    const ifModifiedSince = req.headers['if-modified-since'];
    if (typeof ifModifiedSince === 'string') {
      const since = Date.parse(ifModifiedSince);
      // Last-Modified is second-resolution, so compare at second granularity.
      if (Number.isFinite(since) && Math.floor(mtimeMs / 1000) * 1000 <= since) return true;
    }
    return false;
  }

  // RFC 9110 §13.1.5: a Range request with If-Range may only be served as 206
  // when the If-Range validator still matches the current representation; if it
  // doesn't (the file changed), the range must be ignored and the full current
  // file returned, so a resumed download can't splice stale + fresh bytes.
  //
  // §13.1.5 also requires the entity-tag form to use a STRONG validator. Our
  // ETag is weak (`W/"size-mtime"` — size+mtime is not byte-exact), so an
  // entity-tag If-Range can never authorize partial content: a same-size rewrite
  // or mtime-granularity collision could otherwise splice stale + fresh bytes
  // under a matching weak tag. We therefore reject ALL entity-tag If-Range values
  // (weak ones explicitly; a strong `"…"` never equals our weak ETag anyway) and
  // honor only the date form.
  function ifRangeAllowsPartial(req: any, _etag: string, mtimeMs: number): boolean {
    const ifRange = req.headers['if-range'];
    if (typeof ifRange !== 'string' || ifRange.length === 0) return true; // no If-Range → honor Range
    const value = ifRange.trim();
    // Any entity-tag (weak `W/"…"` or strong `"…"`) → not a strong match against
    // our weak validator → fall back to the full 200.
    if (value.startsWith('"') || value.startsWith('W/')) return false;
    // Date form: honor the range only if the file has NOT changed since (its
    // current Last-Modified is at/before the If-Range date).
    const since = Date.parse(value);
    return Number.isFinite(since) && Math.floor(mtimeMs / 1000) * 1000 <= since;
  }

  function htmlHasPoweredPreviewSignal(source: string): boolean {
    if (/\bSharedArrayBuffer\b/.test(source)) return true;
    if (/\bnew\s+(?:Worker|SharedWorker)\s*\(/.test(source)) return true;
    if (/\bimportScripts\s*\(/.test(source)) return true;
    if (/\bWebAssembly\s*\.\s*(?:instantiateStreaming|compileStreaming)\b/.test(source)) return true;
    if (/\.wasm\b/.test(source)) return true;
    if (/getContext\s*\(\s*["'`]webgl2["'`]/.test(source)) return true;
    if (/\bOffscreenCanvas\b/.test(source)) return true;
    if (/\bnavigator\s*\.\s*gpu\b/.test(source)) return true;
    return false;
  }

  async function detectPoweredPreviewHint(meta: {
    filePath: string;
    mime: string;
    size: number;
  }): Promise<ProjectFileTextPreviewResponse['poweredPreview']> {
    if (!/^text\/html(?:;|$)/i.test(meta.mime)) {
      return { required: false, scannedBytes: 0, complete: true };
    }
    const scanLimit = Math.min(meta.size, HTML_POWERED_PREVIEW_HINT_SCAN_MAX_BYTES);
    if (scanLimit <= 0) {
      return { required: false, scannedBytes: 0, complete: true };
    }

    let scannedBytes = 0;
    let tail = '';
    for await (const chunk of fs.createReadStream(meta.filePath, {
      start: 0,
      end: scanLimit - 1,
      highWaterMark: 256 * 1024,
    })) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      scannedBytes += buffer.byteLength;
      const sample = tail + buffer.toString('utf8');
      if (htmlHasPoweredPreviewSignal(sample)) {
        return {
          required: true,
          scannedBytes,
          complete: scannedBytes >= meta.size,
        };
      }
      tail = sample.slice(-512);
    }

    return {
      required: false,
      scannedBytes,
      complete: scannedBytes >= meta.size,
    };
  }

  async function sendProjectFile(
    req: any,
    res: Response,
    projectId: string,
    relPath: string,
    metadata?: unknown,
    beforeSend?: (mime: string) => void,
    transformFile?: (file: { mime: string; buffer: Buffer }) => Buffer | string | Promise<Buffer | string>,
    revalidate = false,
  ) {
    const meta = await resolveProjectFilePath(
      PROJECTS_DIR,
      projectId,
      relPath,
      metadata,
    );
    beforeSend?.(meta.mime);

    const isStreamed = meta.mime.startsWith('video/') || meta.mime.startsWith('audio/');
    const shouldStreamBody = isStreamed || !transformFile;
    // A transform (the Vite dev-entry -> dist/index.html substitution, or preview
    // bridge injection) can replace the response bytes — but only for HTML. For
    // HTML the source file's mtime/size is NOT a valid validator, so its ETag is
    // computed from the actual sent bytes after the transform. Everything else
    // (assets, fonts, images, streamed media — where the transform is a no-op)
    // keeps the fast mtime ETag with an early 304.
    const willSubstitute =
      !isStreamed && !!transformFile && /^text\/html(?:;|$)/i.test(meta.mime);

    let currentEtag: string | null = null;
    if (revalidate && !willSubstitute) {
      currentEtag = setRawRevalidationHeaders(res, meta);
      if (rawRequestIsFresh(req, currentEtag, meta.mtime)) {
        return res.status(304).end();
      }
    }

    if (shouldStreamBody) {
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', meta.mime);

      if (meta.size === 0) {
        res.setHeader('Content-Length', '0');
        return res.status(200).end();
      }

      // Honor Range only when If-Range still matches the current file — otherwise
      // a resumed download after a rewrite would splice stale + fresh bytes.
      const range =
        currentEtag === null || ifRangeAllowsPartial(req, currentEtag, meta.mtime)
          ? parseByteRange(req.headers.range, meta.size)
          : null;

      if (range === 'unsatisfiable') {
        res.setHeader('Content-Range', `bytes */${meta.size}`);
        return res.status(416).end();
      }

      let start;
      let end;
      let statusCode;
      if (range) {
        ({ start, end } = range);
        statusCode = 206;
        res.setHeader('Content-Range', `bytes ${start}-${end}/${meta.size}`);
        res.setHeader('Content-Length', String(end - start + 1));
      } else {
        start = 0;
        end = meta.size - 1;
        statusCode = 200;
        res.setHeader('Content-Length', String(meta.size));
      }

      res.status(statusCode);
      const stream = fs.createReadStream(meta.filePath, { start, end });
      stream.on('error', (streamErr: any) => {
        if (!res.headersSent) {
          sendApiError(res, 500, 'STREAM_ERROR', String(streamErr));
        } else {
          res.destroy(streamErr);
        }
      });
      stream.pipe(res);
      return;
    }

    const file = await readProjectFile(PROJECTS_DIR, projectId, relPath, metadata);
    const body = transformFile ? await transformFile(file) : file.buffer;
    if (revalidate && willSubstitute) {
      // Validator from the ACTUAL response bytes, so a change to the substituted
      // content (e.g. dist/index.html) busts the cache even when the source
      // file's mtime is unchanged.
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
      const etag = `W/"${createHash('sha1').update(buf).digest('hex').slice(0, 16)}"`;
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Last-Modified', new Date(Math.floor(meta.mtime)).toUTCString());
      const ifNoneMatch = req.headers['if-none-match'];
      if (typeof ifNoneMatch === 'string' && ifNoneMatch.split(',').some((tag) => tag.trim() === etag)) {
        return res.status(304).end();
      }
      return res.type(file.mime).send(buf);
    }
    res.type(file.mime).send(body);
  }

  function previewFilePathForProject(project: any, queryFile: unknown): string {
    if (typeof queryFile === 'string' && queryFile.trim().length > 0) {
      return queryFile;
    }
    const entryFile = project?.metadata?.entryFile;
    return typeof entryFile === 'string' && entryFile.length > 0 ? entryFile : 'index.html';
  }

  function encodeProjectPathForUrl(filePath: string): string {
    return filePath.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  }

  async function maybeResolveVitePreviewHtml({
    file,
    projectId,
    relPath,
    metadata,
    projectsRoot,
    readProjectFile,
  }: {
    file: { mime: string; buffer: Buffer };
    projectId: string;
    relPath: string;
    metadata?: unknown;
    projectsRoot: string;
    readProjectFile: (projectsRoot: string, projectId: string, relPath: string, metadata?: unknown) => Promise<{ buffer: Buffer }>;
  }): Promise<Buffer | string> {
    if (!/^text\/html(?:;|$)/i.test(file.mime)) return file.buffer;
    const html = file.buffer.toString('utf8');
    if (!isViteDevHtmlEntry(html)) return file.buffer;

    const ownerDir = path.posix.dirname(relPath);
    const distRelPath = ownerDir === '.' ? 'dist/index.html' : `${ownerDir}/dist/index.html`;
    try {
      const distFile = await readProjectFile(projectsRoot, projectId, distRelPath, metadata);
      return rewriteViteDistAssetUrlsForPreview(distFile.buffer.toString('utf8'));
    } catch {
      return file.buffer;
    }
  }

  function isViteDevHtmlEntry(html: string): boolean {
    return /<script\b[^>]*\btype\s*=\s*["']module["'][^>]*\bsrc\s*=\s*["']\/src\/[^"']+["'][^>]*>\s*<\/script>/i.test(html);
  }

  function rewriteViteDistAssetUrlsForPreview(html: string): string {
    return html.replace(
      /\b(href|src)\s*=\s*(["'])\/assets\//gi,
      (_match, attr: string, quote: string) => `${attr}=${quote}dist/assets/`,
    );
  }

  // Project files. Each project owns a flat folder under .od/projects/<id>/
  // containing every file the user has uploaded, pasted, sketched, or that
  // the agent has generated. Names are sanitized; paths are confined to the
  // project's own folder (see apps/daemon/src/projects.ts).
  app.get('/api/projects/:id/files', async (req, res) => {
    try {
      const since = Number(req.query?.since);
      const project = getProject(db, req.params.id);
      const files = await listFiles(PROJECTS_DIR, req.params.id, {
        since: Number.isFinite(since) ? since : undefined,
        metadata: project?.metadata,
      });
      /** @type {import('@open-design/contracts').ProjectFilesResponse} */
      const body = { files };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.get('/api/projects/:id/search', async (req, res) => {
    try {
      const query = String(req.query.q ?? '');
      if (!query) {
        sendApiError(res, 400, 'BAD_REQUEST', 'q query parameter is required');
        return;
      }
      const pattern = req.query.pattern ? String(req.query.pattern) : null;
      const max = Math.min(Number(req.query.max) || 200, 1000);
      const searchProject = getProject(db, req.params.id);
      const matches = await searchProjectFiles(PROJECTS_DIR, req.params.id, query, {
        pattern,
        max,
        metadata: searchProject?.metadata,
      });
      res.json({ query, matches });
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.get('/api/projects/:id/folders', async (req, res) => {
    try {
      const project = getProject(db, req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      const folders = await listProjectFolders(PROJECTS_DIR, req.params.id, {
        metadata: project.metadata,
      });
      /** @type {import('@open-design/contracts').ProjectFoldersResponse} */
      const body = { folders };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.post('/api/projects/:id/folders', async (req, res) => {
    try {
      const { name } = req.body || {};
      if (typeof name !== 'string' || !name.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'name required');
      }
      const project = getProject(db, req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      const folder = await createProjectFolder(
        PROJECTS_DIR,
        req.params.id,
        name,
        project.metadata,
      );
      /** @type {import('@open-design/contracts').ProjectFolderResponse} */
      const body = { folder };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
    }
  });

  app.delete('/api/projects/:id/folders', async (req, res) => {
    try {
      const { path: folderPath } = req.body || {};
      if (typeof folderPath !== 'string' || !folderPath.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'path required');
      }
      const project = getProject(db, req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      await deleteProjectFolder(
        PROJECTS_DIR,
        req.params.id,
        folderPath,
        project.metadata,
      );
      /** @type {import('@open-design/contracts').DeleteProjectFolderResponse} */
      const body = { ok: true };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
    }
  });

  app.get('/api/projects/:id/design-system-package-audit', async (req, res) => {
    try {
      const project = getProject(db, req.params.id);
      if (!project) {
        sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
        return;
      }
      const projectRoot = resolveProjectDir(PROJECTS_DIR, project.id, project.metadata);
      const audit = await auditDesignSystemPackage(projectRoot);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ audit });
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.get('/api/projects/:id/preview-url', async (req, res) => {
    try {
      const project = getProject(db, req.params.id);
      if (!project) {
        sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
        return;
      }
      const requestedPath = previewFilePathForProject(project, req.query.file);
      const meta = await resolveProjectFilePath(
        PROJECTS_DIR,
        project.id,
        requestedPath,
        project.metadata,
      );
      const scope = projectPreviewScopes.mint(project.id);
      /** @type {import('@open-design/contracts').ProjectPreviewUrlResponse} */
      const body = {
        url: `/api/projects/${encodeURIComponent(project.id)}/preview/${scope}/${encodeProjectPathForUrl(meta.name)}`,
        file: meta.name,
        csp: projectPreviewCsp,
        iframeSandbox: projectPreviewIframeSandbox,
        opaqueOrigin: true,
      };
      res.setHeader('Cache-Control', 'no-store');
      res.json(body);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });

  app.get(/^\/api\/projects\/([^/]+)\/text-preview\/(.+)$/u, async (req, res) => {
    let handle: import('fs/promises').FileHandle | null = null;
    try {
      const params = req.params as unknown as { 0?: string; 1?: string };
      const projectId = String(params[0] ?? '');
      const relPath = String(params[1] ?? '');
      if (rejectInternalVersionPath(res, relPath)) return;
      const requestedLimit = Number(req.query.limit);
      const limit = Math.max(
        1024,
        Math.min(Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 96 * 1024, 512 * 1024),
      );
      const project = getProject(db, projectId);
      const meta = await resolveProjectFilePath(
        PROJECTS_DIR,
        projectId,
        relPath,
        project?.metadata,
      );
      const bytesToRead = Math.min(meta.size, limit);
      const buffer = Buffer.allocUnsafe(bytesToRead);
      const opened = await fs.promises.open(meta.filePath, 'r');
      handle = opened;
      const result = bytesToRead > 0
        ? await opened.read(buffer, 0, bytesToRead, 0)
        : { bytesRead: 0 };
      const text = buffer.subarray(0, result.bytesRead).toString('utf8');
      const poweredPreview = await detectPoweredPreviewHint(meta);
      const body: ProjectFileTextPreviewResponse = {
        text,
        truncated: meta.size > result.bytesRead,
        size: meta.size,
        limit,
        mime: meta.mime,
        kind: meta.kind,
        poweredPreview,
      };
      res.setHeader('Cache-Control', 'no-store');
      res.json(body);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    } finally {
      await handle?.close().catch(() => undefined);
    }
  });

  app.get(/^\/api\/projects\/([^/]+)\/preview\/([^/]+)\/(.+)$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string; 2?: string };
      const projectId = String(params[0] ?? '');
      const scope = String(params[1] ?? '');
      const relPath = String(params[2] ?? '');
      if (!previewScopeRe.test(scope)) {
        sendApiError(res, 400, 'BAD_REQUEST', 'invalid preview scope');
        return;
      }
      const project = getProject(db, projectId);
      if (!project) {
        sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
        return;
      }
      if (!projectPreviewScopes.validate(project.id, scope)) {
        sendApiError(res, 404, 'PREVIEW_SCOPE_NOT_FOUND', 'preview scope not found');
        return;
      }
      if (req.headers.origin === 'null') {
        res.header('Access-Control-Allow-Origin', '*');
      }
      await sendProjectFile(
        req,
        res,
        project.id,
        relPath,
        project.metadata,
        () => setProjectPreviewHeaders(res),
        async (file) => maybeResolveVitePreviewHtml({
          file,
          projectId: project.id,
          relPath,
          metadata: project.metadata,
          projectsRoot: PROJECTS_DIR,
          readProjectFile,
        }),
      );
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });


  // Preflight for the raw file route. Current artifact fetches are simple GETs
  // (no preflight needed), but an explicit handler future-proofs the route if
  // artifacts ever add custom request headers.
  app.options(/^\/api\/projects\/([^/]+)\/raw\/(.+)$/u, (req, res) => {
    if (req.headers.origin === 'null') {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
    }
    res.sendStatus(204);
  });

  app.get(/^\/api\/projects\/([^/]+)\/raw\/(.+)$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string };
      const projectId = String(params[0] ?? '');
      const relPath = String(params[1] ?? '');
      if (rejectInternalVersionPath(res, relPath)) return;
      const project = getProject(db, projectId);
      // PreviewModal loads artifact HTML via srcdoc, giving the iframe Origin: "null".
      // data: URIs, file://, and some sandboxed iframes also send null — all are
      // local-only callers, so this is safe. Real cross-origin sites send a real
      // origin and remain blocked by the browser's same-origin policy.
      if (req.headers.origin === 'null') {
        res.header('Access-Control-Allow-Origin', '*');
      }
      const meta = await resolveProjectFilePath(
        PROJECTS_DIR,
        projectId,
        relPath,
        project?.metadata,
      );
      const skipHtmlPreviewBridge =
        /^text\/html(?:;|$)/i.test(meta.mime) && meta.size > HTML_PREVIEW_BRIDGE_MAX_BYTES;

      await sendProjectFile(
        req,
        res,
        projectId,
        relPath,
        project?.metadata,
        undefined,
        skipHtmlPreviewBridge ? undefined : async (file) => {
          let transformed = await maybeResolveVitePreviewHtml({
            file,
            projectId,
            relPath,
            metadata: project?.metadata,
            projectsRoot: PROJECTS_DIR,
            readProjectFile,
          });
          if (
            (wantsUrlPreviewScrollBridge(req.query.odPreviewBridge) ||
              wantsUrlPreviewSelectionBridge(req.query.odPreviewBridge) ||
              wantsUrlPreviewSnapshotBridge(req.query.odPreviewBridge)) &&
            /^text\/html(?:;|$)/i.test(file.mime)
          ) {
            let html = Buffer.isBuffer(transformed) ? transformed.toString('utf8') : transformed;
            // Sanitize the <title> so Cmd+P → "Save as PDF" produces a
            // Teams-safe filename. The URL-load iframe uses sandbox without
            // allow-same-origin, so the host cannot rewrite contentDocument.title
            // after load — we must do it here in the response. The srcDoc path
            // has its own sanitization in buildSrcdoc (apps/web/src/runtime/srcdoc.ts).
            html = daemonSanitizeTitleInDoc(html);
            if (wantsUrlPreviewScrollBridge(req.query.odPreviewBridge)) {
              html = injectUrlPreviewBridge(html, 'scroll');
            }
            if (wantsUrlPreviewSelectionBridge(req.query.odPreviewBridge)) {
              html = injectUrlPreviewBridge(html, 'selection');
            }
            if (wantsUrlPreviewSnapshotBridge(req.query.odPreviewBridge)) {
              html = injectUrlPreviewBridge(html, 'snapshot');
            }
            transformed = html;
          }
          return transformed;
        },
        true, // revalidate: emit ETag/Last-Modified so covers/preview/export reuse cached assets
      );
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });

  // Explicitly do not grant CORS for powered previews. Same-origin subresource
  // reads under the powered loopback URL do not preflight; foreign preflights
  // should complete without ACAO so browsers block the read.
  app.options(/^\/api\/projects\/([^/]+)\/powered\/(.+)$/u, (_req, res) => {
    res.sendStatus(204);
  });

  // "Powered preview" file serving. Mirrors /raw but stamps every response
  // (the HTML document AND its relatively-referenced worker/wasm/asset
  // subresources, which resolve under the same /powered/ prefix) with the
  // cross-origin-isolation headers from setPoweredPreviewHeaders. This is the
  // serving half of WebGL/Worker/WASM/SharedArrayBuffer support; the web host
  // decides when to route a preview here (see file-viewer-render-mode.ts).
  app.get(/^\/api\/projects\/([^/]+)\/powered\/(.+)$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string };
      const projectId = String(params[0] ?? '');
      const relPath = String(params[1] ?? '');
      if (rejectInternalVersionPath(res, relPath)) return;
      const project = getProject(db, projectId);
      const meta = await resolveProjectFilePath(
        PROJECTS_DIR,
        projectId,
        relPath,
        project?.metadata,
      );
      const skipPoweredTransform =
        /^text\/html(?:;|$)/i.test(meta.mime) && meta.size > HTML_PREVIEW_BRIDGE_MAX_BYTES;
      await sendProjectFile(
        req,
        res,
        projectId,
        relPath,
        project?.metadata,
        () => setPoweredPreviewHeaders(res),
        skipPoweredTransform ? undefined : async (file) =>
          maybeResolveVitePreviewHtml({
            file,
            projectId,
              relPath,
              metadata: project?.metadata,
              projectsRoot: PROJECTS_DIR,
              readProjectFile,
            }),
      );
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });

  app.delete(/^\/api\/projects\/([^/]+)\/raw\/(.+)$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string };
      const projectId = String(params[0] ?? '');
      const rawSplat = String(params[1] ?? '');
      if (rejectInternalVersionPath(res, rawSplat)) return;
      const project = getProject(db, projectId);
      await deleteProjectFile(PROJECTS_DIR, projectId, rawSplat, project?.metadata);
      await markProjectFileVersionStoreDeleted(PROJECTS_DIR, projectId, rawSplat, project?.metadata);
      /** @type {import('@open-design/contracts').DeleteProjectFileResponse} */
      const body = { ok: true };
      res.json(body);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });

  app.get('/api/projects/:id/files/:name/preview', async (req, res) => {
    try {
      const project = getProject(db, req.params.id);
      const file = await readProjectFile(
        PROJECTS_DIR,
        req.params.id,
        req.params.name,
        project?.metadata,
      );
      const preview = await buildDocumentPreview(file);
      res.json(preview);
    } catch (err: any) {
      const status =
        err && err.statusCode
          ? err.statusCode
          : err && err.code === 'ENOENT'
            ? 404
            : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        err?.message || 'preview unavailable',
      );
    }
  });

  app.get(/^\/api\/projects\/([^/]+)\/files\/(.+)\/versions$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string };
      const projectId = String(params[0] ?? '');
      const fileName = String(params[1] ?? '');
      if (rejectInternalVersionPath(res, fileName)) return;
      const project = getProject(db, projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!/\.html?$/i.test(fileName)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'versions are only available for HTML files');
      }
      let file: ProjectFile | null = null;
      let historyFileName = fileName;
      try {
        const workingFile = await readProjectFile(PROJECTS_DIR, project.id, fileName, project.metadata);
        if (!/\.html?$/i.test(workingFile.name)) {
          return sendApiError(res, 400, 'BAD_REQUEST', 'versions are only available for HTML files');
        }
        file = workingFile;
        historyFileName = workingFile.name;
      } catch (err: any) {
        if (err?.code !== 'ENOENT') throw err;
      }
      const versions = await listProjectFileVersions(PROJECTS_DIR, project.id, historyFileName, project.metadata);
      file ??= fileFromVersionHistory(historyFileName, versions);
      if (!file) {
        return sendApiError(res, 404, 'FILE_NOT_FOUND', 'file not found');
      }
      /** @type {import('@open-design/contracts').ProjectFileVersionsResponse} */
      const body = { file, versions };
      res.setHeader('Cache-Control', 'no-store');
      res.json(body);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err?.message || err),
      );
    }
  });

  app.post(/^\/api\/projects\/([^/]+)\/files\/(.+)\/versions$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string };
      const projectId = String(params[0] ?? '');
      const fileName = String(params[1] ?? '');
      if (rejectInternalVersionPath(res, fileName)) return;
      const project = getProject(db, projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      const file = await readProjectFile(PROJECTS_DIR, project.id, fileName, project.metadata);
      if (!/\.html?$/i.test(file.name)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'versions are only available for HTML files');
      }
      const manualPrompt = typeof req.body?.prompt === 'string' && req.body.prompt.trim()
        ? req.body.prompt.trim()
        : null;
      const requestedSource = requestProjectFileVersionSource(req.body?.source);
      const fallbackPromptInfo = requestedSource === 'ai' && !manualPrompt ? latestProjectPrompt(project) : null;
      const versionOptions: {
        prompt: string | null;
        promptSource?: ProjectFileVersionPromptSource;
        source: ProjectFileVersionSource;
        label?: string | null;
      } = {
        prompt: manualPrompt ?? fallbackPromptInfo?.prompt ?? null,
        source: requestedSource,
        label: typeof req.body?.label === 'string' ? req.body.label : null,
      };
      if (manualPrompt) {
        versionOptions.promptSource = 'manual';
      } else if (requestedSource === 'manual') {
        versionOptions.promptSource = 'manual';
      } else if (requestedSource === 'restore') {
        versionOptions.promptSource = 'restore';
      } else if (fallbackPromptInfo?.promptSource) {
        versionOptions.promptSource = fallbackPromptInfo.promptSource;
      }
      const version = await createProjectFileVersion(
        PROJECTS_DIR,
        project.id,
        file.name,
        file.buffer.toString('utf8'),
        versionOptions,
        project.metadata,
      );
      if (!version) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'version could not be created');
      }
      /** @type {import('@open-design/contracts').CreateProjectFileVersionResponse} */
      const body = { version };
      res.json(body);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err?.message || err),
      );
    }
  });

  app.post(/^\/api\/projects\/([^/]+)\/files\/(.+)\/versions\/([^/]+)\/restore$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string; 2?: string };
      const projectId = String(params[0] ?? '');
      const fileName = String(params[1] ?? '');
      const versionId = String(params[2] ?? '');
      if (rejectInternalVersionPath(res, fileName)) return;
      const project = getProject(db, projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      const restored = await readProjectFileVersion(
        PROJECTS_DIR,
        project.id,
        fileName,
        versionId,
        project.metadata,
      );
      const requestPrompt = typeof req.body?.prompt === 'string' && req.body.prompt.trim()
        ? req.body.prompt.trim()
        : null;
      const prompt = requestPrompt
        ?? restored.version.prompt
        ?? latestProjectPrompt(project).prompt;
      const { file, version, versionWarning } = await withProjectFileVersionLock(
        PROJECTS_DIR,
        project.id,
        fileName,
        project.metadata,
        async (versionLock) => {
          const file = await writeProjectFile(
            PROJECTS_DIR,
            project.id,
            fileName,
            Buffer.from(restored.content, 'utf8'),
            {},
            project.metadata,
          );
          let version: ProjectFileVersion | null = null;
          let versionWarning: ProjectFileVersionWarning | undefined;
          try {
            version = await versionLock.createVersion(restored.content, {
              prompt,
              promptSource: requestPrompt ? 'manual' : 'restore',
              source: 'restore',
              restoreFromVersionId: restored.version.id,
            });
          } catch (err) {
            versionWarning = htmlVersionCaptureWarning(err);
          }
          return { file, version, versionWarning };
        },
      );
      /** @type {import('@open-design/contracts').RestoreProjectFileVersionResponse} */
      const body = { file, version, ...(versionWarning ? { versionWarning } : {}) };
      res.json(body);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'VERSION_NOT_FOUND' : 'BAD_REQUEST',
        String(err?.message || err),
      );
    }
  });

  app.get(/^\/api\/projects\/([^/]+)\/files\/(.+)\/versions\/([^/]+)$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string; 2?: string };
      const projectId = String(params[0] ?? '');
      const fileName = String(params[1] ?? '');
      const versionId = String(params[2] ?? '');
      if (rejectInternalVersionPath(res, fileName)) return;
      const project = getProject(db, projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      const body = await readProjectFileVersion(
        PROJECTS_DIR,
        project.id,
        fileName,
        versionId,
        project.metadata,
      );
      /** @type {import('@open-design/contracts').ProjectFileVersionResponse} */
      const typedBody = body;
      res.setHeader('Cache-Control', 'no-store');
      res.json(typedBody);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'VERSION_NOT_FOUND' : 'BAD_REQUEST',
        String(err?.message || err),
      );
    }
  });

  app.get(/^\/api\/projects\/([^/]+)\/files\/(.+)$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string };
      const projectId = String(params[0] ?? '');
      const fileSplat = String(params[1] ?? '');
      if (rejectInternalVersionPath(res, fileSplat)) return;
      const project = getProject(db, projectId);
      const file = await readProjectFile(
        PROJECTS_DIR,
        projectId,
        fileSplat,
        project?.metadata,
      );
      res.type(file.mime).send(file.buffer);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });

  // Two ways to upload: multipart for binary files (images), and JSON
  // {name, content, encoding} for sketches and pasted text. The frontend
  // uses both depending on the file source.
  app.post(
    '/api/projects/:id/files',
    (req, res, next) => {
      upload.single('file')(req, res, (err: any) => {
        if (err) return sendMulterError(res, err);
        next();
      });
    },
    async (req, res) => {
      try {
        const uploadProject = getProject(db, req.params.id);
        await ensureProject(PROJECTS_DIR, req.params.id, uploadProject?.metadata);
        if (req.file) {
          try {
            const buf = await fs.promises.readFile(req.file.path);
            // A caller-supplied `name` may carry an intentional subdirectory
            // (e.g. "imagery/hero.png" from the design-kit uploader). Preserve it
            // with sanitizePath (sanitizes each segment, keeps the slashes) so the
            // file lands where brand.json references it; sanitizeName would flatten
            // the slash to "_" and orphan the asset at the project root. Raw
            // multipart originalnames are plain basenames, so sanitizeName fits.
            const desiredName = req.body?.name
              ? sanitizePath(req.body.name)
              : sanitizeName(req.file.originalname);
            if (rejectInternalVersionPath(res, desiredName)) return;
            const requestedSource = uploadProject && /\.html?$/i.test(desiredName)
              ? requestProjectFileVersionUploadSource(req.body)
              : null;
            const writeAndCapture = async (versionLock?: HtmlVersionLock) => {
              const meta = await writeProjectFile(
                PROJECTS_DIR,
                req.params.id,
                desiredName,
                buf,
                {},
                uploadProject?.metadata,
              );
              const versionCapture = uploadProject && requestedSource && /\.html?$/i.test(meta.name) && versionLock
                ? await (async () => {
                  const savedFile = await readProjectFile(PROJECTS_DIR, uploadProject.id, meta.name, uploadProject.metadata);
                  return tryEnsureLockedHtmlCurrentVersion(
                    uploadProject,
                    meta.name,
                    savedFile.buffer.toString('utf8'),
                    versionLock.ensureCurrentVersion,
                    {
                      prompt: typeof req.body?.versionPrompt === 'string' ? req.body.versionPrompt : null,
                      promptSource: 'manual',
                      source: requestedSource,
                      label: typeof req.body?.versionLabel === 'string' ? req.body.versionLabel : null,
                    },
                  );
                })()
                : null;
              return { meta, versionCapture };
            };
            const { meta, versionCapture } = uploadProject && requestedSource
              ? await withProjectFileVersionLock(
                PROJECTS_DIR,
                req.params.id,
                desiredName,
                uploadProject.metadata,
                (versionLock) => writeAndCapture(versionLock),
              )
              : await writeAndCapture();
            /** @type {import('@open-design/contracts').ProjectFileResponse} */
            const body = {
              file: meta,
              ...(versionCapture?.versionWarning ? { versionWarning: versionCapture.versionWarning } : {}),
            };
            return res.json(body);
          } finally {
            fs.promises.unlink(req.file.path).catch(() => {});
          }
        }
        const {
          name,
          content,
          encoding,
          artifactManifest,
          artifact,
          overwrite,
          versionLabel,
          versionPrompt,
        } = req.body || {};
        if (typeof name !== 'string' || typeof content !== 'string') {
          return sendApiError(
            res,
            400,
            'BAD_REQUEST',
            'name and content required',
          );
        }
        if (rejectInternalVersionPath(res, name)) return;
        const desiredName = sanitizePath(name);
        if (rejectInternalVersionPath(res, desiredName)) return;
        const requestedSource = uploadProject && /\.html?$/i.test(desiredName)
          ? requestProjectFileVersionUploadSource(req.body)
          : null;
        if (artifactManifest !== undefined && artifactManifest !== null) {
          const validated = validateArtifactManifestInput(
            artifactManifest,
            name,
          );
          if (!validated.ok) {
            return sendApiError(
              res,
              400,
              'BAD_REQUEST',
              `invalid artifactManifest: ${validated.error}`,
            );
          }
        }
        const buf =
          encoding === 'base64'
            ? Buffer.from(content, 'base64')
            : Buffer.from(content, 'utf8');
        const writeAndCapture = async (versionLock?: HtmlVersionLock) => {
          const meta = artifact === true
            ? await createProjectArtifactFile({
              projectsRoot: PROJECTS_DIR,
              projectId: req.params.id,
              input: { name, content, encoding, artifactManifest },
              metadata: uploadProject?.metadata,
              writeProjectFile,
            })
            : await writeProjectFile(
              PROJECTS_DIR,
              req.params.id,
              name,
              buf,
              {
                artifactManifest,
                ...(overwrite === false ? { overwrite: false } : {}),
              },
              uploadProject?.metadata,
            );
          const versionCapture = uploadProject && requestedSource && /\.html?$/i.test(meta.name) && versionLock
            ? await (async () => {
              const savedFile = await readProjectFile(PROJECTS_DIR, uploadProject.id, meta.name, uploadProject.metadata);
              const versionOverride: HtmlVersionOverride = {
                source: requestedSource,
                label: typeof versionLabel === 'string' ? versionLabel : null,
              };
              if (typeof versionPrompt === 'string') {
                versionOverride.prompt = versionPrompt;
              }
              if (requestedSource === 'manual') {
                versionOverride.promptSource = 'manual';
              } else if (requestedSource === 'restore') {
                versionOverride.promptSource = 'restore';
              }
              return tryEnsureLockedHtmlCurrentVersion(
                uploadProject,
                meta.name,
                savedFile.buffer.toString('utf8'),
                versionLock.ensureCurrentVersion,
                versionOverride,
              );
            })()
            : null;
          return { meta, versionCapture };
        };
        const { meta, versionCapture } = uploadProject && requestedSource
          ? await withProjectFileVersionLock(
            PROJECTS_DIR,
            req.params.id,
            desiredName,
            uploadProject.metadata,
            (versionLock) => writeAndCapture(versionLock),
          )
          : await writeAndCapture();
        /** @type {import('@open-design/contracts').ProjectFileResponse} */
        const body = {
          file: meta,
          ...(versionCapture?.versionWarning ? { versionWarning: versionCapture.versionWarning } : {}),
        };
        res.json(body);
      } catch (err: any) {
        const message = String(err?.message || err);
        if (/^invalid (source|versionSource);/u.test(message)) {
          return sendApiError(res, 400, 'BAD_REQUEST', message);
        }
        if (err instanceof ArtifactRegressionError) {
          return sendApiError(res, 422, 'ARTIFACT_REGRESSION', err.message, {
            details: {
              identifier: err.identifier,
              newSize: err.newSize,
              priorSize: err.priorSize,
              priorName: err.priorName,
            },
          });
        }
        if (err instanceof ArtifactPublicationBlockedError) {
          return sendApiError(res, 422, 'ARTIFACT_PUBLICATION_BLOCKED', err.message, {
            details: { placeholders: err.placeholders },
          });
        }
        if (err?.code === 'EEXIST') {
          return sendApiError(res, 409, 'FILE_EXISTS', 'file already exists');
        }
        if (err?.code === 'ARTIFACT_MANIFEST_REQUIRED') {
          return sendApiError(res, 400, 'ARTIFACT_MANIFEST_REQUIRED', err.message);
        }
        if (err?.code === 'ARTIFACT_MANIFEST_INVALID') {
          return sendApiError(res, 400, 'BAD_REQUEST', err.message);
        }
        sendApiError(res, 500, 'INTERNAL_ERROR', 'upload failed');
      }
    },
  );

  app.post('/api/projects/:id/files/rename', async (req, res) => {
    try {
      const { from, to } = req.body || {};
      if (typeof from !== 'string' || typeof to !== 'string') {
        return sendApiError(res, 400, 'BAD_REQUEST', 'from and to required');
      }
      if (rejectInternalVersionPath(res, from) || rejectInternalVersionPath(res, to)) return;
      const project = getProject(db, req.params.id);
      const result = await renameProjectFile(
        PROJECTS_DIR,
        req.params.id,
        from,
        to,
        project?.metadata,
      );
      await renameProjectFileVersionStore(
        PROJECTS_DIR,
        req.params.id,
        result.oldName,
        result.newName,
        project?.metadata,
      );
      /** @type {import('@open-design/contracts').RenameProjectFileResponse} */
      const body = result;
      res.json(body);
    } catch (err: any) {
      if (err?.code === 'EEXIST') {
        return sendApiError(res, 409, 'CONFLICT', String(err?.message || err));
      }
      const message = String(err?.message || err);
      if (err?.code === 'ENOENT' || message.includes('ENOENT') || message.includes('no such file or directory')) {
        return sendApiError(res, 404, 'FILE_NOT_FOUND', message);
      }
      sendApiError(res, 400, 'BAD_REQUEST', message);
    }
  });

  app.delete('/api/projects/:id/files/:name', async (req, res) => {
    try {
      if (rejectInternalVersionPath(res, req.params.name)) return;
      const delProject = getProject(db, req.params.id);
      await deleteProjectFile(PROJECTS_DIR, req.params.id, req.params.name, delProject?.metadata);
      await markProjectFileVersionStoreDeleted(PROJECTS_DIR, req.params.id, req.params.name, delProject?.metadata);
      /** @type {import('@open-design/contracts').DeleteProjectFileResponse} */
      const body = { ok: true };
      res.json(body);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });

}

export interface RegisterProjectUploadRoutesDeps extends RouteDeps<'http' | 'uploads' | 'node'> {}

export function registerProjectUploadRoutes(app: Express, ctx: RegisterProjectUploadRoutesDeps) {
  const { sendApiError } = ctx.http;
  const { handleProjectUpload } = ctx.uploads;
  const { fs } = ctx.node;

  app.post(
    '/api/projects/:id/upload',
    handleProjectUpload,
    async (req, res) => {
      try {
        const incoming = Array.isArray(req.files) ? req.files : [];
        // Subfolder the upload targeted (sanitized, forward-slash, '' for root),
        // stashed by the multer destination resolver. Prepend it so callers
        // get the file's true project-relative path, not just its basename.
        const relDir = typeof (req as any)._uploadRelDir === 'string' ? (req as any)._uploadRelDir : '';
        const out = [];
        for (const f of incoming) {
          try {
            const stat = await fs.promises.stat(f.path);
            const rel = relDir ? `${relDir}/${f.filename}` : f.filename;
            out.push({
              name: rel,
              path: rel,
              size: stat.size,
              mtime: stat.mtimeMs,
              originalName: f.originalname,
            });
          } catch {
            // skip files that vanished mid-flight
          }
        }
        /** @type {import('@open-design/contracts').UploadProjectFilesResponse} */
        const body = { files: out };
        res.json(body);
      } catch (err: any) {
        sendApiError(res, 500, 'INTERNAL_ERROR', 'upload failed');
      }
    },
  );
}
