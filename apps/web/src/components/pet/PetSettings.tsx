import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useT } from '../../i18n';
import { Icon } from '../Icon';
import type { AppConfig, CodexPetSummary, PetConfig, PetCustom } from '../../types';
import { DEFAULT_PET } from '../../state/config';
import {
  codexPetSpritesheetUrl,
  fetchCodexPets,
  syncCommunityPets,
} from '../../providers/registry';
import {
  CUSTOM_PET_ID,
  defaultCustomPet,
  FPS_MAX,
  FPS_MIN,
  FRAMES_MAX,
  FRAMES_MIN,
  resolveActivePet,
} from './pets';
import { PetSpriteFace } from './PetSpriteFace';
import { loadPetImageFromFile } from './image';
import {
  CODEX_ATLAS_ROWS_DEF,
  CODEX_ATLAS_COLS,
  CODEX_ATLAS_ROWS,
  cropAtlasRow,
  loadAtlasImageFromFile,
  looksLikeCodexAtlas,
  prepareCodexAtlas,
} from './codexAtlas';

interface Props {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
}

// Curated palette so the customize swatch row stays compact and on-brand
// without forcing a full color picker. The first entry mirrors --accent.
const ACCENT_SWATCHES = [
  '#c96442',
  '#2348b8',
  '#1f7a3a',
  '#6c3aa6',
  '#d97a26',
  '#9c2a25',
  '#74716b',
  '#0d0c0a',
];

