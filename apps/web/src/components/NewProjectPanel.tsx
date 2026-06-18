import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@open-design/components';
import { createTabToTracking } from '@open-design/contracts/analytics';
import { isOpenDesignHostAvailable, pickHostWorkingDir } from '@open-design/host';
import type { OpenDesignHostProjectImportSuccess } from '@open-design/host';
import { useAnalytics } from '../analytics/provider';
import {
  trackDesignSystemApplyResult,
  trackNewProjectModalElementClick,
  trackNewProjectModalSurfaceView,
  trackNewProjectModalTabClick,
} from '../analytics/events';
import type { ConnectorDetail } from '@open-design/contracts';
import type {
  TrackingDesignSystemApplyTargetKind,
  TrackingDesignSystemOrigin,
  TrackingDesignSystemStatusValue,
} from '@open-design/contracts/analytics';

import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import { fetchPromptTemplate, openFolderDialog } from '../providers/registry';
import { isStoredMediaProviderEntryPresent } from '../state/config';
import { isMediaProviderPickerReady } from '../media/provider-readiness';
import type {
  AudioKind,
  DesignSystemSummary,
  MediaAspect,
  ProjectKind,
  ProjectMetadata,
  ProjectPlatform,
  ProjectTemplate,
  MediaProviderCredentials,
  PromptTemplateSummary,
  SkillSummary,
} from '../types';
import {
  AUDIO_DURATIONS_SEC,
  AUDIO_MODELS_BY_KIND,
  DEFAULT_AUDIO_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  findProvider,
  IMAGE_MODELS,
  MEDIA_ASPECTS,
  type MediaModel,
  VIDEO_LENGTHS_SEC,
  VIDEO_MODELS,
} from '../media/models';
import {
  mergeAihubmixModels,
  useAIHubMixImageModels,
  useAIHubMixVideoModels,
  useAIHubMixAudioModels,
} from '../media/aihubmix-image-models';
import { formatPickAndImportFailure } from '../utils/pickAndImportError';
import { Icon } from './Icon';
import { Skeleton } from './Loading';
import { Toast } from './Toast';
import { useOpenFolderImport } from './useOpenFolderImport';

// Snapshot of a curated prompt template, captured at New Project time and
// folded into ProjectMetadata.promptTemplate. The user may have edited the
// prompt body before clicking Create — that edited copy lives here.
type PromptTemplatePick = {
  summary: PromptTemplateSummary;
  prompt: string;
};

const SFX_AUDIO_DURATIONS_SEC = AUDIO_DURATIONS_SEC.filter((sec) => sec <= 30);

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

type NewProjectPlatform = Exclude<ProjectPlatform, 'auto'>;

const DESIGN_PLATFORMS: Array<{
  value: NewProjectPlatform;
  labelKey: keyof Dict;
  hintKey: keyof Dict;
}> = [
  {
    value: 'responsive',
    labelKey: 'newproj.platform.responsive.label',
    hintKey: 'newproj.platform.responsive.hint',
  },
  {
    value: 'web-desktop',
    labelKey: 'newproj.platform.webDesktop.label',
    hintKey: 'newproj.platform.webDesktop.hint',
  },
  {
    value: 'mobile-ios',
    labelKey: 'newproj.platform.mobileIos.label',
    hintKey: 'newproj.platform.mobileIos.hint',
  },
  {
    value: 'mobile-android',
    labelKey: 'newproj.platform.mobileAndroid.label',
    hintKey: 'newproj.platform.mobileAndroid.hint',
  },
  {
    value: 'tablet',
    labelKey: 'newproj.platform.tablet.label',
    hintKey: 'newproj.platform.tablet.hint',
  },
  {
    value: 'desktop-app',
    labelKey: 'newproj.platform.desktopApp.label',
    hintKey: 'newproj.platform.desktopApp.hint',
  },
];

export type CreateTab = 'prototype' | 'live-artifact' | 'deck' | 'template' | 'media' | 'other';
export type MediaSurface = 'image' | 'video' | 'audio';

export interface CreateInput {
  name: string;
  skillId: string | null;
  designSystemId: string | null;
  metadata: ProjectMetadata;
  userWorkingDirToken?: string;
}

export type ImportClaudeDesignOutcome =
  | { ok: true }
  | { ok: false; message?: string; details?: string };

interface Props {
  skills: SkillSummary[];
  designSystems: DesignSystemSummary[];
  defaultDesignSystemId: string | null;
  templates: ProjectTemplate[];
  onDeleteTemplate?: (id: string) => Promise<boolean>;
  promptTemplates: PromptTemplateSummary[];
  onCreate: (input: CreateInput & { requestId?: string }) => void;
  onImportClaudeDesign?: (
    file: File,
  ) => Promise<ImportClaudeDesignOutcome | void> | ImportClaudeDesignOutcome | void;
  // Local-server flow: the daemon-owned native folder picker returns the
  // selected baseDir, then the renderer POSTs `/api/import/folder`.
  onImportFolder?: (baseDir: string) => Promise<void> | void;
  // Host flow: the desktop main process owns the picker dialog and
  // the import call atomically (`pickAndImport` IPC). The renderer
  // never sees the path or the HMAC token; it only receives the
  // host-owned project identifiers and forwards them here so App-level
  // state can refresh through the daemon API.
  onImportFolderResponse?: (response: OpenDesignHostProjectImportSuccess) => Promise<void> | void;
  mediaProviders?: Record<string, MediaProviderCredentials>;
  connectors?: ConnectorDetail[];
  connectorsLoading?: boolean;
  onOpenConnectorsTab?: () => void;
  loading?: boolean;
  initialTab?: CreateTab;
}

const TAB_LABEL_KEYS: Record<CreateTab, keyof Dict> = {
  prototype: 'newproj.tabPrototype',
  'live-artifact': 'newproj.tabLiveArtifact',
  deck: 'newproj.tabDeck',
  template: 'newproj.tabTemplate',
  media: 'newproj.tabMedia',
  other: 'newproj.tabOther',
};

// Maps the New Project tab + media surface to the apply-result target
// kind enum. `media` collapses to image/video/audio inside callers;
// this helper covers the non-media tabs and the live-artifact special
// case. Media surfaces map case-by-case at the call site.
function newProjectTabToApplyKind(
  tab: CreateTab,
): TrackingDesignSystemApplyTargetKind {
  switch (tab) {
    case 'prototype':
      return 'prototype';
    case 'deck':
      return 'slide_deck';
    case 'live-artifact':
      return 'live_artifact';
    case 'media':
      // Media tab has its own surface picker; the apply emission
      // happens before the user selects image/video/audio, so we
      // mark it `unknown` rather than guessing. The picker is also
      // typically hidden under media but the helper stays total.
      return 'unknown';
    case 'template':
    case 'other':
      return 'unknown';
  }
}

// Maps a `DesignSystemSummary.source` value to the DS origin enum used
// by `design_system_apply_result.design_system_source`. The summary
// shape only carries `'built-in' | 'installed' | 'user'`; we map them
// onto the doc's enum: user → manual_create, built-in → official_preset,
// installed → template.
function deriveDesignSystemOrigin(
  system: DesignSystemSummary | undefined,
): TrackingDesignSystemOrigin | undefined {
  if (!system) return undefined;
  switch (system.source) {
    case 'user':
      return 'manual_create';
    case 'built-in':
      return 'official_preset';
    case 'installed':
      return 'template';
    default:
      return 'unknown';
  }
}

function deriveDesignSystemStatusValue(
  system: DesignSystemSummary | undefined,
): TrackingDesignSystemStatusValue | undefined {
  if (!system) return undefined;
  switch (system.status) {
    case 'draft':
    case 'published':
      return system.status;
    default:
      return 'unknown';
  }
}

const MEDIA_SURFACE_LABEL_KEYS: Record<MediaSurface, keyof Dict> = {
  image: 'newproj.surfaceImage',
  video: 'newproj.surfaceVideo',
  audio: 'newproj.surfaceAudio',
};

export function defaultDesignSystemSelection(
  defaultDesignSystemId: string | null,
  designSystems: DesignSystemSummary[],
): string[] {
  if (!defaultDesignSystemId) return [];
  return designSystems.some((d) => d.id === defaultDesignSystemId && (d.status ?? 'published') !== 'draft')
    ? [defaultDesignSystemId]
    : [];
}

function isSelectableProjectDesignSystem(system: DesignSystemSummary): boolean {
  return system.status !== 'draft';
}

export function buildDesignSystemCreateSelection(
  showDesignSystemPicker: boolean,
  selectedIds: string[],
): { primary: string | null; inspirations: string[] } {
  return showDesignSystemPicker
    ? {
        primary: selectedIds[0] ?? null,
        inspirations: selectedIds.slice(1),
      }
    : { primary: null, inspirations: [] };
}

