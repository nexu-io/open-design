import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { I18nProvider } from '../src/i18n';
import { AnalyticsProvider } from '../src/analytics/provider';
import '@excalidraw/excalidraw/index.css';
import '../src/index.css';
import '../src/styles/home/index.css';
// These hosts render from the client-only App entry. Keep their layout CSS in
// the root route stylesheet so Turbopack does not leave the lazy chunk as a
// preload-only resource after the host mounts.
import '../src/components/TestCampaignModal.module.css';
import '../src/components/HoverTouchpointOverlay.module.css';
import '../src/components/ProductionCampaignBadge.module.css';
import '../src/components/OnboardingWelcome.module.css';

export const metadata: Metadata = {
  title: 'OpenDesign',
  icons: {
    icon: '/app-icon.png',
    apple: '/app-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f7f7' },
    { media: '(prefers-color-scheme: dark)', color: '#202020' },
  ],
};

/**
 * Inline script that runs before React hydrates so the first paint already
 * carries the app's appearance — no flash of unstyled content.
 *
 * The persisted `theme` preference (`'light'` / `'dark'` / `'system'`) is
 * resolved here and stamped on `<html data-theme>` before the first frame, so
 * a dark user never sees a light flash. A `system` theme resolves against the
 * OS immediately — React only re-stamps after hydration. The attribute is
 * always stamped (light on any storage failure): every JS theme reader
 * (`shiki`, `ConnectorLogo`, …) checks `data-theme` first and only falls back
 * to `prefers-color-scheme` when it is absent, so an unstamped root would let
 * a dark OS leak through before hydration. Keep the accent variable mix
 * ratios in sync with `accentVars()` in `src/state/appearance.ts`; this
 * script cannot import application modules.
 */
const themeInitScript = `(function(){try{var c=JSON.parse(localStorage.getItem('open-design:config')||'{}');var s=typeof c.theme==='string'?c.theme:'light';var t=s==='dark'?'dark':s==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',t);var a=typeof c.accentColor==='string'&&/^#[0-9a-fA-F]{6}$/.test(c.accentColor.trim())?c.accentColor.trim().toLowerCase():'#353535';if(c.configMigrationVersion!==3&&(a==='#87ea5c'||a==='#c96442'))a='#353535';var st=document.documentElement.style;st.setProperty('--accent',a);st.setProperty('--accent-strong','color-mix(in srgb, '+a+' 82%, var(--text-strong))');st.setProperty('--accent-soft','color-mix(in srgb, '+a+' 12%, var(--bg-subtle))');st.setProperty('--accent-tint','color-mix(in srgb, '+a+' 6%, var(--bg-panel))');st.setProperty('--accent-hover','color-mix(in srgb, '+a+' 86%, var(--text-strong))');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

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
