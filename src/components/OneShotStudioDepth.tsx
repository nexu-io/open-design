import { useEffect, useMemo, useState } from 'react';
import {
  COVERVISION_STUDIO_DEEPENING,
  EVIDENCE_STUDIO_PIPELINE,
  ONESHOT_ADAPTER_CONTRACTS,
  ONESHOT_OUTPUT_CONTROL_MODULES,
  WEBSITE_STUDIO_SECTIONS,
} from '../oneshotDesignOS';
import {
  buildWebsiteStudioArtifacts,
  createDefaultWebsiteStudioState,
  loadWebsiteStudioState,
  resetWebsiteStudioState,
  resolveWebsiteBuilderAdapterStatus,
  saveWebsiteStudioState,
  type WebsiteStudioArtifacts,
  type WebsiteStudioWorkbenchState,
} from '../state/websiteStudio';
import { Icon } from './Icon';

interface Props {
  onLaunchWebsiteStudio: (
    state: WebsiteStudioWorkbenchState,
    artifacts: WebsiteStudioArtifacts,
  ) => void;
}

type PreviewFrame = 'Desktop' | 'Tablet' | 'Mobile';

const PREVIEW_FRAMES: Array<{ label: PreviewFrame; width: string; note: string }> = [
  { label: 'Desktop', width: '100%', note: '1440px layout, full navigation, proof visible above fold' },
  { label: 'Tablet', width: '74%', note: '834px layout, compact navigation, two-column sections collapse cleanly' },
  { label: 'Mobile', width: '42%', note: '390px layout, no horizontal overflow, sticky action remains readable' },
];

const PIN_TARGETS = [
  'Website Studio / Hero',
  'Website Studio / Proof',
  'Website Studio / Conversion',
  'CoverVision OS / Concept lanes',
  'Evidence Studio / Source path',
  'Website Builder Adapter',
] as const;

