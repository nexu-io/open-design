import { useEffect, useMemo, useRef, useState } from 'react';

import type { ProjectFile, ProjectMetadata } from '../../types';
import type { AppConfig } from '../../types';
import { ProductionCanvasBoard } from './ProductionCanvasBoard';
import { ProductionTaskCard, productionTaskCardForId, PRODUCTION_TASK_CARD_CATALOG } from './ProductionTaskCard';
import { ProductionWorkflowRail, type ProductionWorkflowStep } from './ProductionWorkflowRail';
import {
  buildAssets,
  buildNarration,
  buildOutput,
  buildShot,
  createStoryboardShots,
  createVoicePreview,
  cancelFalMediaJob,
  cancelFalMediaTask,
  planFalMediaJobs,
  submitFalMediaJob,
  waitForFalMediaJob,
  runProductionGeneration,
  type GenerationKind,
  type ProductionMediaJob,
  type ProductionSegment,
} from '../../production-generation';

interface Props {
  projectId: string;
  projectName: string;
  metadata: ProjectMetadata | null | undefined;
  projectFiles: ProjectFile[];
  config: AppConfig;
}

type ProductionProjectMetadata = ProjectMetadata & {
  workflowMode?: 'production';
  taskCardId?: string;
  voiceTone?: string;
  voiceProfileId?: string;
};

type ProductionSegmentId = string;

type ProductionLaneId = 'paragraph' | 'voice' | 'shot' | 'assets' | 'output';
type MediaLaneKind = 'image' | 'video' | '3d';

interface ProductionWorkspaceSnapshot {
  version: 1;
  segments: ProductionSegment[];
  mediaJobs: ProductionMediaJob[];
  nextSegmentNumber: number;
}

interface VoiceProfileCard {
  id: string;
  role: string;
  tone: string;
  description: string;
}

const VOICE_PROFILE_CARDS: readonly VoiceProfileCard[] = [
  {
    id: 'guide-host',
    role: '專業講解者',
    tone: 'professional',
    description: '清楚、穩定，適合科普與商務解說。',
  },
  {
    id: 'young-voice',
    role: '年輕聲線',
    tone: 'young',
    description: '明亮、有朝氣，適合短影音與開場。',
  },
  {
    id: 'mature-voice',
    role: '成熟聲線',
    tone: 'mature',
    description: '沉穩、有份量，適合品牌與專業說明。',
  },
  {
    id: 'friendly-voice',
    role: '親切聲線',
    tone: 'friendly',
    description: '溫和、好接近，適合教學與口播。',
  },
  {
    id: 'calm-voice',
    role: '沉穩聲線',
    tone: 'calm',
    description: '平穩、放鬆，適合長文講解與品牌片。',
  },
  {
    id: 'lively-voice',
    role: '活潑聲線',
    tone: 'lively',
    description: '有節奏感與動態感，適合短影音和節目感。',
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

function createInitialSegments(voiceTone: string, defaultVoiceProfileId: string): ProductionSegment[] {
  const profile = getVoiceProfile(defaultVoiceProfileId);
  return DEFAULT_SEGMENT_BLUEPRINTS.map((segment, index) => {
    const paragraph = segment.paragraph;
    const chosenProfile = index === 0 ? profile : getVoiceProfile(defaultVoiceProfileId);
    return {
      id: segment.id,
      label: segment.label,
      paragraph,
      narration: buildNarration(paragraph, voiceTone, chosenProfile.role),
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
    narration: buildNarration('', voiceTone, profile.role),
    shot: buildShot(''),
    assets: buildAssets(''),
    output: buildOutput(''),
    voiceProfileId: profile.id,
  };
}

function workspaceStorageKey(projectId: string) {
  return `open-design:production-workspace:${projectId}`;
}

function readWorkspaceSnapshot(projectId: string): ProductionWorkspaceSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(workspaceStorageKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProductionWorkspaceSnapshot>;
    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.segments) ||
      !Array.isArray(parsed.mediaJobs) ||
      typeof parsed.nextSegmentNumber !== 'number' ||
      parsed.nextSegmentNumber < 1
    ) {
      return null;
    }
    return {
      version: 1,
      segments: parsed.segments as ProductionSegment[],
      mediaJobs: parsed.mediaJobs as ProductionMediaJob[],
      nextSegmentNumber: Math.floor(parsed.nextSegmentNumber),
    };
  } catch {
    return null;
  }
}

function writeWorkspaceSnapshot(projectId: string, snapshot: ProductionWorkspaceSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(workspaceStorageKey(projectId), JSON.stringify(snapshot));
  } catch {
    // Best-effort only. The workspace still runs from in-memory state.
  }
}

