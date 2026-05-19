// Use Open Design Everywhere — modal entry that documents Open Design's
// non-UI surfaces (CLI, MCP, HTTP, Skills) and ships a one-click "copy
// guide for an agent" payload. Reachable from the entry top-bar and
// from Settings → Integrations as a sibling of the existing MCP install
// snippets.
//
// The technical content lives in ./use-everywhere/sections.ts and the
// agent-handoff markdown blob in ./use-everywhere/agent-guide.ts so the
// modal only owns rendering + clipboard interactions.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import {
  buildAgentGuideMarkdown,
  type AgentGuideOptions,
} from './use-everywhere/agent-guide';
import {
  GUIDE_SECTIONS,
  type CodeSnippet,
  type GuideSection,
} from './use-everywhere/sections';

interface Props {
  onClose: () => void;
  /** Deep-link to Settings → Integrations (existing MCP install snippets). */
  onOpenSettings?: () => void;
  /** Live daemon URL when known (e.g. http://127.0.0.1:7456). */
  daemonUrl?: string;
  /** Optional Open Design version string surfaced in the agent guide header. */
  versionHint?: string;
}

type CopyState = 'idle' | 'copied' | 'failed';

const COPY_RESET_MS = 1600;

export function UseEverywhereModal({
  onClose,
  onOpenSettings,
  daemonUrl,
  versionHint,
}: Props) {
  const t = useT();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div
      className="use-everywhere-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t('useEverywhere.modalAria')}
      data-testid="use-everywhere-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="use-everywhere-modal">
        <header className="use-everywhere-modal__head">
          <div className="use-everywhere-modal__head-titles">
            <span className="use-everywhere-modal__kicker">{t('integrations.kicker')}</span>
            <h2 className="use-everywhere-modal__title">
              {t('useEverywhere.modalTitle')}
            </h2>
            <p className="use-everywhere-modal__subtitle">
              {t('useEverywhere.modalSubtitle')}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="use-everywhere-modal__close"
            onClick={onClose}
            aria-label={t('useEverywhere.closeAria')}
            title={t('useEverywhere.closeTitle')}
          >
            <Icon name="close" size={14} />
          </button>
        </header>

        <UseEverywhereGuidePanel
          onOpenSettings={onOpenSettings}
          daemonUrl={daemonUrl}
          versionHint={versionHint}
        />
      </div>
    </div>
  );
}

export function UseEverywhereGuidePanel({
  onOpenSettings,
  daemonUrl,
  versionHint,
}: Omit<Props, 'onClose'>) {
  const t = useT();
  const [activeId, setActiveId] = useState<GuideSection['id']>('overview');
  const [guideCopy, setGuideCopy] = useState<CopyState>('idle');
  const [snippetCopy, setSnippetCopy] = useState<{ key: string; state: CopyState } | null>(null);
  const guideSections = useMemo(() => localizeGuideSections(t), [t]);

  const guideOptions: AgentGuideOptions = useMemo(() => {
    const opts: AgentGuideOptions = {};
    if (daemonUrl) opts.daemonUrl = daemonUrl;
    if (versionHint) opts.versionHint = versionHint;
    return opts;
  }, [daemonUrl, versionHint]);

  const fullGuide = useMemo(
    () => buildAgentGuideMarkdown(guideOptions),
    [guideOptions],
  );

  // GUIDE_SECTIONS is non-empty by construction (`sections.ts` ships the
  // five tab definitions) but TS narrows `GUIDE_SECTIONS[0]` to a
  // possibly-undefined value under strict index access. Resolve the
  // active section through an explicit lookup that never returns
  // `undefined` so callsites can assume a present section.
  const activeSection = useMemo<GuideSection>(() => {
    const found = guideSections.find((s) => s.id === activeId);
    if (found) return found;
    const first = guideSections[0];
    if (!first) {
      throw new Error('GUIDE_SECTIONS must define at least one section');
    }
    return first;
  }, [activeId, guideSections]);

  async function onCopyGuide() {
    const state = await copyText(fullGuide);
    setGuideCopy(state);
    if (state !== 'idle') {
      window.setTimeout(() => setGuideCopy('idle'), COPY_RESET_MS);
    }
  }

  async function onCopySnippet(key: string, snippet: CodeSnippet) {
    const text = applyDaemonUrl(snippet.body, daemonUrl);
    const state = await copyText(text);
    setSnippetCopy({ key, state });
    if (state !== 'idle') {
      window.setTimeout(() => setSnippetCopy(null), COPY_RESET_MS);
    }
  }

  return (
    <>
      <nav className="use-everywhere-modal__tabs" role="tablist" aria-label={t('useEverywhere.tabsAria')}>
        {guideSections.map((section) => {
          const active = section.id === activeId;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`use-everywhere-modal__tab${active ? ' is-active' : ''}`}
              onClick={() => setActiveId(section.id)}
              data-testid={`use-everywhere-tab-${section.id}`}
            >
              {section.tabLabel}
            </button>
          );
        })}
      </nav>

      <div className="use-everywhere-modal__body">
        <SectionView
          section={activeSection}
          daemonUrl={daemonUrl}
          snippetCopy={snippetCopy}
          onCopySnippet={onCopySnippet}
        />
      </div>

      <footer className="use-everywhere-modal__foot">
        <div className="use-everywhere-modal__foot-info">
          <strong>{t('useEverywhere.footStrong')}</strong>{' '}
          <span>
            {t('useEverywhere.footBody')}
          </span>
        </div>
        <div className="use-everywhere-modal__foot-actions">
          {onOpenSettings ? (
            <button
              type="button"
              className="use-everywhere-modal__secondary"
              onClick={onOpenSettings}
              data-testid="use-everywhere-open-settings"
            >
              <Icon name="settings" size={13} />
              {t('useEverywhere.configureMcp')}
            </button>
          ) : null}
          <button
            type="button"
            className="use-everywhere-modal__primary"
            onClick={onCopyGuide}
            data-testid="use-everywhere-copy-guide"
          >
            <Icon name="copy" size={13} />
            {copyLabel(guideCopy, t('useEverywhere.copyGuide'), t)}
          </button>
        </div>
      </footer>
    </>
  );
}

