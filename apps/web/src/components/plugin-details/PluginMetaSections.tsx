// Plugin metadata sections — the manifest-driven inspector body that
// every detail variant (scenario / media / html / design-system)
// renders alongside its kind-specific hero.
//
// Surfaces every plugin-common field a user might want to inspect
// before applying:
//
//   - About            (description; optional, parents hide when
//                       the header / subtitle already shows it)
//   - Example query    (the prompt body; optional, hidden by media
//                       variants that already render it inline)
//   - Inputs           (declared variables + types + defaults)
//   - Context bundles  (skills, design system, craft, atoms, MCP,
//                       claude plugins)
//   - Workflow         (pipeline stages + atoms)
//   - GenUI surfaces   (interactive prompts the plugin may surface)
//   - Connectors       (required + optional)
//   - Capabilities     (granted permissions)
//   - Source           (origin, fs path, ref, marketplace id,
//                       installed timestamp, contribute link)
//
// Variants that already show a field through their hero/header pass
// it through `omit` so the body never duplicates information the
// user is already looking at.

import { useMemo, useState, type ReactNode } from 'react';
import type {
  InputField,
  InstalledPluginRecord,
  McpServerSpec,
  PluginConnectorRef,
  PluginManifest,
} from '@open-design/contracts';
import { Icon } from '../Icon';
import { TrustBadge } from '../TrustBadge';
import { authorInitials, derivePluginSourceLinks } from '../../runtime/plugin-source';
import { resolvePluginQueryFallback } from '../../state/projects';
import { useI18n } from '../../i18n';
import {
  localizePluginChrome,
  localizePluginDisplayValue,
  localizePluginInputLabel,
  localizePluginPlaceholder,
} from '../../i18n/plugin-content';
import { localizePluginDescription } from '../plugins-home/localization';

export interface PluginMetaOmit {
  description?: boolean;
  query?: boolean;
  inputs?: boolean;
  byline?: boolean;
}

interface ContextRef {
  ref?: string;
  path?: string;
  primary?: boolean;
}

interface Props {
  record: InstalledPluginRecord;
  /** Sections the parent already renders inline. */
  omit?: PluginMetaOmit;
  /**
   * Tighten the visual rhythm for narrow contexts (PreviewModal
   * sidebar). Defaults to false (used by the full-bleed scenario
   * modal); pass true when rendering inside a ~360–540px column.
   */
  compact?: boolean;
  /**
   * Optional top-level heading rendered above the section list so
   * variants whose hero already owns the modal title can still
   * advertise the manifest block as "Plugin info" / "About this
   * plugin". Pass `null` (default) when the section IS the body and
   * a label would be redundant (scenario fallback).
   */
  heading?: string;
  /**
   * 'minimal' keeps the designer-relevant blocks (author, example
   * query) inline and tucks the developer-oriented manifest detail
   * (inputs, context bundles, workflow, GenUI, connectors,
   * capabilities, source) behind a collapsed "Developer details"
   * disclosure. Defaults to 'full' so the scenario / media / design
   * variants keep their existing flat inspector.
   */
  variant?: 'full' | 'minimal';
}

