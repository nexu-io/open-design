// Share affordance for the plugin detail modal.
//
// Surfaces the small set of actions a user actually wants when
// they want to spread / install / link to a plugin they like:
//
//   - Copy plugin id          (raw `<id>` for paste-into-yaml)
//   - Copy install command    (`od plugin install <ref>`)
//   - Copy share link         (link to the marketplace detail page)
//   - Copy markdown badge     (Open Design powered, includes link)
//   - Open source on GitHub   (when the source is a github repo)
//   - Open homepage           (when manifest.homepage is set)
//   - Open in marketplace     (always — the canonical detail page)
//
// We render the popover next to the close button in every detail
// variant header so the affordance reads consistently no matter
// which preview surface is active. A tiny inline toast confirms
// every copy action so the user trusts the click landed.

import { useEffect, useRef, useState } from 'react';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { Icon } from '../Icon';
import { derivePluginSourceLinks } from '../../runtime/plugin-source';

interface Props {
  record: InstalledPluginRecord;
  /**
   * Render variant: `default` is the standalone button used by the
   * media detail header. `inline` drops the trigger as a ghost
   * button that sits inside the PreviewModal's `headerExtras`
   * slot — same popover, no extra padding.
   */
  variant?: 'default' | 'inline';
}

interface ShareItem {
  key: string;
  label: string;
  icon:
    | 'copy'
    | 'link'
    | 'github'
    | 'external-link'
    | 'eye';
  onSelect: () => void | Promise<void>;
  /**
   * When true, the item triggers a `copy` action — we show a brief
   * "Copied" confirmation in the popover after it runs.
   */
  copies?: boolean;
}

interface ShareLinkItem {
  key: string;
  label: string;
  icon: 'github' | 'external-link' | 'eye';
  href: string;
}

function buildInstallCommand(record: InstalledPluginRecord): string {
  // The daemon's install resolver accepts the raw `record.source`
  // shape for every kind (github:owner/repo[@ref][/sub], https URL,
  // local path, marketplace id), so we mirror it verbatim. For
  // marketplace records should use the registry entry name when
  // provenance preserved it; sourceMarketplaceId names the catalog,
  // not the plugin package.
  if (typeof record.sourceMarketplaceEntryName === 'string') {
    return `od plugin install ${record.sourceMarketplaceEntryName}`;
  }
  if (record.sourceKind === 'marketplace' && typeof record.sourceMarketplaceId === 'string') {
    return `od plugin install ${record.sourceMarketplaceId}`;
  }
  return `od plugin install ${record.source}`;
}

function buildShareUrl(record: InstalledPluginRecord): string {
  // Browser-side the marketplace detail page is always at
  // /marketplace/<id>. We use window.location.origin so the
  // copied link is a fully qualified URL the recipient can open
  // in a different session / tab without context.
  if (typeof window === 'undefined') {
    return `/marketplace/${encodeURIComponent(record.id)}`;
  }
  return `${window.location.origin}/marketplace/${encodeURIComponent(record.id)}`;
}

function buildMarkdownBadge(record: InstalledPluginRecord): string {
  const url = buildShareUrl(record);
  return `[![${record.title} — Open Design plugin](https://img.shields.io/badge/Open%20Design-${encodeURIComponent(record.title)}-d65a31?logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2C)](${url})`;
}

export function PluginShareMenu({ record, variant = 'default' }: Props) {
  const [open, setOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const links = derivePluginSourceLinks(record);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function copyToClipboard(text: string, key: string) {
    if (!text) return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((current) => (current === key ? null : current));
      }, 1400);
    });
  }

  const items: ShareItem[] = [
    {
      key: 'install',
      label: 'Copy install command',
      icon: 'copy',
      copies: true,
      onSelect: () => copyToClipboard(buildInstallCommand(record), 'install'),
    },
    {
      key: 'id',
      label: 'Copy plugin ID',
      icon: 'copy',
      copies: true,
      onSelect: () => copyToClipboard(record.id, 'id'),
    },
    {
      key: 'link',
      label: 'Copy share link',
      icon: 'link',
      copies: true,
      onSelect: () => copyToClipboard(buildShareUrl(record), 'link'),
    },
    {
      key: 'badge',
      label: 'Copy markdown badge',
      icon: 'copy',
      copies: true,
      onSelect: () => copyToClipboard(buildMarkdownBadge(record), 'badge'),
    },
  ];

  // Open-in-tab actions are real anchors so users can right-click,
  // copy the link address, or open in a new tab from browser chrome.
  const openItems: ShareLinkItem[] = [];
  if (links.sourceUrl) {
    openItems.push({
      key: 'source',
      label:
        record.sourceKind === 'github' || links.sourceUrl.includes('github.com/')
          ? 'Open source on GitHub'
          : 'Open source',
      icon: links.sourceUrl.includes('github.com/') ? 'github' : 'external-link',
      href: links.sourceUrl,
    });
  }
  if (links.homepageUrl) {
    openItems.push({
      key: 'homepage',
      label: 'Open homepage',
      icon: 'external-link',
      href: links.homepageUrl,
    });
  }
  openItems.push({
    key: 'marketplace',
    label: 'Open in marketplace',
    icon: 'eye',
    href: buildShareUrl(record),
  });

  const triggerClass =
    variant === 'inline'
      ? 'ghost plugin-share-trigger'
      : 'plugin-share-trigger plugin-share-trigger--solo';

  return (
    <div
      className="plugin-share-menu"
      ref={wrapRef}
      data-testid={`plugin-share-${record.id}`}
    >
      <button
        type="button"
        className={triggerClass}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Share plugin"
      >
        <Icon name="share" size={12} />
        <span>Share</span>
      </button>
      {open ? (
        <div className="plugin-share-popover" role="menu">
          <div className="plugin-share-popover__group">
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className="plugin-share-item"
                onClick={() => void item.onSelect()}
              >
                <Icon
                  name={copiedKey === item.key ? 'check' : item.icon}
                  size={12}
                />
                <span>
                  {copiedKey === item.key ? 'Copied' : item.label}
                </span>
              </button>
            ))}
          </div>
          <div className="plugin-share-popover__divider" />
          <div className="plugin-share-popover__group">
            {openItems.map((item) => (
              <a
                key={item.key}
                role="menuitem"
                className="plugin-share-item"
                href={item.href}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
              >
                <Icon name={item.icon} size={12} />
                <span>{item.label}</span>
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