async function copyText(text: string): Promise<CopyState> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return 'failed';
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

interface SectionViewProps {
  section: GuideSection;
  daemonUrl: string | undefined;
  snippetCopy: { key: string; state: CopyState } | null;
  onCopySnippet: (key: string, snippet: CodeSnippet) => void;
}

function SectionView({
  section,
  daemonUrl,
  snippetCopy,
  onCopySnippet,
}: SectionViewProps) {
  const t = useT();
  return (
    <section
      className="use-everywhere-section"
      data-testid={`use-everywhere-section-${section.id}`}
    >
      <header className="use-everywhere-section__head">
        <h3 className="use-everywhere-section__heading">
          {applyDaemonUrl(section.heading, daemonUrl)}
        </h3>
        <p className="use-everywhere-section__intro">
          {applyDaemonUrl(section.intro, daemonUrl)}
        </p>
      </header>

      {section.bullets.length > 0 ? (
        <ul className="use-everywhere-section__bullets">
          {section.bullets.map((bullet) => (
            <li key={bullet}>{applyDaemonUrl(bullet, daemonUrl)}</li>
          ))}
        </ul>
      ) : null}

      <div className="use-everywhere-section__snippets">
        {section.snippets.map((snippet, idx) => {
          const key = `${section.id}-${idx}`;
          const isThis = snippetCopy?.key === key;
          const state: CopyState = isThis ? snippetCopy.state : 'idle';
          return (
            <div key={key} className="use-everywhere-snippet">
              <div className="use-everywhere-snippet__head">
                <span className="use-everywhere-snippet__label">
                  {snippet.label}
                </span>
                <button
                  type="button"
                  className="use-everywhere-snippet__copy"
                  onClick={() => onCopySnippet(key, snippet)}
                  aria-label={t('useEverywhere.copySnippetAria', { label: snippet.label })}
                >
                  <Icon name="copy" size={11} />
                  {copyLabel(state, t('useEverywhere.copy'), t)}
                </button>
              </div>
              <pre
                className="use-everywhere-snippet__pre"
                data-language={snippet.language}
              >
                <code>{applyDaemonUrl(snippet.body, daemonUrl)}</code>
              </pre>
            </div>
          );
        })}
      </div>

      {section.footer ? (
        <p className="use-everywhere-section__footer">
          {applyDaemonUrl(section.footer, daemonUrl)}
        </p>
      ) : null}
    </section>
  );
}

function copyLabel(state: CopyState, idle: string, t: (key: keyof Dict) => string): string {
  if (state === 'copied') return t('useEverywhere.copied');
  if (state === 'failed') return t('useEverywhere.copyFailed');
  return idle;
}

function localizeGuideSections(t: (key: keyof Dict) => string): GuideSection[] {
  return GUIDE_SECTIONS.map((section) => ({
    ...section,
    tabLabel: t(`useEverywhere.section.${section.id}.tab` as keyof Dict),
    heading: t(`useEverywhere.section.${section.id}.heading` as keyof Dict),
    intro: t(`useEverywhere.section.${section.id}.intro` as keyof Dict),
    bullets: section.bullets.map((_, idx) => (
      t(`useEverywhere.section.${section.id}.bullet${idx + 1}` as keyof Dict)
    )),
    snippets: section.snippets.map((snippet, idx) => ({
      ...snippet,
      label: t(`useEverywhere.section.${section.id}.snippet${idx + 1}` as keyof Dict),
    })),
    footer: section.footer
      ? t(`useEverywhere.section.${section.id}.footer` as keyof Dict)
      : undefined,
  }));
}

function applyDaemonUrl(body: string, daemonUrl: string | undefined): string {
  if (!daemonUrl) return body;
  const cleaned = daemonUrl.replace(/\/$/, '');
  return body.replace(/http:\/\/127\.0\.0\.1:7456/g, cleaned);
}
