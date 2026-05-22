export const GA_MEASUREMENT_ID = 'G-N567SYTTWR';

export const GOOGLE_ANALYTICS_HEAD_HTML = `<!-- Google tag (gtag.js) -->
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  var gtagScript = document.createElement('script');
  gtagScript.async = true;
  gtagScript.src = 'https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}';
  document.head.appendChild(gtagScript);
  gtag('js', new Date());

  gtag('config', '${GA_MEASUREMENT_ID}');
</script>`;

export function injectGoogleAnalytics(html: string): string {
  if (html.includes(GA_MEASUREMENT_ID)) return html;
  if (html.includes('</head>')) {
    return html.replace('</head>', `${GOOGLE_ANALYTICS_HEAD_HTML}\n</head>`);
  }
  return `${GOOGLE_ANALYTICS_HEAD_HTML}\n${html}`;
}