export function PetSettings({ cfg, setCfg }: Props) {
  const t = useT();
  const pet: PetConfig = cfg.pet ?? { ...DEFAULT_PET, custom: defaultCustomPet() };
  const customGlyphId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const atlasInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // Atlas import staging — when the user uploads (or drops in) a file
  // that matches the Codex 8x9 / 192x208 spritesheet shape, we keep the
  // raw pixels around in memory so they can preview every animation row
  // and pick the one to "adopt" without re-uploading. None of this hits
  // localStorage; only the cropped row strip does.
  const [atlasPreview, setAtlasPreview] = useState<{
    dataUrl: string;
    width: number;
    height: number;
  } | null>(null);
  const [atlasRowIndex, setAtlasRowIndex] = useState<number>(0);
  const [atlasBusy, setAtlasBusy] = useState(false);
  // "Hatch with AI" prompt scratchpad. The user types a short pet
  // concept here, we splice it into a ready-to-paste hatch-pet skill
  // prompt, then they copy or run it from chat.
  const [hatchConcept, setHatchConcept] = useState('');
  const [hatchCopied, setHatchCopied] = useState(false);
  // "Recently hatched" — the daemon scans `${CODEX_HOME:-$HOME/.codex}/pets/`
  // for pets packaged by the upstream hatch-pet skill and surfaces them
  // here so the user can one-click adopt without going through the
  // file-picker import path.
  const [codexPets, setCodexPets] = useState<CodexPetSummary[]>([]);
  const [codexPetsLoading, setCodexPetsLoading] = useState(false);
  const [codexPetsRoot, setCodexPetsRoot] = useState<string>('');
  const [codexAdopting, setCodexAdopting] = useState<string | null>(null);
  // Community catalog sync — calls the daemon-side port of the
  // `sync-community-pets` script which fetches the latest pets from
  // Codex Pet Share + j20 Hatchery into `~/.codex/pets/`. We surface
  // the run summary (or error) inline below the head row so users get
  // direct feedback after the long-running download.
  const [communitySyncing, setCommunitySyncing] = useState(false);
  const [communitySyncStatus, setCommunitySyncStatus] = useState<
    | { kind: 'done'; wrote: number; total: number }
    | { kind: 'error'; error: string }
    | null
  >(null);

  // Tab routing — split the panel into three exclusive surfaces
  // (built-in / custom / community) so each "where do my pets come
  // from" choice has its own dedicated space and the user feels like
  // they are picking from a single source rather than hunting through
  // a long stack of subsections.
  //
  // Both bundled (Built-in) and user-hatched (Community) pets adopt
  // into the custom slot — they share `petId === CUSTOM_PET_ID`. We
  // bias the initial tab toward "Built-in" since that is the most
  // discoverable surface; the only time we land in Custom is when the
  // user has authored a strip-mode custom pet (uploaded image without
  // a Codex atlas), which can't have come from a bundled adoption.
  type PetSourceTab = 'builtIn' | 'custom' | 'community';
  const initialTab: PetSourceTab =
    pet.petId === CUSTOM_PET_ID && pet.custom.imageUrl && !pet.custom.atlas
      ? 'custom'
      : 'builtIn';
  const [activeTab, setActiveTab] = useState<PetSourceTab>(initialTab);

  // Atlas previews are produced from a Custom-tab upload; pin the
  // user there so the row picker is visible right after they drop
  // the file in.
  useEffect(() => {
    if (atlasPreview) setActiveTab('custom');
  }, [atlasPreview]);

  const refreshCodexPets = useCallback(async () => {
    setCodexPetsLoading(true);
    try {
      const result = await fetchCodexPets();
      setCodexPets(result.pets);
      setCodexPetsRoot(result.rootDir);
    } finally {
      setCodexPetsLoading(false);
    }
  }, []);

  const handleCommunitySync = useCallback(async () => {
    setCommunitySyncing(true);
    setCommunitySyncStatus(null);
    try {
      const result = await syncCommunityPets();
      if (result.error) {
        setCommunitySyncStatus({ kind: 'error', error: result.error });
      } else {
        setCommunitySyncStatus({
          kind: 'done',
          wrote: result.wrote,
          total: result.total,
        });
      }
      // Pull the freshly-synced pets into the grid even on a partial
      // failure — the daemon writes whatever succeeded before erroring.
      await refreshCodexPets();
    } catch (err) {
      setCommunitySyncStatus({
        kind: 'error',
        error: err instanceof Error ? err.message : 'Sync request failed',
      });
    } finally {
      setCommunitySyncing(false);
    }
  }, [refreshCodexPets]);

  useEffect(() => {
    void refreshCodexPets();
  }, [refreshCodexPets]);

  const update = (patch: Partial<PetConfig>) => {
    setCfg((curr) => {
      const prev = curr.pet ?? { ...DEFAULT_PET, custom: defaultCustomPet() };
      return {
        ...curr,
        pet: {
          ...prev,
          ...patch,
          custom: {
            ...prev.custom,
            ...(patch.custom ?? {}),
          },
        },
      };
    });
  };

  // "Adopt" is the umbrella action that picks a pet *and* wakes it. The
  // user can independently tuck via the wake toggle below without giving
  // up adoption status.
  const adopt = (petId: string) => {
    update({ adopted: true, enabled: true, petId });
  };

  // Patch the custom pet's image fields and (when something useful was
  // dropped in) auto-switch the active pet to `custom` so the user
  // sees their upload immediately without an extra click.
  const patchCustom = (patch: Partial<PetCustom>, options?: { focusCustom?: boolean }) => {
    setCfg((curr) => {
      const prev = curr.pet ?? { ...DEFAULT_PET, custom: defaultCustomPet() };
      const nextCustom: PetCustom = { ...prev.custom, ...patch };
      const shouldFocus = options?.focusCustom && nextCustom.imageUrl;
      return {
        ...curr,
        pet: {
          ...prev,
          adopted: shouldFocus ? true : prev.adopted,
          enabled: shouldFocus ? true : prev.enabled,
          petId: shouldFocus ? CUSTOM_PET_ID : prev.petId,
          custom: nextCustom,
        },
      };
    });
  };

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      // Quick aspect probe before we commit to either path — this lets
      // us route Codex hatch-pet atlases through the row-picker flow
      // (no downscale, lossless crop) while every other image keeps
      // the existing tiny-PNG re-encode.
      const probe = await probeImageDimensions(file);
      if (probe && looksLikeCodexAtlas(probe.width, probe.height)) {
        const atlas = await loadAtlasImageFromFile(file);
        setAtlasPreview(atlas);
        setAtlasRowIndex(0);
        return;
      }
      const result = await loadPetImageFromFile(file);
      // Best-effort guess at frame count for spritesheets — if the
      // image is much wider than tall, assume horizontal frames sized
      // to the image height (codex-pets-react sheets follow this
      // convention). The user can always tweak the field after.
      const aspectGuess =
        result.width / Math.max(1, result.height) >= 1.6
          ? Math.min(FRAMES_MAX, Math.max(2, Math.round(result.width / result.height)))
          : 1;
      patchCustom(
        {
          imageUrl: result.dataUrl,
          frames: aspectGuess,
          fps: pet.custom.fps ?? 6,
        },
        { focusCustom: true },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load that image.';
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  }

  // Opening the dedicated "Import Codex sprite" picker forces the atlas
  // path even if the dimensions don't quite match — useful for users
  // who've resized or recompressed a hatched pet outside Open Design.
  async function handleAtlasFile(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    setAtlasBusy(true);
    try {
      const atlas = await loadAtlasImageFromFile(file);
      setAtlasPreview(atlas);
      setAtlasRowIndex(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load that atlas.';
      setUploadError(message);
    } finally {
      setAtlasBusy(false);
    }
  }

  // Slice the staged atlas into a single horizontal animation strip
  // and stash it as the custom pet's sprite. We pick the per-row frame
  // count + fps directly from the upstream `animation-rows.md`
  // reference so the resulting playback matches the cadence the Codex
  // app uses for the same row.
  async function commitAtlasRow() {
    if (!atlasPreview) return;
    const def = CODEX_ATLAS_ROWS_DEF.find((r) => r.index === atlasRowIndex);
    setAtlasBusy(true);
    try {
      const cropped = await cropAtlasRow(atlasPreview.dataUrl, {
        rowIndex: atlasRowIndex,
        cols: CODEX_ATLAS_COLS,
        rows: CODEX_ATLAS_ROWS,
      });
      patchCustom(
        {
          imageUrl: cropped.dataUrl,
          frames: cropped.frames,
          fps: def?.fps ?? pet.custom.fps ?? 6,
          atlas: undefined,
        },
        { focusCustom: true },
      );
      setAtlasPreview(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not crop that row.';
      setUploadError(message);
    } finally {
      setAtlasBusy(false);
    }
  }

  // "Use full atlas" path — keep the entire downscaled Codex grid plus
  // its layout metadata so the overlay can drive row switching from
  // the interaction state machine (idle → hover/waving, drag → running,
  // long-idle → waiting). Mirrors the upstream `codex-pets-react`
  // PetWidget behaviour that picks rows on the fly instead of looping
  // a single strip.
  async function commitFullAtlas() {
    if (!atlasPreview) return;
    setAtlasBusy(true);
    try {
      const prepared = await prepareCodexAtlas(atlasPreview.dataUrl);
      patchCustom(
        {
          imageUrl: prepared.dataUrl,
          atlas: prepared.layout,
          // Drop the legacy strip params so the renderer goes through
          // the atlas branch unambiguously, even on configs migrated
          // from the old single-row import path.
          frames: 1,
          fps: prepared.layout.rowsDef[0]?.fps ?? pet.custom.fps ?? 6,
        },
        { focusCustom: true },
      );
      setAtlasPreview(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not import that atlas.';
      setUploadError(message);
    } finally {
      setAtlasBusy(false);
    }
  }

  function clearImage() {
    patchCustom({ imageUrl: undefined, frames: 1, atlas: undefined });
  }

  // One-click adopt for a Codex hatch-pet — fetch the spritesheet
  // from the daemon and stash the FULL 8x9 atlas (downscaled) plus a
  // matching layout so the overlay can switch animation rows
  // (idle ↔ waving ↔ running-*) just like the upstream
  // `codex-pets-react` `PetWidget`. Defaults `name`/`greeting` from the
  // manifest so the speech bubble feels personalized.
  async function adoptCodexPet(pet: CodexPetSummary) {
    setCodexAdopting(pet.id);
    setUploadError(null);
    try {
      const resp = await fetch(codexPetSpritesheetUrl(pet));
      if (!resp.ok) throw new Error('Could not download that pet.');
      const blob = await resp.blob();
      const dataUrl = await blobToDataUrl(blob);
      const prepared = await prepareCodexAtlas(dataUrl);
      patchCustom(
        {
          name: pet.displayName || pet.id,
          greeting: pet.description || `Hi! I am ${pet.displayName}.`,
          imageUrl: prepared.dataUrl,
          // Atlas mode owns frame timing per row — clear the legacy
          // strip fields so an older config rehydrating into the new
          // shape does not accidentally fall back to strip rendering.
          frames: 1,
          fps: prepared.layout.rowsDef[0]?.fps ?? 6,
          atlas: prepared.layout,
        },
        { focusCustom: true },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not adopt that pet.';
      setUploadError(message);
    } finally {
      setCodexAdopting(null);
    }
  }

  // Build the ready-to-paste hatch-pet skill prompt. The skill is
  // vendored under `skills/hatch-pet/` so any chat agent can run it;
  // this prompt is just the friendly wrapper that names the concept
  // and points the agent at the right skill.
  const hatchPrompt = useMemo(() => {
    const concept = hatchConcept.trim();
    const intro = concept
      ? `Hatch a Codex-compatible animated pet for me. Concept: ${concept}.`
      : 'Hatch a Codex-compatible animated pet for me.';
    return [
      intro,
      '',
      'Use the @hatch-pet skill end-to-end:',
      '1. Generate the base look with $imagegen.',
      '2. Generate every row strip (idle, running-right, waving, jumping, failed, waiting, running, review).',
      '3. Mirror running-left from running-right only when the design is symmetric.',
      '4. Run the deterministic scripts (extract / compose / validate / contact-sheet / videos).',
      '5. Package the result into ${CODEX_HOME:-$HOME/.codex}/pets/<pet-name>/ with pet.json + spritesheet.webp.',
      '',
      'When the spritesheet is saved, tell me the absolute path so I can import it into Open Design via Settings → Pets → Import Codex sprite.',
    ].join('\n');
  }, [hatchConcept]);

  async function copyHatchPrompt() {
    try {
      await navigator.clipboard.writeText(hatchPrompt);
      setHatchCopied(true);
      window.setTimeout(() => setHatchCopied(false), 1800);
    } catch {
      setHatchCopied(false);
    }
  }

  // Resolved view of the custom pet so the preview / picker rows can
  // share the same sprite renderer used by the overlay.
  const customPreview = resolveActivePet({
    ...pet,
    adopted: true,
    petId: CUSTOM_PET_ID,
  })!;

  // Built-in pets are the bundled spritesheets baked into the repo at
  // `assets/community-pets/<id>/`; the daemon flags them with
  // `bundled: true` so they land here. Community pets are the
  // user-hatched / synced pets that live under `~/.codex/pets/`.
  const bundledPets = useMemo(
    () => codexPets.filter((p) => p.bundled),
    [codexPets],
  );
  const communityPets = useMemo(
    () => codexPets.filter((p) => !p.bundled),
    [codexPets],
  );

  // Shared card renderer used by both the Built-in and Community tabs
  // so the visual treatment stays consistent — the only difference
  // between the two grids is which subset of `codexPets` they show.
  function renderCodexCard(p: CodexPetSummary) {
    const adopting = codexAdopting === p.id;
    const spritesheet = `url(${codexPetSpritesheetUrl(p)})`;
    // Best-effort match: bundled / community adoption copies the
    // pet's display name into `custom.name`, so when the user is on
    // a custom slot with a matching name + image we treat that card
    // as the active selection.
    const isActive =
      pet.adopted &&
      pet.petId === CUSTOM_PET_ID &&
      !!pet.custom.imageUrl &&
      pet.custom.name === (p.displayName || p.id);
    return (
      <div
        className={`pet-codex-card${isActive ? ' active' : ''}`}
        key={p.id}
      >
        <div
          className="pet-codex-thumb"
          style={{ ['--pet-codex-src' as string]: spritesheet }}
          aria-hidden
        >
          <span className="pet-codex-thumb-preview" aria-hidden />
        </div>
        <div className="pet-codex-meta">
          <strong>{p.displayName}</strong>
          {p.description ? <span>{p.description}</span> : null}
        </div>
        <button
          type="button"
          className={`seg-btn small pet-codex-adopt-btn${isActive ? ' active' : ''}`}
          onClick={() => void adoptCodexPet(p)}
          disabled={adopting || codexAdopting !== null}
          aria-pressed={isActive}
          aria-label={isActive ? t('pet.adoptedBadge') : t('pet.codexAdopt')}
        >
          <Icon name={adopting ? 'spinner' : 'check'} size={12} />
          {!isActive ? (
            <span>{adopting ? t('pet.codexAdopting') : t('pet.codexAdopt')}</span>
          ) : null}
        </button>
      </div>
    );
  }

  return (
    <section className="settings-section">
      <div className="pet-tabs">
        <div className="pet-tabs-top-row">
          <div
            className="subtab-pill"
            role="tablist"
            aria-label={t('pet.tabsAria')}
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'builtIn'}
              className={activeTab === 'builtIn' ? 'active' : ''}
              onClick={() => setActiveTab('builtIn')}
            >
              {t('pet.tabBuiltIn')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'custom'}
              className={activeTab === 'custom' ? 'active' : ''}
              onClick={() => setActiveTab('custom')}
            >
              {t('pet.tabCustom')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'community'}
              className={activeTab === 'community' ? 'active' : ''}
              onClick={() => setActiveTab('community')}
            >
              {t('pet.tabCommunity')}
            </button>
          </div>
          <div className="pet-wake-controls">
            <button
              type="button"
              className={`seg-btn small${pet.enabled ? ' active' : ''}`}
              onClick={() => update({ enabled: !pet.enabled, adopted: pet.adopted || pet.petId !== '' })}
              disabled={!pet.adopted}
              title={pet.enabled ? t('pet.tuckTitle') : t('pet.wakeTitle')}
            >
              <Icon name={pet.enabled ? 'eye' : 'sparkles'} size={14} />
              <span>{pet.enabled ? t('pet.tuck') : t('pet.wake')}</span>
            </button>
          </div>
        </div>
        <p className="hint pet-tabs-hint">
          {activeTab === 'builtIn'
            ? t('pet.tabBuiltInHint')
            : activeTab === 'custom'
              ? t('pet.tabCustomHint')
              : t('pet.tabCommunityHint')}
        </p>
      </div>

      {activeTab === 'builtIn' ? (
        <div className="pet-built-in">
          {bundledPets.length === 0 ? (
            <p className="hint pet-codex-empty">
              {codexPetsLoading
                ? t('pet.codexLoading')
                : t('pet.builtInEmpty')}
            </p>
          ) : (
            <div
              className="pet-codex-grid"
              role="radiogroup"
              aria-label={t('pet.tabBuiltIn')}
            >
              {bundledPets.map(renderCodexCard)}
            </div>
          )}
          {uploadError ? (
            <p className="hint pet-image-error">{uploadError}</p>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'custom' ? (
      <div className="pet-custom">
        <div className="pet-custom-head">
          <div>
            <h4>{t('pet.customTitle')}</h4>
            <p className="hint">{t('pet.customHint')}</p>
          </div>
          <button
            type="button"
            className={`seg-btn small${pet.adopted && pet.petId === CUSTOM_PET_ID ? ' active' : ''}`}
            onClick={() => adopt(CUSTOM_PET_ID)}
          >
            <Icon
              name={pet.adopted && pet.petId === CUSTOM_PET_ID ? 'check' : 'sparkles'}
              size={12}
            />
            <span>
              {pet.adopted && pet.petId === CUSTOM_PET_ID
                ? t('pet.adoptedBadge')
                : t('pet.useCustom')}
            </span>
          </button>
        </div>
        <div
          className="pet-custom-preview"
          style={{ ['--pet-accent' as string]: pet.custom.accent }}
        >
          <span className="pet-custom-sprite">
            <PetSpriteFace active={customPreview} size={48} />
          </span>
          <div className="pet-custom-bubble">
            <strong>{pet.custom.name || 'Buddy'}</strong>
            <span>{pet.custom.greeting || t('pet.customGreetingPlaceholder')}</span>
          </div>
        </div>
        <div className="pet-image-controls">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              void handleFile(file);
              e.target.value = '';
            }}
          />
          <input
            ref={atlasInputRef}
            type="file"
            accept="image/png,image/webp,image/jpeg,image/gif"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              void handleAtlasFile(file);
              e.target.value = '';
            }}
          />
          <div className="pet-image-row">
            <button
              type="button"
              className="seg-btn small"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Icon name={uploading ? 'spinner' : 'upload'} size={12} />
              <span>
                {pet.custom.imageUrl
                  ? t('pet.imageReplace')
                  : t('pet.imageUpload')}
              </span>
            </button>
            <button
              type="button"
              className="seg-btn small ghost"
              onClick={() => atlasInputRef.current?.click()}
              disabled={atlasBusy}
              title={t('pet.atlasImportTitle')}
            >
              <Icon name={atlasBusy ? 'spinner' : 'sparkles'} size={12} />
              <span>{t('pet.atlasImport')}</span>
            </button>
            {pet.custom.imageUrl ? (
              <button
                type="button"
                className="seg-btn small ghost"
                onClick={clearImage}
              >
                <Icon name="close" size={12} />
                <span>{t('pet.imageRemove')}</span>
              </button>
            ) : null}
          </div>
          <p className="hint">
            {pet.custom.imageUrl
              ? t('pet.imageHintActive')
              : t('pet.imageHintIdle')}
          </p>
          {uploadError ? (
            <p className="hint pet-image-error">{uploadError}</p>
          ) : null}
          {pet.custom.imageUrl && pet.custom.atlas ? (
            <p className="hint pet-image-atlas-hint">{t('pet.atlasActiveHint')}</p>
          ) : null}
          {pet.custom.imageUrl && !pet.custom.atlas ? (
            <div className="pet-image-frames">
              <label className="field">
                <span className="field-label">{t('pet.fieldFrames')}</span>
                <input
                  type="number"
                  min={FRAMES_MIN}
                  max={FRAMES_MAX}
                  step={1}
                  value={pet.custom.frames ?? 1}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!Number.isFinite(n)) return;
                    patchCustom({ frames: n });
                  }}
                />
                <p className="hint">{t('pet.fieldFramesHint')}</p>
              </label>
              <label className="field">
                <span className="field-label">{t('pet.fieldFps')}</span>
                <input
                  type="number"
                  min={FPS_MIN}
                  max={FPS_MAX}
                  step={1}
                  value={pet.custom.fps ?? 6}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!Number.isFinite(n)) return;
                    patchCustom({ fps: n });
                  }}
                />
                <p className="hint">{t('pet.fieldFpsHint')}</p>
              </label>
            </div>
          ) : null}
        </div>

        {atlasPreview ? (
          <div className="pet-atlas-preview">
            <div className="pet-atlas-head">
              <div>
                <strong>{t('pet.atlasPickerTitle')}</strong>
                <p className="hint">{t('pet.atlasPickerHint')}</p>
              </div>
              <button
                type="button"
                className="seg-btn small ghost"
                onClick={() => setAtlasPreview(null)}
                disabled={atlasBusy}
              >
                <Icon name="close" size={12} />
                <span>{t('pet.atlasCancel')}</span>
              </button>
            </div>
            <div
              className="pet-atlas-thumb"
              style={{ backgroundImage: `url(${atlasPreview.dataUrl})` }}
              aria-label={t('pet.atlasPickerTitle')}
            />
            <div
              className="pet-atlas-rows"
              role="radiogroup"
              aria-label={t('pet.atlasPickerTitle')}
            >
              {CODEX_ATLAS_ROWS_DEF.map((row) => {
                const active = row.index === atlasRowIndex;
                return (
                  <button
                    key={row.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`pet-atlas-row${active ? ' active' : ''}`}
                    onClick={() => setAtlasRowIndex(row.index)}
                    disabled={atlasBusy}
                  >
                    <span className="pet-atlas-row-name">
                      {t(`pet.atlasRow.${row.id}` as const)}
                    </span>
                    <span className="pet-atlas-row-meta">
                      {row.frames} · {row.fps} fps
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="pet-atlas-actions">
              <button
                type="button"
                className="seg-btn small"
                onClick={() => void commitFullAtlas()}
                disabled={atlasBusy}
                title={t('pet.atlasAdoptFullTitle')}
              >
                <Icon name={atlasBusy ? 'spinner' : 'sparkles'} size={12} />
                <span>{t('pet.atlasAdoptFull')}</span>
              </button>
              <button
                type="button"
                className="seg-btn small ghost"
                onClick={() => void commitAtlasRow()}
                disabled={atlasBusy}
                title={t('pet.atlasAdoptRowTitle')}
              >
                <Icon name={atlasBusy ? 'spinner' : 'check'} size={12} />
                <span>{t('pet.atlasAdopt')}</span>
              </button>
            </div>
          </div>
        ) : null}

        <div className="pet-custom-fields">
          <label className="field">
            <span className="field-label">{t('pet.fieldName')}</span>
            <input
              type="text"
              maxLength={32}
              value={pet.custom.name}
              placeholder="Buddy"
              onChange={(e) =>
                update({ custom: { ...pet.custom, name: e.target.value } })
              }
            />
          </label>
          <label className="field" htmlFor={customGlyphId}>
            <span className="field-label">{t('pet.fieldGlyph')}</span>
            <input
              id={customGlyphId}
              type="text"
              maxLength={4}
              value={pet.custom.glyph}
              placeholder="🦄"
              onChange={(e) =>
                update({ custom: { ...pet.custom, glyph: e.target.value } })
              }
            />
            <p className="hint">{t('pet.fieldGlyphHint')}</p>
          </label>
          <label className="field">
            <span className="field-label">{t('pet.fieldGreeting')}</span>
            <input
              type="text"
              maxLength={120}
              value={pet.custom.greeting}
              placeholder={t('pet.customGreetingPlaceholder')}
              onChange={(e) =>
                update({ custom: { ...pet.custom, greeting: e.target.value } })
              }
            />
          </label>
          <div className="field">
            <span className="field-label">{t('pet.fieldAccent')}</span>
            <div className="pet-swatches" role="radiogroup" aria-label={t('pet.fieldAccent')}>
              {ACCENT_SWATCHES.map((color) => {
                const active = pet.custom.accent.toLowerCase() === color.toLowerCase();
                return (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`pet-swatch${active ? ' active' : ''}`}
                    style={{ background: color }}
                    onClick={() =>
                      update({ custom: { ...pet.custom, accent: color } })
                    }
                    title={color}
                  />
                );
              })}
              <input
                type="color"
                aria-label={t('pet.fieldAccentCustom')}
                className="pet-swatch-picker"
                value={pet.custom.accent}
                onChange={(e) =>
                  update({ custom: { ...pet.custom, accent: e.target.value } })
                }
              />
            </div>
          </div>
        </div>
      </div>
      ) : null}

      {activeTab === 'community' ? (
        <div className="pet-community">
          <div className="pet-codex">
            <div className="pet-codex-head">
              <div>
                <h4>{t('pet.codexTitle')}</h4>
                <p className="hint">
                  {codexPetsRoot
                    ? t('pet.codexSubtitleWithDir', { dir: codexPetsRoot })
                    : t('pet.codexSubtitle')}
                </p>
              </div>
              <div className="pet-codex-head-actions">
                <button
                  type="button"
                  className="seg-btn small"
                  onClick={() => void handleCommunitySync()}
                  disabled={communitySyncing}
                  title={t('pet.communitySyncTitle')}
                >
                  <Icon
                    name={communitySyncing ? 'spinner' : 'download'}
                    size={12}
                  />
                  <span>
                    {communitySyncing
                      ? t('pet.communitySyncing')
                      : t('pet.communitySync')}
                  </span>
                </button>
                <button
                  type="button"
                  className="seg-btn small ghost"
                  onClick={() => void refreshCodexPets()}
                  disabled={codexPetsLoading}
                  title={t('pet.codexRefresh')}
                >
                  <Icon
                    name={codexPetsLoading ? 'spinner' : 'refresh'}
                    size={12}
                  />
                  <span>{t('pet.codexRefresh')}</span>
                </button>
              </div>
            </div>
            {communitySyncStatus ? (
              <p
                className={`hint pet-codex-sync-status${communitySyncStatus.kind === 'error' ? ' error' : ''}`}
                role="status"
              >
                {communitySyncStatus.kind === 'done'
                  ? t('pet.communitySyncDone', {
                      wrote: communitySyncStatus.wrote,
                      total: communitySyncStatus.total,
                    })
                  : t('pet.communitySyncFailed', {
                      error: communitySyncStatus.error,
                    })}
              </p>
            ) : null}
            {communityPets.length === 0 ? (
              <p className="hint pet-codex-empty">
                {codexPetsLoading ? t('pet.codexLoading') : t('pet.codexEmpty')}
              </p>
            ) : (
              <div
                className="pet-codex-grid"
                role="radiogroup"
                aria-label={t('pet.codexTitle')}
              >
                {communityPets.map(renderCodexCard)}
              </div>
            )}
          </div>

          <div className="pet-hatch">
            <div className="pet-hatch-head">
              <div>
                <h4>{t('pet.hatchTitle')}</h4>
                <p className="hint">{t('pet.hatchHint')}</p>
              </div>
            </div>
            <label className="field">
              <span className="field-label">{t('pet.hatchConcept')}</span>
              <input
                type="text"
                maxLength={140}
                value={hatchConcept}
                placeholder={t('pet.hatchConceptPlaceholder')}
                onChange={(e) => setHatchConcept(e.target.value)}
              />
            </label>
            <pre className="pet-hatch-prompt" aria-live="polite">{hatchPrompt}</pre>
            <div className="pet-hatch-actions">
              <button
                type="button"
                className="seg-btn small"
                onClick={() => void copyHatchPrompt()}
              >
                <Icon name={hatchCopied ? 'check' : 'copy'} size={12} />
                <span>{hatchCopied ? t('pet.hatchCopied') : t('pet.hatchCopy')}</span>
              </button>
            </div>
            <p className="hint pet-hatch-foot">{t('pet.hatchFoot')}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not read pet sprite.'));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(blob);
  });
}

// Cheap dimension probe used to decide whether an upload is a Codex
// hatch-pet atlas before we commit to either the lossy re-encode path
// or the lossless atlas crop path. Returns null on read errors so the
// caller can fall back to the regular flow without surfacing the read
// failure twice.
async function probeImageDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  try {
    const url = URL.createObjectURL(file);
    try {
      return await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error('probe failed'));
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}
