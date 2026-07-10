import { useMemo, useRef, useState } from 'react';

import type { ProjectFile, ProjectMetadata } from '../../types';
import { ProductionCanvasBoard } from './ProductionCanvasBoard';
import { ProductionTaskCard, productionTaskCardForId, PRODUCTION_TASK_CARD_CATALOG } from './ProductionTaskCard';
import { ProductionWorkflowRail, type ProductionWorkflowStep } from './ProductionWorkflowRail';

interface Props {
  projectId: string;
  projectName: string;
  metadata: ProjectMetadata | null | undefined;
  projectFiles: ProjectFile[];
}

type ProductionProjectMetadata = ProjectMetadata & {
  workflowMode?: 'production';
  taskCardId?: string;
  voiceTone?: string;
  voiceProfileId?: string;
};

type ProductionSegmentId = string;

type ProductionLaneId = 'paragraph' | 'voice' | 'shot' | 'assets' | 'output';

interface VoiceProfileCard {
  id: string;
  role: string;
  tone: string;
  description: string;
}

interface ProductionSegment {
  id: ProductionSegmentId;
  label: string;
  paragraph: string;
  narration: string;
  shot: string;
  assets: string;
  output: string;
  voiceProfileId: string;
}

const VOICE_PROFILE_CARDS: readonly VoiceProfileCard[] = [
  {
    id: 'guide-host',
    role: 'Guide host',
    tone: 'professional',
    description: 'Clear and steady for explainers.',
  },
  {
    id: 'warm-storyteller',
    role: 'Warm storyteller',
    tone: 'friendly',
    description: 'Soft and approachable for how-tos.',
  },
  {
    id: 'calm-explainer',
    role: 'Calm explainer',
    tone: 'calm',
    description: 'Good for product or science breakdowns.',
  },
  {
    id: 'energetic-presenter',
    role: 'Energetic presenter',
    tone: 'energetic',
    description: 'Best for short-form or fast hooks.',
  },
] as const;

const DEFAULT_SCRIPT_LINES: readonly string[] = [
  'Hook: explain the core idea in one line.',
  'Body: show the main example with one clear visual.',
  'Wrap-up: finish with a useful takeaway or CTA.',
];

const DEFAULT_SEGMENT_BLUEPRINTS: readonly {
  id: ProductionSegmentId;
  label: string;
  paragraph: string;
}[] = [
  {
    id: 'hook',
    label: 'Hook',
    paragraph: DEFAULT_SCRIPT_LINES[0]!,
  },
  {
    id: 'body',
    label: 'Body',
    paragraph: DEFAULT_SCRIPT_LINES[1]!,
  },
  {
    id: 'wrap',
    label: 'Wrap-up',
    paragraph: DEFAULT_SCRIPT_LINES[2]!,
  },
] as const;

function getVoiceProfile(profileId: string | null | undefined) {
  return VOICE_PROFILE_CARDS.find((profile) => profile.id === profileId) ?? VOICE_PROFILE_CARDS[0]!;
}

function buildNarration(paragraph: string, voiceTone: string, profile: VoiceProfileCard) {
  const trimmedParagraph = paragraph.trim();
  return trimmedParagraph
    ? `${profile.role} (${voiceTone}) 旁白：${paragraph}`
    : `${profile.role} (${voiceTone}) 旁白：請輸入段落`;
}

function buildShot(paragraph: string) {
  return paragraph.trim() ? `鏡頭：${paragraph}` : '鏡頭：請輸入段落';
}

function buildAssets(paragraph: string) {
  return paragraph.trim() ? `素材：${paragraph}` : '素材：請輸入段落';
}

function buildOutput(paragraph: string) {
  return paragraph.trim() ? `成片：${paragraph}` : '成片：請輸入段落';
}

function createInitialSegments(voiceTone: string, defaultVoiceProfileId: string): ProductionSegment[] {
  const profile = getVoiceProfile(defaultVoiceProfileId);
  return DEFAULT_SEGMENT_BLUEPRINTS.map((segment, index) => {
    const paragraph = segment.paragraph;
    const chosenProfile = index === 0 ? profile : getVoiceProfile(defaultVoiceProfileId);
    return {
      id: segment.id,
      label: segment.label,
      paragraph,
      narration: buildNarration(paragraph, voiceTone, chosenProfile),
      shot: buildShot(paragraph),
      assets: buildAssets(paragraph),
      output: buildOutput(paragraph),
      voiceProfileId: chosenProfile.id,
    };
  });
}

function createEmptySegment(
  label: string,
  voiceTone: string,
  voiceProfileId: string,
  id: string,
): ProductionSegment {
  const profile = getVoiceProfile(voiceProfileId);
  return {
    id,
    label,
    paragraph: '',
    narration: buildNarration('', voiceTone, profile),
    shot: buildShot(''),
    assets: buildAssets(''),
    output: buildOutput(''),
    voiceProfileId: profile.id,
  };
}

