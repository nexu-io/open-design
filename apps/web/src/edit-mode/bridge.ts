export const MANUAL_EDIT_DISCOVERY_SELECTOR = 'main, nav, section, article, header, footer, div, h1, h2, h3, p, a, button, img, strong, span, ul, ol, li';
export const MANUAL_EDIT_SOURCE_PATH_ATTR = 'data-od-source-path';
export const MANUAL_EDIT_HOST_NODE_SELECTOR = [
  '[data-od-sandbox-shim]',
  '[data-od-deck-bridge]',
  '[data-od-comment-bridge]',
  '[data-od-edit-bridge]',
  '[data-od-comment-bridge-style]',
  '[data-od-edit-bridge-style]',
  '[data-od-deck-fix]',
].join(',');

export function manualEditDomPathForElement(el: Element): string {
  const parts: number[] = [];
  let node: Element | null = el;
  while (node && node !== node.ownerDocument.body) {
    const parentEl: Element | null = node.parentElement;
    if (!parentEl) break;
    const children = Array.from(parentEl.children).filter((child) => !isManualEditHostNode(child));
    parts.unshift(children.indexOf(node));
    node = parentEl;
  }
  return parts.length ? `path-${parts.join('-')}` : '';
}

export function isManualEditHostNode(el: Element): boolean {
  return el.matches(MANUAL_EDIT_HOST_NODE_SELECTOR);
}

export function manualEditStableIdForElement(el: Element): string {
  const explicit = el.getAttribute('data-od-id');
  if (explicit) return explicit;
  const generated = el.getAttribute(MANUAL_EDIT_SOURCE_PATH_ATTR) || el.getAttribute('data-od-runtime-id') || manualEditDomPathForElement(el);
  if (generated) el.setAttribute('data-od-runtime-id', generated);
  return generated || 'unknown';
}

export function isMeaningfulManualEditElement(el: Element, rect: Pick<DOMRect, 'width' | 'height'>): boolean {
  return isSourceMappableManualEditElement(el) && el.matches(MANUAL_EDIT_DISCOVERY_SELECTOR) && rect.width >= 4 && rect.height >= 4;
}

export function isSourceMappableManualEditElement(el: Element): boolean {
  return el.hasAttribute('data-od-id') || el.hasAttribute(MANUAL_EDIT_SOURCE_PATH_ATTR);
}