export function OneShotStudioDepth({ onLaunchWebsiteStudio }: Props) {
  const [state, setState] = useState<WebsiteStudioWorkbenchState>(() => loadWebsiteStudioState());
  const [activeFrame, setActiveFrame] = useState<PreviewFrame>('Desktop');
  const [activeArtifact, setActiveArtifact] = useState<keyof WebsiteStudioArtifacts>('site_plan.md');
  const [pinTarget, setPinTarget] = useState<string>(PIN_TARGETS[0]);
  const [pinNote, setPinNote] = useState('');

  useEffect(() => {
    saveWebsiteStudioState(state);
  }, [state]);

  const activePreview =
    PREVIEW_FRAMES.find((frame) => frame.label === activeFrame) ?? PREVIEW_FRAMES[0]!;
  const adapterStatus = useMemo(() => resolveWebsiteBuilderAdapterStatus(state), [state]);
  const artifacts = useMemo(() => buildWebsiteStudioArtifacts(state), [state]);
  const selectedSections = WEBSITE_STUDIO_SECTIONS.filter((section) =>
    state.selectedSectionIds.includes(section.id),
  );

  function updateState(next: Partial<WebsiteStudioWorkbenchState>) {
    setState((current) => ({ ...current, ...next, updatedAt: Date.now() }));
  }

  function updateIntake(field: keyof WebsiteStudioWorkbenchState['intake'], value: string) {
    setState((current) => ({
      ...current,
      intake: { ...current.intake, [field]: value },
      evidenceStudio:
        field === 'sourcePath'
          ? { ...current.evidenceStudio, sourcePath: value }
          : current.evidenceStudio,
      updatedAt: Date.now(),
    }));
  }

  function updateToken(label: string, value: string) {
    setState((current) => ({
      ...current,
      tokens: { ...current.tokens, [label]: value },
      updatedAt: Date.now(),
    }));
  }

  function updateGate(id: string, field: 'status' | 'note' | 'evidence', value: string) {
    setState((current) => ({
      ...current,
      qualityReviews: current.qualityReviews.map((gate) =>
        gate.id === id ? { ...gate, [field]: value } : gate,
      ),
      updatedAt: Date.now(),
    }));
  }

  function toggleSection(sectionId: string) {
    setState((current) => {
      const selected = current.selectedSectionIds.includes(sectionId)
        ? current.selectedSectionIds.filter((id) => id !== sectionId)
        : [...current.selectedSectionIds, sectionId];
      return { ...current, selectedSectionIds: selected, updatedAt: Date.now() };
    });
  }

  function addPin() {
    const note = pinNote.trim();
    if (!note) return;
    setState((current) => ({
      ...current,
      pins: [
        {
          id: `pin-${Date.now()}`,
          target: pinTarget,
          note,
          createdAt: Date.now(),
        },
        ...current.pins,
      ],
      updatedAt: Date.now(),
    }));
    setPinNote('');
  }

  return (
    <section className="oneshot-depth" aria-label="OneShot working studio depth">
      <div className="oneshot-depth-head">
        <div>
          <span className="oneshot-depth-kicker">Project-backed studio depth</span>
          <h2>Website Studio workbench</h2>
          <p>
            Website Studio now autosaves its intake, sitemap, selected sections,
            token edits, deploy target, quality reviews, pins, Evidence Studio
            source state, and generated artifact bodies before project launch.
          </p>
        </div>
        <div className="oneshot-depth-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => setState(resetWebsiteStudioState())}
          >
            <Icon name="refresh" size={13} />
            Reset workbench
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => onLaunchWebsiteStudio(state, artifacts)}
          >
            <Icon name="sparkles" size={13} />
            Start Website Studio packet
          </button>
        </div>
      </div>

      <div className="oneshot-depth-save-state">
        <span>
          <Icon name="check" size={12} />
          Autosaved to project-backed Website Studio state
        </span>
        <code>{new Date(state.updatedAt).toLocaleString()}</code>
      </div>

      <div className="oneshot-depth-grid">
        <article className="oneshot-website-panel">
          <PanelTitle icon="file" title="Site intake" meta="Persistent" />
          <div className="oneshot-intake-grid">
            <label>
              <span>Business</span>
              <input
                value={state.intake.business}
                onChange={(event) => updateIntake('business', event.target.value)}
              />
            </label>
            <label>
              <span>Audience</span>
              <input
                value={state.intake.audience}
                onChange={(event) => updateIntake('audience', event.target.value)}
              />
            </label>
            <label>
              <span>Offer</span>
              <input
                value={state.intake.offer}
                onChange={(event) => updateIntake('offer', event.target.value)}
              />
            </label>
            <label>
              <span>Conversion</span>
              <input
                value={state.intake.conversion}
                onChange={(event) => updateIntake('conversion', event.target.value)}
              />
            </label>
            <label className="wide">
              <span>Source/reference path</span>
              <input
                value={state.intake.sourcePath}
                onChange={(event) => updateIntake('sourcePath', event.target.value)}
              />
            </label>
          </div>
          <div className="oneshot-sitemap-plan" aria-label="Sitemap and page planner">
            {state.sitemap.map((page, index) => (
              <span key={`${page}-${index}`}>
                <strong>{String(index + 1).padStart(2, '0')}</strong>
                {page}
              </span>
            ))}
          </div>
        </article>

        <article className="oneshot-website-panel">
          <PanelTitle icon="grid" title="Section library" meta={`${selectedSections.length} selected`} />
          <div className="oneshot-section-library">
            {WEBSITE_STUDIO_SECTIONS.map((section) => (
              <label
                key={section.id}
                className={`oneshot-section-option${
                  state.selectedSectionIds.includes(section.id) ? ' selected' : ''
                }`}
              >
                <span>
                  <input
                    type="checkbox"
                    checked={state.selectedSectionIds.includes(section.id)}
                    onChange={() => toggleSection(section.id)}
                  />
                  <strong>{section.title}</strong>
                </span>
                <p>{section.description}</p>
                <div>
                  {section.items.map((item) => (
                    <small key={`${section.id}-${item}`}>{item}</small>
                  ))}
                </div>
              </label>
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
                <strong>{state.intake.offer}</strong>
                <span>{state.intake.conversion}</span>
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
          <PanelTitle icon="sliders" title="Design-token panel" meta="Autosaved" />
          <div className="oneshot-token-list">
            {Object.entries(state.tokens).map(([label, value]) => (
              <label key={label}>
                <strong>{label}</strong>
                <input value={value} onChange={(event) => updateToken(label, event.target.value)} />
              </label>
            ))}
          </div>
        </article>

        <article className="oneshot-website-panel">
          <PanelTitle icon="link" title="Website Builder adapter stub" meta={adapterStatus.label} />
          <label className="oneshot-deploy-field">
            <span>Real deploy URL or local verified URL</span>
            <input
              value={state.deployTarget}
              onChange={(event) => updateState({ deployTarget: event.target.value })}
              placeholder="https://... or http://127.0.0.1:3004"
            />
          </label>
          <label className="oneshot-deploy-field">
            <span>Deploy command output evidence</span>
            <input
              value={state.deployCommandEvidence}
              onChange={(event) => updateState({ deployCommandEvidence: event.target.value })}
              placeholder="Required before external URLs can be verified-deployed"
            />
          </label>
          <div className={`oneshot-deploy-status ${adapterStatus.status}`}>
            <strong>{adapterStatus.label}</strong>
            <span>{adapterStatus.detail}</span>
          </div>
        </article>

        <article className="oneshot-website-panel">
          <PanelTitle icon="file-code" title="Generated Website Studio artifacts" meta={activeArtifact} />
          <div className="oneshot-artifact-tabs" role="tablist" aria-label="Website Studio artifacts">
            {Object.keys(artifacts).map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={activeArtifact === name}
                className={activeArtifact === name ? 'active' : ''}
                onClick={() => setActiveArtifact(name as keyof WebsiteStudioArtifacts)}
              >
                {name}
              </button>
            ))}
          </div>
          <pre className="oneshot-artifact-preview">{artifacts[activeArtifact]}</pre>
        </article>
      </div>

      <div className="oneshot-depth-band">
        <PanelTitle icon="check" title="Shared quality gates" meta="Real review state" />
        <div className="oneshot-quality-grid">
          {state.qualityReviews.map((gate) => (
            <article key={gate.id} className={gate.status}>
              <div>
                <strong>{gate.title}</strong>
                <select
                  aria-label={`${gate.title} status`}
                  value={gate.status}
                  onChange={(event) => updateGate(gate.id, 'status', event.target.value)}
                >
                  <option value="pass">pass</option>
                  <option value="needs-review">needs review</option>
                  <option value="blocked">blocked</option>
                </select>
              </div>
              <label>
                <span>Review note</span>
                <input value={gate.note} onChange={(event) => updateGate(gate.id, 'note', event.target.value)} />
              </label>
              <label>
                <span>Evidence</span>
                <input
                  value={gate.evidence}
                  onChange={(event) => updateGate(gate.id, 'evidence', event.target.value)}
                />
              </label>
            </article>
          ))}
        </div>
      </div>

      <div className="oneshot-depth-split">
        <article className="oneshot-depth-band">
          <PanelTitle icon="pin" title="Comments and pins" meta={`${state.pins.length} notes`} />
          <div className="oneshot-pin-composer">
            <select value={pinTarget} onChange={(event) => setPinTarget(event.target.value)}>
              {PIN_TARGETS.map((target) => (
                <option key={target} value={target}>{target}</option>
              ))}
            </select>
            <input
              value={pinNote}
              onChange={(event) => setPinNote(event.target.value)}
              placeholder="Add a review note, source reminder, or production risk"
            />
            <button type="button" onClick={addPin}>Add pin</button>
          </div>
          <div className="oneshot-pin-list">
            {state.pins.map((pin) => (
              <div key={pin.id}>
                <strong>{pin.target}</strong>
                <span>{pin.note}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="oneshot-depth-band">
          <PanelTitle icon="folder" title="Evidence Studio v1" meta="Traceable intake" />
          <div className="oneshot-evidence-v1">
            <label className="wide">
              <span>Evidence source path</span>
              <input
                value={state.evidenceStudio.sourcePath}
                onChange={(event) =>
                  updateState({
                    evidenceStudio: { ...state.evidenceStudio, sourcePath: event.target.value },
                  })
                }
              />
            </label>
            {(['originals', 'thumbnails', 'supportingAssets', 'flaggedFiles'] as const).map((field) => (
              <label key={field}>
                <span>{field}</span>
                <input
                  type="number"
                  min="0"
                  value={state.evidenceStudio[field]}
                  onChange={(event) =>
                    updateState({
                      evidenceStudio: {
                        ...state.evidenceStudio,
                        [field]: Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
            ))}
            <label className="wide">
              <span>Review gate</span>
              <input
                value={state.evidenceStudio.reviewGate}
                onChange={(event) =>
                  updateState({
                    evidenceStudio: { ...state.evidenceStudio, reviewGate: event.target.value },
                  })
                }
              />
            </label>
          </div>
          <div className="oneshot-evidence-outputs">
            <span>Evidence inventory</span>
            <span>DESIGN.md</span>
            <span>Opportunity packet</span>
            <span>Codex build brief</span>
          </div>
        </article>
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
