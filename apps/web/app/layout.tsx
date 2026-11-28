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
  themeColor: '#f7f7f7',
};

/**
 * Inline script that runs before React hydrates so the first paint already
 * carries the app's appearance — no flash of unstyled content.
 *
 * Theme resolution mirrors `applyAppearanceToDocument` in
 * `src/state/appearance.ts`: `light`/`dark` stamp the attribute, `system`
 * (the default) REMOVES it — absence is the CSS contract for following the
 * OS (`@media (prefers-color-scheme: dark) html:not([data-theme])` in
 * tokens.css). A storage read that throws pins the known-good light theme so
 * a broken localStorage can never blank the page.
 * A CUSTOM accent (any validated value other than the #353535 default) is
 * stamped inline with the same color-mix ratios as `accentVars()` in
 * `src/state/appearance.ts`; the DEFAULT accent stays unstamped so
 * tokens.css owns all five accent values per theme (the light default
 * stamped inline would override the dark palette's #ededed accent).
 * This script cannot import application modules.
 */
const themeInitScript = `(function(){try{var c=JSON.parse(localStorage.getItem('open-design:config')||'{}');var t=c.theme;t=(t==='dark'||t==='light'||t==='system')?t:'system';var r=document.documentElement;if(t==='dark')r.setAttribute('data-theme','dark');else if(t==='light')r.setAttribute('data-theme','light');else r.removeAttribute('data-theme');var dk=t==='dark'||(t==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',dk?'#202020':'#f7f7f7');var a=typeof c.accentColor==='string'&&/^#[0-9a-fA-F]{6}$/.test(c.accentColor.trim())?c.accentColor.trim().toLowerCase():'#353535';if(c.configMigrationVersion!==3&&(a==='#87ea5c'||a==='#c96442'))a='#353535';if(a!=='#353535'){var s=document.documentElement.style;s.setProperty('--accent',a);s.setProperty('--accent-strong','color-mix(in srgb, '+a+' 82%, var(--text-strong))');s.setProperty('--accent-soft','color-mix(in srgb, '+a+' 12%, var(--bg-subtle))');s.setProperty('--accent-tint','color-mix(in srgb, '+a+' 6%, var(--bg-panel))');s.setProperty('--accent-hover','color-mix(in srgb, '+a+' 86%, var(--text-strong))');}}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

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