function createVoicePreview(segments: ProductionSegment[], voiceTone: string) {
  if (segments.length === 0) {
    return 'Add a script line to generate a voice preview.';
  }

  const profileLabels = segments
    .map((segment) => getVoiceProfile(segment.voiceProfileId).role)
    .filter((role, index, array) => array.indexOf(role) === index);

  return `Voice flow (${voiceTone}) uses ${profileLabels.join(', ')} across ${segments.length} beats.`;
}

function createStoryboardShots(segments: ProductionSegment[]) {
  if (segments.length === 0) {
    return ['Add a script line to create storyboard shots.'];
  }

  return segments.map((segment) => `${segment.label}: ${segment.shot}`);
}

export function ProductionWorkspace({ projectId, projectName, metadata, projectFiles }: Props) {
  const productionMetadata = metadata as ProductionProjectMetadata | null | undefined;
  const selectedTaskCard = productionTaskCardForId(productionMetadata?.taskCardId);
  const taskCardCount = PRODUCTION_TASK_CARD_CATALOG.length;
  const voiceTone = productionMetadata?.voiceTone ?? 'professional';
  const defaultVoiceProfileId = productionMetadata?.voiceProfileId ?? VOICE_PROFILE_CARDS[0]!.id;
  const nextSegmentNumberRef = useRef(DEFAULT_SEGMENT_BLUEPRINTS.length + 1);
  const [segments, setSegments] = useState<ProductionSegment[]>(
    () => createInitialSegments(voiceTone, defaultVoiceProfileId),
  );

  const voicePreview = useMemo(() => createVoicePreview(segments, voiceTone), [segments, voiceTone]);
  const storyboardShots = useMemo(() => createStoryboardShots(segments), [segments]);
  const voiceProfileCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const segment of segments) {
      counts.set(segment.voiceProfileId, (counts.get(segment.voiceProfileId) ?? 0) + 1);
    }
    return counts;
  }, [segments]);

  const updateSegment = (segmentId: ProductionSegmentId, field: ProductionLaneId | 'voiceProfileId', value: string) => {
    setSegments((current) =>
      current.map((segment) => {
        if (segment.id !== segmentId) return segment;

        if (field === 'paragraph') {
          const profile = getVoiceProfile(segment.voiceProfileId);
          return {
            ...segment,
            paragraph: value,
            narration: buildNarration(value, voiceTone, profile),
            shot: buildShot(value),
            assets: buildAssets(value),
            output: buildOutput(value),
          };
        }

        if (field === 'voiceProfileId') {
          const profile = getVoiceProfile(value);
          return {
            ...segment,
            voiceProfileId: profile.id,
            narration: buildNarration(segment.paragraph, voiceTone, profile),
          };
        }

        if (field === 'voice') {
          return {
            ...segment,
            narration: value,
          };
        }

        if (field === 'shot') {
          return {
            ...segment,
            shot: value,
          };
        }

        if (field === 'assets') {
          return {
            ...segment,
            assets: value,
          };
        }

        if (field === 'output') {
          return {
            ...segment,
            output: value,
          };
        }

        return segment;
      }),
    );
  };

  const appendSegment = () => {
    const nextNumber = nextSegmentNumberRef.current;
    nextSegmentNumberRef.current += 1;
    setSegments((current) => [
      ...current,
      createEmptySegment(`第 ${nextNumber} 段`, voiceTone, defaultVoiceProfileId, `segment-${nextNumber}`),
    ]);
  };

  const insertSegmentAfter = (segmentId: ProductionSegmentId) => {
    setSegments((current) => {
      const index = current.findIndex((segment) => segment.id === segmentId);
      const nextNumber = nextSegmentNumberRef.current;
      nextSegmentNumberRef.current += 1;
      const nextSegment = createEmptySegment(
        `第 ${nextNumber} 段`,
        voiceTone,
        current[index]?.voiceProfileId ?? defaultVoiceProfileId,
        `segment-${nextNumber}`,
      );

      if (index < 0) {
        return [...current, nextSegment];
      }

      const next = current.slice();
      next.splice(index + 1, 0, nextSegment);
      return next;
    });
  };

  const removeSegment = (segmentId: ProductionSegmentId) => {
    setSegments((current) => {
      if (current.length <= 1) {
        return current;
      }
      return current.filter((segment) => segment.id !== segmentId);
    });
  };

  const workflowSteps: readonly ProductionWorkflowStep[] = useMemo(
    () => [
      {
        id: 'script',
        label: 'Script',
        status: segments.length > 0 ? 'active' : 'empty',
        description: segments.length > 0
          ? `${segments.length} beats ready to drive voice and storyboard.`
          : 'Start with a clear, editable script backbone.',
      },
      {
        id: 'voice',
        label: 'Voice',
        status: segments.length > 0 ? 'ready' : 'empty',
        description: segments.length > 0
          ? `Voice preview follows the same ${voiceTone} script draft.`
          : 'Generate a voiceover from the script in one click.',
      },
      {
        id: 'storyboard',
        label: 'Storyboard',
        status: segments.length > 0 ? 'ready' : 'empty',
        description: segments.length > 0
          ? `${storyboardShots.length} shots are already lined up from the script.`
          : 'Turn beats into shots when you are ready.',
      },
      {
        id: 'assets',
        label: 'Assets',
        status: projectFiles.length > 0 ? 'ready' : 'empty',
        description: 'Collect generated and uploaded media in one place.',
      },
      {
        id: 'output',
        label: 'Output',
        status: segments.length > 0 ? 'ready' : 'empty',
        description: 'Export the assembled video when the sequence is complete.',
      },
    ],
    [projectFiles.length, segments.length, storyboardShots.length, voiceTone],
  );

  return (
    <section className="production-workspace" data-testid="production-workspace" data-project-id={projectId}>
      <header className="production-workspace__header">
        <div>
          <p className="production-workspace__eyebrow">Production mode</p>
          <h2>{projectName}</h2>
          <p className="production-workspace__lede">
            {segments.length > 0
              ? `${segments.length} script beats now drive the five production lanes in one beginner-friendly flow.`
              : 'Script, voice, storyboard, assets, and output stay connected in one beginner-friendly flow.'}
          </p>
        </div>
        <button type="button" className="production-workspace__primary-action">
          Export draft video
        </button>
      </header>

      <ProductionCanvasBoard />

      <div className="production-workspace__grid">
        <section className="production-workspace__pane">
          <h3>Task card</h3>
          <p className="production-workspace__count">{taskCardCount} starter flows</p>
          <ProductionTaskCard card={selectedTaskCard} selected metadata={productionMetadata} />
        </section>

        <section className="production-workspace__pane">
          <h3>Workflow rail</h3>
          <ProductionWorkflowRail steps={workflowSteps} />
        </section>

        <section className="production-workspace__pane production-workspace__pane--lane">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h3>段落</h3>
              <p>把每段內容寫成明確段落，後面的旁白與分鏡會跟著同步。</p>
            </div>
            <button type="button" className="production-workspace__secondary-action" onClick={appendSegment}>
              新增分段
            </button>
          </div>
          {segments.map((segment) => (
            <article key={segment.id} className="production-workspace__lane-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <strong>{segment.label}</strong>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="production-workspace__secondary-action"
                    aria-label={`${segment.label} 下方新增分段`}
                    onClick={() => insertSegmentAfter(segment.id)}
                  >
                    下方新增
                  </button>
                  <button
                    type="button"
                    className="production-workspace__secondary-action"
                    aria-label={`${segment.label} 刪除分段`}
                    disabled={segments.length <= 1}
                    onClick={() => removeSegment(segment.id)}
                  >
                    刪除
                  </button>
                </div>
              </div>
              <label style={{ display: 'grid', gap: 8 }}>
                <span className="production-workspace__label">{segment.label} 段落</span>
                <textarea
                  aria-label={`${segment.label} 段落`}
                  value={segment.paragraph}
                  onChange={(event) => updateSegment(segment.id, 'paragraph', event.target.value)}
                  rows={4}
                  style={{
                    width: '100%',
                    resize: 'vertical',
                    borderRadius: 16,
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                    background: 'rgba(15, 23, 42, 0.82)',
                    color: '#e2e8f0',
                    padding: '14px 16px',
                    lineHeight: 1.6,
                  }}
                />
              </label>
            </article>
          ))}
        </section>

        <section className="production-workspace__pane production-workspace__pane--lane">
          <h3>旁白</h3>
          <p>每個角色都可以綁定固定音色，避免下一集變聲。</p>
          <div data-testid="production-voice-profile-cards" style={{ display: 'grid', gap: 12 }}>
            {VOICE_PROFILE_CARDS.map((profile) => (
              <article
                key={profile.id}
                className="production-workspace__lane-card"
                data-testid={`production-voice-profile-card-${profile.id}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <strong>{profile.role}</strong>
                    <p style={{ margin: '4px 0 0', color: '#94a3b8' }}>{profile.description}</p>
                  </div>
                  <span className="production-task-card__pill">{voiceProfileCounts.get(profile.id) ?? 0} lanes</span>
                </div>
                <p style={{ margin: 0 }}>Tone: {profile.tone}</p>
              </article>
            ))}
          </div>
          <p data-testid="production-voice-preview">{voicePreview}</p>
          {segments.map((segment) => {
            const currentProfile = getVoiceProfile(segment.voiceProfileId);
            return (
              <article key={segment.id} className="production-workspace__lane-card">
                <label style={{ display: 'grid', gap: 8 }}>
                  <span className="production-workspace__label">{segment.label} 角色綁定</span>
                  <select
                    aria-label={`${segment.label} 角色綁定`}
                    value={segment.voiceProfileId}
                    onChange={(event) => updateSegment(segment.id, 'voiceProfileId', event.target.value)}
                    style={{
                      width: '100%',
                      borderRadius: 16,
                      border: '1px solid rgba(148, 163, 184, 0.25)',
                      background: 'rgba(15, 23, 42, 0.82)',
                      color: '#e2e8f0',
                      padding: '12px 14px',
                    }}
                  >
                    {VOICE_PROFILE_CARDS.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.role} / {profile.tone}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                  <span className="production-workspace__label">{segment.label} 旁白</span>
                  <textarea
                    aria-label={`${segment.label} 旁白`}
                    value={segment.narration}
                    onChange={(event) => updateSegment(segment.id, 'voice', event.target.value)}
                    rows={3}
                    style={{
                      width: '100%',
                      resize: 'vertical',
                      borderRadius: 16,
                      border: '1px solid rgba(148, 163, 184, 0.25)',
                      background: 'rgba(15, 23, 42, 0.82)',
                      color: '#e2e8f0',
                      padding: '14px 16px',
                      lineHeight: 1.6,
                    }}
                  />
                </label>
                <p style={{ marginTop: 10, color: '#94a3b8' }}>{currentProfile.role} locked to this lane.</p>
              </article>
            );
          })}
        </section>

        <section className="production-workspace__pane production-workspace__pane--lane">
          <h3>鏡頭</h3>
          <p>逐 shot 編修，讓分鏡能跟腳本一起演進。</p>
          {segments.map((segment) => (
            <article key={segment.id} className="production-workspace__lane-card">
              <label style={{ display: 'grid', gap: 8 }}>
                <span className="production-workspace__label">{segment.label} 鏡頭</span>
                <textarea
                  aria-label={`${segment.label} 鏡頭`}
                  value={segment.shot}
                  onChange={(event) => updateSegment(segment.id, 'shot', event.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    resize: 'vertical',
                    borderRadius: 16,
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                    background: 'rgba(15, 23, 42, 0.82)',
                    color: '#e2e8f0',
                    padding: '14px 16px',
                    lineHeight: 1.6,
                  }}
                />
              </label>
            </article>
          ))}
        </section>

        <section className="production-workspace__pane production-workspace__pane--lane">
          <h3>素材</h3>
          <p>把每段需要的畫面、圖片、B-roll 與素材提醒寫在同一欄。</p>
          {segments.map((segment) => (
            <article key={segment.id} className="production-workspace__lane-card">
              <label style={{ display: 'grid', gap: 8 }}>
                <span className="production-workspace__label">{segment.label} 素材</span>
                <textarea
                  aria-label={`${segment.label} 素材`}
                  value={segment.assets}
                  onChange={(event) => updateSegment(segment.id, 'assets', event.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    resize: 'vertical',
                    borderRadius: 16,
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                    background: 'rgba(15, 23, 42, 0.82)',
                    color: '#e2e8f0',
                    padding: '14px 16px',
                    lineHeight: 1.6,
                  }}
                />
              </label>
            </article>
          ))}
          {projectFiles.length > 0 ? (
            <div style={{ marginTop: 16 }}>
              <p className="production-workspace__count">Attached files</p>
              <ul>
                {projectFiles.slice(0, 5).map((file) => (
                  <li key={file.name}>{file.name}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p style={{ marginTop: 16 }}>No assets yet. Generated files will land here.</p>
          )}
        </section>

        <section className="production-workspace__pane production-workspace__pane--lane">
          <h3>成片</h3>
          <p>輸出層會總覽每段最終狀態，完成後即可送出成片。</p>
          {segments.map((segment) => (
            <article key={segment.id} className="production-workspace__lane-card">
              <label style={{ display: 'grid', gap: 8 }}>
                <span className="production-workspace__label">{segment.label} 成片</span>
                <textarea
                  aria-label={`${segment.label} 成片`}
                  value={segment.output}
                  onChange={(event) => updateSegment(segment.id, 'output', event.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    resize: 'vertical',
                    borderRadius: 16,
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                    background: 'rgba(15, 23, 42, 0.82)',
                    color: '#e2e8f0',
                    padding: '14px 16px',
                    lineHeight: 1.6,
                  }}
                />
              </label>
            </article>
          ))}
          <p style={{ marginTop: 16 }}>{storyboardShots.length} shots ready for export.</p>
        </section>
      </div>
    </section>
  );
}
