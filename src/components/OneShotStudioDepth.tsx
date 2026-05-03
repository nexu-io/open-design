import { useMemo, useState } from 'react';
import {
  COVERVISION_STUDIO_DEEPENING,
  EVIDENCE_STUDIO_PIPELINE,
  ONESHOT_ADAPTER_CONTRACTS,
  ONESHOT_OUTPUT_CONTROL_MODULES,
  ONESHOT_QUALITY_GATES,
  WEBSITE_STUDIO_DEFAULT_INTAKE,
  WEBSITE_STUDIO_SECTIONS,
} from '../oneshotDesignOS';
import { Icon } from './Icon';

interface Props {
  onLaunchWebsiteStudio: () => void;
}

type PreviewFrame = 'Desktop' | 'Tablet' | 'Mobile';

const PREVIEW_FRAMES: Array<{ label: PreviewFrame; width: string; note: string }> = [
  { label: 'Desktop', width: '100%', note: '1440px layout, full navigation, proof visible above fold' },
  { label: 'Tablet', width: '74%', note: '834px layout, compact navigation, two-column sections collapse cleanly' },
  { label: 'Mobile', width: '42%', note: '390px layout, no horizontal overflow, sticky action remains readable' },
];

const TOKEN_GROUPS = [
  { label: 'Typography', value: 'Display title, compact UI, mono numerals and paths' },
  { label: 'Color', value: 'Paper, graphite, amber proof, cyan action telemetry' },
  { label: 'Spacing', value: 'Dense but calm, 8px rhythm, fixed preview frames' },
  { label: 'Motion', value: 'Only status, review, and source-to-output transitions' },
];

