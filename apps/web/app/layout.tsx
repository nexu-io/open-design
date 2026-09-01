import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { I18nProvider } from '../src/i18n';
import { AnalyticsProvider } from '../src/analytics/provider';
import '@excalidraw/excalidraw/index.css';
import '../src/index.css';
import '../src/styles/home/index.css';

export const metadata: Metadata = {
  title: 'LeastGen Studio',
  icons: {
    icon: '/app-icon.png',
    apple: '/app-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0B0E14',
};

/**
 * Inline script that runs before React hydrates so the first paint already
 * carries the app's appearance — no flash of unstyled content.
 *
 * `data-theme` is pinned to `dark` unconditionally, and deliberately OUTSIDE
 * the try/catch: LeastGen Studio ships dark-only (the workspace is themed
 * dark-first), and a stored `light` / `system` from the old picker must never
 * reach the document. The light token block in `tokens.css` is legacy fallback
 * only. Stamping the attribute unconditionally is what keeps a light OS from
 * leaking through.
 *
 * The accent allowlist below MUST stay in sync with `ACCENT_SWATCHES` in
 * `src/state/appearance.ts`: any persisted accent outside the LeastGen set
 * (old LeastGen Studio greens and neutrals) resolves back to the brand cyan. Keep
 * the accent variable mix ratios in sync with `accentVars()` in
 * `src/state/appearance.ts`; this script cannot import application modules.
 */
const themeInitScript = `(function(){document.documentElement.setAttribute('data-theme','dark');try{var c=JSON.parse(localStorage.getItem('open-design:config')||'{}');var a=typeof c.accentColor==='string'&&/^#[0-9a-fA-F]{6}$/.test(c.accentColor.trim())?c.accentColor.trim().toLowerCase():'#22d3ee';var ok=['#22d3ee','#67e8f9','#1f9cb0','#d8ffff','#8b5cf6','#a3b5c0','#f4fafc','#04211b'];if(ok.indexOf(a)<0)a='#22d3ee';var s=document.documentElement.style;s.setProperty('--accent',a);s.setProperty('--accent-strong','color-mix(in srgb, '+a+' 82%, var(--text-strong))');s.setProperty('--accent-soft','color-mix(in srgb, '+a+' 14%, var(--bg-subtle))');s.setProperty('--accent-tint','color-mix(in srgb, '+a+' 7%, var(--bg-panel))');s.setProperty('--accent-hover','color-mix(in srgb, '+a+' 86%, var(--text-strong))');}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang='en' suppressHydrationWarning>
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: intentional theme-init inline script to prevent FOUC */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body suppressHydrationWarning>
        <I18nProvider>
          <AnalyticsProvider>{children}</AnalyticsProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
