export function googleAnalyticsHeadHtml(
  measurementId: string | undefined,
  pageName = 'landing_home',
): string {
  if (!measurementId) return '';
  return `<!-- Google tag (gtag.js) -->
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  var gtagScript = document.createElement('script');
  gtagScript.async = true;
  gtagScript.src = 'https://www.googletagmanager.com/gtag/js?id=${measurementId}';
  document.head.appendChild(gtagScript);
  gtag('js', new Date());

  gtag('config', ${JSON.stringify(measurementId)});

  document.addEventListener('click', function (event) {
    if (typeof gtag !== 'function') return;
    var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!link) return;

    var href = link.href;
    var label = (link.getAttribute('aria-label') || link.textContent || '').trim().replace(/\\s+/g, ' ');
    var lowerHref = href.toLowerCase();
    var lowerLabel = label.toLowerCase();
    var cta = null;
    var downloadTarget = null;

    if (lowerHref.includes('github.com/nexu-io/open-design/releases')) { cta = 'download_desktop'; downloadTarget = 'direct'; }
    else if (link.getAttribute('data-download-page') !== null || (link.pathname && /\\/download\\/?$/.test(link.pathname.toLowerCase()))) { cta = 'download_desktop'; downloadTarget = 'download_page'; }
    else if (lowerHref === 'https://github.com/nexu-io/open-design' || lowerLabel.includes('star')) cta = 'star_github';
    else if (lowerHref.includes('discord.gg/')) cta = 'join_discord';
    else if (lowerHref.includes('github.com/nexu-io/open-design/issues')) cta = 'open_issue';
    else if (link.pathname && link.pathname.startsWith('/blog/')) cta = 'blog_cta';
    else if (link.pathname && link.pathname.startsWith('/tutorials/')) cta = 'tutorial_cta';

    if (!cta) return;
    var payload = {
      cta_name: cta,
      page_name: ${JSON.stringify(pageName)},
      link_url: href,
      link_text: label.slice(0, 120),
    };
    if (downloadTarget) payload.download_target = downloadTarget;
    // Distinguish the hero / cta / nav desktop-download buttons.
    var placement = link.getAttribute('data-download-placement');
    if (placement) payload.placement = placement;
    gtag('event', 'cta_click', payload);
  });
</script>`;
}

export function injectGoogleAnalytics(html: string, measurementId: string | undefined): string {
  const headHtml = googleAnalyticsHeadHtml(measurementId);
  if (!headHtml) return html;
  if (html.includes(measurementId!)) return html;
  if (html.includes('</head>')) {
    return html.replace('</head>', `${headHtml}\n</head>`);
  }
  return `${headHtml}\n${html}`;
}
