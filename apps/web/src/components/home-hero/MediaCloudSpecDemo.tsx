import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CustomSelect } from '../CustomSelect';
import { Icon } from '../Icon';
import {
  defaultMediaCloudDemoModel,
  defaultMediaCloudDemoValue,
  findMediaCloudDemoModel,
  formatMediaCloudDemoUnitPrice,
  MEDIA_CLOUD_DEMO_MODELS,
  MEDIA_ASPECT_DESCRIPTIONS,
  mediaCloudDemoPriceUsd,
  type MediaCloudDemoModel,
  type MediaCloudDemoSurface,
  type MediaCloudDemoValue,
} from './media-cloud-demo';
import styles from './MediaCloudSpecDemo.module.css';

function AspectRatioIcon({ aspect }: { aspect: string }) {
  const [sourceWidth = 1, sourceHeight = 1] = aspect.split(':').map(Number);
  const scale = Math.min(16 / sourceWidth, 12 / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  return (
    <span className={styles.aspectRatioIcon}>
      <span
        className={styles.aspectRatioIconShape}
        style={{ width: `${width}px`, height: `${height}px` }}
      />
    </span>
  );
}

export interface MediaCloudSpecDemoState {
  image: MediaCloudDemoValue;
  video: MediaCloudDemoValue;
}

export function createMediaCloudSpecDemoState(): MediaCloudSpecDemoState {
  return {
    image: defaultMediaCloudDemoValue('image'),
    video: defaultMediaCloudDemoValue('video'),
  };
}

interface SharedProps {
  surface: MediaCloudDemoSurface;
  value: MediaCloudDemoValue;
}

interface ChangeProps extends SharedProps {
  onChange: (value: MediaCloudDemoValue) => void;
}

interface ModelPickerProps extends ChangeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MediaCloudModelDemoPicker({
  surface,
  value,
  onChange,
  open,
  onOpenChange,
}: ModelPickerProps) {
  const [hoveredModelId, setHoveredModelId] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const model = currentModel(surface, value);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && pickerRef.current?.contains(target)) return;
      onOpenChange(false);
      setHoveredModelId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onOpenChange(false);
      setHoveredModelId(null);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onOpenChange, open]);

  const selectModel = (nextModel: MediaCloudDemoModel) => {
    onChange({
      mode: 'cloud',
      modelId: nextModel.id,
      resolution: nextModel.resolutions[0]!,
      aspect: surface === 'video' ? '16:9' : '1:1',
      duration: nextModel.durations?.[0] ?? 5,
      quantity: value.quantity,
      generateAudio: value.generateAudio,
    });
    onOpenChange(false);
  };

  return (
    <div ref={pickerRef} className={styles.modelPicker} data-testid="media-cloud-model-demo-picker">
      <button
        type="button"
        className={`${styles.modelTrigger}${open ? ` ${styles.modelTriggerOpen}` : ''}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${surface} model: ${model.label}`}
        onClick={() => {
          onOpenChange(!open);
          setHoveredModelId(null);
        }}
      >
        <ModelMark model={model} />
        <span>{model.label}</span>
        <Icon name="chevron-down" size={11} />
      </button>

      {open ? (
        <div
          className={styles.modelMenu}
          role="listbox"
          aria-label={`${surface} models`}
          onMouseLeave={() => setHoveredModelId(null)}
        >
          <div className={styles.modelMenuHeader}>
            <span>{surface === 'image' ? 'Image model' : 'Video model'}</span>
          </div>
          {MEDIA_CLOUD_DEMO_MODELS[surface].map((option) => {
            const selected = option.id === model.id;
            const expanded = option.id === hoveredModelId;
            const optionPrice = expanded
              ? mediaCloudDemoPriceUsd({
                  surface,
                  mode: 'cloud',
                  modelId: option.id,
                  resolution: option.resolutions[0]!,
                  duration: option.durations?.[0],
                  generateAudio: value.generateAudio,
                })
              : null;
            return (
              <button
                type="button"
                key={option.id}
                className={`${styles.modelOption}${selected ? ` ${styles.modelOptionSelected}` : ''}${expanded ? ` ${styles.modelOptionExpanded}` : ''}`}
                role="option"
                aria-label={option.label}
                aria-selected={selected}
                onMouseEnter={() => setHoveredModelId(option.id)}
                onFocus={() => setHoveredModelId(option.id)}
                onClick={() => selectModel(option)}
              >
                <span className={styles.modelOptionTop}>
                  <ModelMark model={option} />
                  <strong>{option.label}</strong>
                  {expanded && optionPrice != null ? (
                    <span className={styles.modelOptionPrice}>
                      ~{formatMediaCloudDemoUnitPrice(
                        surface,
                        optionPrice,
                        option.durations?.[0],
                      )}
                    </span>
                  ) : null}
                  {selected ? <Icon name="check" size={13} /> : null}
                </span>
                <span className={`${styles.modelOptionDetails}${expanded ? ` ${styles.modelOptionDetailsVisible}` : ''}`}>
                  <span>
                    <TruncatedModelSummary summary={option.summary} visible={expanded} />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function TruncatedModelSummary({
  summary,
  visible,
}: {
  summary: string;
  visible: boolean;
}) {
  const summaryRef = useRef<HTMLSpanElement | null>(null);
  const [truncated, setTruncated] = useState(false);

  useLayoutEffect(() => {
    const node = summaryRef.current;
    if (!node || !visible) {
      setTruncated(false);
      return;
    }

    const update = () => setTruncated(node.scrollWidth > node.clientWidth + 1);
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(node);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [summary, visible]);

  return (
    <span
      ref={summaryRef}
      className={`${styles.modelOptionSummary}${truncated ? ' od-tooltip' : ''}`}
      data-tooltip={truncated ? summary : undefined}
      data-tooltip-placement="top"
    >
      {visible ? summary : ''}
    </span>
  );
}

export function MediaCloudSpecDemoPanel({ surface, value, onChange }: ChangeProps) {
  const model = currentModel(surface, value);
  const resolutionOptions = model.resolutions;
  const aspectOptions = model.aspects;
  const durationOptions = model.durations ?? [5];
  const quantityOptions = [1, 2, 3, 4];

  return (
    <section
      className={`${styles.panel} ${surface === 'image' ? styles.panelImage : styles.panelVideo}`}
      aria-label={`${surface} output settings`}
      data-testid="media-cloud-spec-demo-panel"
    >
      <div className={`${styles.fields} ${surface === 'image' ? styles.fieldsImage : styles.fieldsVideo}`}>
        <div className={styles.field}>
          <span>Resolution</span>
          <CustomSelect
            key={`${surface}:resolution`}
            ariaLabel="Resolution"
            value={resolutionOptions.includes(value.resolution) ? value.resolution : resolutionOptions[0]!}
            options={resolutionOptions.map((resolution) => ({
              value: resolution,
              label: formatResolution(resolution),
            }))}
            onChange={(resolution) => onChange({ ...value, resolution })}
            triggerClassName={styles.fieldSelectTrigger}
            menuClassName={styles.fieldSelectMenu}
            portal={false}
          />
        </div>

        <div className={styles.field}>
          <span>Ratio</span>
          <CustomSelect
            key={`${surface}:ratio`}
            ariaLabel="Ratio"
            value={aspectOptions.includes(value.aspect) ? value.aspect : aspectOptions[0]!}
            options={aspectOptions.map((aspect) => ({
              value: aspect,
              label: aspect,
              leadingVisual: <AspectRatioIcon aspect={aspect} />,
              description: MEDIA_ASPECT_DESCRIPTIONS[aspect],
            }))}
            onChange={(aspect) => onChange({ ...value, aspect })}
            triggerClassName={styles.fieldSelectTrigger}
            menuClassName={`${styles.fieldSelectMenu} ${styles.aspectSelectMenu}`}
            portal={false}
          />
        </div>

        {surface === 'video' ? (
          <div className={styles.field}>
            <span>Duration</span>
            <CustomSelect
              key={`${surface}:duration`}
              ariaLabel="Duration"
              value={String(durationOptions.includes(value.duration) ? value.duration : durationOptions[0])}
              options={durationOptions.map((duration) => ({
                value: String(duration),
                label: `${duration} seconds`,
              }))}
              onChange={(duration) => onChange({ ...value, duration: Number(duration) })}
              triggerClassName={styles.fieldSelectTrigger}
              menuClassName={styles.fieldSelectMenu}
              portal={false}
            />
          </div>
        ) : null}

        <div className={styles.field}>
          <span>Quantity</span>
          <CustomSelect
            key={`${surface}:quantity`}
            ariaLabel="Quantity"
            value={String(quantityOptions.includes(value.quantity) ? value.quantity : 1)}
            options={quantityOptions.map((quantity) => ({
              value: String(quantity),
              label: formatQuantity(surface, quantity),
            }))}
            onChange={(quantity) => onChange({ ...value, quantity: Number(quantity) })}
            triggerClassName={styles.fieldSelectTrigger}
            menuClassName={styles.fieldSelectMenu}
            portal={false}
          />
        </div>

        {surface === 'video' ? (
          <div className={styles.field}>
            <span>Audio</span>
            <CustomSelect
              key={`${surface}:audio`}
              ariaLabel="Audio"
              value={value.generateAudio ? 'on' : 'off'}
              options={[
                { value: 'off', label: 'Off' },
                { value: 'on', label: 'On' },
              ]}
              onChange={(audio) => onChange({ ...value, generateAudio: audio === 'on' })}
              triggerClassName={styles.fieldSelectTrigger}
              menuClassName={styles.fieldSelectMenu}
              portal={false}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

interface SettingsProps extends ChangeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MediaCloudSpecDemoSettings({
  surface,
  value,
  onChange,
  open,
  onOpenChange,
}: SettingsProps) {
  const settingsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && settingsRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onOpenChange, open]);

  return (
    <div ref={settingsRef} className={styles.settingsPicker}>
      <button
        type="button"
        className={`${styles.tab}${open ? ` ${styles.tabOpen}` : ''}`}
        aria-label={`${surface} output settings`}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        data-testid="media-cloud-spec-demo-tab"
      >
        <Icon name="more-horizontal" size={15} />
      </button>
      {open ? (
        <MediaCloudSpecDemoPanel surface={surface} value={value} onChange={onChange} />
      ) : null}
    </div>
  );
}

function currentModel(
  surface: MediaCloudDemoSurface,
  value: MediaCloudDemoValue,
): MediaCloudDemoModel {
  return findMediaCloudDemoModel(surface, value.modelId) ?? defaultMediaCloudDemoModel(surface);
}

function ModelMark({ model }: { model: MediaCloudDemoModel }) {
  return (
    <span className={styles.modelMark} aria-hidden="true">
      <img src={model.iconSrc} alt="" />
    </span>
  );
}

function formatResolution(value: string): string {
  return value.endsWith('k') ? value.toUpperCase() : value;
}

function formatQuantity(surface: MediaCloudDemoSurface, quantity: number): string {
  const unit = surface === 'image' ? 'image' : 'video';
  return `${quantity} ${unit}${quantity === 1 ? '' : 's'}`;
}