export function PluginMetaSections({ record, omit, compact, heading, variant = 'full' }: Props) {
  const { locale } = useI18n();
  const [copied, setCopied] = useState(false);

  const manifest: PluginManifest = record.manifest ?? ({} as PluginManifest);
  const specVersion = typeof manifest.specVersion === 'string' ? manifest.specVersion : '';
  const od = manifest.od ?? {};
  const description = localizePluginDescription(locale, record);
  const query = resolvePluginQueryFallback(od.useCase?.query);
  const inputs = (od.inputs ?? []) as InputField[];
  const ctx = od.context ?? {};
  const stages = od.pipeline?.stages ?? [];
  const surfaces = od.genui?.surfaces ?? [];
  const required = (od.connectors?.required ?? []) as PluginConnectorRef[];
  const optional = (od.connectors?.optional ?? []) as PluginConnectorRef[];
  const capabilities = od.capabilities ?? [];

  const hasContext = useMemo(() => {
    if (!ctx) return false;
    return Boolean(
      (ctx.skills && ctx.skills.length > 0) ||
        ctx.designSystem ||
        (ctx.craft && ctx.craft.length > 0) ||
        (ctx.assets && ctx.assets.length > 0) ||
        (ctx.mcp && ctx.mcp.length > 0) ||
        (ctx.atoms && ctx.atoms.length > 0) ||
        (ctx.claudePlugins && ctx.claudePlugins.length > 0),
    );
  }, [ctx]);

  function copyQuery() {
    if (!query) return;
    void navigator.clipboard.writeText(query).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }

  function refLabel(r: ContextRef): string {
    return r.ref ?? r.path ?? '';
  }

  function formattedInstalledAt(): string {
    try {
      return new Date(record.installedAt).toLocaleString(locale);
    } catch {
      return String(record.installedAt);
    }
  }

  function label(key: Parameters<typeof localizePluginChrome>[1], vars?: Record<string, string | number>): string {
    return localizePluginChrome(locale, key, vars);
  }

  const installedLabel = formattedInstalledAt();
  const links = useMemo(() => derivePluginSourceLinks(record), [record]);
  const hasAuthorBlock = Boolean(
    links.authorName || links.authorProfileUrl || links.homepageUrl,
  );

  const showDescription = !omit?.description && Boolean(description);
  const showQuery = !omit?.query && Boolean(query);
  const showInputs = !omit?.inputs && inputs.length > 0;

  const wrapperClass = `plugin-meta-sections${compact ? ' is-compact' : ''}`;

  return (
    <div className={wrapperClass} data-testid="plugin-meta-sections">
      {heading ? (
        <header className="plugin-meta-sections__heading">
          <h3>{heading}</h3>
          <span className="plugin-meta-sections__heading-meta">
            <span>v{record.version}</span>
            <span>·</span>
            <TrustBadge trust={record.trust} />
            {record.sourceKind ? (
              <>
                <span>·</span>
                <span>{record.sourceKind}</span>
              </>
            ) : null}
          </span>
        </header>
      ) : null}
      {!omit?.byline && hasAuthorBlock ? (
        <Section title={label('author')}>
          <div
            className="plugin-details-modal__byline"
            data-testid="plugin-details-author"
          >
            <AuthorAvatar
              name={links.authorName}
              avatarUrl={links.authorAvatarUrl}
            />
            <div className="plugin-details-modal__byline-meta">
              {links.authorName ? (
                <div className="plugin-details-modal__byline-name">
                  <span className="plugin-details-modal__byline-prefix">
                    {label('by')}
                  </span>
                  <span className="plugin-details-modal__author-name">
                    {links.authorName}
                  </span>
                </div>
              ) : null}
              <div className="plugin-details-modal__byline-links">
                {links.authorProfileUrl ? (
                  <ExternalLink
                    href={links.authorProfileUrl}
                    icon="github"
                    testId="plugin-details-author-profile"
                  >
                    {githubProfileLabel(links.authorProfileUrl)}
                  </ExternalLink>
                ) : null}
                {links.homepageUrl ? (
                  <ExternalLink
                    href={links.homepageUrl}
                    icon="external-link"
                    testId="plugin-details-author-homepage"
                  >
                    {label('homepage')}
                  </ExternalLink>
                ) : null}
              </div>
            </div>
          </div>
        </Section>
      ) : null}

      {showDescription ? (
        <Section title={label('about')}>
          <p className="plugin-details-modal__description">{description}</p>
        </Section>
      ) : null}

      {showQuery ? (
        <Section
          title={label('exampleQuery')}
          hint={label('exampleQueryHint')}
          action={
            <button
              type="button"
              className="plugin-details-modal__chip-btn"
              onClick={copyQuery}
            >
              <Icon name="copy" size={12} />
              {copied ? label('copied') : label('copy')}
            </button>
          }
        >
          <pre className="plugin-details-modal__query">{query}</pre>
        </Section>
      ) : null}

      {((advanced) =>
        variant === 'minimal' ? (
          <details
            className="plugin-meta-sections__advanced"
            data-testid="plugin-meta-advanced"
          >
            <summary className="plugin-meta-sections__advanced-summary">
              {label('developerDetails')}
            </summary>
            {advanced}
          </details>
        ) : (
          advanced
        ))(
        <>
      {showInputs ? (
        <Section
          title={label('inputs')}
          count={inputs.length}
          hint={label('inputsHint')}
        >
          <ul className="plugin-details-modal__inputs">
            {inputs.map((field) => (
              <li key={field.name} className="plugin-details-modal__input">
                <div className="plugin-details-modal__input-head">
                  <code>{field.name}</code>
                  {field.required ? (
                    <span className="plugin-details-modal__badge is-required">
                      {label('required')}
                    </span>
                  ) : null}
                  {field.type ? (
                    <span className="plugin-details-modal__badge is-type">
                      {field.type}
                    </span>
                  ) : null}
                </div>
                {field.label ? (
                  <div className="plugin-details-modal__muted">
                    {localizePluginInputLabel(locale, field)}
                  </div>
                ) : null}
                {field.placeholder ? (
                  <div className="plugin-details-modal__muted plugin-details-modal__small">
                    {label('examplePrefix')}{' '}
                    {localizePluginPlaceholder(locale, field.placeholder)}
                  </div>
                ) : null}
                {field.options && field.options.length > 0 ? (
                  <div className="plugin-details-modal__chips plugin-details-modal__chips--inline">
                    {field.options.map((opt) => (
                      <span key={opt} className="plugin-details-modal__chip">
                        {localizePluginDisplayValue(locale, opt)}
                      </span>
                    ))}
                  </div>
                ) : null}
                {field.default !== undefined &&
                field.default !== null &&
                String(field.default).length > 0 ? (
                  <div className="plugin-details-modal__muted plugin-details-modal__small">
                    {label('defaultPrefix')} <code>{localizePluginDisplayValue(locale, field.default)}</code>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {hasContext ? (
        <Section
          title={label('contextBundles')}
          hint={label('contextBundlesHint')}
        >
          <div className="plugin-details-modal__context">
            {ctx.skills && ctx.skills.length > 0 ? (
              <ContextGroup label={label('skills')} count={ctx.skills.length}>
                {ctx.skills.map((s, i) => (
                  <span key={`skill-${i}`} className="plugin-details-modal__chip">
                    {refLabel(s as ContextRef)}
                  </span>
                ))}
              </ContextGroup>
            ) : null}
            {ctx.designSystem ? (
              <ContextGroup label={label('designSystem')}>
                <span className="plugin-details-modal__chip">
                  {refLabel(ctx.designSystem as ContextRef)}
                  {(ctx.designSystem as ContextRef).primary ? (
                    <span className="plugin-details-modal__badge is-primary">
                      {label('primary')}
                    </span>
                  ) : null}
                </span>
              </ContextGroup>
            ) : null}
            {ctx.craft && ctx.craft.length > 0 ? (
              <ContextGroup label={label('craft')} count={ctx.craft.length}>
                {ctx.craft.map((c) => (
                  <span key={`craft-${c}`} className="plugin-details-modal__chip">
                    {c}
                  </span>
                ))}
              </ContextGroup>
            ) : null}
            {ctx.atoms && ctx.atoms.length > 0 ? (
              <ContextGroup label={label('atoms')} count={ctx.atoms.length}>
                {ctx.atoms.map((a) => (
                  <span key={`atom-${a}`} className="plugin-details-modal__chip">
                    {a}
                  </span>
                ))}
              </ContextGroup>
            ) : null}
            {ctx.assets && ctx.assets.length > 0 ? (
              <ContextGroup label={label('assets')} count={ctx.assets.length}>
                {ctx.assets.map((a) => (
                  <span
                    key={`asset-${a}`}
                    className="plugin-details-modal__chip plugin-details-modal__chip--mono"
                  >
                    {a}
                  </span>
                ))}
              </ContextGroup>
            ) : null}
            {ctx.mcp && ctx.mcp.length > 0 ? (
              <ContextGroup label={label('mcpServers')} count={ctx.mcp.length}>
                {(ctx.mcp as McpServerSpec[]).map((m) => (
                  <span key={`mcp-${m.name}`} className="plugin-details-modal__chip">
                    {m.name}
                  </span>
                ))}
              </ContextGroup>
            ) : null}
            {ctx.claudePlugins && ctx.claudePlugins.length > 0 ? (
              <ContextGroup
                label={label('claudePlugins')}
                count={ctx.claudePlugins.length}
              >
                {ctx.claudePlugins.map((p, i) => (
                  <span key={`cp-${i}`} className="plugin-details-modal__chip">
                    {refLabel(p as ContextRef)}
                  </span>
                ))}
              </ContextGroup>
            ) : null}
          </div>
        </Section>
      ) : null}

      {stages.length > 0 ? (
        <Section
          title={label('workflow')}
          count={stages.length}
          hint={label('workflowHint')}
        >
          <ol className="plugin-details-modal__stages">
            {stages.map((stage, idx) => (
              <li key={`${stage.id}-${idx}`} className="plugin-details-modal__stage">
                <div className="plugin-details-modal__stage-head">
                  <span className="plugin-details-modal__stage-num">{idx + 1}</span>
                  <code className="plugin-details-modal__stage-id">{stage.id}</code>
                  {stage.repeat ? (
                    <span className="plugin-details-modal__badge is-repeat">
                      {label('repeat')}
                    </span>
                  ) : null}
                  {stage.onFailure ? (
                    <span className="plugin-details-modal__badge is-failure">
                      {label('onFailurePrefix')} {stage.onFailure}
                    </span>
                  ) : null}
                </div>
                {stage.atoms && stage.atoms.length > 0 ? (
                  <div className="plugin-details-modal__stage-atoms">
                    {stage.atoms.map((atom) => (
                      <code
                        key={`${stage.id}-${atom}`}
                        className="plugin-details-modal__atom"
                      >
                        {atom}
                      </code>
                    ))}
                  </div>
                ) : null}
                {stage.until ? (
                  <div className="plugin-details-modal__muted plugin-details-modal__small">
                    {label('untilPrefix')} <code>{stage.until}</code>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {surfaces.length > 0 ? (
        <Section
          title={label('genuiSurfaces')}
          count={surfaces.length}
          hint={label('genuiSurfacesHint')}
        >
          <ul className="plugin-details-modal__surfaces">
            {surfaces.map((s) => (
              <li key={s.id} className="plugin-details-modal__surface">
                <div className="plugin-details-modal__surface-head">
                  <code>{s.id}</code>
                  <span className="plugin-details-modal__badge is-type">
                    {s.kind}
                  </span>
                  {s.persist ? (
                    <span className="plugin-details-modal__muted plugin-details-modal__small">
                      {label('persistsAt')} <code>{s.persist}</code>
                    </span>
                  ) : null}
                </div>
                {s.prompt ? (
                  <div className="plugin-details-modal__surface-prompt">
                    “{s.prompt}”
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {required.length > 0 || optional.length > 0 ? (
        <Section title={label('connectors')}>
          {required.length > 0 ? (
            <ConnectorList label={label('required')} items={required} variant="required" />
          ) : null}
          {optional.length > 0 ? (
            <ConnectorList label={label('optional')} items={optional} variant="optional" />
          ) : null}
        </Section>
      ) : null}

      {capabilities.length > 0 ? (
        <Section
          title={label('capabilities')}
          count={capabilities.length}
          hint={label('capabilitiesHint')}
        >
          <div className="plugin-details-modal__caps">
            {capabilities.map((c) => (
              <code key={c} className="plugin-details-modal__atom is-cap">
                {c}
              </code>
            ))}
          </div>
        </Section>
      ) : null}

      <Section
        title={label('source')}
        action={
          links.contributeUrl ? (
            <a
              className="plugin-details-modal__chip-btn"
              href={links.contributeUrl}
              target="_blank"
              rel="noreferrer"
              data-testid="plugin-details-contribute"
              title={
                links.contributeOnGithub
                  ? label('openIssueOnGithub')
                  : label('openContributePage')
              }
            >
              <Icon
                name={links.contributeOnGithub ? 'github' : 'external-link'}
                size={12}
              />
              {label('contribute')}
            </a>
          ) : undefined
        }
      >
        <dl className="plugin-details-modal__source">
          <div>
            <dt>{label('origin')}</dt>
            <dd>
              <span className="plugin-details-modal__source-kind">
                {links.sourceKindLabel}
              </span>
              {links.sourceUrl ? (
                <ExternalLink
                  href={links.sourceUrl}
                  icon={
                    record.sourceKind === 'github' ? 'github' : 'external-link'
                  }
                  testId="plugin-details-source-link"
                >
                  {links.sourceLabel}
                </ExternalLink>
              ) : (
                <code>{links.sourceLabel}</code>
              )}
            </dd>
          </div>
          <div>
            <dt>{label('path')}</dt>
            <dd>
              <code>{record.fsPath}</code>
            </dd>
          </div>
          <div>
            <dt>{label('version')}</dt>
            <dd>
              <code>v{record.version}</code>
            </dd>
          </div>
          {specVersion ? (
            <div>
              <dt>{label('spec')}</dt>
              <dd>
                <code>v{specVersion}</code>
              </dd>
            </div>
          ) : null}
          <div>
            <dt>{label('trust')}</dt>
            <dd>
              <TrustBadge trust={record.trust} />
            </dd>
          </div>
          {record.pinnedRef ? (
            <div>
              <dt>{label('pinnedRef')}</dt>
              <dd>
                <code>{record.pinnedRef}</code>
              </dd>
            </div>
          ) : null}
          {record.sourceMarketplaceId ? (
            <div>
              <dt>{label('marketplaceId')}</dt>
              <dd>
                <code>{record.sourceMarketplaceId}</code>
              </dd>
            </div>
          ) : null}
          {manifest.license ? (
            <div>
              <dt>{label('license')}</dt>
              <dd>
                <code>{manifest.license}</code>
              </dd>
            </div>
          ) : null}
          <div>
            <dt>{label('installed')}</dt>
            <dd>{installedLabel}</dd>
          </div>
        </dl>
      </Section>
        </>,
      )}
    </div>
  );
}

interface SectionProps {
  title: string;
  count?: number;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}

function Section({ title, count, hint, action, children }: SectionProps) {
  return (
    <section className="plugin-details-modal__section">
      <div className="plugin-details-modal__section-head">
        <h3 className="plugin-details-modal__section-title">
          {title}
          {typeof count === 'number' ? (
            <span className="plugin-details-modal__section-count">{count}</span>
          ) : null}
        </h3>
        {action ? (
          <div className="plugin-details-modal__section-action">{action}</div>
        ) : null}
      </div>
      {hint ? (
        <p className="plugin-details-modal__section-hint">{hint}</p>
      ) : null}
      <div className="plugin-details-modal__section-body">{children}</div>
    </section>
  );
}

interface ContextGroupProps {
  label: string;
  count?: number;
  children: ReactNode;
}

function ContextGroup({ label, count, children }: ContextGroupProps) {
  return (
    <div className="plugin-details-modal__ctx-group">
      <div className="plugin-details-modal__ctx-label">
        {label}
        {typeof count === 'number' ? (
          <span className="plugin-details-modal__ctx-count">{count}</span>
        ) : null}
      </div>
      <div className="plugin-details-modal__chips">{children}</div>
    </div>
  );
}

interface AuthorAvatarProps {
  name: string | null;
  avatarUrl: string | null;
}

function AuthorAvatar({ name, avatarUrl }: AuthorAvatarProps) {
  const [broken, setBroken] = useState(false);
  if (avatarUrl && !broken) {
    return (
      <img
        className="plugin-details-modal__avatar"
        src={avatarUrl}
        alt={name ? `${name} avatar` : 'Author avatar'}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span
      className="plugin-details-modal__avatar plugin-details-modal__avatar--fallback"
      aria-hidden
    >
      {authorInitials(name)}
    </span>
  );
}

interface ExternalLinkProps {
  href: string;
  icon: 'github' | 'external-link';
  children: ReactNode;
  testId?: string;
}

function ExternalLink({ href, icon, children, testId }: ExternalLinkProps) {
  return (
    <a
      className="plugin-details-modal__ext-link"
      href={href}
      target="_blank"
      rel="noreferrer"
      data-testid={testId}
    >
      <Icon name={icon} size={12} />
      <span>{children}</span>
    </a>
  );
}

function githubProfileLabel(url: string): string {
  try {
    const parsed = new URL(url);
    if (/^(?:www\.)?github\.com$/.test(parsed.hostname)) {
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (segments.length >= 2) return `${segments[0]}/${segments[1]!.replace(/\.git$/, '')}`;
      if (segments.length === 1) return `@${segments[0]}`;
    }
    return parsed.hostname + parsed.pathname.replace(/\/$/, '');
  } catch {
    return url;
  }
}

interface ConnectorListProps {
  label: string;
  items: PluginConnectorRef[];
  variant: 'required' | 'optional';
}

function ConnectorList({ label, items, variant }: ConnectorListProps) {
  return (
    <div className="plugin-details-modal__connector-group">
      <h4 className="plugin-details-modal__sub-title">
        {label}
        <span className={`plugin-details-modal__badge is-${variant}`}>
          {items.length}
        </span>
      </h4>
      <ul className="plugin-details-modal__connectors">
        {items.map((c) => (
          <li
            key={`${variant}-${c.id}`}
            className="plugin-details-modal__connector"
          >
            <code>{c.id}</code>
            {c.tools && c.tools.length > 0 ? (
              <span className="plugin-details-modal__muted plugin-details-modal__small">
                · {c.tools.join(', ')}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
