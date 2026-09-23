/** Shared by the full editor bridge and the portable comment bridge. */
export const ANNOTATED_SELECTOR_HELPERS = String.raw`
  function annotatedElementIdFor(el){
    var odId = el.getAttribute('data-od-id');
    if (odId) return odId;
    var label = el.getAttribute('data-screen-label');
    return label || null;
  }
  function annotatedSelectorFor(el, esc){
    var odId = el.getAttribute('data-od-id');
    if (odId) return '[data-od-id="' + esc(odId) + '"]';
    var label = el.getAttribute('data-screen-label');
    if (label) return '[data-screen-label="' + esc(label) + '"]';
    return null;
  }
`;
