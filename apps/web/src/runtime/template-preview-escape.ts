import { endOfTag, findRealTagOffset, prependAfterDoctype } from '@open-design/contracts/runtime/html-injection-points';

export function buildTemplatePreviewEscapeBridge(): string {
  return `<script data-od-template-preview-escape>
(function(){
  document.addEventListener('keydown', function(event){
    if (event.key !== 'Escape' || window.parent === window) return;
    event.preventDefault();
    event.stopPropagation();
    window.parent.postMessage({ type: 'od:template-preview-escape' }, '*');
  }, true);
})();
</script>`;
}

export function injectTemplatePreviewEscapeBridge(html: string): string {
  const script = buildTemplatePreviewEscapeBridge();
  const head = findRealTagOffset(html, /<head(?=[\t\n\f\r />])/i);
  const end = head >= 0 ? endOfTag(html, head) : -1;
  return end >= 0
    ? html.slice(0, end + 1) + script + html.slice(end + 1)
    : prependAfterDoctype(html, script);
}