export function buildManualEditBridge(enabled: boolean): string {
  return `<script data-od-edit-bridge>(function(){
  var bridgeVersion = 'inline-text-v5';
  var enabled = ${JSON.stringify(enabled)};
  var discoverySelector = ${JSON.stringify(MANUAL_EDIT_DISCOVERY_SELECTOR)};
  var hostNodeSelector = ${JSON.stringify(MANUAL_EDIT_HOST_NODE_SELECTOR)};
  var sourcePathAttr = ${JSON.stringify(MANUAL_EDIT_SOURCE_PATH_ATTR)};
  var positionOverrideAttr = 'data-od-edit-position-override';
  var styleProps = ['fontFamily','fontSize','fontWeight','color','textAlign','lineHeight','letterSpacing','width','height','minHeight','gap','flexDirection','justifyContent','alignItems','backgroundColor','opacity','padding','paddingTop','paddingRight','paddingBottom','paddingLeft','margin','marginTop','marginRight','marginBottom','marginLeft','border','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','borderStyle','borderColor','borderRadius'];
  var activeTextEdit = null;
  var inlineTextCommitTimer = null;
  var restoringInlineText = false;
  var lastTargetsJson = '';
  function debug(event, detail){
    void event;
    void detail;
  }
  function isHostNode(el){
    return !!(el && el.matches && el.matches(hostNodeSelector));
  }
  function domPath(el){
    var parts = [];
    var node = el;
    while (node && node !== document.body) {
      var parent = node.parentElement;
      if (!parent) break;
      var children = Array.prototype.slice.call(parent.children).filter(function(child){ return !isHostNode(child); });
      parts.unshift(children.indexOf(node));
      node = parent;
    }
    return parts.length ? 'path-' + parts.join('-') : '';
  }
  function stableId(el){
    var explicit = el.getAttribute('data-od-id');
    if (explicit) return explicit;
    var generated = el.getAttribute(sourcePathAttr) || el.getAttribute('data-od-runtime-id') || domPath(el);
    if (generated) el.setAttribute('data-od-runtime-id', generated);
    return generated || 'unknown';
  }
  function isSourceMappable(el){
    return !!(el && el.hasAttribute && (el.hasAttribute('data-od-id') || el.hasAttribute(sourcePathAttr)));
  }
  function isDiscoveryTarget(el){
    return !!(el && el.matches && el.matches(discoverySelector));
  }
  function isPrimaryTarget(el){
    if (!el || !el.hasAttribute) return false;
    if (el.hasAttribute('data-od-id') || el.hasAttribute('data-od-edit')) return true;
    var tag = el.tagName ? el.tagName.toLowerCase() : '';
    return tag === 'a' || tag === 'button';
  }
  function hasElementChildren(el){
    return !!(el && el.children && el.children.length > 0);
  }
  function inferKind(el){
    var explicit = el.getAttribute('data-od-edit');
    if (explicit === 'text' || explicit === 'link' || explicit === 'image' || explicit === 'container') return explicit;
    var tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'a') return 'link';
    if (tag === 'img') return 'image';
    if (['section','main','nav','div','article','header','footer'].indexOf(tag) >= 0) return 'container';
    return 'text';
  }
  function isDirectTextEditable(el){
    var kind = inferKind(el);
    return (kind === 'text' || kind === 'link') && !hasElementChildren(el);
  }
  function labelFor(el, id, kind){
    var explicit = el.getAttribute('data-od-label');
    if (explicit) return explicit;
    var tag = el.tagName ? el.tagName.toLowerCase() : 'element';
    var text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    if (text) return text.slice(0, 42);
    if (kind === 'image') return el.getAttribute('alt') || id;
    return tag + ' #' + id;
  }
  function attrsFor(el){
    var attrs = {};
    for (var i = 0; i < el.attributes.length; i++) {
      var attr = el.attributes[i];
      if (!attr || attr.name.indexOf('data-od-runtime') === 0 || attr.name === 'data-od-edit-selected' || attr.name === positionOverrideAttr || attr.name === 'data-od-editing-text') continue;
      attrs[attr.name] = attr.value;
    }
    return attrs;
  }
  function stylesFor(el){
    var computed = window.getComputedStyle(el);
    var styles = {};
    styleProps.forEach(function(prop){ styles[prop] = el.style[prop] || computed[prop] || ''; });
    return styles;
  }
  function isLayoutContainer(el){
    var display = window.getComputedStyle(el).display || '';
    if (display.indexOf('flex') >= 0 || display.indexOf('grid') >= 0) return true;
    return hasOwnDisplayHiddenState(el) && inferKind(el) === 'container';
  }
  function hasOwnDisplayHiddenState(el){
    var computed = window.getComputedStyle(el);
    return computed.display === 'none' || el.hasAttribute('hidden');
  }
  function hasHiddenAncestorDisplayState(el){
    var node = el;
    while (node && node !== document.documentElement) {
      if (hasOwnDisplayHiddenState(node)) return true;
      node = node.parentElement;
    }
    return false;
  }
  function isHiddenTarget(el, rect){
    var targetVisibility = window.getComputedStyle(el).visibility;
    if (targetVisibility === 'hidden' || targetVisibility === 'collapse') return true;
    return hasHiddenAncestorDisplayState(el);
  }
  function targetFrom(el, includeOuterHtml){
    var rect = el.getBoundingClientRect();
    var kind = inferKind(el);
    var id = stableId(el);
    var hidden = isHiddenTarget(el, rect);
    var fields = {};
    if (kind === 'link') {
      fields.text = (el.textContent || '').trim();
      fields.href = el.getAttribute('href') || '';
    } else if (kind === 'image') {
      fields.src = el.getAttribute('src') || '';
      fields.alt = el.getAttribute('alt') || '';
    } else {
      fields.text = (el.textContent || '').trim();
    }
    return {
      id: id,
      kind: kind,
      label: labelFor(el, id, kind),
      tagName: el.tagName ? el.tagName.toLowerCase() : 'element',
      className: typeof el.className === 'string' ? el.className : '',
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 180),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      fields: fields,
      attributes: attrsFor(el),
      styles: stylesFor(el),
      isLayoutContainer: isLayoutContainer(el),
      isHidden: hidden,
      outerHtml: includeOuterHtml ? (el.outerHTML || '').replace(/\\sdata-od-runtime-id="[^"]*"/g, '').replace(/\\sdata-od-source-path="[^"]*"/g, '').replace(/\\sdata-od-edit-selected="[^"]*"/g, '').replace(/\\sdata-od-editing-text="[^"]*"/g, '').replace(/\\sdata-od-edit-position-override="[^"]*"/g, '') : ''
    };
  }
  function allTargets(){
    var nodes = document.body ? document.body.querySelectorAll(discoverySelector) : [];
    var targets = [];
    for (var i = 0; i < nodes.length; i++) {
      var rect = nodes[i].getBoundingClientRect();
      if (!isSourceMappable(nodes[i])) continue;
      if (!isHiddenTarget(nodes[i], rect) && (rect.width < 4 || rect.height < 4)) continue;
      targets.push(targetFrom(nodes[i], false));
    }
    return targets;
  }
  function postTargets(){
    if (!enabled) return;
    var targets = allTargets();
    var targetsJson = JSON.stringify(targets.map(function(target){
      return [target.id, target.rect.x, target.rect.y, target.rect.width, target.rect.height, target.text];
    }));
    if (targetsJson === lastTargetsJson) return;
    lastTargetsJson = targetsJson;
    window.parent.postMessage({ type: 'od-edit-targets', targets: targets }, '*');
  }
  function clearSelectedTarget(exceptId){
    var selected = document.querySelectorAll('[data-od-edit-selected]');
    for (var i = 0; i < selected.length; i++) {
      if (exceptId && stableId(selected[i]) === exceptId) continue;
      selected[i].removeAttribute('data-od-edit-selected');
    }
  }
  function makeInlineTextEditable(el, id, focus){
    if (!enabled || !isDirectTextEditable(el)) return;
    if (!activeTextEdit || activeTextEdit.id !== id) {
      var originalOuterHtml = (el.outerHTML || '').replace(/\\sdata-od-runtime-id="[^"]*"/g, '').replace(/\\sdata-od-source-path="[^"]*"/g, '').replace(/\\sdata-od-edit-selected="[^"]*"/g, '').replace(/\\sdata-od-editing-text="[^"]*"/g, '').replace(/\\scontenteditable="[^"]*"/g, '').replace(/\\sspellcheck="[^"]*"/g, '');
      activeTextEdit = {
        el: el,
        id: id,
        originalText: el.textContent || '',
        currentText: el.textContent || '',
        originalHtml: el.innerHTML || '',
        currentHtml: el.innerHTML || '',
        originalOuterHtml: originalOuterHtml,
        lastCommittedText: el.textContent || '',
        lastCommittedHtml: originalOuterHtml,
        focusSelectionApplied: false,
        pendingReplaceOnType: false,
        useOuterHtml: hasElementChildren(el)
      };
    } else {
      activeTextEdit.el = el;
    }
    if (el.getAttribute('contenteditable') !== 'plaintext-only') el.setAttribute('contenteditable', 'plaintext-only');
    if (el.getAttribute('spellcheck') !== 'true') el.setAttribute('spellcheck', 'true');
    if (el.getAttribute('data-od-editing-text') !== 'true') el.setAttribute('data-od-editing-text', 'true');
    if (!focus || document.activeElement === el) return;
    setTimeout(function(){
      if (!activeTextEdit || activeTextEdit.id !== id || document.activeElement === el) return;
      try {
        window.focus();
      } catch (_) {}
      try {
        el.focus({ preventScroll: true });
      } catch (_) {
        el.focus();
      }
      if (!activeTextEdit.focusSelectionApplied) activeTextEdit.focusSelectionApplied = true;
    }, 80);
  }
  function setSelectedTarget(id, focus){
    clearSelectedTarget(id);
    if (!id) return;
    var el = findById(id);
    if (el) {
      if (el.getAttribute('data-od-edit-selected') !== 'true') el.setAttribute('data-od-edit-selected', 'true');
      makeInlineTextEditable(el, id, !!focus);
    }
  }
  function selectTextContents(el){
    try {
      var range = document.createRange();
      range.selectNodeContents(el);
      var selection = window.getSelection && window.getSelection();
      if (!selection) return;
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (_) {}
  }
  function clearInlineTextEdit(commit){
    if (!activeTextEdit) return;
    var edit = activeTextEdit;
    activeTextEdit = null;
    if (inlineTextCommitTimer) {
      clearTimeout(inlineTextCommitTimer);
      inlineTextCommitTimer = null;
    }
    edit.el.removeAttribute('contenteditable');
    edit.el.removeAttribute('spellcheck');
    edit.el.removeAttribute('data-od-editing-text');
    if (!commit) {
      edit.el.innerHTML = edit.originalHtml;
      return;
    }
    postInlineTextCommit(edit);
  }
  function sanitizedEditableOuterHtml(el){
    return (el.outerHTML || '').replace(/\\sdata-od-runtime-id="[^"]*"/g, '').replace(/\\sdata-od-source-path="[^"]*"/g, '').replace(/\\sdata-od-edit-selected="[^"]*"/g, '').replace(/\\sdata-od-editing-text="[^"]*"/g, '').replace(/\\scontenteditable="[^"]*"/g, '').replace(/\\sspellcheck="[^"]*"/g, '');
  }
  function postInlineTextCommit(edit){
    var el = findById(edit.id) || edit.el;
    if (!el) {
      debug('bridge:commit-missing-element', { id: edit.id });
      return;
    }
    var value = el.textContent || '';
    var html = sanitizedEditableOuterHtml(el);
    if (value === edit.originalText && html === edit.originalOuterHtml) {
      debug('bridge:commit-skipped-original', { id: edit.id, value: value });
      return;
    }
    if (value === edit.lastCommittedText && html === edit.lastCommittedHtml) {
      debug('bridge:commit-skipped-duplicate', { id: edit.id, value: value });
      return;
    }
    edit.lastCommittedText = value;
    edit.lastCommittedHtml = html;
    var target = targetFrom(el, true);
    var message = {
      type: 'od-edit-text-commit',
      id: edit.id,
      value: value,
      html: html,
      useOuterHtml: !!edit.useOuterHtml,
      target: target
    };
    if (target.kind === 'link') message.href = el.getAttribute('href') || '';
    debug('bridge:commit-post', { id: edit.id, value: value, htmlLength: html.length, useOuterHtml: !!edit.useOuterHtml });
    window.parent.postMessage(message, '*');
  }
  function scheduleInlineTextCommit(){
    if (!activeTextEdit) return;
    if (inlineTextCommitTimer) clearTimeout(inlineTextCommitTimer);
    inlineTextCommitTimer = setTimeout(function(){
      inlineTextCommitTimer = null;
      if (activeTextEdit) postInlineTextCommit(activeTextEdit);
    }, 350);
  }
  function beginInlineTextEdit(el){
    if (!isDirectTextEditable(el)) return;
    if (activeTextEdit && activeTextEdit.el === el) return;
    clearInlineTextEdit(true);
    var id = stableId(el);
    var originalOuterHtml = sanitizedEditableOuterHtml(el);
    activeTextEdit = {
      el: el,
      id: id,
      originalText: el.textContent || '',
      currentText: el.textContent || '',
      originalHtml: el.innerHTML || '',
      currentHtml: el.innerHTML || '',
      originalOuterHtml: originalOuterHtml,
      lastCommittedText: el.textContent || '',
      lastCommittedHtml: originalOuterHtml,
      focusSelectionApplied: false,
      pendingReplaceOnType: false,
      useOuterHtml: hasElementChildren(el)
    };
    debug('bridge:begin-inline-edit', { id: id, tag: el.tagName ? el.tagName.toLowerCase() : null, text: el.textContent || '' });
    setSelectedTarget(id, true);
    scheduleInlineTextEditRestores(id, activeTextEdit);
    setTimeout(function(){
      try {
        window.focus();
      } catch (_) {}
      try {
        el.focus({ preventScroll: true });
      } catch (_) {
        el.focus();
      }
      if (activeTextEdit && activeTextEdit.id === id) activeTextEdit.focusSelectionApplied = true;
    }, 0);
  }
  function ensureInlineTextEditActive(){
    if (!activeTextEdit) return;
    var el = findById(activeTextEdit.id);
    if (!el || !isDirectTextEditable(el)) return;
    activeTextEdit.el = el;
    if (el.getAttribute('data-od-edit-selected') !== 'true') {
      clearSelectedTarget(activeTextEdit.id);
      el.setAttribute('data-od-edit-selected', 'true');
    }
    if (el.getAttribute('contenteditable') !== 'plaintext-only') el.setAttribute('contenteditable', 'plaintext-only');
    if (el.getAttribute('spellcheck') !== 'true') el.setAttribute('spellcheck', 'true');
    if (el.getAttribute('data-od-editing-text') !== 'true') el.setAttribute('data-od-editing-text', 'true');
    if (document.activeElement !== el) {
      try {
        window.focus();
      } catch (_) {}
      try {
        el.focus({ preventScroll: true });
      } catch (_) {
        el.focus();
      }
    }
  }
  function restoreInlineTextEditById(id, snapshot){
    if (!enabled) return;
    var el = findById(id);
    if (!el || !isDirectTextEditable(el)) return;
    if (!activeTextEdit) {
      activeTextEdit = {
        el: el,
        id: id,
        originalText: snapshot.originalText,
        currentText: snapshot.currentText,
        originalHtml: snapshot.originalHtml,
        currentHtml: snapshot.currentHtml,
        originalOuterHtml: snapshot.originalOuterHtml,
        lastCommittedText: snapshot.lastCommittedText,
        lastCommittedHtml: snapshot.lastCommittedHtml,
        focusSelectionApplied: snapshot.focusSelectionApplied,
        pendingReplaceOnType: snapshot.pendingReplaceOnType,
        useOuterHtml: snapshot.useOuterHtml
      };
    }
    if (activeTextEdit.id !== id) return;
    ensureInlineTextEditActive();
  }
  function scheduleInlineTextEditRestores(id, snapshot){
    [50, 250, 750].forEach(function(delay){
      setTimeout(function(){ restoreInlineTextEditById(id, snapshot); }, delay);
    });
  }
  function noteInlineTextInput(el){
    if (!activeTextEdit || !el || stableId(el) !== activeTextEdit.id) return;
    activeTextEdit.el = el;
    activeTextEdit.currentText = el.textContent || '';
    activeTextEdit.currentHtml = el.innerHTML || '';
    activeTextEdit.pendingReplaceOnType = false;
    debug('bridge:input', { id: activeTextEdit.id, value: activeTextEdit.currentText });
    scheduleInlineTextCommit();
  }
  function applyInlineTextKeyboardInput(ev){
    if (!activeTextEdit) return false;
    var el = findById(activeTextEdit.id) || activeTextEdit.el;
    if (!el || !isDirectTextEditable(el) || document.activeElement === el) return false;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return false;
    var next = null;
    if (ev.key && ev.key.length === 1) {
      next = activeTextEdit.pendingReplaceOnType ? ev.key : (el.textContent || '') + ev.key;
    } else if (ev.key === 'Backspace') {
      var current = activeTextEdit.pendingReplaceOnType ? '' : (el.textContent || '');
      next = current.slice(0, Math.max(0, current.length - 1));
    } else if (ev.key === 'Delete') {
      next = activeTextEdit.pendingReplaceOnType ? '' : (el.textContent || '');
    }
    if (next === null) return false;
    ev.preventDefault();
    ev.stopPropagation();
    activeTextEdit.pendingReplaceOnType = false;
    restoringInlineText = true;
    el.textContent = next;
    el.setAttribute('contenteditable', 'plaintext-only');
    el.setAttribute('spellcheck', 'true');
    el.setAttribute('data-od-editing-text', 'true');
    if (el.getAttribute('data-od-edit-selected') !== 'true') el.setAttribute('data-od-edit-selected', 'true');
    restoringInlineText = false;
    noteInlineTextInput(el);
    debug('bridge:key-applied', { id: activeTextEdit.id, key: ev.key, value: next });
    return true;
  }
  function handleInlineTextHistoryShortcut(ev){
    if (!enabled || !(ev.metaKey || ev.ctrlKey) || ev.altKey) return false;
    var key = ev.key ? String(ev.key).toLowerCase() : '';
    var action = null;
    if (key === 'z') action = ev.shiftKey ? 'redo' : 'undo';
    else if (key === 'y') action = 'redo';
    if (!action) return false;
    ev.preventDefault();
    ev.stopPropagation();
    if (activeTextEdit) postInlineTextCommit(activeTextEdit);
    debug('bridge:history-key', { action: action, key: ev.key, shiftKey: !!ev.shiftKey });
    window.parent.postMessage({ type: 'od-edit-history-key', action: action }, '*');
    return true;
  }
  function replaceSelectionOrAppendText(el, text){
    if (!activeTextEdit) return false;
    var current = activeTextEdit.pendingReplaceOnType ? '' : (el.textContent || '');
    var caretOffset = current.length;
    var selection = window.getSelection && window.getSelection();
    if (selection && selection.rangeCount > 0) {
      var range = selection.getRangeAt(0);
      if (el.contains(range.commonAncestorContainer)) {
        var before = '';
        var after = '';
        try {
          var beforeRange = document.createRange();
          beforeRange.selectNodeContents(el);
          beforeRange.setEnd(range.startContainer, range.startOffset);
          before = beforeRange.toString();
          var afterRange = document.createRange();
          afterRange.selectNodeContents(el);
          afterRange.setStart(range.endContainer, range.endOffset);
          after = afterRange.toString();
          current = before + text + after;
          caretOffset = before.length + text.length;
        } catch (_) {
          current = (activeTextEdit.pendingReplaceOnType ? '' : (el.textContent || '')) + text;
          caretOffset = current.length;
        }
      } else {
        current += text;
        caretOffset = current.length;
      }
    } else {
      current += text;
      caretOffset = current.length;
    }
    activeTextEdit.pendingReplaceOnType = false;
    restoringInlineText = true;
    el.textContent = current;
    el.setAttribute('contenteditable', 'plaintext-only');
    el.setAttribute('spellcheck', 'true');
    el.setAttribute('data-od-editing-text', 'true');
    if (el.getAttribute('data-od-edit-selected') !== 'true') el.setAttribute('data-od-edit-selected', 'true');
    restoringInlineText = false;
    noteInlineTextInput(el);
    try {
      var textNode = el.firstChild && el.firstChild.nodeType === 3 ? el.firstChild : null;
      var nextSelection = window.getSelection && window.getSelection();
      if (!textNode || !nextSelection) return true;
      var cursorRange = document.createRange();
      var offset = Math.max(0, Math.min(caretOffset, textNode.textContent ? textNode.textContent.length : 0));
      cursorRange.setStart(textNode, offset);
      cursorRange.collapse(true);
      var nextSelection = window.getSelection && window.getSelection();
      if (nextSelection) {
        nextSelection.removeAllRanges();
        nextSelection.addRange(cursorRange);
      }
    } catch (_) {}
    return true;
  }
  function handleInlineTextBeforeInput(ev){
    if (!activeTextEdit || !ev.target) return;
    var el = findById(activeTextEdit.id) || activeTextEdit.el;
    if (!el || !isDirectTextEditable(el) || ev.target !== el) return;
    debug('bridge:beforeinput', {
      id: activeTextEdit.id,
      inputType: ev.inputType || '',
      data: typeof ev.data === 'string' ? ev.data : null,
      value: el.textContent || ''
    });
    if (ev.inputType === 'insertText' && typeof ev.data === 'string') {
      ev.preventDefault();
      ev.stopPropagation();
      replaceSelectionOrAppendText(el, ev.data);
      return;
    }
    if (ev.inputType === 'deleteContentBackward') {
      ev.preventDefault();
      ev.stopPropagation();
      var current = activeTextEdit.pendingReplaceOnType ? '' : (el.textContent || '');
      var next = current;
      var caretOffset = Math.max(0, current.length - 1);
      var selection = window.getSelection && window.getSelection();
      if (selection && selection.rangeCount > 0) {
        var range = selection.getRangeAt(0);
        if (el.contains(range.commonAncestorContainer)) {
          try {
            var beforeRange = document.createRange();
            beforeRange.selectNodeContents(el);
            beforeRange.setEnd(range.startContainer, range.startOffset);
            var before = beforeRange.toString();
            var afterRange = document.createRange();
            afterRange.selectNodeContents(el);
            afterRange.setStart(range.endContainer, range.endOffset);
            var after = afterRange.toString();
            if (!range.collapsed) {
              next = before + after;
              caretOffset = before.length;
            } else {
              var removeAt = Math.max(0, before.length - 1);
              next = before.slice(0, removeAt) + after;
              caretOffset = removeAt;
            }
          } catch (_) {
            next = current.slice(0, Math.max(0, current.length - 1));
            caretOffset = next.length;
          }
        } else {
          next = current.slice(0, Math.max(0, current.length - 1));
          caretOffset = next.length;
        }
      } else {
        next = current.slice(0, Math.max(0, current.length - 1));
        caretOffset = next.length;
      }
      activeTextEdit.pendingReplaceOnType = false;
      restoringInlineText = true;
      el.textContent = next;
      restoringInlineText = false;
      noteInlineTextInput(el);
      try {
        var textNode = el.firstChild && el.firstChild.nodeType === 3 ? el.firstChild : null;
        var nextSelection = window.getSelection && window.getSelection();
        if (!textNode || !nextSelection) return;
        var range = document.createRange();
        var offset = Math.max(0, Math.min(caretOffset, textNode.textContent ? textNode.textContent.length : 0));
        range.setStart(textNode, offset);
        range.collapse(true);
        nextSelection.removeAllRanges();
        nextSelection.addRange(range);
      } catch (_) {}
    }
  }
  function restoreInlineTextContent(){
    if (!activeTextEdit || restoringInlineText) return;
    var el = findById(activeTextEdit.id);
    if (!el || !isDirectTextEditable(el)) return;
    activeTextEdit.el = el;
    if (typeof activeTextEdit.currentText !== 'string' || el.textContent === activeTextEdit.currentText) return;
    restoringInlineText = true;
    el.textContent = activeTextEdit.currentText;
    el.setAttribute('contenteditable', 'plaintext-only');
    el.setAttribute('spellcheck', 'true');
    el.setAttribute('data-od-editing-text', 'true');
    if (el.getAttribute('data-od-edit-selected') !== 'true') el.setAttribute('data-od-edit-selected', 'true');
    restoringInlineText = false;
  }
  function closestTarget(event){
    var el = event.target;
    var fallback = null;
    while (el && el !== document.documentElement) {
      if (el !== document.body && el !== document.documentElement && isSourceMappable(el) && isDiscoveryTarget(el)) {
        if (isDirectTextEditable(el)) return el;
        if (isPrimaryTarget(el)) return el;
        if (!fallback) fallback = el;
      }
      el = el.parentElement;
    }
    return fallback;
  }
  function handleManualEditPick(ev){
    if (!enabled) return;
    var el = closestTarget(ev);
    if (!el) return;
    debug('bridge:pointer-pick', { eventType: ev.type, id: stableId(el), tag: el.tagName ? el.tagName.toLowerCase() : null, text: el.textContent || '' });
    if (activeTextEdit && activeTextEdit.el === el) {
      ensureInlineTextEditActive();
      ev.stopPropagation();
      return;
    }
    if (activeTextEdit) clearInlineTextEdit(true);
    window.parent.postMessage({ type: 'od-edit-select', target: targetFrom(el, true) }, '*');
    var directTextTarget = isDirectTextEditable(el);
    beginInlineTextEdit(el);
    if (!directTextTarget) ev.preventDefault();
    ev.stopPropagation();
  }
  function preventManualEditActivation(ev){
    if (!enabled) return;
    var el = closestTarget(ev);
    if (!el) return;
    ev.preventDefault();
    ev.stopPropagation();
  }
  function camelToKebab(name){ return String(name).replace(/[A-Z]/g, function(m){ return '-' + m.toLowerCase(); }); }
  function cssEscapeId(value){ if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value); return String(value).replace(/"/g, '\\\\"'); }
  function findById(id){
    if (!id) return null;
    if (id === '__body__') return document.body;
    var el = document.querySelector('[data-od-id="' + cssEscapeId(id) + '"]')
          || document.querySelector('[data-od-runtime-id="' + cssEscapeId(id) + '"]')
          || document.querySelector('[' + sourcePathAttr + '="' + cssEscapeId(id) + '"]');
    if (el) return el;
    if (typeof id === 'string' && id.indexOf('path-') === 0) {
      var parts = id.slice('path-'.length).split('-').map(function(s){ return Number(s); });
      var node = document.body;
      for (var i = 0; i < parts.length; i++) {
        if (!node) return null;
        var idx = parts[i];
        if (!Number.isInteger(idx) || idx < 0) return null;
        var children = Array.prototype.slice.call(node.children).filter(function(c){ return !isHostNode(c); });
        node = children[idx] || null;
      }
      return node;
    }
    return null;
  }
  function applyPreviewStyles(id, styles, version){
    var el = findById(id);
    if (!el) {
      window.parent.postMessage({ type: 'od-edit-preview-style-applied', id: id || '', version: Number(version) || 0, ok: false, error: 'Target not found' }, '*');
      return;
    }
    var keys = Object.keys(styles || {});
    try {
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var value = styles[key];
        var cssName = camelToKebab(key);
        if (typeof value !== 'string' || value.trim() === '') el.style.removeProperty(cssName);
        else el.style.setProperty(cssName, value.trim());
      }
      window.parent.postMessage({ type: 'od-edit-preview-style-applied', id: id, version: Number(version) || 0, ok: true }, '*');
    } catch (e) {
      window.parent.postMessage({ type: 'od-edit-preview-style-applied', id: id, version: Number(version) || 0, ok: false, error: e && e.message ? String(e.message) : 'Could not apply preview styles' }, '*');
    }
  }
  function setOverlayNeutralized(nextEnabled){
    var marked = document.querySelectorAll('[' + positionOverrideAttr + ']');
    for (var i = 0; i < marked.length; i++) {
      var el = marked[i];
      var snapshot = {};
      try { snapshot = JSON.parse(decodeURIComponent(el.getAttribute(positionOverrideAttr) || '{}')); } catch (_) {}
      ['position','top','right','bottom','left'].forEach(function(prop){
        var item = snapshot[prop] || {};
        if (typeof item.value === 'string' && item.value) el.style.setProperty(prop, item.value, item.priority || '');
        else el.style.removeProperty(prop);
      });
      marked[i].removeAttribute(positionOverrideAttr);
    }
    if (!nextEnabled || !document.body) return;
    var nodes = document.body.querySelectorAll('*');
    for (var j = 0; j < nodes.length; j++) {
      var el = nodes[j];
      if (isHostNode(el)) continue;
      var computed = window.getComputedStyle(el);
      if (computed.position !== 'sticky' && computed.position !== 'fixed') continue;
      var snapshot = {};
      ['position','top','right','bottom','left'].forEach(function(prop){
        snapshot[prop] = {
          value: el.style.getPropertyValue(prop) || '',
          priority: el.style.getPropertyPriority(prop) || ''
        };
      });
      el.setAttribute(positionOverrideAttr, encodeURIComponent(JSON.stringify(snapshot)));
      el.style.setProperty('position', 'static', 'important');
      el.style.removeProperty('top');
      el.style.removeProperty('right');
      el.style.removeProperty('bottom');
      el.style.removeProperty('left');
    }
  }
  window.addEventListener('message', function(ev){
    if (!ev.data) return;
    if (ev.data.type === 'od-edit-mode') {
      var wasEnabled = enabled;
      enabled = !!ev.data.enabled;
      document.documentElement.toggleAttribute('data-od-edit-mode', enabled);
      setOverlayNeutralized(enabled);
      if (!enabled) {
        clearInlineTextEdit(false);
        clearSelectedTarget();
      }
      if (enabled && !wasEnabled) setTimeout(postTargets, 0);
      return;
    }
    if (ev.data.type === 'od-edit-selected-target') {
      var selectedId = ev.data.id || null;
      var forceClear = !!ev.data.forceClear;
      debug('bridge:selected-target-message', { id: selectedId });
      if (!selectedId && forceClear) {
        if (activeTextEdit) clearInlineTextEdit(true);
        clearSelectedTarget();
        return;
      }
      if (activeTextEdit && !selectedId) return;
      if (activeTextEdit && activeTextEdit.id === selectedId) {
        setSelectedTarget(selectedId, false);
        return;
      }
      if (activeTextEdit && activeTextEdit.id !== selectedId) clearInlineTextEdit(true);
      setSelectedTarget(selectedId, true);
      return;
    }
    if (ev.data.type === 'od-edit-preview-style') {
      applyPreviewStyles(ev.data.id, ev.data.styles || {}, ev.data.version);
      return;
    }
    if (ev.data.type === 'od-edit-key') {
      debug('bridge:key-message', { key: ev.data.key, shiftKey: !!ev.data.shiftKey });
      applyInlineTextKeyboardInput({
        key: typeof ev.data.key === 'string' ? ev.data.key : '',
        shiftKey: !!ev.data.shiftKey,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        preventDefault: function(){},
        stopPropagation: function(){}
      });
      return;
    }
    if (ev.data.type === 'od-edit-text-commit-now') {
      if (activeTextEdit) postInlineTextCommit(activeTextEdit);
      return;
    }
  });
  document.addEventListener('pointerdown', handleManualEditPick, true);
  document.addEventListener('click', preventManualEditActivation, true);
  document.addEventListener('beforeinput', handleInlineTextBeforeInput, true);
  document.addEventListener('input', function(ev){
    if (restoringInlineText || !activeTextEdit || !ev.target) return;
    noteInlineTextInput(ev.target);
  }, true);
  document.addEventListener('keydown', function(ev){
    if (handleInlineTextHistoryShortcut(ev)) return;
    if (!activeTextEdit) return;
    debug('bridge:keydown', { key: ev.key, targetTag: ev.target && ev.target.tagName ? ev.target.tagName.toLowerCase() : null });
    if (applyInlineTextKeyboardInput(ev)) return;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      clearInlineTextEdit(false);
      return;
    }
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      ev.stopPropagation();
      clearInlineTextEdit(true);
    }
  }, true);
  window.addEventListener('resize', postTargets);
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(function(){
      if (!activeTextEdit || restoringInlineText) return;
      setTimeout(restoreInlineTextContent, 0);
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', postTargets);
  else setTimeout(postTargets, 0);
  document.documentElement.toggleAttribute('data-od-edit-mode', enabled);
  setOverlayNeutralized(enabled);
  debug('bridge:ready', {});
})();</script>`;
}

export function buildManualEditBridgeStyle(): string {
  return `<style data-od-edit-bridge-style>
html[data-od-edit-mode] body * { cursor: pointer !important; }
html[data-od-edit-mode] [data-od-id],
html[data-od-edit-mode] [data-od-runtime-id] { outline: 1px dashed rgba(37, 99, 235, 0.35); outline-offset: 3px; }
html[data-od-edit-mode] [data-od-id]:hover,
html[data-od-edit-mode] [data-od-runtime-id]:hover { outline: 2px solid #2563eb; }
html[data-od-edit-mode] [data-od-edit-selected] {
  outline: 2px solid #2563eb !important;
  outline-offset: 4px;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.16);
}
html[data-od-edit-mode] [data-od-editing-text] {
  cursor: text !important;
  user-select: text;
}
</style>`;
}