export function NewProjectPanel({
  skills,
  designSystems,
  defaultDesignSystemId,
  templates,
  onDeleteTemplate,
  promptTemplates,
  onCreate,
  onImportClaudeDesign,
  onImportFolder,
  onImportFolderResponse,
  mediaProviders,
  connectors,
  connectorsLoading = false,
  onOpenConnectorsTab,
  loading = false,
  initialTab = 'prototype',
}: Props) {
  const t = useT();
  const analytics = useAnalytics();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [importZipError, setImportZipError] = useState<
    { message: string; details?: string } | null
  >(null);
  const [workingDir, setWorkingDir] = useState<string | null>(null);
  const [workingDirToken, setWorkingDirToken] = useState<string | null>(null);
  const [workingDirPicking, setWorkingDirPicking] = useState(false);
  const [workingDirError, setWorkingDirError] = useState<
    { message: string; details?: string } | null
  >(null);
  const [tab, setTab] = useState<CreateTab>(initialTab);
  // P0 analytics — fire surface_view once per (panel mount, tab) pair so the
  // funnel sees both initial open and tab switches without double-counting on
  // unrelated re-renders. Ref keys on a tab string because the panel is a
  // long-lived component the modal mounts/unmounts as the user opens/closes it.
  const newProjectViewedTabRef = useRef<string | null>(null);
  useEffect(() => {
    if (newProjectViewedTabRef.current === tab) return;
    newProjectViewedTabRef.current = tab;
    trackNewProjectModalSurfaceView(analytics.track, {
      page_name: 'home',
      area: 'new_project_modal',
      tab_name: createTabToTracking(tab),
    });
  }, [tab, analytics.track]);
  // Media tab consolidates image / video / audio. The active surface picks
  // which set of options + skill resolution applies; submission still maps
  // back to the existing image/video/audio ProjectKind branches so the
  // backend contract is unchanged.
  const [mediaSurface, setMediaSurface] = useState<MediaSurface>('image');
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const [tabScroll, setTabScroll] = useState({ left: false, right: false });
  const [name, setName] = useState('');
  // Design-system selection is now an *array* internally so the same
  // component can drive both single-select and multi-select modes without
  // duplicating state. Single-select coerces to length 0/1.
  const selectableDesignSystems = useMemo(
    () => designSystems.filter(isSelectableProjectDesignSystem),
    [designSystems],
  );
  const initialDefaultDsSelection = useMemo(
    () => defaultDesignSystemSelection(defaultDesignSystemId, selectableDesignSystems),
    [defaultDesignSystemId, selectableDesignSystems],
  );
  const [selectedDsIds, setSelectedDsIds] = useState<string[]>(
    () => initialDefaultDsSelection,
  );
  const [dsSelectionTouched, setDsSelectionTouched] = useState(false);
  const [dsMulti, setDsMulti] = useState(false);

  // Per-tab metadata. Tracked independently so switching tabs preserves
  // each tab's pick rather than resetting to defaults.
  const [fidelity, setFidelity] = useState<'wireframe' | 'high-fidelity'>(
    'high-fidelity',
  );
  const [platformTargets, setPlatformTargets] = useState<NewProjectPlatform[]>(['responsive']);
  const [includeLandingPage, setIncludeLandingPage] = useState(false);
  const [includeOsWidgets, setIncludeOsWidgets] = useState(false);
  const [speakerNotes, setSpeakerNotes] = useState(false);
  const [animations, setAnimations] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [imageModel, setImageModel] = useState(DEFAULT_IMAGE_MODEL);
  const [imageAspect, setImageAspect] = useState<MediaAspect>('1:1');
  const [videoModel, setVideoModel] = useState(DEFAULT_VIDEO_MODEL);
  const [videoModelTouched, setVideoModelTouched] = useState(false);
  const [videoAspect, setVideoAspect] = useState<MediaAspect>('16:9');
  const [videoLength, setVideoLength] = useState(5);
  const [audioKind, setAudioKind] = useState<AudioKind>('speech');
  const [audioModel, setAudioModel] = useState(DEFAULT_AUDIO_MODEL.speech);
  const [audioDuration, setAudioDuration] = useState(10);
  const [voice, setVoice] = useState('');
  // Per-surface curated prompt template the user picked. Tracked
  // independently for image vs video so flipping tabs doesn't clobber the
  // other one's pick. The body is editable in-line and the edited copy is
  // what gets carried to the agent — that's the "optimize the template"
  // affordance the design brief asks for.
  const [imagePromptTemplate, setImagePromptTemplate] =
    useState<PromptTemplatePick | null>(null);
  const [videoPromptTemplate, setVideoPromptTemplate] =
    useState<PromptTemplatePick | null>(null);

  // Design system is meaningful only for the structured/visual surfaces
  // (prototype, deck, template, and the freeform "other" canvas). The
  // media surfaces use prompt templates instead — design tokens don't map
  // onto image/video/audio generations, and the picker just adds noise
  // there. Keep this list explicit so future tabs declare their intent.
  const tabSupportsDesignSystem =
    tab === 'prototype' ||
    tab === 'deck' ||
    tab === 'template' ||
    tab === 'other';
  // Orbit briefings ship their own complete visual language baked into
  // example.html and explicitly opt out of DESIGN.md injection via
  // `od.design_system.requires: false`. Hide the picker only for those
  // Orbit scenario skills; the general prototype creation surface should
  // still honor the user's configured default design system even when a
  // non-Orbit default skill does not require one.
  const tabDefaultSkillForcesNoDs = useMemo(() => {
    const tabSkillId = ((): string | null => {
      if (tab === 'prototype' || tab === 'live-artifact') {
        const list = skills.filter((s) => s.mode === 'prototype');
        return list.find((s) => s.defaultFor.includes('prototype'))?.id
          ?? list[0]?.id ?? null;
      }
      if (tab === 'deck') {
        const list = skills.filter((s) => s.mode === 'deck');
        return list.find((s) => s.defaultFor.includes('deck'))?.id
          ?? list[0]?.id ?? null;
      }
      return null;
    })();
    if (!tabSkillId) return false;
    const s = skills.find((x) => x.id === tabSkillId);
    return s
      ? s.scenario === 'orbit' && s.designSystemRequired === false
      : false;
  }, [tab, skills]);
  const showDesignSystemPicker =
    tabSupportsDesignSystem && !tabDefaultSkillForcesNoDs;

  useEffect(() => {
    if (dsSelectionTouched) return;
    setSelectedDsIds(initialDefaultDsSelection);
  }, [dsSelectionTouched, initialDefaultDsSelection]);

  // Fires `design_system_apply_result` with `auto_select` when the
  // picker mounts/refreshes and pre-selects the user's default DS
  // without an explicit click. Only emits once per default-id while
  // the picker is showing, and only while the user hasn't manually
  // changed the selection (so the dashboard separates auto vs manual
  // attribution). The picker visibility guard skips media tabs where
  // the DS picker isn't rendered.
  const autoSelectFiredForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!showDesignSystemPicker) return;
    if (dsSelectionTouched) return;
    const primary = initialDefaultDsSelection[0];
    if (!primary) return;
    if (autoSelectFiredForRef.current === primary) return;
    autoSelectFiredForRef.current = primary;
    const picked = selectableDesignSystems.find((d) => d.id === primary);
    trackDesignSystemApplyResult(analytics.track, {
      page_name: 'home',
      area: 'design_system_picker',
      action: 'auto_select',
      result: 'success',
      target_project_kind: newProjectTabToApplyKind(tab),
      design_system_id: primary,
      design_system_source: deriveDesignSystemOrigin(picked),
      design_system_status: deriveDesignSystemStatusValue(picked),
      design_system_applied: true,
      design_system_selection_mode: 'default',
      is_default: true,
      is_auto_selected: true,
      available_design_system_count: designSystems.length,
      duration_ms: 0,
    });
  }, [
    analytics.track,
    dsSelectionTouched,
    initialDefaultDsSelection,
    selectableDesignSystems,
    showDesignSystemPicker,
    tab,
  ]);

  // When entering the template tab, snap to the first user-saved template
  // if there is one (and we don't already have a valid pick). The template
  // tab no longer offers a built-in fallback — the entire point is to
  // start from a template *the user* created via Share.
  useEffect(() => {
    if (tab !== 'template') return;
    if (templates.length === 0) {
      setTemplateId(null);
      return;
    }
    if (templateId == null || !templates.some((t) => t.id === templateId)) {
      setTemplateId(templates[0]!.id);
    }
  }, [tab, templates, templateId]);

  // The skill the request still routes through — kept so prototype/deck
  // pick a default-rendered skill (so the agent gets the right SKILL.md
  // body) without requiring the user to choose one explicitly.
  const skillIdForTab = useMemo(() => {
    if (tab === 'other') return null;
    if (tab === 'prototype') {
      const list = skills.filter((s) => s.mode === 'prototype');
      return list.find((s) => s.defaultFor.includes('prototype'))?.id
        ?? list[0]?.id
        ?? null;
    }
    if (tab === 'live-artifact') {
      const exact = skills.find((s) => s.id === 'live-artifact' || s.name === 'live-artifact');
      if (exact) return exact.id;
      const hinted = skills.find((s) => {
        const haystack = `${s.id} ${s.name} ${s.description} ${s.triggers.join(' ')}`.toLowerCase();
        return haystack.includes('live artifact') || haystack.includes('live-artifact');
      });
      if (hinted) return hinted.id;
      const prototypes = skills.filter((s) => s.mode === 'prototype');
      return prototypes.find((s) => s.defaultFor.includes('prototype'))?.id
        ?? prototypes[0]?.id
        ?? null;
    }
    if (tab === 'deck') {
      const list = skills.filter((s) => s.mode === 'deck');
      return list.find((s) => s.defaultFor.includes('deck'))?.id
        ?? list[0]?.id
        ?? null;
    }
    if (tab === 'media') {
      const list = skills.filter(
        (s) => s.mode === mediaSurface || s.surface === mediaSurface,
      );
      // The HyperFrames-HTML render path lives in the `hyperframes` skill.
      // When the user has chosen `hyperframes-html` (via dropdown or template),
      // pin the project to that skill explicitly.
      if (mediaSurface === 'video' && videoModel === 'hyperframes-html') {
        const hyper = list.find((s) => s.id === 'hyperframes');
        if (hyper) return hyper.id;
      }
      return list.find((s) => s.defaultFor.includes(mediaSurface))?.id
        ?? list[0]?.id
        ?? null;
    }
    return null;
  }, [tab, mediaSurface, skills, videoModel]);

  // When the user picks a curated prompt template, propagate the template's
  // declared `model` and `aspect` onto the actual project state. Without
  // this the user picks (e.g.) a HyperFrames template but `videoModel`
  // stays on the default seedance — the agent then dispatches the wrong
  // model and the render path mismatches the prompt.
  function handleImagePromptTemplate(pick: PromptTemplatePick | null) {
    setImagePromptTemplate(pick);
    const m = pick?.summary.model;
    // Accept catalogued ids plus any live AIHubMix catalogue id (aihubmix-*),
    // which renders dynamically and won't appear in the static IMAGE_MODELS.
    if (m && (IMAGE_MODELS.some((x) => x.id === m) || m.startsWith('aihubmix-'))) setImageModel(m);
    const a = pick?.summary.aspect;
    if (a && (MEDIA_ASPECTS as readonly string[]).includes(a)) {
      setImageAspect(a as MediaAspect);
    }
  }
  function handleVideoPromptTemplate(pick: PromptTemplatePick | null) {
    setVideoPromptTemplate(pick);
    const m = pick?.summary.model;
    if (m && VIDEO_MODELS.some((x) => x.id === m)) {
      setVideoModel(m);
      setVideoModelTouched(true);
    }
    const a = pick?.summary.aspect;
    if (a && (MEDIA_ASPECTS as readonly string[]).includes(a)) {
      setVideoAspect(a as MediaAspect);
    }
  }
  function handleVideoModel(id: string) {
    setVideoModel(id);
    setVideoModelTouched(true);
  }

  // The HyperFrames skill renders HTML compositions through a local
  // `npx hyperframes render` path, which dispatches under the
  // `hyperframes-html` model — not seedance/veo/sora. When the resolved
  // skill for the video tab is hyperframes, default `videoModel` so the
  // model dropdown matches the actual render path. Once the user has
  // explicitly chosen a model (via the dropdown or by picking a template
  // that declares a model), `videoModelTouched` latches and this effect
  // becomes a no-op for the rest of the panel session — re-entering the
  // Media tab's Video surface no longer silently rewrites their override back to
  // hyperframes-html.
  useEffect(() => {
    if (tab !== 'media' || mediaSurface !== 'video') return;
    if (skillIdForTab !== 'hyperframes') return;
    if (videoModelTouched) return;
    if (videoPromptTemplate) return;
    if (!VIDEO_MODELS.some((m) => m.id === 'hyperframes-html')) return;
    setVideoModel('hyperframes-html');
    // Intentionally leaving videoPromptTemplate / videoModel out of deps
    // so this only fires when the user toggles the tab or the skill
    // resolution shifts — not whenever the user changes the dropdown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, mediaSurface, skillIdForTab, videoModelTouched]);

  const canCreate =
    !loading && (tab !== 'template' || templateId != null);

  function updateTabScrollState() {
    const el = tabsRef.current;
    if (!el) return;
    const maxLeft = el.scrollWidth - el.clientWidth;
    setTabScroll({
      left: el.scrollLeft > 2,
      right: el.scrollLeft < maxLeft - 2,
    });
  }

  function scrollTabs(direction: -1 | 1) {
    const el = tabsRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction * Math.max(120, el.clientWidth * 0.65),
      behavior: 'smooth',
    });
  }

  function handleDesignSystemChange(ids: string[]) {
    setDsSelectionTouched(true);
    setSelectedDsIds(ids);
    const previousPrimary = selectedDsIds[0] ?? null;
    const nextPrimary = ids[0] ?? null;
    // Only emit when the primary actually changed; secondary reorders
    // inside multi-select don't count as a fresh apply.
    if (previousPrimary === nextPrimary) return;
    const targetKind = newProjectTabToApplyKind(tab);
    if (ids.length === 0) {
      trackDesignSystemApplyResult(analytics.track, {
        page_name: 'home',
        area: 'design_system_picker',
        action: 'clear_selection',
        result: 'success',
        target_project_kind: targetKind,
        design_system_applied: false,
        design_system_selection_mode: 'none',
        is_default: false,
        is_auto_selected: false,
        available_design_system_count: designSystems.length,
        duration_ms: 0,
      });
      return;
    }
    if (!nextPrimary) return;
    const picked = designSystems.find((d) => d.id === nextPrimary);
    const isDefault = nextPrimary === defaultDesignSystemId;
    trackDesignSystemApplyResult(analytics.track, {
      page_name: 'home',
      area: 'design_system_picker',
      action: 'select_design_system',
      result: 'success',
      target_project_kind: targetKind,
      design_system_id: nextPrimary,
      design_system_source: deriveDesignSystemOrigin(picked),
      design_system_status: deriveDesignSystemStatusValue(picked),
      design_system_applied: true,
      design_system_selection_mode: isDefault ? 'default' : 'manual',
      is_default: isDefault,
      // `is_auto_selected` reports whether this row was picked by the
      // app (initial default selection from `initialDefaultDsSelection`)
      // rather than by the user. Once `dsSelectionTouched` is set we
      // know any subsequent change came from a click.
      is_auto_selected: false,
      available_design_system_count: designSystems.length,
      duration_ms: 0,
    });
  }

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    updateTabScrollState();
    const onScroll = () => updateTabScrollState();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(updateTabScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    const el = tabsRef.current;
    const active = el?.querySelector<HTMLButtonElement>('.newproj-tab.active');
    active?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    window.setTimeout(updateTabScrollState, 180);
  }, [tab]);

  function handleCreate() {
    if (!canCreate) return;
    // Media surfaces don't carry a design system pick. Force the primary
    // and inspiration ids to empty there so the New Project panel can't
    // accidentally bind a stale DS that the user can no longer see in the
    // form (the picker is hidden for image/video/audio).
    const { primary: primaryDs, inspirations } =
      buildDesignSystemCreateSelection(showDesignSystemPicker, selectedDsIds);
    const promptTemplatePick =
      tab === 'media'
        ? mediaSurface === 'image'
          ? imagePromptTemplate
          : mediaSurface === 'video'
            ? videoPromptTemplate
            : null
        : null;
    const trimmedName = name.trim();
    const metadata = buildMetadata({
      tab,
      mediaSurface,
      fidelity,
      platformTargets,
      includeLandingPage,
      includeOsWidgets,
      speakerNotes,
      animations,
      templateId,
      templates,
      imageModel,
      imageAspect,
      videoModel,
      videoAspect,
      videoLength,
      audioKind,
      audioModel,
      audioDuration,
      voice,
      inspirationIds: inspirations,
      promptTemplate: promptTemplatePick,
    });
    // Generate the click→result correlation id here so the home_click and
    // the eventual project_create_result share request_id.
    const requestId = analytics.newRequestId();
    // v2 emits ui_click element=create on the New project modal; the
    // project_create_result correlated through `requestId` carries the
    // project_kind / fidelity payload, so we no longer duplicate them
    // on the click event.
    trackNewProjectModalElementClick(
      analytics.track,
      {
        page_name: 'home',
        area: 'new_project_modal',
        element: 'create',
        tab_name: createTabToTracking(tab),
      },
      { requestId },
    );
    onCreate({
      name: trimmedName || autoName(tab, mediaSurface, t),
      skillId: skillIdForTab,
      designSystemId: primaryDs,
      metadata: {
        ...metadata,
        nameSource: trimmedName ? 'user' : 'generated',
        ...(workingDir ? { userWorkingDir: workingDir } : {}),
      },
      ...(workingDirToken ? { userWorkingDirToken: workingDirToken } : {}),
      requestId,
    });
  }

  async function handlePickWorkingDir() {
    if (workingDirPicking) return;
    setWorkingDirPicking(true);
    setWorkingDirError(null);
    try {
      if (isOpenDesignHostAvailable()) {
        const result = await pickHostWorkingDir();
        if (result.ok) {
          setWorkingDir(result.baseDir);
          setWorkingDirToken(result.token);
          return;
        }
        if ('canceled' in result && result.canceled) return;
        setWorkingDirError({
          message: `Couldn't open the folder picker (${'reason' in result ? result.reason : 'host unavailable'}). Please update Open Design and try again.`,
        });
        return;
      }
      const picked = await openFolderDialog();
      if (picked) {
        setWorkingDir(picked);
        setWorkingDirToken(null);
      }
    } finally {
      setWorkingDirPicking(false);
    }
  }

  async function handleImportPicked(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file || !onImportClaudeDesign) return;
    setImporting(true);
    setImportZipError(null);
    try {
      const result = await onImportClaudeDesign(file);
      if (result?.ok === false) {
        setImportZipError({
          message: result.message ? `Import failed: ${result.message}` : 'Import failed',
          details: result.details,
        });
      }
    } catch (err) {
      setImportZipError({
        message: err instanceof Error ? `Import failed: ${err.message}` : 'Import failed',
      });
    } finally {
      setImporting(false);
    }
  }

  const folderImport = useOpenFolderImport({
    skillId: skillIdForTab,
    onImportFolder,
    onImportFolderResponse,
  });

  return (
    <div className="newproj" data-testid="new-project-panel">
      <div className={`newproj-tabs-shell${tabScroll.left ? ' can-left' : ''}${tabScroll.right ? ' can-right' : ''}`}>
        <button
          type="button"
          className={`newproj-tabs-arrow left${tabScroll.left ? '' : ' hidden'}`}
          onClick={() => scrollTabs(-1)}
          aria-label="Scroll project types left"
          tabIndex={tabScroll.left ? 0 : -1}
        >
          <Icon name="chevron-left" size={16} strokeWidth={2} />
        </button>
        <div className="newproj-tabs" role="tablist" ref={tabsRef}>
          {(Object.keys(TAB_LABEL_KEYS) as CreateTab[]).map((entry) => (
            <button
              key={entry}
              role="tab"
              data-testid={`new-project-tab-${entry}`}
              aria-selected={tab === entry}
              className={`newproj-tab ${tab === entry ? 'active' : ''}`}
              onClick={() => {
                if (entry !== tab) {
                  trackNewProjectModalTabClick(analytics.track, {
                    page_name: 'home',
                    area: 'new_project_modal',
                    element: 'tab',
                    tab_name: createTabToTracking(entry),
                  });
                }
                setTab(entry);
              }}
            >
              {t(TAB_LABEL_KEYS[entry])}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`newproj-tabs-arrow right${tabScroll.right ? '' : ' hidden'}`}
          onClick={() => scrollTabs(1)}
          aria-label="Scroll project types right"
          tabIndex={tabScroll.right ? 0 : -1}
        >
          <Icon name="chevron-right" size={16} strokeWidth={2} />
        </button>
      </div>
      <div className="newproj-body">
        <h3 className="newproj-title">
          <span className="newproj-title-text">{titleForTab(tab, mediaSurface, t)}</span>
          {tab === 'live-artifact' ? (
            // "Beta" is an internationally adopted brand-style status marker;
            // intentionally not run through t() (consistent with short product
            // status pills that read the same across our supported locales).
            <span className="newproj-title-badge" aria-label="Beta feature">Beta</span>
          ) : null}
        </h3>

        <div className="newproj-name-row">
          <input
            className="newproj-name"
            data-testid="new-project-name"
            placeholder={t('newproj.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="newproj-working-dir-row">
          <button
            type="button"
            className={`ghost newproj-working-dir od-tooltip${workingDir ? ' picked' : ''}`}
            onClick={() => void handlePickWorkingDir()}
            disabled={workingDirPicking}
            title={workingDir ?? t('workingDirPicker.homeTitle')}
            data-tooltip={workingDir ?? t('workingDirPicker.homeTitle')}
          >
            <Icon name="folder" size={13} />
            <span>
              {workingDirPicking
                ? t('workingDirPicker.processing')
                : workingDir
                  ? displayFolderName(workingDir)
                  : t('workingDirPicker.select')}
            </span>
          </button>
          {workingDir ? (
            <button
              type="button"
              className="newproj-working-dir-clear"
              onClick={() => {
                setWorkingDir(null);
                setWorkingDirToken(null);
              }}
              aria-label={t('workingDirPicker.clearAria')}
            >
              <Icon name="close" size={10} />
            </button>
          ) : null}
        </div>

        {showDesignSystemPicker ? (
          <DesignSystemPicker
            designSystems={selectableDesignSystems}
            defaultDesignSystemId={defaultDesignSystemId}
            selectedIds={selectedDsIds}
            multi={dsMulti}
            onChangeMulti={setDsMulti}
            onChange={handleDesignSystemChange}
            loading={loading}
          />
        ) : null}

        {tab === 'media' ? (
          <div
            className="newproj-media-segmented"
            role="tablist"
            aria-label={t('newproj.tabMedia')}
          >
            {(Object.keys(MEDIA_SURFACE_LABEL_KEYS) as MediaSurface[]).map((surface) => (
              <button
                key={surface}
                type="button"
                role="tab"
                data-testid={`new-project-media-surface-${surface}`}
                aria-selected={mediaSurface === surface}
                className={`newproj-media-surface ${mediaSurface === surface ? 'active' : ''}`}
                onClick={() => setMediaSurface(surface)}
              >
                {t(MEDIA_SURFACE_LABEL_KEYS[surface])}
              </button>
            ))}
          </div>
        ) : null}

        {tab === 'media' && mediaSurface === 'image' ? (
          <PromptTemplatePicker
            surface="image"
            templates={promptTemplates}
            value={imagePromptTemplate}
            onChange={handleImagePromptTemplate}
          />
        ) : null}

        {tab === 'media' && mediaSurface === 'video' ? (
          <PromptTemplatePicker
            surface="video"
            templates={promptTemplates}
            value={videoPromptTemplate}
            onChange={handleVideoPromptTemplate}
          />
        ) : null}

        {tab === 'prototype' || tab === 'live-artifact' || tab === 'template' || tab === 'other' ? (
          <PlatformPicker value={platformTargets} onChange={setPlatformTargets} />
        ) : null}

        {tab === 'prototype' || tab === 'live-artifact' || tab === 'template' || tab === 'other' ? (
          <SurfaceOptions
            includeLandingPage={includeLandingPage}
            includeOsWidgets={includeOsWidgets}
            onIncludeLandingPage={setIncludeLandingPage}
            onIncludeOsWidgets={setIncludeOsWidgets}
          />
        ) : null}

        {/* Live artifact always renders at high fidelity — its whole point
            is data-bound polished UI, so the wireframe option is hidden. */}
        {tab === 'prototype' ? (
          <FidelityPicker value={fidelity} onChange={setFidelity} />
        ) : null}

        {tab === 'live-artifact' ? (
          <ConnectorsSection
            connectors={connectors}
            loading={connectorsLoading}
            onOpenConnectorsTab={onOpenConnectorsTab}
          />
        ) : null}

        {tab === 'deck' ? (
          <ToggleRow
            label={t('newproj.toggleSpeakerNotes')}
            hint={t('newproj.toggleSpeakerNotesHint')}
            checked={speakerNotes}
            onChange={setSpeakerNotes}
          />
        ) : null}

        {tab === 'template' ? (
          <>
            <TemplatePicker
              templates={templates}
              value={templateId}
              onChange={setTemplateId}
              onDelete={onDeleteTemplate}
            />
            <ToggleRow
              label={t('newproj.toggleAnimations')}
              hint={t('newproj.toggleAnimationsHint')}
              checked={animations}
              onChange={setAnimations}
            />
          </>
        ) : null}

        {tab === 'media' && mediaSurface === 'image' ? (
          <MediaProjectOptions
            surface="image"
            imageModel={imageModel}
            imageAspect={imageAspect}
            mediaProviders={mediaProviders}
            onImageModel={setImageModel}
            onImageAspect={setImageAspect}
          />
        ) : null}

        {tab === 'media' && mediaSurface === 'video' ? (
          <MediaProjectOptions
            surface="video"
            videoModel={videoModel}
            videoAspect={videoAspect}
            videoLength={videoLength}
            mediaProviders={mediaProviders}
            onVideoModel={handleVideoModel}
            onVideoAspect={setVideoAspect}
            onVideoLength={setVideoLength}
          />
        ) : null}

        {tab === 'media' && mediaSurface === 'audio' ? (
          <MediaProjectOptions
            surface="audio"
            audioKind={audioKind}
            audioModel={audioModel}
            audioDuration={audioDuration}
            voice={voice}
            mediaProviders={mediaProviders}
            onAudioKind={(kind) => {
              setAudioKind(kind);
              setAudioModel(DEFAULT_AUDIO_MODEL[kind]);
              if (kind === 'sfx') {
                setAudioDuration((duration) => Math.min(duration, SFX_AUDIO_DURATIONS_SEC.at(-1) ?? 30));
              }
            }}
            onAudioModel={setAudioModel}
            onAudioDuration={setAudioDuration}
            onVoice={setVoice}
          />
        ) : null}

        <button
          className="primary newproj-create"
          data-testid="create-project"
          onClick={handleCreate}
          disabled={!canCreate}
          title={
            tab === 'template' && templateId == null
              ? t('newproj.createDisabledTitle')
              : undefined
          }
        >
          <Icon name="plus" size={13} />
          <span>
            {tab === 'template'
              ? t('newproj.createFromTemplate')
              : tab === 'live-artifact'
                ? t('newproj.createLiveArtifact')
              : t('newproj.create')}
          </span>
        </button>
        {onImportClaudeDesign ? (
          <>
            <input
              ref={importInputRef}
              type="file"
              accept=".zip,application/zip"
              hidden
              onChange={handleImportPicked}
            />
            <button
              type="button"
              className="ghost newproj-import"
              disabled={loading || importing}
              title={t('newproj.importClaudeZipTitle')}
              onClick={() => importInputRef.current?.click()}
            >
              <Icon name="import" size={13} />
              <span>
                {importing
                  ? t('newproj.importingClaudeZip')
                  : t('newproj.importClaudeZip')}
              </span>
            </button>
          </>
        ) : null}
        {folderImport.available ? (
          <div className="newproj-open-folder">
            <button
              type="button"
              className="ghost newproj-import"
              disabled={folderImport.importing}
              onClick={() => void folderImport.openFolder()}
            >
              <Icon name="folder" size={13} />
              <span>{folderImport.importing ? 'Opening...' : 'Open folder'}</span>
            </button>
          </div>
        ) : null}
      </div>
      <div className="newproj-footer">{t('newproj.privacyFooter')}</div>
      {importZipError ? (
        <Toast
          message={importZipError.message}
          details={importZipError.details ?? null}
          ttlMs={6000}
          onDismiss={() => setImportZipError(null)}
        />
      ) : null}
      {folderImport.error ? (
        <Toast
          message={folderImport.error.message}
          details={folderImport.error.details ?? null}
          ttlMs={6000}
          onDismiss={folderImport.clearError}
        />
      ) : null}
      {workingDirError ? (
        <Toast
          message={workingDirError.message}
          details={workingDirError.details ?? null}
          ttlMs={6000}
          onDismiss={() => setWorkingDirError(null)}
        />
      ) : null}
    </div>
  );
}

function displayFolderName(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path;
}

function PlatformPicker({
  value,
  onChange,
}: {
  value: NewProjectPlatform[];
  onChange: (v: NewProjectPlatform[]) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  function togglePlatform(next: NewProjectPlatform) {
    const active = value.includes(next);
    const updated = active
      ? value.filter((item) => item !== next)
      : [...value, next];
    onChange(updated.length > 0 ? updated : ['responsive']);
  }

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    // Defer listener registration by a tick so the very click that opened
    // the popover doesn't get re-interpreted as an outside-click on the
    // mousedown that follows in the same event cycle.
    const tid = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointer);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(tid);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const primary = DESIGN_PLATFORMS.find((o) => o.value === value[0]) ?? null;
  const extraCount = Math.max(0, value.length - 1);

  return (
    <div
      className={`newproj-section ds-picker platform-picker${open ? ' open' : ''}`}
      ref={wrapRef}
    >
      <label className="newproj-label">Target platforms</label>
      <button
        type="button"
        className={`ds-picker-trigger${open ? ' open' : ''}${primary ? '' : ' empty'}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
      >
        <span className="ds-picker-meta">
          <span className="ds-picker-title">
            {primary ? t(primary.labelKey) : 'Pick a platform'}
            {extraCount > 0 ? (
              <span className="ds-picker-extra-pill">+{extraCount}</span>
            ) : null}
          </span>
        </span>
        <Icon
          name="chevron-down"
          size={14}
          className="ds-picker-chevron"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        />
      </button>
      {open ? (
        <div
          className="ds-picker-popover"
          id={listboxId}
          role="listbox"
          aria-label="Target platforms"
          aria-multiselectable="true"
        >
          <div className="ds-picker-list">
            {DESIGN_PLATFORMS.map((option) => {
              const active = value.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`ds-picker-item${active ? ' active' : ''}`}
                  onClick={() => togglePlatform(option.value)}
                >
                  <span className="ds-picker-item-text">
                    <span className="ds-picker-item-title">{t(option.labelKey)}</span>
                    <span className="ds-picker-item-sub">{t(option.hintKey)}</span>
                  </span>
                  <span
                    className={`ds-picker-mark check${active ? ' active' : ''}`}
                    aria-hidden
                  >
                    {active ? '✓' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SurfaceOptions({
  includeLandingPage,
  includeOsWidgets,
  onIncludeLandingPage,
  onIncludeOsWidgets,
}: {
  includeLandingPage: boolean;
  includeOsWidgets: boolean;
  onIncludeLandingPage: (v: boolean) => void;
  onIncludeOsWidgets: (v: boolean) => void;
}) {
  const t = useT();
  return (
    <div className="newproj-section surface-options">
      <label className="newproj-label">{t('newproj.surfaceOptionsLabel')}</label>
      <div className="compact-toggle-list">
        <CompactToggle
          label={t('newproj.includeLandingPage')}
          hint={t('newproj.includeLandingPageHint')}
          checked={includeLandingPage}
          onChange={onIncludeLandingPage}
        />
        <CompactToggle
          label={t('newproj.includeOsWidgets')}
          hint={t('newproj.includeOsWidgetsHint')}
          checked={includeOsWidgets}
          onChange={onIncludeOsWidgets}
        />
      </div>
    </div>
  );
}

// Lightweight inline toggle row. The hint moves to a native tooltip so the
// row stays one line tall — used by SurfaceOptions where the toggles are
// secondary controls and the full card treatment of ToggleRow felt too heavy.
function CompactToggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`compact-toggle${checked ? ' on' : ''}${disabled ? ' disabled' : ''}`}
      onClick={() => { if (!disabled) onChange(!checked); }}
      aria-pressed={checked}
      disabled={disabled}
      title={hint}
    >
      <span className="compact-toggle-label">{label}</span>
      <span className="compact-toggle-switch" aria-hidden />
    </button>
  );
}

function FidelityPicker({
  value,
  onChange,
}: {
  value: 'wireframe' | 'high-fidelity';
  onChange: (v: 'wireframe' | 'high-fidelity') => void;
}) {
  const t = useT();
  return (
    <div className="newproj-section">
      <label className="newproj-label">{t('newproj.fidelityLabel')}</label>
      <div className="fidelity-grid">
        <FidelityCard
          active={value === 'wireframe'}
          onClick={() => onChange('wireframe')}
          label={t('newproj.fidelityWireframe')}
          variant="wireframe"
        />
        <FidelityCard
          active={value === 'high-fidelity'}
          onClick={() => onChange('high-fidelity')}
          label={t('newproj.fidelityHigh')}
          variant="high-fidelity"
        />
      </div>
    </div>
  );
}

/* ============================================================
   Connectors section (live-artifact only).
   - Lists configured connectors as compact chips so the user can
     see at a glance what data sources this artifact can pull from.
   - When no connector is configured (or the list hasn't loaded yet
     and ended up empty), shows a guidance card that, on click, opens
     the Settings → Connectors surface (the new home of the catalog).
   ============================================================ */
function ConnectorsSection({
  connectors,
  loading,
  onOpenConnectorsTab,
}: {
  connectors?: ConnectorDetail[];
  loading: boolean;
  onOpenConnectorsTab?: () => void;
}) {
  const t = useT();
  const configured = useMemo(
    () => (connectors ?? []).filter((c) => c.status === 'connected'),
    [connectors],
  );
  const hasConfigured = configured.length > 0;

  if (loading && !connectors) {
    return (
      <div className="newproj-section newproj-connectors">
        <label className="newproj-label">{t('newproj.connectorsLabel')}</label>
        <Skeleton height={56} width="100%" radius={8} />
      </div>
    );
  }

  return (
    <div
      className="newproj-section newproj-connectors"
      data-testid="new-project-connectors"
    >
      <div className="newproj-connectors-head">
        <label className="newproj-label">{t('newproj.connectorsLabel')}</label>
        {hasConfigured ? (
          <button
            type="button"
            className="newproj-connectors-manage"
            onClick={() => onOpenConnectorsTab?.()}
            data-testid="new-project-connectors-manage"
          >
            {t('newproj.connectorsManage')}
          </button>
        ) : null}
      </div>

      {hasConfigured ? (
        <>
          <span className="newproj-connectors-hint">
            {configured.length === 1
              ? t('newproj.connectorsCountOne', { n: configured.length })
              : t('newproj.connectorsCountMany', { n: configured.length })}
            <span aria-hidden> · </span>
            {t('newproj.connectorsHint')}
          </span>
          <ul className="newproj-connectors-list" aria-label={t('newproj.connectorsLabel')}>
            {configured.map((c) => (
              <li
                key={c.id}
                className="newproj-connector-chip"
                title={c.name}
              >
                <span className="newproj-connector-dot" aria-hidden />
                <span className="newproj-connector-name">{c.name}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <button
          type="button"
          className="newproj-connectors-empty"
          onClick={() => onOpenConnectorsTab?.()}
          data-testid="new-project-connectors-empty"
          aria-label={t('newproj.connectorsEmptyCta')}
        >
          <span className="newproj-connectors-empty-icon" aria-hidden>
            <Icon name="link" size={14} />
          </span>
          <span className="newproj-connectors-empty-text">
            <span className="newproj-connectors-empty-title">
              {t('newproj.connectorsEmptyTitle')}
            </span>
            <span className="newproj-connectors-empty-body">
              {t('newproj.connectorsEmptyBody')}
            </span>
            <span className="newproj-connectors-empty-cta">
              {t('newproj.connectorsEmptyCta')}
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

function FidelityCard({
  active,
  onClick,
  label,
  variant,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  variant: 'wireframe' | 'high-fidelity';
}) {
  return (
    <button
      type="button"
      className={`fidelity-card${active ? ' active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className={`fidelity-thumb fidelity-thumb-${variant}`} aria-hidden>
        {variant === 'wireframe' ? <WireframeArt /> : <HighFidelityArt />}
      </span>
      <span className="fidelity-label">{label}</span>
    </button>
  );
}

function WireframeArt() {
  return (
    <svg viewBox="0 0 120 70" width="100%" height="100%" aria-hidden>
      <rect x="6" y="8" width="46" height="6" rx="2" fill="#d8d4cb" />
      <rect x="6" y="20" width="34" height="4" rx="2" fill="#ebe8e1" />
      <rect x="6" y="28" width="38" height="4" rx="2" fill="#ebe8e1" />
      <rect x="6" y="36" width="30" height="4" rx="2" fill="#ebe8e1" />
      <circle cx="22" cy="56" r="6" fill="none" stroke="#d8d4cb" strokeWidth="1.4" />
      <rect x="64" y="8" width="50" height="54" rx="3" fill="none" stroke="#d8d4cb" strokeWidth="1.4" />
      <rect x="70" y="14" width="38" height="4" rx="2" fill="#ebe8e1" />
      <rect x="70" y="22" width="32" height="4" rx="2" fill="#ebe8e1" />
      <rect x="70" y="30" width="38" height="4" rx="2" fill="#ebe8e1" />
    </svg>
  );
}

function HighFidelityArt() {
  return (
    <svg viewBox="0 0 120 70" width="100%" height="100%" aria-hidden>
      <rect x="6" y="8" width="34" height="6" rx="2" fill="#1a1916" />
      <rect x="6" y="20" width="46" height="4" rx="2" fill="#74716b" />
      <rect x="6" y="28" width="42" height="4" rx="2" fill="#b3b0a8" />
      <rect x="6" y="40" width="22" height="9" rx="2" fill="#c96442" />
      <rect x="64" y="8" width="50" height="54" rx="4" fill="#fbeee5" />
      <rect x="70" y="14" width="38" height="4" rx="2" fill="#c96442" />
      <rect x="70" y="22" width="32" height="3" rx="1.5" fill="#74716b" />
      <rect x="70" y="29" width="36" height="3" rx="1.5" fill="#b3b0a8" />
      <rect x="70" y="36" width="20" height="6" rx="2" fill="#c96442" />
    </svg>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`toggle-row${checked ? ' on' : ''}${disabled ? ' disabled' : ''}`}
      onClick={() => { if (!disabled) onChange(!checked); }}
      aria-pressed={checked}
      disabled={disabled}
    >
      <div className="toggle-row-text">
        <span className="toggle-row-label">{label}</span>
        {hint ? <span className="toggle-row-hint">{hint}</span> : null}
      </div>
      <span className="toggle-row-switch" aria-hidden />
    </button>
  );
}

function TemplatePicker({
  templates,
  value,
  onChange,
  onDelete,
}: {
  templates: ProjectTemplate[];
  value: string | null;
  onChange: (id: string | null) => void;
  onDelete?: (id: string) => Promise<boolean>;
}) {
  const t = useT();
  const deleteTemplateTitleId = useId();
  const [confirmDelete, setConfirmDelete] = useState<
    { id: string; name: string } | null
  >(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  function closeConfirm() {
    setConfirmDelete(null);
    setDeleting(false);
    setDeleteError(false);
  }

  async function runDelete() {
    if (!confirmDelete || !onDelete) return;
    setDeleting(true);
    setDeleteError(false);
    let ok = false;
    try {
      ok = await onDelete(confirmDelete.id);
    } catch {
      ok = false;
    }
    if (ok) {
      if (value === confirmDelete.id) onChange(null);
      closeConfirm();
    } else {
      setDeleting(false);
      setDeleteError(true);
    }
  }

  return (
    <div className="newproj-section">
      <label className="newproj-label">{t('newproj.templateLabel')}</label>
      {templates.length === 0 ? (
        <div className="template-howto">
          <span className="template-howto-title">
            {t('newproj.noTemplatesTitle')}
          </span>
          <span className="template-howto-body">
            {t('newproj.noTemplatesBody')}
          </span>
        </div>
      ) : (
        <div className="template-list">
          {templates.map((tpl) => {
            const fallbackDesc = `${t('newproj.savedTemplate')} · ${tpl.files.length} ${
              tpl.files.length === 1
                ? t('newproj.fileSingular')
                : t('newproj.filePlural')
            }`;
            return (
              <TemplateOption
                key={tpl.id}
                active={value === tpl.id}
                onClick={() => onChange(tpl.id)}
                onDelete={onDelete ? () => setConfirmDelete({ id: tpl.id, name: tpl.name }) : () => {}}
                name={tpl.name}
                description={tpl.description ?? fallbackDesc}
              />
            );
          })}
        </div>
      )}
      {confirmDelete ? (
        <Dialog
          className="modal-confirm"
          role="alertdialog"
          onClose={deleting ? undefined : closeConfirm}
          ariaLabelledBy={deleteTemplateTitleId}
        >
          <DialogTitle id={deleteTemplateTitleId}>{t('newproj.deleteTemplateTitle')}</DialogTitle>
          <DialogDescription className="modal-confirm-message">
            {t('newproj.deleteTemplateConfirm', { name: confirmDelete.name })}
          </DialogDescription>
          {deleteError ? (
            <p className="modal-confirm-error" role="alert">
              {t('newproj.deleteTemplateError')}
            </p>
          ) : null}
          <DialogFooter className="row">
            <button type="button" onClick={closeConfirm} disabled={deleting}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="primary danger"
              autoFocus
              disabled={deleting}
              onClick={runDelete}
            >
              {t('newproj.deleteTemplateConfirmCta')}
            </button>
          </DialogFooter>
        </Dialog>
      ) : null}
    </div>
  );
}

/* ============================================================
   Prompt template picker — for the image/video tabs only.
   - Trigger card (mirrors the design-system trigger) opens a popover
     with a search field and a thumbnail-card list filtered by surface.
   - When a template is picked we lazily fetch the full prompt body via
     fetchPromptTemplate(...) and drop it into a textarea so the user
     can tune ("optimize") the wording before clicking Create.
   - The (possibly edited) body lands in metadata.promptTemplate.prompt
     and becomes part of the system prompt — the agent treats it as a
     stylistic + structural reference for the generation request.
   ============================================================ */
function PromptTemplatePicker({
  surface,
  templates,
  value,
  onChange,
}: {
  surface: 'image' | 'video';
  templates: PromptTemplateSummary[];
  value: PromptTemplatePick | null;
  onChange: (next: PromptTemplatePick | null) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Last template we tried to pick that failed — kept so the inline
  // banner can offer a one-click retry without making the user re-find
  // the card in the popover (which auto-closed on success). Cleared as
  // soon as a pick succeeds or the user picks a different template.
  const [lastFailedPick, setLastFailedPick] =
    useState<PromptTemplateSummary | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const surfaceScoped = useMemo(
    () => templates.filter((tpl) => tpl.surface === surface),
    [templates, surface],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return surfaceScoped;
    return surfaceScoped.filter((tpl) => {
      return (
        tpl.title.toLowerCase().includes(q) ||
        tpl.summary.toLowerCase().includes(q) ||
        (tpl.category || '').toLowerCase().includes(q) ||
        (tpl.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [surfaceScoped, query]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => searchRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    const id = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointer);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function pickTemplate(summary: PromptTemplateSummary) {
    setLoadingId(summary.id);
    setError(null);
    try {
      const detail = await fetchPromptTemplate(summary.surface, summary.id);
      if (!detail) {
        setError(t('promptTemplates.fetchError'));
        setLastFailedPick(summary);
        return;
      }
      onChange({ summary, prompt: detail.prompt });
      setLastFailedPick(null);
      setOpen(false);
      setQuery('');
    } catch {
      // fetchPromptTemplate already swallows errors and returns null in
      // the happy path; this catch is a defensive net for unexpected
      // throws so the inline banner still surfaces and the user can
      // retry instead of being stuck on a permanent loading spinner.
      setError(t('promptTemplates.fetchError'));
      setLastFailedPick(summary);
    } finally {
      setLoadingId(null);
    }
  }

  function clear() {
    onChange(null);
    setLastFailedPick(null);
    setError(null);
    setOpen(false);
    setQuery('');
  }

  const triggerTitle = value?.summary.title ?? t('newproj.promptTemplateNoneTitle');
  const triggerSub = value
    ? value.summary.category || value.summary.summary || t('newproj.promptTemplateRefSub')
    : t('newproj.promptTemplateNoneSub');

  return (
    <div className="newproj-section ds-picker prompt-template-picker" ref={wrapRef}>
      <label className="newproj-label">{t('newproj.promptTemplateLabel')}</label>
      <button
        type="button"
        data-testid="prompt-template-trigger"
        className={`ds-picker-trigger${open ? ' open' : ''}${value ? '' : ' empty'}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <PromptTemplateAvatar summary={value?.summary ?? null} />
        <span className="ds-picker-meta">
          <span className="ds-picker-title">{triggerTitle}</span>
          <span className="ds-picker-sub">{triggerSub}</span>
        </span>
        <Icon
          name="chevron-down"
          size={14}
          className="ds-picker-chevron"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        />
      </button>
      {open ? (
        <div className="ds-picker-popover" role="listbox">
          <div className="ds-picker-head">
            <input
              ref={searchRef}
              data-testid="prompt-template-search"
              className="ds-picker-search"
              placeholder={t('newproj.promptTemplateSearch')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="ds-picker-list">
            <button
              type="button"
              role="option"
              aria-selected={value === null}
              className={`ds-picker-item${value === null ? ' active' : ''}`}
              onClick={clear}
            >
              <span className="ds-picker-item-avatar">
                <NoneAvatar />
              </span>
              <span className="ds-picker-item-text">
                <span className="ds-picker-item-title">
                  {t('newproj.promptTemplateNoneTitle')}
                </span>
                <span className="ds-picker-item-sub">
                  {t('newproj.promptTemplateNoneSub')}
                </span>
              </span>
            </button>
            {filtered.length === 0 ? (
              <div className="ds-picker-empty">
                {surfaceScoped.length === 0
                  ? t('newproj.promptTemplateEmpty')
                  : t('promptTemplates.emptyNoMatch')}
              </div>
            ) : (
              filtered.map((tpl) => {
                const active = value?.summary.id === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`ds-picker-item${active ? ' active' : ''}`}
                    onClick={() => void pickTemplate(tpl)}
                    disabled={loadingId === tpl.id}
                  >
                    <span className="ds-picker-item-avatar">
                      <PromptTemplateAvatar summary={tpl} />
                    </span>
                    <span className="ds-picker-item-text">
                      <span className="ds-picker-item-title">
                        {tpl.title}
                        {loadingId === tpl.id ? (
                          <span className="ds-picker-item-badge">
                            {t('common.loading')}
                          </span>
                        ) : null}
                      </span>
                      <span className="ds-picker-item-sub">
                        {tpl.summary || tpl.category}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
      {error ? (
        <div
          className="prompt-template-error"
          role="alert"
          data-testid="prompt-template-error"
        >
          <span className="prompt-template-error-msg">{error}</span>
          {lastFailedPick ? (
            <button
              type="button"
              className="ghost prompt-template-error-retry"
              data-testid="prompt-template-retry"
              onClick={() => void pickTemplate(lastFailedPick)}
              disabled={loadingId === lastFailedPick.id}
            >
              {loadingId === lastFailedPick.id
                ? t('common.loading')
                : t('promptTemplates.retry')}
            </button>
          ) : null}
        </div>
      ) : null}
      {value ? (
        <div className="prompt-template-edit">
          <div className="prompt-template-edit-head">
            <span className="prompt-template-edit-label">
              {t('newproj.promptTemplateBodyLabel')}
            </span>
            <span className="prompt-template-edit-hint">
              {t('newproj.promptTemplateOptimizeHint')}
            </span>
          </div>
          <textarea
            data-testid="prompt-template-body"
            className="prompt-template-edit-textarea"
            value={value.prompt}
            rows={6}
            onChange={(e) =>
              onChange({ summary: value.summary, prompt: e.target.value })
            }
          />
          {value.prompt.trim().length === 0 ? (
            <div
              className="prompt-template-edit-empty"
              data-testid="prompt-template-empty-hint"
            >
              {t('newproj.promptTemplateBodyEmpty')}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PromptTemplateAvatar({
  summary,
}: {
  summary: PromptTemplateSummary | null;
}) {
  if (!summary) return <NoneAvatar />;
  if (summary.previewImageUrl) {
    return (
      <span className="ds-avatar prompt-template-avatar" aria-hidden>
        <img
          src={summary.previewImageUrl}
          alt=""
          loading="lazy"
          draggable={false}
        />
      </span>
    );
  }
  return (
    <span className="ds-avatar prompt-template-avatar fallback" aria-hidden>
      <Icon name={summary.surface === 'video' ? 'play' : 'image'} size={14} />
    </span>
  );
}

function TemplateOption({
  active,
  onClick,
  onDelete,
  name,
  description,
}: {
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
  name: string;
  description: string;
}) {
  return (
    <div className={`template-option${active ? ' active' : ''}`}>
      <button
        type="button"
        className="template-option-select"
        onClick={onClick}
        aria-pressed={active}
      >
        <span className={`template-radio${active ? ' active' : ''}`} aria-hidden />
        <span className="template-option-text">
          <span className="template-option-name">{name}</span>
          <span className="template-option-desc">{description}</span>
        </span>
      </button>
      <button
        type="button"
        className="template-option-delete"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title="Delete template"
        aria-label={`Delete template ${name}`}
      >
        ✕
      </button>
    </div>
  );
}

/* ============================================================
   Design system picker — custom popover (replaces native <select>).
   - Single-select by default. Toggle in the popover header switches to
     multi-select, which lets users blend up to a few inspirations
     (first pick is the primary; the rest go into metadata).
   - Trigger card mirrors the claude.ai/design treatment: a tiny brand
     swatch strip + title + "Default" subtitle + chevron.
   ============================================================ */
function DesignSystemPicker({
  designSystems,
  defaultDesignSystemId,
  selectedIds,
  multi,
  onChange,
  onChangeMulti,
  loading,
}: {
  designSystems: DesignSystemSummary[];
  defaultDesignSystemId: string | null;
  selectedIds: string[];
  multi: boolean;
  onChange: (ids: string[]) => void;
  onChangeMulti: (v: boolean) => void;
  loading: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  // The open popover renders through a portal anchored to the trigger so it
  // escapes the New Project modal's `.newproj-body { overflow-y: auto }` clip
  // box. A plain `position: absolute` popover (the previous shape) was trapped
  // inside that scroll container and got truncated when the trigger sat low in
  // the body or the window was short (issue #4303). Mirrors the viewport-aware
  // up/down placement of the shared DesignSystemPicker.
  const [anchor, setAnchor] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const byId = useMemo(() => {
    const map = new Map<string, DesignSystemSummary>();
    for (const d of designSystems) map.set(d.id, d);
    return map;
  }, [designSystems]);

  // Sort: selected first (in pick order), then default DS, then alpha
  // by category then title. Keeps the popover scannable while honoring
  // the user's existing picks.
  const ordered = useMemo(() => {
    const picked = selectedIds
      .map((id) => byId.get(id))
      .filter((d): d is DesignSystemSummary => Boolean(d));
    const pickedSet = new Set(picked.map((d) => d.id));
    const rest = designSystems
      .filter((d) => (d.status ?? 'published') !== 'draft' && !pickedSet.has(d.id))
      .sort((a, b) => {
        if (a.id === defaultDesignSystemId) return -1;
        if (b.id === defaultDesignSystemId) return 1;
        const ca = a.category || 'Other';
        const cb = b.category || 'Other';
        if (ca !== cb) return ca.localeCompare(cb);
        return a.title.localeCompare(b.title);
      });
    return [...picked, ...rest];
  }, [designSystems, byId, selectedIds, defaultDesignSystemId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter((d) => {
      return (
        d.title.toLowerCase().includes(q) ||
        (d.summary || '').toLowerCase().includes(q) ||
        (d.category || '').toLowerCase().includes(q)
      );
    });
  }, [ordered, query]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  // Anchor the portalled popover to the trigger, flipping above it when there
  // isn't room below (e.g. the picker sits low in a short New Project modal).
  useLayoutEffect(() => {
    if (!open) {
      setAnchor(null);
      return undefined;
    }
    function updateAnchor() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewport = window.innerWidth;
      const width = Math.max(280, rect.width);
      const left = Math.max(8, Math.min(viewport - width - 8, rect.left));
      const gap = 6;
      const margin = 12;
      const PREFERRED_MIN = 200;
      const PREFERRED_MAX = 440;
      const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
      const spaceAbove = rect.top - gap - margin;
      // Open upward only when there's more room above and below is cramped.
      // Either way the popover is sized to the room on the chosen side.
      const openUp = spaceBelow < PREFERRED_MIN + 80 && spaceAbove > spaceBelow;
      const available = openUp ? spaceAbove : spaceBelow;
      // Clamp the fixed popover to the side's actual space. The PREFERRED_MIN
      // is only honored when the side can fit it; when both sides are tighter
      // than that (a very short window), forcing 200px here would push the
      // popover past the viewport instead of letting the list scroll inside a
      // smaller box. Floor at >= 0 so an off-screen trigger can't yield NaN.
      const maxHeight = Math.max(0, Math.min(PREFERRED_MAX, available));
      if (openUp) {
        setAnchor({
          bottom: window.innerHeight - rect.top + gap,
          left,
          width,
          maxHeight,
        });
      } else {
        setAnchor({
          top: rect.bottom + gap,
          left,
          width,
          maxHeight,
        });
      }
    }
    updateAnchor();
    window.addEventListener('resize', updateAnchor);
    window.addEventListener('scroll', updateAnchor, true);
    return () => {
      window.removeEventListener('resize', updateAnchor);
      window.removeEventListener('scroll', updateAnchor, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      // The popover is portalled outside `wrapRef`, so check it explicitly or
      // every click inside the open list would dismiss the picker.
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    // Defer listener registration by a tick so the very click that opened
    // the popover doesn't get re-interpreted as an outside-click on the
    // mousedown that follows in the same event cycle (StrictMode also
    // double-invokes the effect, which can race the same event).
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointer);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle(id: string) {
    if (multi) {
      // Multi-select: tapping toggles membership; the *first* id in the
      // array is treated as the primary across the rest of the app.
      const has = selectedIds.includes(id);
      if (has) {
        onChange(selectedIds.filter((x) => x !== id));
      } else {
        onChange([...selectedIds, id]);
      }
    } else {
      onChange([id]);
      setOpen(false);
    }
  }

  function clearAll() {
    onChange([]);
    if (!multi) setOpen(false);
  }

  const primaryId = selectedIds[0] ?? null;
  const primary = primaryId ? byId.get(primaryId) ?? null : null;
  const extraCount = Math.max(0, selectedIds.length - 1);
  const isDefault = !!primary && primary.id === defaultDesignSystemId;

  if (loading && designSystems.length === 0) {
    return (
      <div className="newproj-section">
        <label className="newproj-label">{t('newproj.designSystem')}</label>
        <Skeleton height={56} width="100%" radius={8} />
      </div>
    );
  }

  return (
    <div
      className={`newproj-section ds-picker${open ? ' open' : ''}`}
      data-testid="design-system-picker"
      ref={wrapRef}
    >
      <label className="newproj-label">{t('newproj.designSystem')}</label>
      <button
        ref={triggerRef}
        type="button"
        data-testid="design-system-trigger"
        className={`ds-picker-trigger${open ? ' open' : ''}${primary ? '' : ' empty'}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <DesignSystemAvatar system={primary} extraCount={extraCount} />
        <span className="ds-picker-meta">
          <span className="ds-picker-title">
            {primary ? primary.title : t('newproj.dsNoneFreeform')}
            {extraCount > 0 ? (
              <span className="ds-picker-extra-pill">+{extraCount}</span>
            ) : null}
          </span>
          <span className="ds-picker-sub">
            {primary
              ? isDefault
                ? t('common.default')
                : primary.category || t('newproj.dsCategoryFallback')
              : t('newproj.dsNoneSubtitleEmpty')}
          </span>
        </span>
        <Icon
          name="chevron-down"
          size={14}
          className="ds-picker-chevron"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        />
      </button>
      {open && anchor && typeof document !== 'undefined'
        ? createPortal(
        <div
          ref={popoverRef}
          className="ds-picker-popover ds-picker-popover-portal"
          role="listbox"
          data-placement={anchor.bottom !== undefined ? 'up' : 'down'}
          style={{
            top: anchor.top,
            bottom: anchor.bottom,
            left: anchor.left,
            width: anchor.width,
            maxHeight: anchor.maxHeight,
          }}
        >
          <div className="ds-picker-head">
            <input
              ref={searchRef}
              data-testid="design-system-search"
              className="ds-picker-search"
              placeholder={t('newproj.dsSearch')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div
              className="ds-picker-mode"
              role="tablist"
              aria-label={t('newproj.dsModeAria')}
            >
              <button
                type="button"
                role="tab"
                aria-selected={!multi}
                className={`ds-picker-mode-btn${!multi ? ' active' : ''}`}
                onClick={() => {
                  onChangeMulti(false);
                  if (selectedIds.length > 1) onChange(selectedIds.slice(0, 1));
                }}
              >
                {t('newproj.dsModeSingle')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={multi}
                className={`ds-picker-mode-btn${multi ? ' active' : ''}`}
                onClick={() => onChangeMulti(true)}
              >
                {t('newproj.dsModeMulti')}
              </button>
            </div>
          </div>
          <div className="ds-picker-list ds-picker-list-design-systems">
            <DsPickerItem
              active={selectedIds.length === 0}
              multi={multi}
              onClick={clearAll}
              avatar={<NoneAvatar />}
              title={t('newproj.dsNoneTitle')}
              subtitle={t('newproj.dsNoneSub')}
            />
            {filtered.length === 0 ? (
              <div className="ds-picker-empty">
                {t('newproj.dsEmpty', { query })}
              </div>
            ) : (
              filtered.map((d) => {
                const active = selectedIds.includes(d.id);
                const order = active ? selectedIds.indexOf(d.id) : -1;
                return (
                  <DsPickerItem
                    key={d.id}
                    active={active}
                    multi={multi}
                    order={order}
                    onClick={() => toggle(d.id)}
                    avatar={<DesignSystemAvatar system={d} />}
                    title={d.title}
                    badge={
                      d.id === defaultDesignSystemId
                        ? t('newproj.dsBadgeDefault')
                        : undefined
                    }
                    subtitle={d.summary || d.category || ''}
                  />
                );
              })
            )}
          </div>
          {multi && selectedIds.length > 1 ? (
            <div className="ds-picker-foot">
              <span className="ds-picker-foot-text">
                <strong>{primary?.title ?? t('newproj.dsPrimaryFallback')}</strong>{' '}
                {extraCount === 1
                  ? t('newproj.dsFootSingular')
                  : t('newproj.dsFootPlural')}
              </span>
              <button
                type="button"
                className="ds-picker-clear"
                onClick={clearAll}
              >
                {t('newproj.dsFootClear')}
              </button>
            </div>
          ) : null}
        </div>,
          document.body,
        )
        : null}
    </div>
  );
}

function DsPickerItem({
  active,
  multi,
  order,
  onClick,
  avatar,
  title,
  subtitle,
  badge,
}: {
  active: boolean;
  multi: boolean;
  order?: number;
  onClick: () => void;
  avatar: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      className={`ds-picker-item${active ? ' active' : ''}`}
      onClick={onClick}
    >
      <span className="ds-picker-item-avatar">{avatar}</span>
      <span className="ds-picker-item-text">
        <span className="ds-picker-item-title">
          {title}
          {badge ? <span className="ds-picker-item-badge">{badge}</span> : null}
        </span>
        <span className="ds-picker-item-sub">{subtitle}</span>
      </span>
      <span
        className={`ds-picker-mark ${multi ? 'check' : 'radio'}${active ? ' active' : ''}`}
        aria-hidden
      >
        {multi ? (
          active ? (order != null && order >= 0 ? order + 1 : '✓') : ''
        ) : null}
      </span>
    </button>
  );
}

function DesignSystemAvatar({
  system,
  extraCount = 0,
}: {
  system: DesignSystemSummary | null;
  extraCount?: number;
}) {
  if (!system) return <NoneAvatar />;
  const swatches = system.swatches && system.swatches.length > 0
    ? system.swatches.slice(0, 4)
    : fallbackSwatches(system.title);
  return (
    <span className="ds-avatar" aria-hidden>
      <span className="ds-avatar-grid">
        {swatches.map((c, i) => (
          <span key={i} className="ds-avatar-cell" style={{ background: c }} />
        ))}
      </span>
      {extraCount > 0 ? (
        <span className="ds-avatar-stack">+{extraCount}</span>
      ) : null}
    </span>
  );
}

function NoneAvatar() {
  return (
    <span className="ds-avatar ds-avatar-none" aria-hidden>
      <svg viewBox="0 0 24 24" width="16" height="16">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <line x1="6" y1="18" x2="18" y2="6" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </span>
  );
}

// Deterministic fallback swatches for design systems whose DESIGN.md doesn't
// expose its tokens via the bold-and-hex format. Keeps the avatar visually
// distinct per-system without extra metadata fetches.
function fallbackSwatches(seed: string): string[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const base = h % 360;
  return [
    `hsl(${base}, 18%, 96%)`,
    `hsl(${(base + 90) % 360}, 22%, 78%)`,
    `hsl(${(base + 180) % 360}, 30%, 32%)`,
    `hsl(${(base + 30) % 360}, 70%, 52%)`,
  ];
}

function MediaProjectOptions(props:
  | {
      surface: 'image';
      imageModel: string;
      imageAspect: MediaAspect;
      mediaProviders?: Record<string, MediaProviderCredentials>;
      onImageModel: (value: string) => void;
      onImageAspect: (value: MediaAspect) => void;
    }
  | {
      surface: 'video';
      videoModel: string;
      videoAspect: MediaAspect;
      videoLength: number;
      mediaProviders?: Record<string, MediaProviderCredentials>;
      onVideoModel: (value: string) => void;
      onVideoAspect: (value: MediaAspect) => void;
      onVideoLength: (value: number) => void;
    }
  | {
      surface: 'audio';
      audioKind: AudioKind;
      audioModel: string;
      audioDuration: number;
      voice: string;
      mediaProviders?: Record<string, MediaProviderCredentials>;
      onAudioKind: (value: AudioKind) => void;
      onAudioModel: (value: string) => void;
      onAudioDuration: (value: number) => void;
      onVoice: (value: string) => void;
    }
) {
  const t = useT();
  const aihubmixImageModels = useAIHubMixImageModels();
  const aihubmixVideoModels = useAIHubMixVideoModels();
  const aihubmixAudioModels = useAIHubMixAudioModels();

  if (props.surface === 'image') {
    return (
      <div className="newproj-media-options">
        <MediaModelCards
          label={t('newproj.modelLabel')}
          models={supportedModels('image', mergeAihubmixModels(IMAGE_MODELS, aihubmixImageModels))}
          mediaProviders={props.mediaProviders}
          value={props.imageModel}
          onChange={props.onImageModel}
        />
        <AspectCards
          label={t('newproj.aspectLabel')}
          value={props.imageAspect}
          onChange={props.onImageAspect}
        />
      </div>
    );
  }

  if (props.surface === 'video') {
    return (
      <div className="newproj-media-options">
        <MediaModelCards
          label={t('newproj.modelLabel')}
          models={supportedModels('video', mergeAihubmixModels(VIDEO_MODELS, aihubmixVideoModels))}
          mediaProviders={props.mediaProviders}
          value={props.videoModel}
          onChange={props.onVideoModel}
        />
        <AspectCards
          label={t('newproj.aspectLabel')}
          value={props.videoAspect}
          onChange={props.onVideoAspect}
        />
        <label className="newproj-label">
          <span>{t('newproj.videoLengthLabel')}</span>
          <select value={props.videoLength} onChange={(e) => props.onVideoLength(Number(e.target.value))}>
            {VIDEO_LENGTHS_SEC.map((sec) => (
              <option key={sec} value={sec}>{t('newproj.videoLengthSeconds', { n: sec })}</option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  // AIHubMix's live catalogue is speech (TTS) only; music/sfx stay static.
  const audioBase =
    props.audioKind === 'speech'
      ? mergeAihubmixModels(AUDIO_MODELS_BY_KIND.speech, aihubmixAudioModels)
      : AUDIO_MODELS_BY_KIND[props.audioKind];
  const models = supportedModels('audio', audioBase);
  const audioDurations = props.audioKind === 'sfx'
    ? SFX_AUDIO_DURATIONS_SEC
    : AUDIO_DURATIONS_SEC;
  return (
    <div className="newproj-media-options">
      <OptionCards
        label={t('newproj.audioKindLabel')}
        options={[
          { value: 'speech' as const, title: t('newproj.audioKindSpeech') },
          { value: 'sfx' as const, title: t('newproj.audioKindSfx') },
        ]}
        value={props.audioKind}
        onChange={props.onAudioKind}
      />
      <MediaModelCards
        label={t('newproj.modelLabel')}
        models={models}
        mediaProviders={props.mediaProviders}
        value={props.audioModel}
        onChange={props.onAudioModel}
      />
      <label className="newproj-label">
        <span>{t('newproj.audioDurationLabel')}</span>
        <select value={props.audioDuration} onChange={(e) => props.onAudioDuration(Number(e.target.value))}>
          {audioDurations.map((sec) => (
            <option key={sec} value={sec}>{t('newproj.audioDurationSeconds', { n: sec })}</option>
          ))}
        </select>
      </label>
      {props.audioKind === 'speech' ? (
        <label className="newproj-label">
          <span>{t('newproj.voiceLabel')}</span>
          <input
            value={props.voice}
            placeholder={t('newproj.voicePlaceholder')}
            onChange={(e) => props.onVoice(e.target.value)}
          />
        </label>
      ) : null}
    </div>
  );
}

export function supportedModels(surface: 'image' | 'video' | 'audio', models: MediaModel[]): MediaModel[] {
  const supportedProviders: Record<'image' | 'video' | 'audio', Set<string>> = {
    image: new Set(['openai', 'codex', 'volcengine', 'grok', 'nanobanana', 'openrouter', 'imagerouter', 'leonardo', 'custom-image', 'aihubmix']),
    video: new Set(['volcengine', 'hyperframes', 'grok', 'openrouter', 'imagerouter', 'aihubmix']),
    audio: new Set(['minimax', 'fishaudio', 'senseaudio', 'elevenlabs', 'openai', 'volcengine', 'aihubmix']),
  };
  return models.filter((model) => {
    const provider = findProvider(model.provider);
    return provider?.integrated === true && supportedProviders[surface].has(model.provider);
  });
}

function MediaModelCards({
  label,
  models,
  mediaProviders,
  value,
  onChange,
}: {
  label: string;
  models: MediaModel[];
  mediaProviders?: Record<string, MediaProviderCredentials>;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Group models by provider once. The trigger row needs the same provider
  // metadata (label + status) to render the selected model's caption, so we
  // compute groups regardless of whether the popover is open.
  const groups = useMemo(() => {
    const out: Array<{
      providerId: string;
      providerLabel: string;
      status: 'configured' | 'integrated' | 'unsupported';
      sortIndex: number;
      sortPriority: number;
      models: MediaModel[];
    }> = [];
    for (const model of models) {
      const provider = findProvider(model.provider);
      const providerId = provider?.id ?? model.provider;
      if (!isMediaProviderPickerReady(providerId, mediaProviders)) continue;
      const entry = mediaProviders?.[providerId];
      const configured = provider?.credentialsRequired !== false && isStoredMediaProviderEntryPresent(entry);
      let group = out.find((g) => g.providerId === providerId);
      if (!group) {
        group = {
          providerId,
          providerLabel: provider?.label ?? model.provider,
          status: configured
            ? 'configured'
            : provider?.integrated
              ? 'integrated'
              : 'unsupported',
          sortIndex: out.length,
          sortPriority: configured ? 0 : provider?.credentialsRequired === false ? 1 : 2,
          models: [],
        };
        out.push(group);
      }
      group.models.push(model);
    }
    return out.sort((a, b) => a.sortPriority - b.sortPriority || a.sortIndex - b.sortIndex);
  }, [models, mediaProviders]);

  const selected = useMemo(() => {
    for (const group of groups) {
      const hit = group.models.find((m) => m.id === value);
      if (hit) return { model: hit, group };
    }
    return null;
  }, [groups, value]);
  const firstAvailableModelId = groups[0]?.models[0]?.id ?? null;

  useEffect(() => {
    if (selected) return;
    if (firstAvailableModelId) {
      onChange(firstAvailableModelId);
      return;
    }
    if (value) onChange('');
  }, [firstAvailableModelId, onChange, selected, value]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        models: g.models.filter((m) => {
          return (
            m.id.toLowerCase().includes(q) ||
            m.label.toLowerCase().includes(q) ||
            m.hint.toLowerCase().includes(q) ||
            g.providerLabel.toLowerCase().includes(q)
          );
        }),
      }))
      .filter((g) => g.models.length > 0);
  }, [groups, query]);

  const totalMatches = filteredGroups.reduce((n, g) => n + g.models.length, 0);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => searchRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    const id = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointer);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(modelId: string) {
    onChange(modelId);
    setOpen(false);
    setQuery('');
  }

  const triggerTitle = selected?.model.label ?? t('newproj.modelMissingTitle');
  // The model.hint frequently leads with the provider name (e.g.
  // "OpenAI · 4K, native multimodal"), so emitting providerLabel as a
  // separate prefix would duplicate it. If the hint already opens with the
  // provider label, just use the hint verbatim — otherwise prefix it.
  const triggerSub = selected
    ? selected.model.hint.toLowerCase().startsWith(selected.group.providerLabel.toLowerCase())
      ? selected.model.hint
      : `${selected.group.providerLabel} · ${selected.model.hint}`
    : t('newproj.modelMissingSub');

  return (
    <div className="newproj-section ds-picker model-picker" ref={wrapRef}>
      <label className="newproj-label">{label}</label>
      <button
        type="button"
        data-testid="model-picker-trigger"
        className={`ds-picker-trigger${open ? ' open' : ''}${selected ? '' : ' empty'}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="ds-picker-meta">
          <span className="ds-picker-title">{triggerTitle}</span>
          <span className="ds-picker-sub">{triggerSub}</span>
        </span>
        <Icon
          name="chevron-down"
          size={14}
          className="ds-picker-chevron"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        />
      </button>
      {open ? (
        <div className="ds-picker-popover" role="listbox">
          <div className="ds-picker-head">
            <input
              ref={searchRef}
              data-testid="model-picker-search"
              className="ds-picker-search"
              placeholder={t('newproj.modelSearch')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="ds-picker-list">
            {totalMatches === 0 ? (
              <div className="ds-picker-empty">{t('newproj.modelEmpty')}</div>
            ) : (
              filteredGroups.map((group) => (
                <div className="ds-picker-group" key={group.providerId}>
                  <div className="ds-picker-group-head">
                    <span>{group.providerLabel}</span>
                    <span className={`newproj-provider-badge ${group.status}`}>
                      {group.status === 'configured'
                        ? 'Configured'
                        : group.status === 'integrated'
                          ? 'Integrated'
                          : 'Unsupported'}
                    </span>
                  </div>
                  {group.models.map((model) => {
                    const active = value === model.id;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        data-testid={`model-picker-option-${model.id}`}
                        className={`ds-picker-item${active ? ' active' : ''}`}
                        onClick={() => pick(model.id)}
                      >
                        <span className="ds-picker-item-text">
                          <span className="ds-picker-item-title">
                            {model.label}
                            {model.default ? (
                              <span className="ds-picker-item-badge">
                                {t('newproj.modelRecommended')}
                              </span>
                            ) : null}
                          </span>
                          <span className="ds-picker-item-sub">{model.hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AspectCards({
  label,
  value,
  onChange,
}: {
  label: string;
  value: MediaAspect;
  onChange: (value: MediaAspect) => void;
}) {
  const labels: Record<MediaAspect, string> = {
    '1:1': 'Square',
    '16:9': 'Landscape',
    '9:16': 'Portrait',
    '4:3': 'Wide',
    '3:4': 'Tall',
  };
  return (
    <div className="newproj-media-field">
      <div className="newproj-label">{label}</div>
      <div className="newproj-aspect-segmented" role="radiogroup" aria-label={label}>
        {MEDIA_ASPECTS.map((aspect) => {
          const active = value === aspect;
          return (
            <button
              key={aspect}
              type="button"
              role="radio"
              aria-checked={active}
              title={`${labels[aspect]} · ${aspect}`}
              className={`newproj-aspect-pill${active ? ' active' : ''}`}
              onClick={() => onChange(aspect)}
            >
              <span
                className={`newproj-aspect-icon newproj-aspect-icon-${aspect.replace(':', '-')}`}
                aria-hidden
              />
              <span className="newproj-aspect-ratio">{aspect}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OptionCards<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; title: string; hint?: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="newproj-media-field">
      <div className="newproj-label">{label}</div>
      <div className="newproj-option-grid compact">
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            className={`newproj-card newproj-option-card${value === option.value ? ' active' : ''}`}
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
          >
            <span>{option.title}</span>
            {option.hint ? <small>{option.hint}</small> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function buildMetadata(input: {
  tab: CreateTab;
  mediaSurface: MediaSurface;
  fidelity: 'wireframe' | 'high-fidelity';
  platformTargets: NewProjectPlatform[];
  includeLandingPage: boolean;
  includeOsWidgets: boolean;
  speakerNotes: boolean;
  animations: boolean;
  templateId: string | null;
  templates: ProjectTemplate[];
  imageModel: string;
  imageAspect: MediaAspect;
  videoModel: string;
  videoAspect: MediaAspect;
  videoLength: number;
  audioKind: AudioKind;
  audioModel: string;
  audioDuration: number;
  voice: string;
  inspirationIds: string[];
  promptTemplate: PromptTemplatePick | null;
}): ProjectMetadata {
  const kind: ProjectKind =
    input.tab === 'live-artifact'
      ? 'prototype'
      : input.tab === 'media'
        ? input.mediaSurface
        : input.tab;
  const selectedPlatforms = normalizeSelectedPlatforms(input.platformTargets);
  const concreteTargets = platformTargetsFor(selectedPlatforms);
  const canIncludeOsWidgets = platformTargetsSupportOsWidgets(concreteTargets);
  const surfaceOptions = {
    ...(input.includeLandingPage ? { includeLandingPage: true } : {}),
    ...(input.includeOsWidgets && canIncludeOsWidgets ? { includeOsWidgets: true } : {}),
  };
  const base = {
    platform: selectedPlatforms[0],
    platformTargets: concreteTargets,
    ...surfaceOptions,
  };
  const inspirations = input.inspirationIds.length > 0
    ? { inspirationDesignSystemIds: input.inspirationIds }
    : {};
  if (input.tab === 'prototype' || input.tab === 'live-artifact') {
    return {
      kind,
      ...base,
      // Live artifact is locked to high fidelity (the picker is hidden in
      // the panel) — wireframe live artifacts don't make sense.
      fidelity: input.tab === 'live-artifact' ? 'high-fidelity' : input.fidelity,
      ...(input.tab === 'live-artifact' ? { intent: 'live-artifact' as const } : {}),
      ...inspirations,
    };
  }
  if (input.tab === 'deck') {
    return { kind, speakerNotes: input.speakerNotes, ...inspirations };
  }
  if (input.tab === 'template') {
    if (input.templateId == null) {
      return { kind, ...base, animations: input.animations, ...inspirations };
    }
    const tpl = input.templates.find((x) => x.id === input.templateId);
    // The fallback label is consumed by the agent prompt rather than the
    // UI, so we keep it in English to match the rest of the prompt corpus.
    return {
      kind,
      ...base,
      animations: input.animations,
      templateId: input.templateId,
      templateLabel: tpl?.name ?? 'Saved template',
      ...inspirations,
    };
  }
  if (input.tab === 'media') {
    if (input.mediaSurface === 'image') {
      const imageModel = input.imageModel.trim();
      return {
        kind,
        ...(imageModel ? { imageModel } : {}),
        imageAspect: input.imageAspect,
        ...buildPromptTemplateMetadata(input.promptTemplate),
        ...inspirations,
      };
    }
    if (input.mediaSurface === 'video') {
      const videoModel = input.videoModel.trim();
      return {
        kind,
        ...(videoModel ? { videoModel } : {}),
        videoAspect: input.videoAspect,
        videoLength: input.videoLength,
        ...buildPromptTemplateMetadata(input.promptTemplate),
        ...inspirations,
      };
    }
    const audioModel = input.audioModel.trim();
    return {
      kind,
      audioKind: input.audioKind,
      ...(audioModel ? { audioModel } : {}),
      audioDuration: input.audioDuration,
      ...(input.audioKind === 'speech' && input.voice.trim()
        ? { voice: input.voice.trim() }
        : {}),
      ...inspirations,
    };
  }
  return { kind: 'other', ...base, ...inspirations };
}

function normalizeSelectedPlatforms(platforms: NewProjectPlatform[]): NewProjectPlatform[] {
  const seen = new Set<NewProjectPlatform>();
  for (const platform of platforms) {
    if (DESIGN_PLATFORMS.some((option) => option.value === platform)) {
      seen.add(platform);
    }
  }
  return seen.size > 0 ? [...seen] : ['responsive'];
}

function platformTargetsSupportOsWidgets(platforms: ProjectPlatform[] | NewProjectPlatform[]): boolean {
  return platforms.some((platform) =>
    platform === 'mobile-ios'
    || platform === 'mobile-android'
    || platform === 'tablet',
  );
}

function platformTargetsFor(platforms: NewProjectPlatform[]): ProjectPlatform[] {
  const targets = new Set<ProjectPlatform>();
  for (const platform of platforms) {
    switch (platform) {
      case 'responsive':
        targets.add('responsive');
        break;
      case 'web-desktop':
        targets.add('web-desktop');
        break;
      case 'mobile-ios':
        targets.add('mobile-ios');
        break;
      case 'mobile-android':
        targets.add('mobile-android');
        break;
      case 'tablet':
        targets.add('tablet');
        break;
      case 'desktop-app':
        targets.add('desktop-app');
        break;
      default: {
        const exhaustive: never = platform;
        targets.add(exhaustive);
      }
    }
  }
  return targets.size > 0 ? [...targets] : ['responsive'];
}

function buildPromptTemplateMetadata(
  pick: PromptTemplatePick | null,
): { promptTemplate?: ProjectMetadata['promptTemplate'] } {
  if (!pick) return {};
  const trimmed = pick.prompt.trim();
  if (trimmed.length === 0) return {};
  const { summary } = pick;
  return {
    promptTemplate: {
      id: summary.id,
      surface: summary.surface,
      title: summary.title,
      prompt: trimmed,
      summary: summary.summary || undefined,
      category: summary.category || undefined,
      tags: summary.tags && summary.tags.length > 0 ? summary.tags : undefined,
      model: summary.model,
      aspect: summary.aspect,
      source: summary.source
        ? {
            repo: summary.source.repo,
            license: summary.source.license,
            author: summary.source.author,
            url: summary.source.url,
          }
        : undefined,
    },
  };
}

function titleForTab(
  tab: CreateTab,
  mediaSurface: MediaSurface,
  t: TranslateFn,
): string {
  switch (tab) {
    case 'prototype':
      return t('newproj.titlePrototype');
    case 'live-artifact':
      return t('newproj.titleLiveArtifact');
    case 'deck':
      return t('newproj.titleDeck');
    case 'template':
      return t('newproj.titleTemplate');
    case 'media': {
      // Title tracks the active surface so the heading still reads "New
      // image" / "New video" / "New audio" — the shared "Media" label only
      // appears on the tab strip itself.
      const key: keyof Dict =
        mediaSurface === 'image'
          ? 'newproj.titleImage'
          : mediaSurface === 'video'
            ? 'newproj.titleVideo'
            : 'newproj.titleAudio';
      return t(key);
    }
    case 'other':
      return t('newproj.titleOther');
  }
}

function autoName(
  tab: CreateTab,
  mediaSurface: MediaSurface,
  t: TranslateFn,
): string {
  const stamp = new Date().toLocaleDateString();
  // For the Media tab the auto name reads "Image · {date}" / "Video · …" /
  // "Audio · …" so the project list still surfaces the actual surface.
  const labelKey: keyof Dict =
    tab === 'media' ? MEDIA_SURFACE_LABEL_KEYS[mediaSurface] : TAB_LABEL_KEYS[tab];
  return `${t(labelKey)} · ${stamp}`;
}