export function OneShotStudioDepth({ onLaunchWebsiteStudio }: Props) {
  const [business, setBusiness] = useState(WEBSITE_STUDIO_DEFAULT_INTAKE.business);
  const [audience, setAudience] = useState(WEBSITE_STUDIO_DEFAULT_INTAKE.audience);
  const [offer, setOffer] = useState(WEBSITE_STUDIO_DEFAULT_INTAKE.offer);
  const [conversion, setConversion] = useState(WEBSITE_STUDIO_DEFAULT_INTAKE.conversion);
  const [sourcePath, setSourcePath] = useState(WEBSITE_STUDIO_DEFAULT_INTAKE.sourcePath);
  const [deployUrl, setDeployUrl] = useState('');
  const [activeFrame, setActiveFrame] = useState<PreviewFrame>('Desktop');

  const activePreview =
    PREVIEW_FRAMES.find((frame) => frame.label === activeFrame) ?? PREVIEW_FRAMES[0]!;
  const cleanedDeployUrl = deployUrl.trim();
  const hasVerifiedDeployTarget =
    cleanedDeployUrl.startsWith('https://') || cleanedDeployUrl.startsWith('http://127.0.0.1');
  const deployStatus = hasVerifiedDeployTarget ? 'Ready to verify URL' : 'Prepare-only';
  const deployDetail = hasVerifiedDeployTarget
    ? cleanedDeployUrl
    : 'No live URL claimed. Export a build brief or run a real deploy command first.';

  const buildBrief = useMemo(
    () => [
      `Goal: Build a professional website for ${business}.`,
      `Audience: ${audience}.`,
      `Offer: ${offer}.`,
      `Primary conversion: ${conversion}.`,
      `Source/reference path: ${sourcePath}.`,
      `Deploy status: ${deployStatus}.`,
      'Verification: run typecheck, tests, build, and responsive screenshot checks before publish.',
    ],
    [audience, business, conversion, deployStatus, offer, sourcePath],
  );

  return (
    <section className="oneshot-depth" aria-label="OneShot working studio depth">
      <div className="oneshot-depth-head">
        <div>
          <span className="oneshot-depth-kicker">Working studio depth</span>
          <h2>Website Studio workbench</h2>
          <p>
            The Design OS architecture is now actionable: intake, sitemap,
            sections, responsive frames, tokens, quality gates, output controls,
            adapters, CoverVision depth, and Evidence Studio pipeline.
          </p>
        </div>
        <button type="button" className="primary" onClick={onLaunchWebsiteStudio}>
          <Icon name="sparkles" size={13} />
          Start Website Studio packet
        </button>
      </div>

      <div className="oneshot-depth-grid">
        <article className="oneshot-website-panel">
          <PanelTitle icon="file" title="Site intake" meta="Editable v1" />
          <div className="oneshot-intake-grid">
            <label>
              <span>Business</span>
              <input value={business} onChange={(event) => setBusiness(event.target.value)} />
            </label>
            <label>
              <span>Audience</span>
              <input value={audience} onChange={(event) => setAudience(event.target.value)} />
            </label>
            <label>
              <span>Offer</span>
              <input value={offer} onChange={(event) => setOffer(event.target.value)} />
            </label>
            <label>
              <span>Conversion</span>
              <input value={conversion} onChange={(event) => setConversion(event.target.value)} />
            </label>
            <label className="wide">
              <span>Source/reference path</span>
              <input value={sourcePath} onChange={(event) => setSourcePath(event.target.value)} />
            </label>
          </div>
          <div className="oneshot-sitemap-plan" aria-label="Sitemap and page planner">
            {WEBSITE_STUDIO_DEFAULT_INTAKE.pages.map((page, index) => (
              <span key={page}>
                <strong>{String(index + 1).padStart(2, '0')}</strong>
                {page}
              </span>
            ))}
          </div>
        </article>

        <article className="oneshot-website-panel">
          <PanelTitle icon="grid" title="Section library" meta="Website Studio v1" />
          <div className="oneshot-section-library">
            {WEBSITE_STUDIO_SECTIONS.map((section) => (
              <div key={section.id}>
                <strong>{section.title}</strong>
                <p>{section.description}</p>
                <div>
                  {section.items.map((item) => (
                    <small key={`${section.id}-${item}`}>{item}</small>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="oneshot-website-panel oneshot-preview-panel">
          <PanelTitle icon="eye" title="Responsive preview frames" meta={activePreview.note} />
          <div className="oneshot-frame-tabs" role="tablist" aria-label="Responsive preview frames">
            {PREVIEW_FRAMES.map((frame) => (
              <button
                key={frame.label}
                type="button"
                role="tab"
                aria-selected={activeFrame === frame.label}
                className={activeFrame === frame.label ? 'active' : ''}
                onClick={() => setActiveFrame(frame.label)}
              >
                {frame.label}
              </button>
            ))}
          </div>
          <div className="oneshot-preview-stage">
            <div className="oneshot-preview-frame" style={{ width: activePreview.width }}>
              <div className="oneshot-preview-nav">
                <span />
                <span />
                <span />
              </div>
              <div className="oneshot-preview-hero">
                <strong>{offer}</strong>
                <span>{conversion}</span>
              </div>
              <div className="oneshot-preview-body">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </article>

        <article className="oneshot-website-panel">
          <PanelTitle icon="sliders" title="Design-token panel" meta="Shared system" />
          <div className="oneshot-token-list">
            {TOKEN_GROUPS.map((group) => (
              <div key={group.label}>
                <strong>{group.label}</strong>
                <span>{group.value}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="oneshot-website-panel">
          <PanelTitle icon="link" title="Deploy status" meta={deployStatus} />
          <label className="oneshot-deploy-field">
            <span>Real deploy URL or local verified URL</span>
            <input
              value={deployUrl}
              onChange={(event) => setDeployUrl(event.target.value)}
              placeholder="https://... or http://127.0.0.1:3004"
            />
          </label>
          <div className={`oneshot-deploy-status ${hasVerifiedDeployTarget ? 'ready' : 'prepare'}`}>
            <strong>{deployStatus}</strong>
            <span>{deployDetail}</span>
          </div>
        </article>

        <article className="oneshot-website-panel">
          <PanelTitle icon="file-code" title="Codex build brief export" meta="Preview" />
          <div className="oneshot-brief-preview">
            {buildBrief.map((line) => (
              <code key={line}>{line}</code>
            ))}
          </div>
        </article>
      </div>

      <div className="oneshot-depth-band">
        <PanelTitle icon="check" title="Shared quality gates" meta="Required before export" />
        <div className="oneshot-quality-grid">
          {ONESHOT_QUALITY_GATES.map((gate) => (
            <article key={gate.id} className={gate.status}>
              <div>
                <strong>{gate.title}</strong>
                <span>{gate.status}</span>
              </div>
              <meter min="0" max="100" value={gate.score} aria-label={`${gate.title} score`} />
              <p>{gate.evidence}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="oneshot-depth-split">
        <StudioModulePanel
          icon="comment"
          title="Professional output controls"
          meta="Cross-studio"
          modules={ONESHOT_OUTPUT_CONTROL_MODULES}
        />
        <StudioModulePanel
          icon="image"
          title="CoverVision OS deeper studio"
          meta="Premium"
          modules={COVERVISION_STUDIO_DEEPENING}
        />
      </div>

      <div className="oneshot-depth-split">
        <StudioModulePanel
          icon="link"
          title="Adapter layer"
          meta="No replacement of OneShot core"
          modules={ONESHOT_ADAPTER_CONTRACTS.map((adapter) => ({
            id: adapter.id,
            title: adapter.title,
            status: adapter.status === 'ready' ? 'adapter-ready' : adapter.status,
            description: adapter.guardrail,
            items: adapter.methods,
          }))}
        />
        <StudioModulePanel
          icon="folder"
          title="Evidence Studio pipeline"
          meta="Traceable packets"
          modules={EVIDENCE_STUDIO_PIPELINE}
        />
      </div>
    </section>
  );
}

function PanelTitle({
  icon,
  title,
  meta,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  meta: string;
}) {
  return (
    <div className="oneshot-panel-title">
      <span>
        <Icon name={icon} size={14} />
        <strong>{title}</strong>
      </span>
      <small>{meta}</small>
    </div>
  );
}

function StudioModulePanel({
  icon,
  title,
  meta,
  modules,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  meta: string;
  modules: Array<{
    id: string;
    title: string;
    status: string;
    description: string;
    items: string[];
  }>;
}) {
  return (
    <article className="oneshot-depth-band">
      <PanelTitle icon={icon} title={title} meta={meta} />
      <div className="oneshot-module-list">
        {modules.map((module) => (
          <section key={module.id}>
            <div>
              <strong>{module.title}</strong>
              <span>{module.status}</span>
            </div>
            <p>{module.description}</p>
            <div>
              {module.items.slice(0, 6).map((item) => (
                <small key={`${module.id}-${item}`}>{item}</small>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