export function ProductionWorkspace({ projectId, projectName, metadata, projectFiles, config }: Props) {
  const productionMetadata = metadata as ProductionProjectMetadata | null | undefined;
  const selectedTaskCard = productionTaskCardForId(productionMetadata?.taskCardId);
  const taskCardCount = PRODUCTION_TASK_CARD_CATALOG.length;
  const voiceTone = productionMetadata?.voiceTone ?? 'professional';
  const defaultVoiceProfileId = productionMetadata?.voiceProfileId ?? VOICE_PROFILE_CARDS[0]!.id;
  const savedSnapshot = useMemo(() => readWorkspaceSnapshot(projectId), [projectId]);
  const nextSegmentNumberRef = useRef(savedSnapshot?.nextSegmentNumber ?? DEFAULT_SEGMENT_BLUEPRINTS.length + 1);
  const falAbortRef = useRef<AbortController | null>(null);
  const [segments, setSegments] = useState<ProductionSegment[]>(
    () => savedSnapshot?.segments ?? createInitialSegments(voiceTone, defaultVoiceProfileId),
  );
  const [mediaJobs, setMediaJobs] = useState<ProductionMediaJob[]>(
    () => savedSnapshot?.mediaJobs ?? [],
  );
  const [nextSegmentNumber, setNextSegmentNumber] = useState(
    () => savedSnapshot?.nextSegmentNumber ?? DEFAULT_SEGMENT_BLUEPRINTS.length + 1,
  );
  const [generationBusy, setGenerationBusy] = useState<GenerationKind | null>(null);
  const [generationNotice, setGenerationNotice] = useState<string | null>(null);
  const [falSyncBusy, setFalSyncBusy] = useState(false);
  const mediaJobBuckets = useMemo(
    () =>
      ({
        image: mediaJobs.filter((job) => job.kind === 'image'),
        video: mediaJobs.filter((job) => job.kind === 'video'),
        '3d': mediaJobs.filter((job) => job.kind === '3d'),
      }) as Record<MediaLaneKind, ProductionMediaJob[]>,
    [mediaJobs],
  );

  useEffect(() => {
    writeWorkspaceSnapshot(projectId, {
      version: 1,
      segments,
      mediaJobs,
      nextSegmentNumber,
    });
  }, [mediaJobs, nextSegmentNumber, projectId, segments]);

  const voicePreview = useMemo(
    () => createVoicePreview(segments, voiceTone, (profileId) => getVoiceProfile(profileId).role),
    [segments, voiceTone],
  );
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
            narration: buildNarration(value, voiceTone, profile.role),
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
            narration: buildNarration(segment.paragraph, voiceTone, profile.role),
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
    setNextSegmentNumber(nextSegmentNumberRef.current);
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
      setNextSegmentNumber(nextSegmentNumberRef.current);
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

  const updateMediaJob = (jobId: string, updater: (job: ProductionMediaJob) => ProductionMediaJob) => {
    setMediaJobs((current) => current.map((job) => (job.id === jobId ? updater(job) : job)));
  };

  const queueFalJobs = (nextSegments: readonly ProductionSegment[], kind: MediaLaneKind = 'image') => {
    if (kind === '3d') {
      setGenerationNotice('3D queue is planned in the canvas, but the daemon currently only accepts image and video surfaces.');
      return;
    }
    setMediaJobs(planFalMediaJobs({ segments: nextSegments, kind }));
  };

  const runGeneration = async (kind: GenerationKind) => {
    setGenerationBusy(kind);
    setGenerationNotice(null);

    try {
      const result = await runProductionGeneration({
        kind,
        config,
        segments,
        voiceTone,
        defaultVoiceProfileId,
        knownVoiceProfileIds: VOICE_PROFILE_CARDS.map((profile) => profile.id),
        resolveVoiceLabel: (voiceProfileId) => getVoiceProfile(voiceProfileId).role,
      });
      setSegments(result.segments);
      setGenerationNotice(result.notice);
      if (kind === 'draft' || kind === 'storyboard') {
        queueFalJobs(result.segments, 'image');
      }
    } catch (error) {
      setGenerationNotice(error instanceof Error ? error.message : String(error));
    }
    setGenerationBusy(null);
  };

  const runFalQueue = async () => {
    if (mediaJobs.length === 0) {
      setGenerationNotice('No FAL.ai jobs queued yet.');
      return;
    }

    falAbortRef.current?.abort();
    const controller = new AbortController();
    falAbortRef.current = controller;
    setFalSyncBusy(true);
    setGenerationNotice('Submitting queued media jobs to FAL.ai...');

    try {
      for (const job of mediaJobs) {
        if (controller.signal.aborted) break;
        if (job.status === 'completed') continue;
        if (job.kind === '3d') {
          setGenerationNotice('Skipped 3D plan-only jobs while syncing FAL.ai.');
          continue;
        }

        const submitted = await submitFalMediaJob({
          projectId,
          job,
        });
        if (controller.signal.aborted) {
          updateMediaJob(job.id, (current) => cancelFalMediaJob(current));
          break;
        }

        updateMediaJob(job.id, () => submitted);

        let current = submitted;
        while (!controller.signal.aborted && (current.status === 'queued' || current.status === 'running')) {
          const { job: nextJob, snapshot } = await waitForFalMediaJob({
            job: current,
            since: current.progress.length,
            timeoutMs: 25_000,
          });
          current = nextJob;
          updateMediaJob(job.id, () => nextJob);
          if (snapshot.status === 'done' || snapshot.status === 'failed' || snapshot.status === 'interrupted') {
            break;
          }
        }
      }

      if (!controller.signal.aborted) {
        setGenerationNotice('FAL.ai jobs synced from the daemon.');
      }
    } catch (error) {
      setGenerationNotice(error instanceof Error ? error.message : String(error));
    } finally {
      if (falAbortRef.current === controller) {
        falAbortRef.current = null;
      }
      setFalSyncBusy(false);
    }
  };

  const cancelFalQueue = () => {
    const controller = falAbortRef.current;
    falAbortRef.current = null;
    if (controller) controller.abort();
    setGenerationBusy(null);
    setFalSyncBusy(false);
    setGenerationNotice('Canceling FAL.ai queue...');
    void (async () => {
      const activeJobs = mediaJobs.filter(
        (job) => (job.status === 'queued' || job.status === 'running') && job.kind !== '3d',
      );
      const nextJobs = await Promise.all(
        activeJobs.map(async (job) => {
          try {
            return await cancelFalMediaTask({ projectId, job });
          } catch {
            return cancelFalMediaJob(job);
          }
        }),
      );
      setMediaJobs((current) =>
        current.map((job) => nextJobs.find((nextJob) => nextJob.id === job.id) ?? job),
      );
      setGenerationNotice('FAL.ai queue canceled.');
    })();
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

      <div className="production-workspace__generation-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <button
          type="button"
          className="production-workspace__secondary-action"
          onClick={() => void runGeneration('draft')}
          disabled={generationBusy !== null}
        >
          {generationBusy === 'draft' ? 'Generating draft…' : 'Generate draft'}
        </button>
        <button
          type="button"
          className="production-workspace__secondary-action"
          onClick={() => void runGeneration('voice')}
          disabled={generationBusy !== null}
        >
          {generationBusy === 'voice' ? 'Generating voice…' : 'Generate voice'}
        </button>
        <button
          type="button"
          className="production-workspace__secondary-action"
          onClick={() => void runGeneration('storyboard')}
          disabled={generationBusy !== null}
        >
          {generationBusy === 'storyboard' ? 'Generating storyboard…' : 'Generate storyboard'}
        </button>
        <button
          type="button"
          className="production-workspace__secondary-action"
          onClick={() => void runFalQueue()}
          disabled={generationBusy !== null || falSyncBusy || mediaJobs.length === 0}
        >
          Sync FAL.ai queue
        </button>
        <button
          type="button"
          className="production-workspace__secondary-action"
          onClick={cancelFalQueue}
          disabled={!falSyncBusy && !mediaJobs.some((job) => job.status === 'queued' || job.status === 'running')}
        >
          Cancel FAL.ai queue
        </button>
        {generationNotice ? <p style={{ margin: '6px 0 0', color: '#94a3b8' }}>{generationNotice}</p> : null}
      </div>

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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              className="production-workspace__secondary-action"
              onClick={() => queueFalJobs(segments, 'image')}
              disabled={segments.length === 0 || falSyncBusy}
            >
              規劃圖片隊列
            </button>
            <button
              type="button"
              className="production-workspace__secondary-action"
              onClick={() => queueFalJobs(segments, 'video')}
              disabled={segments.length === 0 || falSyncBusy}
            >
              規劃影片隊列
            </button>
            <button
              type="button"
              className="production-workspace__secondary-action"
              disabled
              title="3D queue is planned locally first; a daemon surface has not been confirmed yet."
            >
              3D 規劃中
            </button>
          </div>
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
          <p style={{ marginTop: 8, color: '#94a3b8' }}>
            {mediaJobs.length} media jobs queued for FAL.ai: {mediaJobBuckets.image.length} image, {mediaJobBuckets.video.length} video, {mediaJobBuckets['3d'].length} plan-only 3D.
          </p>
          {mediaJobs.length > 0 ? (
            <div data-testid="production-media-job-list" style={{ display: 'grid', gap: 12, marginTop: 12 }}>
              {(['image', 'video', '3d'] as const).map((kind) => {
                const jobs = mediaJobBuckets[kind];
                return (
                  <article key={kind} className="production-workspace__lane-card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <strong>{kind === '3d' ? '3D 規劃' : `${kind === 'image' ? '圖片' : '影片'} queue`}</strong>
                        <p style={{ margin: '4px 0 0', color: '#94a3b8' }}>
                          {kind === '3d'
                            ? '先保留成畫布規劃，不直接送 daemon。'
                            : '這一欄會同步到 FAL.ai / daemon。'}
                        </p>
                      </div>
                      <span className="production-task-card__pill">{jobs.length}</span>
                    </div>
                    {jobs.length > 0 ? (
                      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                        {jobs.map((job) => (
                          <div key={job.id}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                              <strong>{job.segmentId}</strong>
                              <span className="production-task-card__pill">{job.status}</span>
                            </div>
                            <p style={{ margin: '8px 0 0' }}>
                              {job.kind} / {job.model}
                            </p>
                            {job.taskId ? <p style={{ margin: '8px 0 0', color: '#94a3b8' }}>task {job.taskId}</p> : null}
                            {job.progress.length > 0 ? <p style={{ margin: '8px 0 0', color: '#94a3b8' }}>{job.progress.at(-1)}</p> : null}
                            <p style={{ margin: '8px 0 0', color: '#94a3b8' }}>{job.prompt}</p>
                            {job.error ? <p style={{ margin: '8px 0 0', color: '#fda4af' }}>{job.error}</p> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <p style={{ marginTop: 12, color: '#94a3b8' }}>No FAL.ai jobs queued yet.</p>
          )}
          <p style={{ marginTop: 12, color: '#94a3b8' }}>
            3D is intentionally plan-only until we confirm a supported FAL daemon surface.
          </p>
        </section>
      </div>
    </section>
  );
}
