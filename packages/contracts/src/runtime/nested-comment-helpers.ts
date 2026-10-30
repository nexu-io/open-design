/** Browser code shared by URL and inline previews. Decodes the cloud viewer's
 * od-frame-v1 anchor without granting child frames access to host messages.
 * Missing, ambiguous or inaccessible targets remain unlocated.
 */
export const NESTED_COMMENT_HELPERS = String.raw`
  var nestedCommentAnchors = new WeakMap(), nestedCommentDocuments = new WeakSet();
  function isNestedCommentAnchor(id, selector) {
    return String(id || '').indexOf('od-frame-v1:') === 0 || String(selector || '').indexOf('od-frame-v1:') === 0;
  }
  function nestedLocalNode(doc, id, selector) {
    if (typeof id !== 'string' || typeof selector !== 'string') return null;
    if (id.indexOf('cmt:') === 0 || commentSelectorClaimsIdentity(selector)) {
      var uuid = id.slice(4);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid) || id !== 'cmt:' + uuid || selector !== '[data-od-comment-id="' + uuid + '"]') return null;
    }
    var nodes = doc.querySelectorAll(selector);
    if (nodes.length !== 1) return null;
    var node = nodes[0];
    if (id.indexOf('dom:') === 0) return id.slice(4) === selector ? node : null;
    if (id.indexOf('cmt:') === 0) return node;
    return node.getAttribute('data-od-id') === id || node.getAttribute('data-screen-label') === id ? node : null;
  }
  function resolveNestedComment(id, selector) {
    try {
      if (id !== selector || typeof selector !== 'string' || selector.length > 4100 || selector.indexOf('od-frame-v1:') !== 0) return null;
      var value = JSON.parse(selector.slice(12));
      if (!Array.isArray(value) || value.length !== 3 || !Array.isArray(value[0]) || !value[0].length || value[0].length > 8) return null;
      var doc = document, frames = [];
      for (var part of value[0]) {
        if (!Array.isArray(part) || part.length !== 3 || part.some(function(v) { return typeof v !== 'string'; })) return null;
        var f = nestedLocalNode(doc, part[0], part[1]);
        // The legacy third field is retained in stored anchors, but no longer gates location.
        if (!f || f.localName !== 'iframe' || !f.contentDocument) return null;
        frames.push(f); doc = f.contentDocument;
        if (!nestedCommentDocuments.has(doc) && typeof schedulePostActiveCommentTarget === 'function') {
          nestedCommentDocuments.add(doc);
          doc.addEventListener('scroll', schedulePostActiveCommentTarget, true);
          doc.defaultView.addEventListener('resize', schedulePostActiveCommentTarget);
        }
      }
      var node = nestedLocalNode(doc, value[1], value[2]);
      if (node) nestedCommentAnchors.set(node, { id: id, selector: selector, frames: frames });
      return node;
    } catch (_) { return null; }
  }
  function nestedCommentPayload(node, unclipped) {
    var anchor = node && nestedCommentAnchors.get(node);
    if (!anchor) return null;
    try {
      if (!node.isConnected || resolveNestedComment(anchor.id, anchor.selector) !== node) return null;
      var r = node.getBoundingClientRect(), x = r.left, y = r.top, width = r.width, height = r.height;
      if (!(width > 0 && height > 0)) return null;
      for (var i = anchor.frames.length - 1; i >= 0; i--) {
        var f = anchor.frames[i];
        // Paint only the part visible through this child viewport before
        // projecting it into the parent. The persisted wire anchor is unchanged.
        var view = f.contentDocument && f.contentDocument.defaultView;
        if (!view) return null;
        if (!unclipped) {
        var right = Math.min(view.innerWidth, x + width), bottom = Math.min(view.innerHeight, y + height);
        x = Math.max(0, x); y = Math.max(0, y);
        width = right - x; height = bottom - y;
        if (!(width > 0 && height > 0)) return null;
        }
        for (var n = f; n; n = n.parentElement) {
          var transform = n.ownerDocument.defaultView.getComputedStyle(n).transform;
          if (transform && transform !== 'none') {
            var m = new DOMMatrixReadOnly(transform);
            if (!m.is2D || m.a <= 0 || m.d <= 0 || Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6) return null;
          }
        }
        var b = f.getBoundingClientRect();
        if (!f.offsetWidth || !f.offsetHeight || !b.width || !b.height) return null;
        var sx = b.width / f.offsetWidth, sy = b.height / f.offsetHeight;
        x = b.left + (f.clientLeft + x) * sx; y = b.top + (f.clientTop + y) * sy; width *= sx; height *= sy;
      }
      if (![x, y, width, height].every(Number.isFinite)) return null;
      return { type: 'od:comment-target', elementId: anchor.id, selector: anchor.selector,
        label: node.localName, text: (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
        position: { x: x, y: y, width: width, height: height }, htmlHint: '<' + node.localName + '>', style: null };
    } catch (_) { return null; }
  }
  function scrollNestedComment(node) {
    var anchor = node && nestedCommentAnchors.get(node);
    if (!anchor) return;
    for (var i = anchor.frames.length - 1; i >= 0; i--) anchor.frames[i].scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  }
`;
