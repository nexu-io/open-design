import { useEffect, useMemo, useRef, useState } from 'react';
import { MarkdownRenderer, artifactRendererRegistry } from '../artifacts/renderer-registry';
import { renderMarkdownToSafeHtml } from '../artifacts/markdown';
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import {
  checkDeploymentLink,
  deployProjectFile,
  fetchDeployConfig,
  fetchProjectDeployments,
  fetchProjectFilePreview,
  fetchProjectFileText,
  projectFileUrl,
  projectRawUrl,
  updateDeployConfig,
  writeProjectTextFile,
} from '../providers/registry';
import type { ProjectFilePreview } from '../providers/registry';
import {
  exportAsHtml,
  exportAsJsx,
  exportAsMd,
  exportAsPdf,
  exportProjectAsZip,
  exportReactComponentAsHtml,
  exportReactComponentAsZip,
  openSandboxedPreviewInNewTab,
} from '../runtime/exports';
import { buildReactComponentSrcdoc } from '../runtime/react-component';
import { buildSrcdoc } from '../runtime/srcdoc';
import { parseForceInline, shouldUrlLoadHtmlPreview } from './file-viewer-render-mode';
import { saveTemplate } from '../state/projects';
import type { DeployConfigResponse, DeployProjectFileResponse, ProjectFile } from '../types';
import { Icon } from './Icon';
import { PreviewDrawOverlay, type DrawPreviewSubmit } from './PreviewDrawOverlay';
import {
  liveSnapshotForComment,
  overlayBoundsFromSnapshot,
  targetFromSnapshot,
  type PreviewCommentSnapshot,
} from '../comments';
import type { PreviewComment, PreviewCommentTarget } from '../types';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;
type SlideState = { active: number; count: number };
type VisualEditDraft = {
  text: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
  color: string;
  backgroundColor: string;
  width: string;
  height: string;
  moveX: number;
  moveY: number;
  animationName: string;
  animationDuration: string;
  animationDelay: string;
  animationTimingFunction: string;
  animationIterationCount: string;
  animationDirection: string;
  animationFillMode: string;
  custom: string;
};
type VisualEditBatchItem = {
  id: string;
  snapshot: PreviewCommentSnapshot;
  draft: VisualEditDraft;
};
type VisualEditPanelPosition = { x: number; y: number } | null;
type TweakGroup = 'Cores' | 'Tipografia' | 'Espaçamento' | 'Bordas' | 'Motion' | 'Outros';
type TweakControlKind = 'color' | 'number' | 'select' | 'text';
type TweakPreset = 'compact' | 'comfortable' | 'soft' | 'sharp' | 'motionless';
type TweakValueMap = Record<string, string>;
type TweakToken = {
  name: string;
  label: string;
  value: string;
  group: TweakGroup;
  kind: TweakControlKind;
  virtual?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
};

const htmlPreviewSlideState = new Map<string, SlideState>();
const FONT_RECENTS_KEY = 'od.visualEdit.recentFonts';
const MAX_TWEAK_TOKENS = 64;
const VIRTUAL_TWEAK_PREFIX = '__od-';
const DEFAULT_FONT_CHOICES = [
  'Arial, sans-serif',
  'Helvetica, sans-serif',
  'Georgia, serif',
  '"Times New Roman", serif',
  '"Courier New", monospace',
  'Verdana, sans-serif',
  'Tahoma, sans-serif',
  'Trebuchet MS, sans-serif',
  'Impact, sans-serif',
  'system-ui, sans-serif',
];
const EMPTY_VISUAL_EDIT_DRAFT: VisualEditDraft = {
  text: '',
  fontFamily: '',
  fontSize: '',
  fontWeight: '',
  lineHeight: '',
  letterSpacing: '',
  color: '',
  backgroundColor: '',
  width: '',
  height: '',
  moveX: 0,
  moveY: 0,
  animationName: '',
  animationDuration: '',
  animationDelay: '',
  animationTimingFunction: '',
  animationIterationCount: '',
  animationDirection: '',
  animationFillMode: '',
  custom: '',
};
const FALLBACK_TWEAK_TOKENS: TweakToken[] = [
  { name: '__od-accent', label: 'Accent', value: '#e8754f', group: 'Cores', kind: 'color', virtual: true },
  { name: '__od-page', label: 'Fundo da página', value: '#ffffff', group: 'Cores', kind: 'color', virtual: true },
  { name: '__od-text', label: 'Texto principal', value: '#14110f', group: 'Cores', kind: 'color', virtual: true },
  { name: '__od-radius', label: 'Arredondamento global', value: '16px', group: 'Bordas', kind: 'number', virtual: true, min: 0, max: 48, step: 1 },
  { name: '__od-motion', label: 'Movimento', value: 'normal', group: 'Motion', kind: 'select', virtual: true, options: ['normal', 'none'] },
];
const VIRTUAL_DENSITY_TWEAK = `${VIRTUAL_TWEAK_PREFIX}preset-density`;
const VIRTUAL_MOTION_TWEAK = `${VIRTUAL_TWEAK_PREFIX}preset-motion`;
const PRESET_TWEAK_TOKENS: TweakToken[] = [
  { name: VIRTUAL_DENSITY_TWEAK, label: 'Densidade global', value: 'normal', group: 'Espaçamento', kind: 'select', virtual: true, options: ['compact', 'normal', 'comfortable'] },
  { name: VIRTUAL_MOTION_TWEAK, label: 'Motion global', value: 'normal', group: 'Motion', kind: 'select', virtual: true, options: ['normal', 'none'] },
];

interface Props {
  projectId: string;
  file: ProjectFile;
  liveHtml?: string;
  isDeck?: boolean;
  onExportAsPptx?: ((fileName: string) => void) | undefined;
  streaming?: boolean;
  previewComments?: PreviewComment[];
  onSavePreviewComment?: (target: PreviewCommentTarget, note: string, attachAfterSave: boolean) => Promise<PreviewComment | null>;
  onRemovePreviewComment?: (commentId: string) => Promise<void>;
  onSendPreviewComment?: (comment: PreviewComment) => void | Promise<void>;
}

export function FileViewer({
  projectId,
  file,
  liveHtml,
  isDeck,
  onExportAsPptx,
  streaming,
  previewComments = [],
  onSavePreviewComment,
  onRemovePreviewComment,
  onSendPreviewComment,
}: Props) {
  const rendererMatch = artifactRendererRegistry.resolve({
    file,
    isDeckHint: Boolean(isDeck),
  });

  if (rendererMatch?.renderer.id === 'html' || rendererMatch?.renderer.id === 'deck-html') {
    return (
      <HtmlViewer
        projectId={projectId}
        file={file}
        liveHtml={liveHtml}
        isDeck={rendererMatch.renderer.id === 'deck-html'}
        onExportAsPptx={onExportAsPptx}
        streaming={Boolean(streaming)}
        previewComments={previewComments}
        onSavePreviewComment={onSavePreviewComment}
        onRemovePreviewComment={onRemovePreviewComment}
        onSendPreviewComment={onSendPreviewComment}
      />
    );
  }
  if (rendererMatch?.renderer.id === 'react-component') {
    return <ReactComponentViewer projectId={projectId} file={file} />;
  }
  if (rendererMatch?.renderer.id === 'markdown') {
    return <MarkdownViewer projectId={projectId} file={file} />;
  }
  if (rendererMatch?.renderer.id === 'svg') {
    return <SvgViewer projectId={projectId} file={file} />;
  }
  if (file.kind === 'image') {
    return (
      <ImageViewer
        projectId={projectId}
        file={file}
        streaming={Boolean(streaming)}
        onSavePreviewComment={onSavePreviewComment}
        onSendPreviewComment={onSendPreviewComment}
      />
    );
  }
  if (file.kind === 'video') {
    return <VideoViewer projectId={projectId} file={file} />;
  }
  if (file.kind === 'audio') {
    return <AudioViewer projectId={projectId} file={file} />;
  }
  if (file.kind === 'sketch') {
    return (
      <ImageViewer
        projectId={projectId}
        file={file}
        streaming={Boolean(streaming)}
        onSavePreviewComment={onSavePreviewComment}
        onSendPreviewComment={onSendPreviewComment}
      />
    );
  }
  if (file.kind === 'text' || file.kind === 'code') {
    return <TextViewer projectId={projectId} file={file} />;
  }
  if (
    file.kind === 'pdf' ||
    file.kind === 'document' ||
    file.kind === 'presentation' ||
    file.kind === 'spreadsheet'
  ) {
    return <DocumentPreviewViewer projectId={projectId} file={file} />;
  }
  return <BinaryViewer projectId={projectId} file={file} />;
}

function FileActions({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useT();
  return (
    <div className="viewer-toolbar-actions">
      <a
        className="ghost-link"
        href={projectFileUrl(projectId, file.name)}
        download={file.name}
      >
        {t('fileViewer.download')}
      </a>
      <a
        className="ghost-link"
        href={projectFileUrl(projectId, file.name)}
        target="_blank"
        rel="noreferrer noopener"
      >
        {t('fileViewer.open')}
      </a>
    </div>
  );
}

function CommentPopover({
  target,
  existing,
  draft,
  onDraft,
  onClose,
  onSave,
  onRemove,
  disabled,
  scale,
  t,
}: {
  target: PreviewCommentSnapshot;
  existing: PreviewComment | null;
  draft: string;
  onDraft: (value: string) => void;
  onClose: () => void;
  onSave: (attach: boolean) => void | Promise<void>;
  onRemove: (commentId: string) => void | Promise<void>;
  disabled?: boolean;
  scale: number;
  t: TranslateFn;
}) {
  const bounds = overlayBoundsFromSnapshot(target, scale);
  return (
    <div
      className="comment-popover"
      data-testid="comment-popover"
      style={{
        left: `clamp(14px, ${Math.round(bounds.left)}px, calc(100% - 334px))`,
        top: `clamp(14px, ${Math.round(bounds.top + bounds.height + 12)}px, calc(100% - 180px))`,
      }}
    >
      <div className="comment-popover-head">
        <div>
          <strong>{target.elementId}</strong>
          <span>{target.label}</span>
        </div>
        <button type="button" className="ghost" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
      <textarea
        data-testid="comment-popover-input"
        value={draft}
        placeholder={t('chat.comments.placeholder')}
        onChange={(event) => onDraft(event.target.value)}
      />
      <div className="comment-popover-actions">
        {existing ? (
          <button type="button" className="comment-popover-remove" onClick={() => onRemove(existing.id)}>
            {t('chat.comments.remove')}
          </button>
        ) : <span />}
        <button
          type="button"
          className="primary"
          data-testid="comment-add-send"
          disabled={disabled || !draft.trim()}
          onClick={() => void onSave(true)}
        >
          {existing ? t('chat.comments.updateSend') : t('chat.comments.addSend')}
        </button>
      </div>
    </div>
  );
}

function extractTweakTokens(source: string): TweakToken[] {
  const found = new Map<string, TweakToken>();
  const re = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;{}]+);/g;
  let match: RegExpExecArray | null = re.exec(source);
  while (match !== null) {
    const name = match[1] ?? '';
    const value = cleanCssValue(match[2] ?? '');
    if (name && value && !found.has(name)) {
      found.set(name, {
        name,
        label: labelForTweak(name),
        value,
        group: groupForTweak(name, value),
        kind: kindForTweak(name, value),
      });
    }
    match = re.exec(source);
  }
  const tokens = Array.from(found.values())
    .sort((a, b) => tweakGroupOrder(a.group) - tweakGroupOrder(b.group) || a.label.localeCompare(b.label))
    .slice(0, MAX_TWEAK_TOKENS);
  return tokens.length >= 3 ? tokens : [...tokens, ...FALLBACK_TWEAK_TOKENS];
}

function changedTweakValues(tokens: TweakToken[], values: TweakValueMap): TweakValueMap {
  const next: TweakValueMap = {};
  for (const token of tokens) {
    const raw = values[token.name];
    if (raw === undefined) continue;
    const value = cleanCssValue(raw);
    if (!value || value === token.value.trim()) continue;
    next[token.name] = value;
  }
  return next;
}

function tweakPreviewStyle(values: TweakValueMap): string {
  const rootOverrides: string[] = [];
  for (const [name, rawValue] of Object.entries(values)) {
    const value = safeTweakValue(rawValue);
    if (!value || name.startsWith(VIRTUAL_TWEAK_PREFIX)) continue;
    rootOverrides.push(`${name}: ${value};`);
  }
  const rootStyle = rootOverrides.length ? `:root { ${rootOverrides.join(' ')} }` : '';
  return [rootStyle, virtualTweakStyle(values), presetGlobalTweakStyle(values)].filter(Boolean).join('\n');
}

function applyTweakValuesToHtmlSource(source: string, values: TweakValueMap): string {
  let next = source;
  const rootOverrides: string[] = [];
  const virtual = [virtualTweakStyle(values), presetGlobalTweakStyle(values)].filter(Boolean).join('\n');

  for (const [name, rawValue] of Object.entries(values)) {
    const value = safeTweakValue(rawValue);
    if (!value) continue;
    if (name.startsWith(VIRTUAL_TWEAK_PREFIX)) continue;
    const re = new RegExp(`(${escapeRegExp(name)}\\s*:\\s*)([^;{}]+)(;)`, 'g');
    let replaced = false;
    next = next.replace(re, (_full, prefix: string, _old: string, suffix: string) => {
      replaced = true;
      return `${prefix}${value}${suffix}`;
    });
    if (!replaced) rootOverrides.push(`${name}: ${value};`);
  }

  const rootStyle = rootOverrides.length ? `:root { ${rootOverrides.join(' ')} }` : '';
  return upsertTweakStyleBlock(next, [rootStyle, virtual].filter(Boolean).join('\n'));
}

function presetGlobalTweakStyle(values: TweakValueMap): string {
  const density = safeTweakValue(values[VIRTUAL_DENSITY_TWEAK]);
  const motion = safeTweakValue(values[VIRTUAL_MOTION_TWEAK]);
  const styles: string[] = [];
  if (density === 'compact' || density === 'comfortable') {
    const scale = density === 'compact' ? '0.94' : '1.06';
    const width = density === 'compact' ? '106.38298%' : '94.33962%';
    styles.push(`html body { transform: scale(${scale}) !important; transform-origin: top left !important; width: ${width} !important; }`);
  }
  if (motion === 'none') {
    styles.push('html *, html *::before, html *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }');
  }
  return styles.join('\n');
}

function presetTweakValues(tokens: TweakToken[], preset: TweakPreset, current: TweakValueMap): TweakValueMap {
  const next = { ...current };
  for (const token of tokens) {
    const value = token.value;
    let changed: string | null = null;
    if (preset === 'compact' && token.group === 'Espaçamento') changed = scaleCssValue(value, 0.84);
    if (preset === 'comfortable' && token.group === 'Espaçamento') changed = scaleCssValue(value, 1.18);
    if (preset === 'soft' && token.group === 'Bordas') changed = scaleCssValue(value, 1.45) ?? '22px';
    if (preset === 'sharp' && token.group === 'Bordas') changed = '0px';
    if (preset === 'motionless' && token.group === 'Motion') changed = motionlessValue(token, value);
    if (!changed) continue;
    if (changed.trim() === token.value.trim()) delete next[token.name];
    else next[token.name] = changed;
  }
  if (preset === 'compact') next[VIRTUAL_DENSITY_TWEAK] = 'compact';
  if (preset === 'comfortable') next[VIRTUAL_DENSITY_TWEAK] = 'comfortable';
  if (preset === 'motionless') next[VIRTUAL_MOTION_TWEAK] = 'none';
  return next;
}

function groupTweakTokens(tokens: TweakToken[]): Array<[TweakGroup, TweakToken[]]> {
  const groups = new Map<TweakGroup, TweakToken[]>();
  for (const token of tokens) {
    const items = groups.get(token.group) ?? [];
    items.push(token);
    groups.set(token.group, items);
  }
  return Array.from(groups.entries()).sort((a, b) => tweakGroupOrder(a[0]) - tweakGroupOrder(b[0]));
}

function labelForTweak(name: string): string {
  return name
    .replace(/^--/, '')
    .replace(/^od-tweak-/, '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function groupForTweak(name: string, value: string): TweakGroup {
  const haystack = `${name} ${value}`.toLowerCase();
  if (isColorValue(value) || /(color|colour|accent|brand|surface|background|bg|ink|text|border|shadow)/.test(haystack)) return 'Cores';
  if (/(font|type|weight|line-height|letter|tracking|heading|body)/.test(haystack)) return 'Tipografia';
  if (/(space|spacing|gap|padding|margin|inset|offset|grid|gutter|size|width|height)/.test(haystack)) return 'Espaçamento';
  if (/(radius|rounded|corner|border-radius)/.test(haystack)) return 'Bordas';
  if (/(motion|duration|delay|animation|transition|ease|easing)/.test(haystack)) return 'Motion';
  return 'Outros';
}

function kindForTweak(name: string, value: string): TweakControlKind {
  if (name.startsWith(VIRTUAL_TWEAK_PREFIX) && name.endsWith('motion')) return 'select';
  if (isColorValue(value)) return 'color';
  if (parseNumericCssValue(value)) return 'number';
  return 'text';
}

function tweakGroupOrder(group: TweakGroup): number {
  return ['Cores', 'Tipografia', 'Espaçamento', 'Bordas', 'Motion', 'Outros'].indexOf(group);
}

function parseNumericCssValue(value: string): { number: number; unit: string } | null {
  const match = /^(-?\d+(?:\.\d+)?)(px|rem|em|vh|vw|%|ms|s)?$/i.exec(value.trim());
  if (!match) return null;
  return { number: Number(match[1]), unit: match[2] ?? '' };
}

function tweakRange(token: TweakToken, current: number): { min: number; max: number; step: number } {
  if (token.min !== undefined && token.max !== undefined && token.step !== undefined) {
    return { min: token.min, max: token.max, step: token.step };
  }
  if (token.group === 'Bordas') return { min: 0, max: 64, step: 1 };
  if (token.group === 'Espaçamento') return { min: 0, max: Math.max(96, Math.ceil(current * 2)), step: 1 };
  if (token.group === 'Tipografia') return { min: 0, max: Math.max(96, Math.ceil(current * 2)), step: 1 };
  if (token.group === 'Motion') return { min: 0, max: 5000, step: 50 };
  return { min: Math.min(0, current), max: Math.max(100, Math.ceil(current * 2)), step: 1 };
}

function scaleCssValue(value: string, factor: number): string | null {
  const parsed = parseNumericCssValue(value);
  if (!parsed) return null;
  const next = Math.max(0, parsed.number * factor);
  const rounded = Math.round(next * 100) / 100;
  return `${rounded}${parsed.unit}`;
}

function motionlessValue(token: TweakToken, value: string): string {
  if (token.kind === 'select') return 'none';
  const parsed = parseNumericCssValue(value);
  if (parsed && (parsed.unit === 'ms' || parsed.unit === 's')) return '0ms';
  if (/name|animation/i.test(token.name)) return 'none';
  return '0ms';
}

function isColorValue(value: string): boolean {
  const clean = value.trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(clean) ||
    /^(rgb|rgba|hsl|hsla)\(/i.test(clean) ||
    /^(transparent|currentColor)$/i.test(clean);
}

function colorInputValue(value: string): string {
  const clean = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(clean)) return clean;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(clean);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(clean);
  if (rgb) {
    const toHex = (part: string) => Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, '0');
    return `#${toHex(rgb[1] ?? '0')}${toHex(rgb[2] ?? '0')}${toHex(rgb[3] ?? '0')}`;
  }
  return '#000000';
}

function cleanCssValue(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function safeTweakValue(value: string): string {
  const clean = cleanCssValue(value).replace(/[;{}<>]/g, '');
  if (!clean || /(javascript:|expression\s*\(|@import|<\/?style)/i.test(clean)) return '';
  return clean;
}

function virtualTweakStyle(values: TweakValueMap): string {
  const accent = safeTweakValue(values['__od-accent'] ?? '');
  const page = safeTweakValue(values['__od-page'] ?? '');
  const text = safeTweakValue(values['__od-text'] ?? '');
  const radius = safeTweakValue(values['__od-radius'] ?? '');
  const motion = safeTweakValue(values['__od-motion'] ?? '');
  const lines: string[] = [];
  if (page) lines.push(`html, body { background: ${page} !important; }`);
  if (text) lines.push(`body { color: ${text} !important; }`);
  if (accent) {
    lines.push(`:where(a, button, [role="button"], input[type="button"], input[type="submit"], .btn, .button, [class*="button"], [class*="cta"]) { border-color: ${accent} !important; }`);
    lines.push(`:where(button, [role="button"], input[type="button"], input[type="submit"], .btn, .button, [class*="button"], [class*="cta"]) { background-color: ${accent} !important; }`);
  }
  if (radius) lines.push(`:where(button, input, textarea, select, .card, .panel, .modal, .btn, .button, [class*="card"], [class*="panel"], [class*="button"]) { border-radius: ${radius} !important; }`);
  if (motion === 'none') lines.push('*, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; scroll-behavior: auto !important; }');
  return lines.join('\n');
}

function upsertTweakStyleBlock(source: string, style: string): string {
  const block = style.trim() ? `<style data-od-tweaks>\n${style.trim()}\n</style>` : '';
  const re = /<style\b[^>]*data-od-tweaks[^>]*>[\s\S]*?<\/style>/i;
  if (re.test(source)) return source.replace(re, block);
  if (!block) return source;
  if (/<\/head>/i.test(source)) return source.replace(/<\/head>/i, `${block}\n</head>`);
  return `${block}\n${source}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function VisualEditPanel({
  target,
  draft,
  fontChoices,
  queuedCount,
  panelPosition,
  onDraft,
  onPanelPosition,
  onClose,
  onQueue,
  onSendQueue,
  onClearQueue,
  onDirectSave,
  onApply,
  disabled,
  scale,
}: {
  target: PreviewCommentSnapshot;
  draft: VisualEditDraft;
  fontChoices: string[];
  queuedCount: number;
  panelPosition: VisualEditPanelPosition;
  onDraft: (draft: VisualEditDraft) => void;
  onPanelPosition: (position: VisualEditPanelPosition) => void;
  onClose: () => void;
  onQueue: () => void;
  onSendQueue: () => void | Promise<void>;
  onClearQueue: () => void;
  onDirectSave: () => void | Promise<void>;
  onApply: () => void | Promise<void>;
  disabled?: boolean;
  scale: number;
}) {
  const bounds = overlayBoundsFromSnapshot(target, scale);
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [panelDragPoint, setPanelDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const setField = (key: keyof VisualEditDraft, value: string | number) => {
    onDraft({ ...draft, [key]: value });
  };
  const moveBy = (dx: number, dy: number) => {
    onDraft({
      ...draft,
      moveX: Math.round(draft.moveX + dx),
      moveY: Math.round(draft.moveY + dy),
    });
  };
  const selectedFont = draft.fontFamily.trim();
  const recentFonts = recentFontChoices();
  const defaultPanelPosition = {
    x: Math.round(bounds.left + bounds.width + 14),
    y: Math.round(bounds.top),
  };
  const activePanelPosition = panelPosition ?? defaultPanelPosition;
  return (
    <>
      <div
        className="visual-edit-drag-target"
        style={{
          left: bounds.left + draft.moveX * scale,
          top: bounds.top + draft.moveY * scale,
          width: bounds.width,
          height: bounds.height,
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragPoint({ x: event.clientX, y: event.clientY });
        }}
        onPointerMove={(event) => {
          if (!dragPoint) return;
          event.preventDefault();
          const dx = (event.clientX - dragPoint.x) / Math.max(scale, 0.01);
          const dy = (event.clientY - dragPoint.y) / Math.max(scale, 0.01);
          setDragPoint({ x: event.clientX, y: event.clientY });
          moveBy(dx, dy);
        }}
        onPointerUp={() => setDragPoint(null)}
        onPointerCancel={() => setDragPoint(null)}
      >
        <span>Arraste para mover</span>
      </div>
      {!dragPoint ? (
        <div
          className="visual-edit-panel"
          data-testid="visual-edit-panel"
          style={{
            left: `clamp(14px, ${activePanelPosition.x}px, calc(100% - 394px))`,
            top: `clamp(14px, ${activePanelPosition.y}px, calc(100% - 640px))`,
          }}
        >
          <div className="visual-edit-head">
            <div
              className="visual-edit-panel-handle"
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                setPanelDragPoint({ x: event.clientX, y: event.clientY });
                onPanelPosition(activePanelPosition);
              }}
              onPointerMove={(event) => {
                if (!panelDragPoint) return;
                event.preventDefault();
                const dx = event.clientX - panelDragPoint.x;
                const dy = event.clientY - panelDragPoint.y;
                setPanelDragPoint({ x: event.clientX, y: event.clientY });
                onPanelPosition({
                  x: Math.max(14, activePanelPosition.x + dx),
                  y: Math.max(14, activePanelPosition.y + dy),
                });
              }}
              onPointerUp={() => setPanelDragPoint(null)}
              onPointerCancel={() => setPanelDragPoint(null)}
            >
              <strong>Editar elemento</strong>
              <span>{target.label || target.elementId}</span>
            </div>
            <button type="button" className="ghost" onClick={onClose}>
              Fechar
            </button>
          </div>
          {queuedCount > 0 ? (
            <div className="visual-edit-queue">
              <span>{queuedCount} alteração{queuedCount === 1 ? '' : 'es'} na fila</span>
              <button type="button" onClick={onClearQueue}>Limpar</button>
              <button type="button" className="primary" disabled={disabled} onClick={() => void onSendQueue()}>
                Enviar fila
              </button>
            </div>
          ) : null}
        {isTextEditableSnapshot(target) ? (
          <label className="visual-edit-field visual-edit-full">
            <span>Texto</span>
            <textarea
              name="visual-edit-text"
              value={draft.text}
              placeholder="Texto visível do elemento…"
              onChange={(event) => setField('text', event.target.value)}
            />
          </label>
        ) : (
          <div className="visual-edit-safe-note">
            Container selecionado. Texto direto desativado para não remover filhos como logo, menu e botões.
          </div>
        )}
        <div className="visual-edit-section">
          <div className="visual-edit-section-title">Fonte</div>
          <div className="visual-edit-font-picker">
            <button
              type="button"
              className="visual-edit-font-trigger"
              aria-haspopup="listbox"
              aria-expanded={fontMenuOpen}
              onClick={() => setFontMenuOpen((value) => !value)}
            >
              <span style={{ fontFamily: selectedFont || undefined }}>
                {fontDisplayName(selectedFont || fontChoices[0] || 'Escolha uma fonte')}
              </span>
              <span aria-hidden>⌄</span>
            </button>
            {fontMenuOpen ? (
              <div className="visual-edit-font-menu" role="listbox" aria-label="Fontes">
                {fontChoices.map((font, index) => (
                  <button
                    key={font}
                    type="button"
                    role="option"
                    aria-selected={font === selectedFont}
                    className={font === selectedFont ? 'active' : ''}
                    style={{ fontFamily: font }}
                    onMouseEnter={() => setField('fontFamily', font)}
                    onFocus={() => setField('fontFamily', font)}
                    onClick={() => {
                      rememberFontChoice(font);
                      setField('fontFamily', font);
                      setFontMenuOpen(false);
                    }}
                  >
                    <span>{fontDisplayName(font)}</span>
                    {index === 0 ? <em>Atual</em> : recentFonts.includes(normalizeFontChoice(font)) ? <em>Recente</em> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="visual-edit-section">
          <div className="visual-edit-section-title">Tipografia e cor</div>
          <div className="visual-edit-grid">
          <label className="visual-edit-field">
            <span>Tamanho</span>
            <input
              name="visual-edit-font-size"
              value={draft.fontSize}
              placeholder="32px, 4vw…"
              onChange={(event) => setField('fontSize', event.target.value)}
            />
          </label>
          <label className="visual-edit-field">
            <span>Peso</span>
            <input
              name="visual-edit-font-weight"
              value={draft.fontWeight}
              placeholder="400, 700…"
              onChange={(event) => setField('fontWeight', event.target.value)}
            />
          </label>
          <label className="visual-edit-field">
            <span>Altura linha</span>
            <input
              name="visual-edit-line-height"
              value={draft.lineHeight}
              placeholder="1.1, 48px…"
              onChange={(event) => setField('lineHeight', event.target.value)}
            />
          </label>
          <label className="visual-edit-field">
            <span>Tracking</span>
            <input
              name="visual-edit-letter-spacing"
              value={draft.letterSpacing}
              placeholder="-0.02em, 1px…"
              onChange={(event) => setField('letterSpacing', event.target.value)}
            />
          </label>
          <label className="visual-edit-field">
            <span>Cor texto</span>
            <input
              name="visual-edit-color"
              value={draft.color}
              placeholder="#111, rgb(0 0 0)…"
              onChange={(event) => setField('color', event.target.value)}
            />
          </label>
          <label className="visual-edit-field">
            <span>Fundo</span>
            <input
              name="visual-edit-background"
              value={draft.backgroundColor}
              placeholder="transparent, #fff…"
              onChange={(event) => setField('backgroundColor', event.target.value)}
            />
          </label>
          </div>
        </div>
        <div className="visual-edit-section">
          <div className="visual-edit-section-title">Tamanho e posição</div>
          <div className="visual-edit-grid">
          <label className="visual-edit-field">
            <span>Largura</span>
            <input
              name="visual-edit-width"
              value={draft.width}
              placeholder="auto, 320px, 80%…"
              onChange={(event) => setField('width', event.target.value)}
            />
          </label>
          <label className="visual-edit-field">
            <span>Altura</span>
            <input
              name="visual-edit-height"
              value={draft.height}
              placeholder="auto, 96px…"
              onChange={(event) => setField('height', event.target.value)}
            />
          </label>
          <label className="visual-edit-field">
            <span>Mover X</span>
            <input
              name="visual-edit-move-x"
              type="number"
              inputMode="numeric"
              value={draft.moveX}
              onChange={(event) => setField('moveX', Number(event.target.value) || 0)}
            />
          </label>
          <label className="visual-edit-field">
            <span>Mover Y</span>
            <input
              name="visual-edit-move-y"
              type="number"
              inputMode="numeric"
              value={draft.moveY}
              onChange={(event) => setField('moveY', Number(event.target.value) || 0)}
            />
          </label>
          </div>
        </div>
        <details className="visual-edit-details" open>
          <summary>Animação</summary>
          <div className="visual-edit-grid">
            <label className="visual-edit-field">
              <span>Nome</span>
              <input
                name="visual-edit-animation-name"
                value={draft.animationName}
                placeholder="pulse, fadeIn, none…"
                onChange={(event) => setField('animationName', event.target.value)}
              />
            </label>
            <label className="visual-edit-field">
              <span>Duração</span>
              <input
                name="visual-edit-animation-duration"
                value={draft.animationDuration}
                placeholder="300ms, 1.8s…"
                onChange={(event) => setField('animationDuration', event.target.value)}
              />
            </label>
            <label className="visual-edit-field">
              <span>Delay</span>
              <input
                name="visual-edit-animation-delay"
                value={draft.animationDelay}
                placeholder="0ms, -0.2s…"
                onChange={(event) => setField('animationDelay', event.target.value)}
              />
            </label>
            <label className="visual-edit-field">
              <span>Easing</span>
              <input
                name="visual-edit-animation-timing"
                value={draft.animationTimingFunction}
                placeholder="ease-out, cubic-bezier(…)…"
                onChange={(event) => setField('animationTimingFunction', event.target.value)}
              />
            </label>
            <label className="visual-edit-field">
              <span>Repetição</span>
              <input
                name="visual-edit-animation-iteration"
                value={draft.animationIterationCount}
                placeholder="1, infinite…"
                onChange={(event) => setField('animationIterationCount', event.target.value)}
              />
            </label>
            <label className="visual-edit-field">
              <span>Direção</span>
              <input
                name="visual-edit-animation-direction"
                value={draft.animationDirection}
                placeholder="normal, alternate…"
                onChange={(event) => setField('animationDirection', event.target.value)}
              />
            </label>
            <label className="visual-edit-field">
              <span>Fill mode</span>
              <input
                name="visual-edit-animation-fill"
                value={draft.animationFillMode}
                placeholder="none, both, forwards…"
                onChange={(event) => setField('animationFillMode', event.target.value)}
              />
            </label>
          </div>
        </details>
        <label className="visual-edit-field visual-edit-full">
          <span>Qualquer outro detalhe</span>
          <textarea
            name="visual-edit-custom"
            value={draft.custom}
            placeholder="Ex.: alinhar com o card da direita, trocar hover, ajustar breakpoint mobile…"
            onChange={(event) => setField('custom', event.target.value)}
          />
        </label>
        <div className="visual-edit-actions">
          <span>{target.position.width} × {target.position.height}</span>
          <div>
            <button type="button" disabled={disabled} onClick={() => void onDirectSave()}>
              Salvar direto
            </button>
            <button type="button" disabled={disabled} onClick={onQueue}>
              Adicionar à fila
            </button>
            <button type="button" className="primary" disabled={disabled} onClick={() => void onApply()}>
              Aplicar com IA
            </button>
          </div>
        </div>
        </div>
      ) : null}
    </>
  );
}

function TweaksPanel({
  tokens,
  values,
  changedCount,
  disabled,
  onChange,
  onReset,
  onPreset,
  onSave,
  onClose,
}: {
  tokens: TweakToken[];
  values: TweakValueMap;
  changedCount: number;
  disabled?: boolean;
  onChange: (name: string, value: string) => void;
  onReset: () => void;
  onPreset: (preset: TweakPreset) => void;
  onSave: () => void | Promise<void>;
  onClose: () => void;
}) {
  const grouped = useMemo(() => groupTweakTokens(tokens), [tokens]);
  return (
    <div className="tweaks-panel" data-testid="tweaks-panel">
      <div className="tweaks-head">
        <div>
          <strong>Tweaks</strong>
          <span>{tokens.length} controle{tokens.length === 1 ? '' : 's'} disponível{tokens.length === 1 ? '' : 'is'}</span>
        </div>
        <button type="button" className="ghost" onClick={onClose}>
          Fechar
        </button>
      </div>
      <div className="tweaks-summary">
        <span>{changedCount} alteração{changedCount === 1 ? '' : 'es'} em preview</span>
        <small>Ajustes simples são aplicados direto no HTML, sem IA.</small>
      </div>
      <div className="tweaks-presets" aria-label="Presets rápidos">
        <button type="button" onClick={() => onPreset('compact')}>Compacto</button>
        <button type="button" onClick={() => onPreset('comfortable')}>Confortável</button>
        <button type="button" onClick={() => onPreset('soft')}>Mais redondo</button>
        <button type="button" onClick={() => onPreset('sharp')}>Mais reto</button>
        <button type="button" onClick={() => onPreset('motionless')}>Sem motion</button>
      </div>
      <div className="tweaks-groups">
        {grouped.map(([group, items]) => (
          <section className="tweaks-group" key={group}>
            <h3>{group}</h3>
            {items.map((token) => (
              <TweakControl
                key={token.name}
                token={token}
                value={values[token.name] ?? token.value}
                changed={Boolean(values[token.name] !== undefined && values[token.name].trim() !== token.value.trim())}
                onChange={(value) => onChange(token.name, value)}
              />
            ))}
          </section>
        ))}
      </div>
      <div className="tweaks-actions">
        <button type="button" onClick={onReset} disabled={changedCount === 0}>
          Resetar
        </button>
        <button type="button" className="primary" disabled={disabled || changedCount === 0} onClick={() => void onSave()}>
          Aplicar no HTML
        </button>
      </div>
    </div>
  );
}

function mergeTweakTokens(tokens: TweakToken[]): TweakToken[] {
  const merged = new Map<string, TweakToken>();
  for (const token of [...PRESET_TWEAK_TOKENS, ...FALLBACK_TWEAK_TOKENS, ...tokens]) {
    if (!merged.has(token.name)) merged.set(token.name, token);
  }
  return Array.from(merged.values()).slice(0, MAX_TWEAK_TOKENS);
}

function TweakControl({
  token,
  value,
  changed,
  onChange,
}: {
  token: TweakToken;
  value: string;
  changed: boolean;
  onChange: (value: string) => void;
}) {
  const parsed = parseNumericCssValue(value);
  const range = parsed ? tweakRange(token, parsed.number) : null;
  return (
    <div className={`tweak-control${changed ? ' changed' : ''}`}>
      <div className="tweak-control-meta">
        <strong>{token.label}</strong>
        <code>{token.virtual ? 'global' : token.name}</code>
      </div>
      <div className="tweak-control-inputs">
        {token.kind === 'color' ? (
          <input
            className="tweak-color-input"
            type="color"
            value={colorInputValue(value)}
            onChange={(event) => onChange(event.target.value)}
            aria-label={token.label}
          />
        ) : null}
        {token.kind === 'select' ? (
          <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={token.label}>
            {(token.options ?? []).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        ) : (
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-label={token.label}
            spellCheck={false}
          />
        )}
      </div>
      {token.kind === 'number' && parsed && range ? (
        <input
          className="tweak-range"
          type="range"
          min={range.min}
          max={range.max}
          step={range.step}
          value={parsed.number}
          onChange={(event) => onChange(`${event.target.value}${parsed.unit}`)}
          aria-label={`${token.label} slider`}
        />
      ) : null}
    </div>
  );
}

function CommentPreviewOverlays({
  comments,
  liveTargets,
  hoveredTarget,
  activeTarget,
  scale,
  onOpenComment,
}: {
  comments: PreviewComment[];
  liveTargets: Map<string, PreviewCommentSnapshot>;
  hoveredTarget: PreviewCommentSnapshot | null;
  activeTarget: PreviewCommentSnapshot | null;
  scale: number;
  onOpenComment: (comment: PreviewComment, snapshot: PreviewCommentSnapshot) => void;
}) {
  const visibleComments = comments
    .map((comment, index) => ({
      comment,
      index,
      snapshot: liveSnapshotForComment(comment, liveTargets),
    }))
    .filter((item): item is { comment: PreviewComment; index: number; snapshot: PreviewCommentSnapshot } =>
      Boolean(item.snapshot),
    );
  const targetOverlay = activeTarget ?? hoveredTarget;
  return (
    <div className="comment-overlay-layer" aria-hidden={false}>
      {visibleComments.map(({ comment, index, snapshot }) => {
        const bounds = overlayBoundsFromSnapshot(snapshot, scale);
        return (
          <div
            key={comment.id}
            className="comment-saved-marker"
            style={{
              left: bounds.left,
              top: bounds.top,
              width: bounds.width,
              height: bounds.height,
            }}
            data-testid={`comment-saved-marker-${comment.elementId}`}
          >
            <div className="comment-saved-outline" />
            <button
              type="button"
              className="comment-saved-pin"
              onClick={() => onOpenComment(comment, snapshot)}
              title={`${comment.elementId}: ${comment.note}`}
              aria-label={`Open comment for ${comment.elementId}`}
            >
              {index + 1}
            </button>
          </div>
        );
      })}
      {targetOverlay ? (
        <CommentTargetOverlay
          snapshot={targetOverlay}
          scale={scale}
          selected={Boolean(activeTarget)}
        />
      ) : null}
    </div>
  );
}

function CommentTargetOverlay({
  snapshot,
  scale,
  selected,
}: {
  snapshot: PreviewCommentSnapshot;
  scale: number;
  selected: boolean;
}) {
  const bounds = overlayBoundsFromSnapshot(snapshot, scale);
  const width = Math.round(snapshot.position.width);
  const height = Math.round(snapshot.position.height);
  return (
    <div
      className={`comment-target-overlay${selected ? ' selected' : ''}`}
      style={{
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      }}
      data-testid="comment-target-overlay"
    >
      <div className="comment-target-tooltip">
        <strong>{snapshot.elementId}</strong>
        <span>{snapshot.label}</span>
        <span>{width} × {height}</span>
      </div>
    </div>
  );
}

function ReactComponentViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useT();
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  const [source, setSource] = useState<string | null>(null);
  const [srcDoc, setSrcDoc] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const shareRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSource(null);
    let cancelled = false;
    void fetchProjectFileText(projectId, file.name).then((text) => {
      if (!cancelled) setSource(text ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, file.name, file.mtime, reloadKey]);

  useEffect(() => {
    if (!shareMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!shareRef.current) return;
      if (!shareRef.current.contains(e.target as Node)) setShareMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShareMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [shareMenuOpen]);

  const exportTitle = file.name.replace(/\.(jsx|tsx)$/i, '') || file.name;
  const sourceExtension = file.name.toLowerCase().endsWith('.tsx') ? '.tsx' : '.jsx';

  useEffect(() => {
    if (source === null) {
      setSrcDoc('');
      return;
    }

    let cancelled = false;
    const buildSrcDoc = () => {
      const nextSrcDoc = buildReactComponentSrcdoc(source, { title: exportTitle });
      if (!cancelled) setSrcDoc(nextSrcDoc);
    };

    if (source.length > 100_000) {
      setSrcDoc('');
      const timeout = window.setTimeout(buildSrcDoc, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timeout);
      };
    }

    buildSrcDoc();
    return () => {
      cancelled = true;
    };
  }, [source, exportTitle]);

  return (
    <div className="viewer react-component-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <button
            type="button"
            className="icon-only"
            onClick={() => setReloadKey((n) => n + 1)}
            title={t('fileViewer.reload')}
            aria-label={t('fileViewer.reloadAria')}
          >
            <Icon name="reload" size={14} />
          </button>
          <span className="viewer-meta">
            {t('fileViewer.reactMeta', { size: humanSize(file.size) })}
          </span>
        </div>
        <div className="viewer-toolbar-actions">
          <div className="viewer-tabs">
            <button
              type="button"
              className={`viewer-tab ${mode === 'preview' ? 'active' : ''}`}
              onClick={() => setMode('preview')}
            >
              {t('fileViewer.preview')}
            </button>
            <button
              type="button"
              className={`viewer-tab ${mode === 'source' ? 'active' : ''}`}
              onClick={() => setMode('source')}
            >
              {t('fileViewer.source')}
            </button>
          </div>
          {source !== null ? (
            <>
              <span className="viewer-divider" aria-hidden />
              <div className="share-menu" ref={shareRef}>
                <button
                  type="button"
                  className="viewer-action primary"
                  aria-haspopup="menu"
                  aria-expanded={shareMenuOpen}
                  onClick={() => setShareMenuOpen((v) => !v)}
                >
                  <span>{t('fileViewer.shareLabel')}</span>
                  <Icon name="chevron-down" size={11} />
                </button>
                {shareMenuOpen ? (
                  <div className="share-menu-popover" role="menu">
                    <button
                      type="button"
                      className="share-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setShareMenuOpen(false);
                        exportAsJsx(source, exportTitle, sourceExtension);
                      }}
                    >
                      <span className="share-menu-icon"><Icon name="file-code" size={14} /></span>
                      <span>{t('fileViewer.exportJsx')}</span>
                    </button>
                    <button
                      type="button"
                      className="share-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setShareMenuOpen(false);
                        exportReactComponentAsHtml(source, exportTitle);
                      }}
                    >
                      <span className="share-menu-icon"><Icon name="file" size={14} /></span>
                      <span>{t('fileViewer.exportReactHtml')}</span>
                    </button>
                    <div className="share-menu-divider" />
                    <button
                      type="button"
                      className="share-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setShareMenuOpen(false);
                        exportReactComponentAsZip(source, exportTitle, sourceExtension);
                      }}
                    >
                      <span className="share-menu-icon"><Icon name="download" size={14} /></span>
                      <span>{t('fileViewer.exportZip')}</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
      <div className="viewer-body">
        {source === null || (mode === 'preview' && !srcDoc) ? (
          <div className="viewer-empty">{t('fileViewer.loading')}</div>
        ) : mode === 'preview' ? (
          <iframe
            data-testid="react-component-preview-frame"
            title={file.name}
            sandbox="allow-scripts"
            srcDoc={srcDoc}
          />
        ) : (
          <CodeWithLines text={source} />
        )}
      </div>
    </div>
  );
}

function BinaryViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useT();
  return (
    <div className="viewer binary-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {t('fileViewer.binaryMeta', { size: humanSize(file.size) })}
          </span>
        </div>
        <FileActions projectId={projectId} file={file} />
      </div>
      <div className="viewer-body">
        <div className="viewer-empty">
          {t('fileViewer.binaryNote', { size: file.size })}
        </div>
      </div>
    </div>
  );
}

function DocumentPreviewViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useT();
  const [preview, setPreview] = useState<ProjectFilePreview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPreview(null);
    void fetchProjectFilePreview(projectId, file.name).then((next) => {
      if (!cancelled) {
        setPreview(next);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, file.name, file.mtime]);

  return (
    <div className="viewer document-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {documentMetaLabel(file, t)} · {humanSize(file.size)}
          </span>
        </div>
        <FileActions projectId={projectId} file={file} />
      </div>
      <div className="viewer-body">
        {loading ? (
          <div className="viewer-empty">{t('fileViewer.loading')}</div>
        ) : preview ? (
          <div className="document-preview">
            <h2>{preview.title}</h2>
            {preview.sections.map((section, idx) => (
              <section key={`${section.title}-${idx}`}>
                <h3>{section.title}</h3>
                {section.lines.map((line, lineIdx) => (
                  <p key={`${lineIdx}-${line}`}>{line}</p>
                ))}
              </section>
            ))}
          </div>
        ) : (
          <div className="viewer-empty">{t('fileViewer.previewUnavailable')}</div>
        )}
      </div>
    </div>
  );
}

function HtmlViewer({
  projectId,
  file,
  liveHtml,
  isDeck,
  onExportAsPptx,
  streaming,
  previewComments = [],
  onSavePreviewComment,
  onRemovePreviewComment,
  onSendPreviewComment,
}: {
  projectId: string;
  file: ProjectFile;
  liveHtml?: string;
  isDeck: boolean;
  onExportAsPptx?: ((fileName: string) => void) | undefined;
  streaming: boolean;
  previewComments?: PreviewComment[];
  onSavePreviewComment?: (target: PreviewCommentTarget, note: string, attachAfterSave: boolean) => Promise<PreviewComment | null>;
  onRemovePreviewComment?: (commentId: string) => Promise<void>;
  onSendPreviewComment?: (comment: PreviewComment) => void | Promise<void>;
}) {
  const t = useT();
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  const [source, setSource] = useState<string | null>(liveHtml ?? null);
  const [inlinedSource, setInlinedSource] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [presentMenuOpen, setPresentMenuOpen] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  // Template save UX. We surface a transient "Saved" pill in the share
  // menu so the user gets feedback without a noisy toast layer.
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateNote, setTemplateNote] = useState<string | null>(null);
  const [deployment, setDeployment] = useState<DeployProjectFileResponse | null>(null);
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [deployConfig, setDeployConfig] = useState<DeployConfigResponse | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployPhase, setDeployPhase] = useState<'idle' | 'deploying' | 'preparing-link'>('idle');
  const [savingDeployConfig, setSavingDeployConfig] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployResult, setDeployResult] = useState<DeployProjectFileResponse | null>(null);
  const [copiedDeployLink, setCopiedDeployLink] = useState(false);
  const [vercelToken, setVercelToken] = useState('');
  const [teamId, setTeamId] = useState('');
  const [teamSlug, setTeamSlug] = useState('');
  const [inTabPresent, setInTabPresent] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [tweaksMode, setTweaksMode] = useState(false);
  const [tweakDraft, setTweakDraft] = useState<TweakValueMap>({});
  const [commentMode, setCommentMode] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  // Opt back into the legacy inline-asset srcDoc path via `?forceInline=1`
  // on the host page. Lets users escape-hatch around the URL-load default
  // for non-deck HTML that depends on the in-iframe localStorage shim.
  const forceInline = useMemo(
    () => (typeof window === 'undefined' ? false : parseForceInline(window.location.search)),
    [],
  );
  const [activeCommentTarget, setActiveCommentTarget] = useState<PreviewCommentSnapshot | null>(null);
  const [hoveredCommentTarget, setHoveredCommentTarget] = useState<PreviewCommentSnapshot | null>(null);
  const [liveCommentTargets, setLiveCommentTargets] = useState<Map<string, PreviewCommentSnapshot>>(() => new Map());
  const [commentDraft, setCommentDraft] = useState('');
  const [editDraft, setEditDraft] = useState<VisualEditDraft>(EMPTY_VISUAL_EDIT_DRAFT);
  const [editBatch, setEditBatch] = useState<VisualEditBatchItem[]>([]);
  const [editPanelPosition, setEditPanelPosition] = useState<VisualEditPanelPosition>(null);
  const previewStateKey = `${projectId}:${file.name}`;
  // Slide deck nav state: the iframe posts the active index + total count
  // back to the host every time a slide settles. Host renders prev/next
  // controls in the toolbar and reflects the count beside them.
  const [slideState, setSlideState] = useState<SlideState | null>(
    () => htmlPreviewSlideState.get(previewStateKey) ?? null,
  );
  const previewBodyRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const shareRef = useRef<HTMLDivElement | null>(null);
  const activeCommentTargetRef = useRef<PreviewCommentSnapshot | null>(null);
  const editBatchRef = useRef<VisualEditBatchItem[]>([]);

  useEffect(() => {
    if (liveHtml !== undefined) {
      setSource(liveHtml);
      return;
    }
    setSource(null);
    let cancelled = false;
    void fetchProjectFileText(projectId, file.name).then((text) => {
      if (!cancelled) setSource(text);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, file.name, file.mtime, liveHtml, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    setDeployResult(null);
    setDeployError(null);
    setCopiedDeployLink(false);
    setDeployPhase('idle');
    void fetchProjectDeployments(projectId).then((items) => {
      if (cancelled) return;
      const current = items.find(
        (item) => item.fileName === file.name && item.providerId === 'vercel-self',
      );
      setDeployment(current ?? null);
      setDeployResult(current ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, file.name]);

  // Detect deck-shaped HTML even when the project's skill didn't declare
  // `mode: deck`. Freeform projects often produce a deck because the user
  // asked for one in plain prose; without this, prev/next and Present
  // never surface and the deck becomes a static, unnavigable preview.
  const looksLikeDeck = useMemo(() => {
    if (!source) return false;
    return /class\s*=\s*['"][^'"]*\bslide\b/i.test(source);
  }, [source]);
  const effectiveDeck = isDeck || looksLikeDeck;
  const tweakTokens = useMemo(() => (source ? mergeTweakTokens(extractTweakTokens(source)) : FALLBACK_TWEAK_TOKENS), [source]);
  const changedTweaks = useMemo(() => changedTweakValues(tweakTokens, tweakDraft), [tweakTokens, tweakDraft]);
  const changedTweaksCount = Object.keys(changedTweaks).length;
  const previewSource = inlinedSource ?? source;
  const liveTweakCss = useMemo(
    () => (tweaksMode && changedTweaksCount > 0 ? tweakPreviewStyle(changedTweaks) : ''),
    [tweaksMode, changedTweaks, changedTweaksCount],
  );
  // When we URL-load the iframe directly, skip every in-host inlining /
  // srcDoc-rebuilding step. The browser does the asset resolution itself,
  // which is the whole point of the URL-load path.
  const useUrlLoadPreview = shouldUrlLoadHtmlPreview({
    mode,
    isDeck: effectiveDeck,
    commentMode: commentMode || editMode || drawMode || tweaksMode,
    forceInline,
  });
  const previewSrcUrl = useMemo(
    () => `${projectRawUrl(projectId, file.name)}?v=${Math.round(file.mtime)}&r=${reloadKey}`,
    [projectId, file.name, file.mtime, reloadKey],
  );

  useEffect(() => {
    setInlinedSource(null);
    if (useUrlLoadPreview) return;
    if (!source || effectiveDeck || !hasRelativeAssetRefs(source)) return;
    let cancelled = false;
    void inlineRelativeAssets(source, projectId, file.name).then((next) => {
      if (!cancelled) setInlinedSource(next);
    });
    return () => {
      cancelled = true;
    };
  }, [source, effectiveDeck, projectId, file.name, useUrlLoadPreview]);

  const srcDoc = useMemo(
    () => (previewSource ? buildSrcdoc(previewSource, {
      deck: effectiveDeck,
      baseHref: projectRawUrl(projectId, baseDirFor(file.name)),
      initialSlideIndex: htmlPreviewSlideState.get(previewStateKey)?.active ?? 0,
      commentBridge: commentMode || editMode || drawMode,
      tweakBridge: tweaksMode,
    }) : ''),
    [previewSource, effectiveDeck, projectId, file.name, previewStateKey, commentMode, editMode, drawMode, tweaksMode],
  );

  useEffect(() => {
    if (!effectiveDeck) {
      setSlideState(null);
      return;
    }
    setSlideState(htmlPreviewSlideState.get(previewStateKey) ?? null);
    function onMessage(ev: MessageEvent) {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const data = ev?.data as
        | { type?: string; active?: number; count?: number }
        | null;
      if (!data || data.type !== 'od:slide-state') return;
      if (typeof data.active !== 'number' || typeof data.count !== 'number') return;
      const next = { active: data.active, count: data.count };
      htmlPreviewSlideState.set(previewStateKey, next);
      setSlideState(next);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [effectiveDeck, previewStateKey]);

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'od:comment-mode', enabled: commentMode || editMode || drawMode }, '*');
  }, [commentMode, editMode, drawMode, srcDoc]);

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'od:tweaks-preview', css: liveTweakCss }, '*');
  }, [liveTweakCss, srcDoc]);

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    if (!editMode) {
      win.postMessage({ type: 'od:visual-edit-preview', clear: true }, '*');
      return;
    }
    const edits = editBatchRef.current.map((item) => ({
      selector: item.snapshot.selector,
      draft: item.draft,
    }));
    if (activeCommentTarget) {
      edits.push({
        selector: activeCommentTarget.selector,
        draft: editDraft,
      });
    }
    if (edits.length === 0) {
      win.postMessage({ type: 'od:visual-edit-preview', clear: true }, '*');
      return;
    }
    win.postMessage({
      type: 'od:visual-edit-preview',
      edits,
    }, '*');
  }, [editMode, activeCommentTarget, editDraft, srcDoc]);

  useEffect(() => {
    setActiveCommentTarget(null);
    setHoveredCommentTarget(null);
    setLiveCommentTargets(new Map());
    setCommentDraft('');
    setEditDraft(EMPTY_VISUAL_EDIT_DRAFT);
    setEditBatch([]);
    editBatchRef.current = [];
    setEditPanelPosition(null);
    setTweaksMode(false);
    setTweakDraft({});
    setEditMode(false);
    setDrawMode(false);
  }, [file.name]);

  useEffect(() => {
    activeCommentTargetRef.current = activeCommentTarget;
  }, [activeCommentTarget]);

  useEffect(() => {
    if (!commentMode && !editMode && !drawMode) {
      setActiveCommentTarget(null);
      setHoveredCommentTarget(null);
      setLiveCommentTargets(new Map());
      return;
    }
    const snapshotFromData = (data: Partial<PreviewCommentSnapshot>): PreviewCommentSnapshot => ({
      filePath: file.name,
      elementId: String(data.elementId || ''),
      selector: String(data.selector || ''),
      label: String(data.label || ''),
      text: String(data.text || ''),
      position: {
        x: Number(data.position?.x) || 0,
        y: Number(data.position?.y) || 0,
        width: Number(data.position?.width) || 0,
        height: Number(data.position?.height) || 0,
      },
      htmlHint: String(data.htmlHint || ''),
      styles: stylesFromSnapshotData(data.styles),
    });
    function onMessage(ev: MessageEvent) {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const data = ev.data as (Partial<PreviewCommentSnapshot> & {
        type?: string;
        targets?: Array<Partial<PreviewCommentSnapshot>>;
      }) | null;
      if (!data?.type) return;
      if (data.type === 'od:comment-targets' && Array.isArray(data.targets)) {
        const next = new Map<string, PreviewCommentSnapshot>();
        data.targets.forEach((item) => {
          const snapshot = snapshotFromData(item);
          if (snapshot.elementId) next.set(snapshot.elementId, snapshot);
        });
        setLiveCommentTargets(next);
        setActiveCommentTarget((current) => (
          current ? editMode ? current : next.get(current.elementId) ?? null : null
        ));
        setHoveredCommentTarget((current) => (
          current ? next.get(current.elementId) ?? null : null
        ));
        return;
      }
      if (data.type === 'od:comment-leave') {
        setHoveredCommentTarget(null);
        return;
      }
      if (data.type === 'od:comment-hover') {
        const snapshot = snapshotFromData(data);
        if (!snapshot.elementId) return;
        const lockedTarget = activeCommentTargetRef.current;
        if (editMode && lockedTarget && snapshot.elementId !== lockedTarget.elementId) return;
        setHoveredCommentTarget(snapshot);
        setLiveCommentTargets((current) => new Map(current).set(snapshot.elementId, snapshot));
        return;
      }
      if (data.type === 'od:comment-target') {
        if (!commentMode && !editMode) return;
        const snapshot = snapshotFromData(data);
        if (!snapshot.elementId) return;
        const lockedTarget = activeCommentTargetRef.current;
        if (editMode && lockedTarget && snapshot.elementId !== lockedTarget.elementId) return;
        const existing = previewComments.find((comment) => comment.elementId === snapshot.elementId);
        setActiveCommentTarget(snapshot);
        setHoveredCommentTarget(snapshot);
        setLiveCommentTargets((current) => new Map(current).set(snapshot.elementId, snapshot));
        if (editMode) setEditDraft(visualEditDraftFromSnapshot(snapshot));
        else setCommentDraft(existing?.note ?? '');
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [commentMode, editMode, drawMode, file.name, previewComments]);

  function postSlide(action: 'next' | 'prev' | 'first' | 'last') {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'od:slide', action }, '*');
  }

  // Keyboard nav on the host, so the user can press ←/→ even when focus
  // is on the chat composer or any other host control.
  useEffect(() => {
    if (!effectiveDeck || mode !== 'preview') return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        postSlide('next');
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        postSlide('prev');
      } else if (e.key === 'Home') {
        e.preventDefault();
        postSlide('first');
      } else if (e.key === 'End') {
        e.preventDefault();
        postSlide('last');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [effectiveDeck, mode]);

  useEffect(() => {
    if (!presentMenuOpen) return;
    const onPointer = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('.present-wrap')) return;
      setPresentMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresentMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [presentMenuOpen]);

  useEffect(() => {
    if (!shareMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!shareRef.current) return;
      if (!shareRef.current.contains(e.target as Node)) setShareMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShareMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [shareMenuOpen]);

  useEffect(() => {
    if (!inTabPresent) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInTabPresent(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [inTabPresent]);

  function openInNewTab() {
    if (!source) return;
    openSandboxedPreviewInNewTab(source, exportTitle, {
      deck: effectiveDeck,
      baseHref: projectRawUrl(projectId, baseDirFor(file.name)),
      initialSlideIndex: htmlPreviewSlideState.get(previewStateKey)?.active ?? 0,
    });
  }

  // Snapshot this project as a reusable template. The daemon snapshots
  // EVERY html/text/code file in the project (not just the file open in
  // the viewer), so the template captures the whole design, not a single
  // page. Surfaced here in the Share menu because that's where the user's
  // share / export mental model already lives.
  async function handleSaveAsTemplate() {
    setShareMenuOpen(false);
    const defaultName =
      file.name.replace(/\.html?$/i, '') || t('fileViewer.templateNameDefault');
    const name = window.prompt(t('fileViewer.templateNamePrompt'), defaultName);
    if (!name || !name.trim()) return;
    const description = window.prompt(
      t('fileViewer.templateDescPrompt'),
      '',
    );
    setSavingTemplate(true);
    setTemplateNote(null);
    try {
      const tpl = await saveTemplate({
        name: name.trim(),
        description: description?.trim() || undefined,
        sourceProjectId: projectId,
      });
      setTemplateNote(
        tpl
          ? t('fileViewer.savedTemplate', { name: tpl.name })
          : t('fileViewer.savedTemplateFail'),
      );
    } finally {
      setSavingTemplate(false);
      // Auto-clear the note so the menu doesn't keep stale state next open.
      setTimeout(() => setTemplateNote(null), 4000);
    }
  }

  async function openDeployModal() {
    setShareMenuOpen(false);
    setDeployModalOpen(true);
    setDeployError(null);
    setCopiedDeployLink(false);
    setDeployPhase('idle');
    const [config, deployments] = await Promise.all([
      fetchDeployConfig(),
      fetchProjectDeployments(projectId),
    ]);
    if (config) {
      setDeployConfig(config);
      setVercelToken(config.tokenMask || '');
      setTeamId(config.teamId || '');
      setTeamSlug(config.teamSlug || '');
    }
    const current = deployments.find(
      (item) => item.fileName === file.name && item.providerId === 'vercel-self',
    );
    setDeployment(current ?? null);
    setDeployResult(current ?? null);
  }

  async function saveDeployConfig() {
    setSavingDeployConfig(true);
    setDeployError(null);
    try {
      const config = await updateDeployConfig({
        token: vercelToken,
        teamId,
        teamSlug,
      });
      if (!config) throw new Error(t('fileViewer.deployConfigSaveFailed'));
      setDeployConfig(config);
      setVercelToken(config.tokenMask || '');
      setTeamId(config.teamId || '');
      setTeamSlug(config.teamSlug || '');
      return config;
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : t('fileViewer.deployConfigSaveFailed'));
      return null;
    } finally {
      setSavingDeployConfig(false);
    }
  }

  async function deployToVercel() {
    setDeploying(true);
    setDeployPhase('deploying');
    setDeployError(null);
    setCopiedDeployLink(false);
    try {
      const typedToken = vercelToken.trim();
      const hasNewToken = typedToken && typedToken !== deployConfig?.tokenMask;
      const needsConfigSave =
        hasNewToken ||
        teamId.trim() !== (deployConfig?.teamId || '') ||
        teamSlug.trim() !== (deployConfig?.teamSlug || '') ||
        !deployConfig?.configured;
      if (needsConfigSave) {
        const nextConfig = await saveDeployConfig();
        if (!nextConfig?.configured) {
          throw new Error(t('fileViewer.vercelTokenRequired'));
        }
      }
      setDeployPhase('preparing-link');
      const next = await deployProjectFile(projectId, file.name);
      setDeployment(next);
      setDeployResult(next);
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : t('fileViewer.deployFailed'));
    } finally {
      setDeploying(false);
      setDeployPhase('idle');
    }
  }

  async function retryDeploymentLink() {
    const current = deployResult || deployment;
    if (!current?.id) return;
    setDeployError(null);
    setDeployPhase('preparing-link');
    try {
      const next = await checkDeploymentLink(projectId, current.id);
      setDeployment(next);
      setDeployResult(next);
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : t('fileViewer.deployFailed'));
    } finally {
      setDeployPhase('idle');
    }
  }

  async function copyDeployLink(url: string) {
    const safeUrl = url.trim();
    if (!safeUrl) return;
    try {
      await navigator.clipboard.writeText(safeUrl);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = safeUrl;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.top = '-1000px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopiedDeployLink(true);
    window.setTimeout(() => setCopiedDeployLink(false), 1800);
  }

  function presentInThisTab() {
    setPresentMenuOpen(false);
    setInTabPresent(true);
  }

  function presentFullscreen() {
    setPresentMenuOpen(false);
    const el = previewBodyRef.current;
    if (el && typeof el.requestFullscreen === 'function') {
      el.requestFullscreen().catch(() => setInTabPresent(true));
    } else {
      setInTabPresent(true);
    }
  }

  function presentNewTab() {
    setPresentMenuOpen(false);
    openInNewTab();
  }

  function bumpZoom(delta: number) {
    setZoom((z) => Math.max(25, Math.min(200, z + delta)));
  }

  function toggleCommentMode() {
    setMode('preview');
    setTweaksMode(false);
    setDrawMode(false);
    setEditMode(false);
    setCommentMode((v) => !v);
  }

  function toggleEditMode() {
    setMode('preview');
    setTweaksMode(false);
    setDrawMode(false);
    setCommentMode(false);
    setEditMode((value) => !value);
  }

  function toggleDrawMode() {
    setMode('preview');
    setTweaksMode(false);
    setCommentMode(false);
    setEditMode(false);
    setDrawMode((value) => !value);
  }

  function toggleTweaksMode() {
    setMode('preview');
    setCommentMode(false);
    setEditMode(false);
    setDrawMode(false);
    setTweaksMode((value) => !value);
  }

  const showPresent = effectiveDeck && source !== null;
  const canShare = source !== null;
  const exportTitle = file.name.replace(/\.html?$/i, '') || file.name;
  const canPptx = canShare && Boolean(onExportAsPptx) && !streaming;
  const previewScale = zoom / 100;
  const activeDeployment = deployResult || deployment;
  const activeDeployedUrl = activeDeployment?.url?.trim() || '';
  const activeDeploymentReady = activeDeployment?.status === 'ready';
  const activeDeploymentDelayed = activeDeployment?.status === 'link-delayed';
  const activeDeploymentProtected = activeDeployment?.status === 'protected';
  const activeDeploymentNeedsRetry = activeDeploymentDelayed || activeDeploymentProtected;
  const copyDeployLabel = copiedDeployLink
    ? t('fileViewer.copied')
    : t('fileViewer.copyDeployLink');
  const editFontChoices = availableFontChoices(source ?? '', activeCommentTarget);

  function setTweakValue(name: string, value: string) {
    setTweakDraft((current) => ({ ...current, [name]: value }));
  }

  function applyTweakPreset(preset: TweakPreset) {
    setTweakDraft((current) => presetTweakValues(tweakTokens, preset, current));
  }

  async function saveTweaksDirectly() {
    if (!source || streaming || changedTweaksCount === 0) return;
    const nextSource = applyTweakValuesToHtmlSource(source, changedTweaks);
    if (nextSource === source) return;
    const saved = await writeProjectTextFile(projectId, file.name, nextSource);
    if (!saved) return;
    setSource(nextSource);
    setInlinedSource(null);
    setTweakDraft({});
    setReloadKey((value) => value + 1);
  }

  function clearVisualEditBatch() {
    editBatchRef.current = [];
    setEditBatch([]);
    const win = iframeRef.current?.contentWindow;
    const active = activeCommentTargetRef.current;
    if (!win) return;
    if (editMode && active) {
      win.postMessage({
        type: 'od:visual-edit-preview',
        edits: [{ selector: active.selector, draft: editDraft }],
      }, '*');
      return;
    }
    win.postMessage({ type: 'od:visual-edit-preview', clear: true }, '*');
  }

  function queueCurrentVisualEdit() {
    if (!activeCommentTarget) return;
    const item = makeVisualEditBatchItem(activeCommentTarget, editDraft);
    const next = upsertVisualEditBatch(editBatchRef.current, item);
    editBatchRef.current = next;
    setEditBatch(next);
    setActiveCommentTarget(null);
    setHoveredCommentTarget(null);
    setEditDraft(EMPTY_VISUAL_EDIT_DRAFT);
  }

  async function sendVisualEditBatch() {
    const currentItems = activeCommentTarget
      ? upsertVisualEditBatch(editBatchRef.current, makeVisualEditBatchItem(activeCommentTarget, editDraft))
      : editBatchRef.current;
    if (!currentItems.length || !onSavePreviewComment || !onSendPreviewComment || streaming) return;
    const saved = await onSavePreviewComment(
      targetFromSnapshot(currentItems[0].snapshot),
      composeVisualEditBatchNote(currentItems),
      false,
    );
    if (!saved) return;
    currentItems.forEach((item) => rememberFontChoice(item.draft.fontFamily));
    await onSendPreviewComment(saved);
    editBatchRef.current = [];
    setEditBatch([]);
    setActiveCommentTarget(null);
    setHoveredCommentTarget(null);
    setEditDraft(EMPTY_VISUAL_EDIT_DRAFT);
    setEditMode(false);
  }

  return (
    <div className="viewer html-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <button
            type="button"
            className="icon-only"
            onClick={() => setReloadKey((n) => n + 1)}
            title={t('fileViewer.reload')}
            aria-label={t('fileViewer.reloadAria')}
          >
            <Icon name="reload" size={14} />
          </button>
          {effectiveDeck ? (
            <span
              className="deck-nav"
              role="group"
              aria-label={t('fileViewer.slideNavAria')}
            >
              <button
                type="button"
                className="icon-only"
                onClick={() => postSlide('prev')}
                title={t('fileViewer.previousSlide')}
                aria-label={t('fileViewer.previousSlide')}
                disabled={slideState !== null && slideState.active <= 0}
              >
                <Icon name="chevron-right" size={14} style={{ transform: 'rotate(180deg)' }} />
              </button>
              <span className="deck-nav-counter">
                {slideState
                  ? `${slideState.active + 1} / ${slideState.count}`
                  : '— / —'}
              </span>
              <button
                type="button"
                className="icon-only"
                onClick={() => postSlide('next')}
                title={t('fileViewer.nextSlide')}
                aria-label={t('fileViewer.nextSlide')}
                disabled={
                  slideState !== null &&
                  slideState.active >= slideState.count - 1
                }
              >
                <Icon name="chevron-right" size={14} />
              </button>
            </span>
          ) : null}
          <button
            type="button"
            className={`viewer-toggle${tweaksMode ? ' on' : ''}`}
            disabled={source === null || streaming}
            title={t('fileViewer.tweaks')}
            aria-pressed={tweaksMode}
            onClick={toggleTweaksMode}
          >
            <Icon name="tweaks" size={13} />
            <span>{t('fileViewer.tweaks')}</span>
            <span className="switch" aria-hidden />
          </button>
        </div>
        <div className="viewer-toolbar-actions">
          <div className="viewer-tabs">
            <button
              className={`viewer-tab ${mode === 'preview' ? 'active' : ''}`}
              onClick={() => setMode('preview')}
            >
              {t('fileViewer.preview')}
            </button>
            <button
              className={`viewer-tab ${mode === 'source' ? 'active' : ''}`}
              onClick={() => setMode('source')}
            >
              {t('fileViewer.source')}
            </button>
          </div>
          <span className="viewer-divider" aria-hidden />
          <button
            className={`viewer-action${commentMode ? ' active' : ''}`}
            type="button"
            data-testid="comment-mode-toggle"
            title={t('fileViewer.comment')}
            aria-pressed={commentMode}
            disabled={!onSavePreviewComment || streaming}
            onClick={toggleCommentMode}
          >
            <Icon name="comment" size={13} />
            <span>{t('fileViewer.comment')}</span>
          </button>
          <button
            className={`viewer-action${editMode ? ' active' : ''}`}
            type="button"
            data-testid="edit-mode-toggle"
            title={t('fileViewer.edit')}
            aria-pressed={editMode}
            disabled={!onSavePreviewComment || !onSendPreviewComment || streaming}
            onClick={toggleEditMode}
          >
            <Icon name="edit" size={13} />
            <span>{t('fileViewer.edit')}</span>
          </button>
          <button
            className={`viewer-action${drawMode ? ' active' : ''}`}
            type="button"
            disabled={!onSavePreviewComment || !onSendPreviewComment || streaming}
            title={t('fileViewer.draw')}
            aria-pressed={drawMode}
            onClick={toggleDrawMode}
          >
            <Icon name="draw" size={13} />
            <span>{t('fileViewer.draw')}</span>
          </button>
          <span className="viewer-divider" aria-hidden />
          <button
            type="button"
            className="icon-only"
            onClick={() => bumpZoom(-25)}
            title={t('fileViewer.zoomOut')}
            aria-label={t('fileViewer.zoomOut')}
          >
            <Icon name="minus" size={14} />
          </button>
          <button
            type="button"
            className="viewer-action"
            onClick={() => setZoom(100)}
            title={t('fileViewer.resetZoom')}
            style={{ minWidth: 60 }}
          >
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{zoom}%</span>
          </button>
          <button
            type="button"
            className="icon-only"
            onClick={() => bumpZoom(25)}
            title={t('fileViewer.zoomIn')}
            aria-label={t('fileViewer.zoomIn')}
          >
            <Icon name="plus" size={14} />
          </button>
          <span className="viewer-divider" aria-hidden />
          {showPresent ? (
            <div className="present-wrap">
              <button
                className="viewer-action present-trigger"
                aria-haspopup="menu"
                aria-expanded={presentMenuOpen}
                onClick={() => setPresentMenuOpen((v) => !v)}
              >
                <Icon name="present" size={13} />
                <span>{t('fileViewer.present')}</span>
                <Icon name="chevron-down" size={11} />
              </button>
              {presentMenuOpen ? (
                <div className="present-menu" role="menu">
                  <button role="menuitem" onClick={presentInThisTab}>
                    <span className="present-icon"><Icon name="eye" size={13} /></span>{' '}
                    {t('fileViewer.presentInTab')}
                  </button>
                  <button role="menuitem" onClick={presentFullscreen}>
                    <span className="present-icon"><Icon name="play" size={13} /></span>{' '}
                    {t('fileViewer.presentFullscreen')}
                  </button>
                  <button role="menuitem" onClick={presentNewTab}>
                    <span className="present-icon"><Icon name="share" size={13} /></span>{' '}
                    {t('fileViewer.presentNewTab')}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {canShare ? (
            <div className="share-menu" ref={shareRef}>
              <button
                className="viewer-action primary"
                aria-haspopup="menu"
                aria-expanded={shareMenuOpen}
                onClick={() => setShareMenuOpen((v) => !v)}
              >
                <span>{t('fileViewer.shareLabel')}</span>
                <Icon name="chevron-down" size={11} />
              </button>
              {shareMenuOpen ? (
                <div className="share-menu-popover" role="menu">
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setShareMenuOpen(false);
                      exportAsPdf(source ?? '', exportTitle, { deck: effectiveDeck });
                    }}
                  >
                    <span className="share-menu-icon"><Icon name="file" size={14} /></span>
                    <span>
                      {effectiveDeck
                        ? t('fileViewer.exportPdfAllSlides')
                        : t('fileViewer.exportPdf')}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    disabled={!canPptx}
                    title={
                      onExportAsPptx
                        ? streaming
                          ? t('fileViewer.exportPptxBusy')
                          : t('fileViewer.exportPptxHint')
                        : t('fileViewer.exportPptxNa')
                    }
                    onClick={() => {
                      setShareMenuOpen(false);
                      if (onExportAsPptx) onExportAsPptx(file.name);
                    }}
                  >
                    <span className="share-menu-icon"><Icon name="present" size={14} /></span>
                    <span>{t('fileViewer.exportPptx') + '…'}</span>
                  </button>
                  <div className="share-menu-divider" />
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setShareMenuOpen(false);
                      void exportProjectAsZip({
                        projectId,
                        filePath: file.name,
                        fallbackHtml: source ?? '',
                        fallbackTitle: exportTitle,
                      });
                    }}
                  >
                    <span className="share-menu-icon"><Icon name="download" size={14} /></span>
                    <span>{t('fileViewer.exportZip')}</span>
                  </button>
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setShareMenuOpen(false);
                      exportAsHtml(source ?? '', exportTitle);
                    }}
                  >
                    <span className="share-menu-icon"><Icon name="file-code" size={14} /></span>
                    <span>{t('fileViewer.exportHtml')}</span>
                  </button>
                  {/* Export as Markdown — pass-through download of the
                      artifact source with a `.md` extension. No conversion
                      runs; the file body is identical to the Source view.
                      Useful for piping the artifact into markdown-aware
                      tooling (LLM context windows, vault apps). See
                      issue #279. */}
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setShareMenuOpen(false);
                      exportAsMd(source ?? '', exportTitle);
                    }}
                  >
                    <span className="share-menu-icon"><Icon name="file" size={14} /></span>
                    <span>{t('fileViewer.exportMd')}</span>
                  </button>
                  <div className="share-menu-divider" />
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    disabled={savingTemplate}
                    onClick={() => {
                      void handleSaveAsTemplate();
                    }}
                  >
                    <span className="share-menu-icon"><Icon name="copy" size={14} /></span>
                    <span>
                      {savingTemplate
                        ? t('fileViewer.savingTemplate')
                        : templateNote
                          ? templateNote
                          : t('fileViewer.saveAsTemplate')}
                    </span>
                  </button>
                  <div className="share-menu-divider" />
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    onClick={() => {
                      void openDeployModal();
                    }}
                  >
                    <span className="share-menu-icon"><Icon name="upload" size={14} /></span>
                    <span>
                      {activeDeployedUrl
                        ? t('fileViewer.redeployToVercel')
                        : t('fileViewer.deployToVercel')}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    disabled={!activeDeployedUrl}
                    onClick={() => {
                      setShareMenuOpen(false);
                      void copyDeployLink(activeDeployedUrl);
                    }}
                  >
                    <span className="share-menu-icon"><Icon name="copy" size={14} /></span>
                    <span>
                      {copyDeployLabel}
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="viewer-body" ref={previewBodyRef}>
        {source === null ? (
          <div className="viewer-empty">{t('fileViewer.loading')}</div>
        ) : mode === 'preview' ? (
          <div className="comment-preview-layer">
            <div
              style={{
                width: `${100 / previewScale}%`,
                height: `${100 / previewScale}%`,
                transform: `scale(${previewScale})`,
                transformOrigin: '0 0',
              }}
            >
              {useUrlLoadPreview ? (
                <iframe
                  ref={iframeRef}
                  data-testid="artifact-preview-frame"
                  data-od-render-mode="url-load"
                  title={file.name}
                  sandbox="allow-scripts"
                  src={previewSrcUrl}
                  onLoad={() => iframeRef.current?.contentWindow?.postMessage({ type: 'od:tweaks-preview', css: liveTweakCss }, '*')}
                />
              ) : (
                <iframe
                  ref={iframeRef}
                  data-testid="artifact-preview-frame"
                  data-od-render-mode="srcdoc"
                  title={file.name}
                  sandbox="allow-scripts"
                  srcDoc={srcDoc}
                  onLoad={() => iframeRef.current?.contentWindow?.postMessage({ type: 'od:tweaks-preview', css: liveTweakCss }, '*')}
                />
              )}
            </div>
            {tweaksMode ? (
              <TweaksPanel
                tokens={tweakTokens}
                values={tweakDraft}
                changedCount={changedTweaksCount}
                disabled={streaming || source === null}
                onChange={setTweakValue}
                onReset={() => setTweakDraft({})}
                onPreset={applyTweakPreset}
                onSave={saveTweaksDirectly}
                onClose={() => setTweaksMode(false)}
              />
            ) : null}
            {commentMode || editMode ? (
              <CommentPreviewOverlays
                comments={editMode ? [] : previewComments}
                liveTargets={liveCommentTargets}
                hoveredTarget={hoveredCommentTarget}
                activeTarget={activeCommentTarget}
                scale={previewScale}
                onOpenComment={(comment, snapshot) => {
                  setActiveCommentTarget(snapshot);
                  setHoveredCommentTarget(snapshot);
                  if (editMode) setEditDraft(visualEditDraftFromSnapshot(snapshot));
                  else setCommentDraft(comment.note);
                }}
              />
            ) : null}
            {commentMode && activeCommentTarget ? (
              <CommentPopover
                target={activeCommentTarget}
                existing={previewComments.find((comment) => comment.elementId === activeCommentTarget.elementId) ?? null}
                draft={commentDraft}
                onDraft={setCommentDraft}
                onClose={() => setActiveCommentTarget(null)}
                onSave={async (attach) => {
                  if (!commentDraft.trim() || !onSavePreviewComment) return;
                  if (streaming && attach) return;
                  const shouldSend = attach && Boolean(onSendPreviewComment);
                  const saved = await onSavePreviewComment(targetFromSnapshot(activeCommentTarget), commentDraft.trim(), attach && !shouldSend);
                  if (!saved) return;
                  if (shouldSend) {
                    await onSendPreviewComment?.(saved);
                    setCommentMode(false);
                  }
                  setActiveCommentTarget(null);
                }}
                onRemove={async (commentId) => {
                  if (!onRemovePreviewComment) return;
                  await onRemovePreviewComment(commentId);
                  setActiveCommentTarget(null);
                }}
                disabled={streaming}
                scale={previewScale}
                t={t}
              />
            ) : null}
            {editMode && activeCommentTarget ? (
              <VisualEditPanel
                target={activeCommentTarget}
                draft={editDraft}
                fontChoices={editFontChoices}
                queuedCount={editBatch.length}
                panelPosition={editPanelPosition}
                onDraft={setEditDraft}
                onPanelPosition={setEditPanelPosition}
                onClose={() => {
                  setActiveCommentTarget(null);
                  setHoveredCommentTarget(null);
                  setEditDraft(EMPTY_VISUAL_EDIT_DRAFT);
                }}
                onQueue={queueCurrentVisualEdit}
                onSendQueue={sendVisualEditBatch}
                onClearQueue={clearVisualEditBatch}
                onDirectSave={async () => {
                  if (!source || streaming) return;
                  const nextSource = applyVisualEditToHtmlSource(source, activeCommentTarget, editDraft);
                  if (!nextSource) return;
                  const saved = await writeProjectTextFile(projectId, file.name, nextSource);
                  if (!saved) return;
                  rememberFontChoice(editDraft.fontFamily);
                  setSource(nextSource);
                  setInlinedSource(null);
                  setReloadKey((value) => value + 1);
                  setActiveCommentTarget(null);
                  setEditMode(false);
                }}
                onApply={async () => {
                  await sendVisualEditBatch();
                }}
                disabled={streaming}
                scale={previewScale}
              />
            ) : null}
            {editMode && !activeCommentTarget && editBatch.length > 0 ? (
              <div className="visual-edit-batch-dock">
                <span>{editBatch.length} alteração{editBatch.length === 1 ? '' : 'es'} pronta{editBatch.length === 1 ? '' : 's'}</span>
                <small>Selecione outro elemento ou envie tudo para a IA.</small>
                <div>
                  <button type="button" onClick={clearVisualEditBatch}>Limpar</button>
                  <button type="button" className="primary" disabled={streaming} onClick={() => void sendVisualEditBatch()}>
                    Enviar tudo
                  </button>
                </div>
              </div>
            ) : null}
            {drawMode ? (
              <PreviewDrawOverlay
                fileName={file.name}
                scale={previewScale}
                liveTargets={liveCommentTargets}
                disabled={streaming}
                onClose={() => setDrawMode(false)}
                onSubmit={async ({ target, note }) => {
                  if (!onSavePreviewComment || !onSendPreviewComment || streaming) return;
                  const saved = await onSavePreviewComment(target, note, false);
                  if (!saved) return;
                  await onSendPreviewComment(saved);
                  setDrawMode(false);
                }}
              />
            ) : null}
          </div>
        ) : (
          <pre className="viewer-source">{source}</pre>
        )}
      </div>
      {inTabPresent && source ? (
        <div
          className="present-overlay"
          role="dialog"
          aria-label={t('fileViewer.exitPresentation')}
        >
          <button
            className="present-exit"
            onClick={() => setInTabPresent(false)}
            aria-label={t('fileViewer.exitPresentation')}
          >
            <Icon name="close" size={13} /> {t('fileViewer.exitPresentation')}
          </button>
          {useUrlLoadPreview ? (
            <iframe
              title="present"
              sandbox="allow-scripts"
              data-od-render-mode="url-load"
              src={previewSrcUrl}
            />
          ) : (
            <iframe
              title="present"
              sandbox="allow-scripts"
              data-od-render-mode="srcdoc"
              srcDoc={srcDoc}
            />
          )}
        </div>
      ) : null}
      {deployModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal deploy-modal" role="dialog" aria-modal="true">
            <div className="modal-head">
              <div className="kicker">VERCEL</div>
              <h2>{t('fileViewer.deployModalTitle')}</h2>
              <p className="subtitle">{t('fileViewer.deployModalSubtitle')}</p>
            </div>
            <div className="deploy-form">
              <div className="field-label-row">
                <label htmlFor="vercel-token">{t('fileViewer.vercelToken')}</label>
                <a
                  href="https://vercel.com/account/settings/tokens"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {t('fileViewer.vercelTokenGetLink')}
                </a>
              </div>
              <input
                id="vercel-token"
                type="password"
                value={vercelToken}
                placeholder={t('fileViewer.vercelTokenPlaceholder')}
                onChange={(e) => setVercelToken(e.target.value)}
              />
              <div className="deploy-config-actions">
                <button
                  type="button"
                  className="ghost-link button-like"
                  disabled={savingDeployConfig}
                  onClick={() => {
                    void saveDeployConfig();
                  }}
                >
                  {savingDeployConfig ? t('fileViewer.savingConfig') : t('fileViewer.save')}
                </button>
              </div>
              {deployConfig?.configured ? (
                <p className="hint">{t('fileViewer.vercelTokenReuseHint')}</p>
              ) : null}
              <div className="deploy-field-grid">
                <label>
                  <span>{t('fileViewer.vercelTeamId')}</span>
                  <input
                    value={teamId}
                    placeholder={t('fileViewer.optional')}
                    onChange={(e) => setTeamId(e.target.value)}
                  />
                </label>
                <label>
                  <span>{t('fileViewer.vercelTeamSlug')}</span>
                  <input
                    value={teamSlug}
                    placeholder={t('fileViewer.optional')}
                    onChange={(e) => setTeamSlug(e.target.value)}
                  />
                </label>
              </div>
              <p className="hint">{t('fileViewer.vercelPreviewOnly')}</p>
              {deployError ? <p className="deploy-error">{deployError}</p> : null}
              {activeDeployedUrl ? (
                <div
                  className={`deploy-result ${
                    activeDeploymentProtected ? 'protected' : activeDeploymentDelayed ? 'delayed' : 'ready'
                  }`}
                >
                  <div className="deploy-result-label">
                    {activeDeploymentProtected
                      ? t('fileViewer.deployLinkProtectedLabel')
                      : activeDeploymentDelayed
                      ? t('fileViewer.deployLinkPreparingLabel')
                      : t('fileViewer.deployResultLabel')}
                  </div>
                  {activeDeploymentNeedsRetry ? (
                    <p className="deploy-result-message">
                      {activeDeploymentProtected
                        ? t('fileViewer.deployLinkProtected')
                        : t('fileViewer.deployLinkDelayed')}
                    </p>
                  ) : null}
                  <a href={activeDeployedUrl} target="_blank" rel="noreferrer noopener">
                    {activeDeployedUrl}
                  </a>
                  <div className="deploy-result-actions">
                    {activeDeploymentNeedsRetry ? (
                      <button
                        type="button"
                        className="viewer-action"
                        disabled={deployPhase === 'preparing-link'}
                        onClick={() => {
                          void retryDeploymentLink();
                        }}
                      >
                        {deployPhase === 'preparing-link'
                          ? t('fileViewer.preparingPublicLink')
                          : t('fileViewer.retryLink')}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="viewer-action"
                      onClick={() => {
                        void copyDeployLink(activeDeployedUrl);
                      }}
                    >
                      <Icon name="copy" size={14} />
                      <span>{copyDeployLabel}</span>
                    </button>
                    <a
                      className={`ghost-link ${activeDeploymentReady ? '' : 'disabled'}`}
                      href={activeDeploymentReady ? activeDeployedUrl : undefined}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-disabled={!activeDeploymentReady}
                    >
                      <Icon name="upload" size={14} />
                      {t('fileViewer.open')}
                    </a>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="modal-foot">
              <button
                type="button"
                className="ghost-link button-like"
                onClick={() => setDeployModalOpen(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="viewer-action primary"
                disabled={deploying || savingDeployConfig || deployPhase !== 'idle'}
                onClick={() => {
                  void deployToVercel();
                }}
              >
                {deployPhase === 'deploying'
                  ? t('fileViewer.deployingToVercel')
                  : deployPhase === 'preparing-link'
                    ? t('fileViewer.preparingPublicLink')
                    : t('fileViewer.deployToVercel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function baseDirFor(fileName: string): string {
  const idx = fileName.lastIndexOf('/');
  return idx >= 0 ? fileName.slice(0, idx + 1) : '';
}

function hasRelativeAssetRefs(html: string): boolean {
  const attr = /\s(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = attr.exec(html)) !== null) {
    const value = match[1]?.trim();
    if (!value) continue;
    if (/^(?:https?:|data:|blob:|mailto:|tel:|#|\/)/i.test(value)) continue;
    return true;
  }
  return false;
}

async function inlineRelativeAssets(
  html: string,
  projectId: string,
  fileName: string,
): Promise<string> {
  const replacements: Array<Promise<{ from: string; to: string } | null>> = [];
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of links) {
    const rel = readHtmlAttr(tag, 'rel');
    const href = readHtmlAttr(tag, 'href');
    if (!rel || !/\bstylesheet\b/i.test(rel) || !href) continue;
    replacements.push(
      fetchProjectRelativeText(projectId, fileName, href).then((css) =>
        css == null
          ? null
          : {
              from: tag,
              to:
                `<style data-od-inline-asset="${escapeHtmlAttr(href)}">\n` +
                `${css.replace(/<\/style/gi, '<\\/style')}\n</style>`,
            },
      ),
    );
  }

  const scripts = html.match(/<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>\s*<\/script>/gi) ?? [];
  for (const tag of scripts) {
    const src = readHtmlAttr(tag, 'src');
    if (!src) continue;
    replacements.push(
      fetchProjectRelativeText(projectId, fileName, src).then((js) => {
        if (js == null) return null;
        const open = tag.match(/^<script\b[^>]*>/i)?.[0] ?? '<script>';
        const attrs = open
          .replace(/^<script/i, '')
          .replace(/>$/i, '')
          .replace(/\ssrc\s*=\s*(['"])[\s\S]*?\1/i, '');
        return {
          from: tag,
          to: `<script${attrs}>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`,
        };
      }),
    );
  }

  const resolved = (await Promise.all(replacements)).filter(
    (item): item is { from: string; to: string } => item !== null,
  );
  return resolved.reduce((next, { from, to }) => next.replace(from, () => to), html);
}

async function fetchProjectRelativeText(
  projectId: string,
  ownerFileName: string,
  assetRef: string,
): Promise<string | null> {
  const filePath = resolveProjectRelativePath(ownerFileName, assetRef);
  if (!filePath) return null;
  try {
    const resp = await fetch(projectRawUrl(projectId, filePath));
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

function resolveProjectRelativePath(ownerFileName: string, assetRef: string): string | null {
  if (/^(?:https?:|data:|blob:|mailto:|tel:|#|\/)/i.test(assetRef)) return null;
  try {
    const url = new URL(assetRef, `https://od.local/${baseDirFor(ownerFileName)}`);
    if (url.origin !== 'https://od.local') return null;
    return decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  } catch {
    return null;
  }
}

function readHtmlAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(['"])([\\s\\S]*?)\\1`, 'i'));
  return match?.[2] ?? null;
}

function stylesFromSnapshotData(value: unknown): PreviewCommentSnapshot['styles'] {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  return {
    display: String(raw.display || ''),
    position: String(raw.position || ''),
    color: String(raw.color || ''),
    backgroundColor: String(raw.backgroundColor || ''),
    fontFamily: String(raw.fontFamily || ''),
    fontSize: String(raw.fontSize || ''),
    fontWeight: String(raw.fontWeight || ''),
    lineHeight: String(raw.lineHeight || ''),
    letterSpacing: String(raw.letterSpacing || ''),
    width: String(raw.width || ''),
    height: String(raw.height || ''),
    transform: String(raw.transform || ''),
    animationName: String(raw.animationName || ''),
    animationDuration: String(raw.animationDuration || ''),
    animationDelay: String(raw.animationDelay || ''),
    animationTimingFunction: String(raw.animationTimingFunction || ''),
    animationIterationCount: String(raw.animationIterationCount || ''),
    animationDirection: String(raw.animationDirection || ''),
    animationFillMode: String(raw.animationFillMode || ''),
  };
}

function visualEditDraftFromSnapshot(snapshot: PreviewCommentSnapshot): VisualEditDraft {
  const styles = snapshot.styles;
  return {
    ...EMPTY_VISUAL_EDIT_DRAFT,
    text: snapshot.text || '',
    fontFamily: styles?.fontFamily || '',
    fontSize: styles?.fontSize || '',
    fontWeight: styles?.fontWeight || '',
    lineHeight: styles?.lineHeight || '',
    letterSpacing: styles?.letterSpacing || '',
    color: styles?.color || '',
    backgroundColor: transparentToEmpty(styles?.backgroundColor || ''),
    width: styles?.width || (snapshot.position.width ? `${snapshot.position.width}px` : ''),
    height: styles?.height || (snapshot.position.height ? `${snapshot.position.height}px` : ''),
    animationName: styles?.animationName === 'none' ? '' : styles?.animationName || '',
    animationDuration: styles?.animationDuration || '',
    animationDelay: styles?.animationDelay || '',
    animationTimingFunction: styles?.animationTimingFunction || '',
    animationIterationCount: styles?.animationIterationCount || '',
    animationDirection: styles?.animationDirection || '',
    animationFillMode: styles?.animationFillMode || '',
  };
}

function composeVisualEditNote(snapshot: PreviewCommentSnapshot, draft: VisualEditDraft): string {
  const payload = visualEditPayload(snapshot, draft);
  return [
    'Apply this visual edit exactly to the selected element.',
    `Target file: ${snapshot.filePath}. Edit only this file for this change.`,
    'Do not create a new sibling HTML file, duplicate artifact, or blank handoff file.',
    'Blank fields mean keep the current value.',
    'For movement, choose the safest implementation for this layout: transform, margin, flex/grid alignment, absolute positioning, or responsive CSS as appropriate.',
    'Preserve unrelated elements and keep desktop/mobile behavior clean.',
    JSON.stringify(payload, null, 2),
  ].join('\n');
}

function composeVisualEditBatchNote(items: VisualEditBatchItem[]): string {
  const targetFiles = [...new Set(items.map((item) => item.snapshot.filePath).filter(Boolean))];
  return [
    'Apply these visual edits exactly. Each edit targets one element; do not merge targets unless required for responsive layout.',
    `Target file${targetFiles.length === 1 ? '' : 's'}: ${targetFiles.join(', ')}.`,
    'Do not create new sibling HTML files, duplicate artifacts, or blank handoff files.',
    'Blank fields mean keep the current value.',
    'Preserve unrelated elements and keep desktop/mobile behavior clean.',
    JSON.stringify({
      edits: items.map((item, index) => ({
        order: index + 1,
        ...visualEditPayload(item.snapshot, item.draft),
      })),
    }, null, 2),
  ].join('\n');
}

function visualEditPayload(snapshot: PreviewCommentSnapshot, draft: VisualEditDraft) {
  return {
    target: {
      elementId: snapshot.elementId,
      selector: snapshot.selector,
      label: snapshot.label,
      filePath: snapshot.filePath,
    },
    requestedChanges: {
      text: draft.text.trim(),
      typography: {
        fontFamily: draft.fontFamily.trim(),
        fontSize: draft.fontSize.trim(),
        fontWeight: draft.fontWeight.trim(),
        lineHeight: draft.lineHeight.trim(),
        letterSpacing: draft.letterSpacing.trim(),
        color: draft.color.trim(),
        backgroundColor: draft.backgroundColor.trim(),
      },
      layout: {
        width: draft.width.trim(),
        height: draft.height.trim(),
        moveX: draft.moveX,
        moveY: draft.moveY,
      },
      animation: {
        animationName: draft.animationName.trim(),
        animationDuration: draft.animationDuration.trim(),
        animationDelay: draft.animationDelay.trim(),
        animationTimingFunction: draft.animationTimingFunction.trim(),
        animationIterationCount: draft.animationIterationCount.trim(),
        animationDirection: draft.animationDirection.trim(),
        animationFillMode: draft.animationFillMode.trim(),
      },
      custom: draft.custom.trim(),
    },
    currentSnapshot: {
      text: snapshot.text,
      position: snapshot.position,
      styles: snapshot.styles ?? null,
      htmlHint: snapshot.htmlHint,
    },
  };
}

function makeVisualEditBatchItem(snapshot: PreviewCommentSnapshot, draft: VisualEditDraft): VisualEditBatchItem {
  return {
    id: `${snapshot.filePath}:${snapshot.elementId}:${snapshot.selector}`,
    snapshot,
    draft: { ...draft },
  };
}

function upsertVisualEditBatch(current: VisualEditBatchItem[], item: VisualEditBatchItem): VisualEditBatchItem[] {
  const next = current.filter((entry) => entry.id !== item.id);
  next.push(item);
  return next;
}

function transparentToEmpty(value: string): string {
  return value === 'rgba(0, 0, 0, 0)' ? '' : value;
}

function availableFontChoices(source: string, target: PreviewCommentSnapshot | null): string[] {
  const fonts = new Set<string>();
  const add = (value: string | undefined) => {
    const clean = String(value || '').trim();
    if (!clean || clean === 'inherit' || clean === 'initial' || clean === 'unset') return;
    fonts.add(clean);
  };
  const current = normalizeFontChoice(target?.styles?.fontFamily || '');
  add(current);
  const fontFaceRe = /font-family\s*:\s*([^;{}]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = fontFaceRe.exec(source))) add(match[1]);
  DEFAULT_FONT_CHOICES.forEach(add);
  const recent = recentFontChoices().filter((font) => fonts.has(font) && font !== current);
  const sorted = Array.from(fonts)
    .filter((font) => font !== current && !recent.includes(font))
    .sort((a, b) => fontDisplayName(a).localeCompare(fontDisplayName(b), undefined, { sensitivity: 'base' }));
  return [current, ...recent, ...sorted].filter(Boolean).slice(0, 36);
}

function recentFontChoices(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FONT_RECENTS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map((font) => normalizeFontChoice(String(font))).filter(Boolean).slice(0, 6) : [];
  } catch {
    return [];
  }
}

function rememberFontChoice(font: string): void {
  const normalized = normalizeFontChoice(font);
  if (!normalized || typeof window === 'undefined') return;
  const next = [normalized, ...recentFontChoices().filter((item) => item !== normalized)].slice(0, 6);
  try {
    window.localStorage.setItem(FONT_RECENTS_KEY, JSON.stringify(next));
  } catch {}
}

function normalizeFontChoice(font: string): string {
  return font.replace(/\s+/g, ' ').trim();
}

function fontDisplayName(font: string): string {
  return normalizeFontChoice(font).replaceAll('"', '').split(',')[0] || font;
}

function applyVisualEditToHtmlSource(
  source: string,
  snapshot: PreviewCommentSnapshot,
  draft: VisualEditDraft,
): string | null {
  const parser = new DOMParser();
  const isFullDocument = /^\s*(?:<!doctype|<html[\s>])/i.test(source);
  const hadDoctype = /^\s*<!doctype/i.test(source);
  const doc = parser.parseFromString(isFullDocument ? source : `<body>${source}</body>`, 'text/html');
  const target = findEditableElement(doc, snapshot);
  if (!target) return null;

  if (isTextEditableSnapshot(snapshot)) target.textContent = draft.text;
  setInlineStyle(target, 'fontFamily', draft.fontFamily);
  setInlineStyle(target, 'fontSize', draft.fontSize);
  setInlineStyle(target, 'fontWeight', draft.fontWeight);
  setInlineStyle(target, 'lineHeight', draft.lineHeight);
  setInlineStyle(target, 'letterSpacing', draft.letterSpacing);
  setInlineStyle(target, 'color', draft.color);
  setInlineStyle(target, 'backgroundColor', draft.backgroundColor);
  setInlineStyle(target, 'width', draft.width);
  setInlineStyle(target, 'height', draft.height);
  setInlineStyle(target, 'animationName', draft.animationName);
  setInlineStyle(target, 'animationDuration', draft.animationDuration);
  setInlineStyle(target, 'animationDelay', draft.animationDelay);
  setInlineStyle(target, 'animationTimingFunction', draft.animationTimingFunction);
  setInlineStyle(target, 'animationIterationCount', draft.animationIterationCount);
  setInlineStyle(target, 'animationDirection', draft.animationDirection);
  setInlineStyle(target, 'animationFillMode', draft.animationFillMode);

  if (draft.moveX || draft.moveY) {
    const existing = target.style.transform.trim();
    const withoutOldTranslate = existing.replace(/translate(?:3d|X|Y)?\([^)]*\)\s*/gi, '').trim();
    target.style.transform = `translate(${Math.round(draft.moveX)}px, ${Math.round(draft.moveY)}px)${withoutOldTranslate ? ` ${withoutOldTranslate}` : ''}`;
  }

  if (!isFullDocument) return doc.body.innerHTML;
  const html = doc.documentElement.outerHTML;
  return hadDoctype ? `<!doctype html>\n${html}` : html;
}

function findEditableElement(doc: Document, snapshot: PreviewCommentSnapshot): HTMLElement | null {
  const bySelector = safeQuery(doc, snapshot.selector);
  if (bySelector) return bySelector;
  const id = snapshot.elementId;
  const byOdId = safeQuery(doc, `[data-od-id="${cssAttrValue(id)}"]`);
  if (byOdId) return byOdId;
  const byScreen = safeQuery(doc, `[data-screen-label="${cssAttrValue(id)}"]`);
  if (byScreen) return byScreen;
  return doc.getElementById(id);
}

function isTextEditableSnapshot(snapshot: PreviewCommentSnapshot): boolean {
  const label = snapshot.label.toLowerCase();
  const selector = snapshot.selector.toLowerCase();
  const elementId = snapshot.elementId.toLowerCase();
  if (/^(body|html|main|section|header|footer|nav|aside|article|div)\b/.test(label)) return false;
  if (/^(body|html|main|section|header|footer|nav|aside|article|div)\b/.test(selector)) return false;
  if (/(background|hero|page|wrapper|container|layout|shell|stage|screen)/i.test(elementId)) return false;
  return /^(h1|h2|h3|h4|h5|h6|p|span|a|button|label|strong|em|small|li|figcaption|blockquote|cite|time|input|textarea)\b/.test(label)
    || /^(h1|h2|h3|h4|h5|h6|p|span|a|button|label|strong|em|small|li|figcaption|blockquote|cite|time|input|textarea)\b/.test(selector);
}

function safeQuery(doc: Document, selector: string): HTMLElement | null {
  try {
    const element = doc.querySelector(selector);
    return element instanceof HTMLElement ? element : null;
  } catch {
    return null;
  }
}

function setInlineStyle(element: HTMLElement, key: keyof CSSStyleDeclaration, value: string): void {
  const clean = value.trim();
  if (!clean) return;
  element.style[key as any] = clean;
}

function cssAttrValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function ImageViewer({
  projectId,
  file,
  streaming,
  onSavePreviewComment,
  onSendPreviewComment,
}: {
  projectId: string;
  file: ProjectFile;
  streaming: boolean;
  onSavePreviewComment?: (target: PreviewCommentTarget, note: string, attachAfterSave: boolean) => Promise<PreviewComment | null>;
  onSendPreviewComment?: (comment: PreviewComment) => void | Promise<void>;
}) {
  const t = useT();
  const [drawMode, setDrawMode] = useState(false);
  const url = `${projectFileUrl(projectId, file.name)}?v=${Math.round(file.mtime)}`;
  async function sendDraw({ target, note }: DrawPreviewSubmit) {
    if (!onSavePreviewComment || !onSendPreviewComment || streaming) return;
    const saved = await onSavePreviewComment({
      ...target,
      selector: 'img',
      label: `Drawing over ${file.name}`,
      text: file.name,
      htmlHint: `${target.htmlHint} sourceFile: ${file.name}`,
    }, note, false);
    if (!saved) return;
    await onSendPreviewComment(saved);
    setDrawMode(false);
  }
  return (
    <div className="viewer image-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {file.kind === 'sketch'
              ? t('fileViewer.sketchMeta', { size: humanSize(file.size) })
              : t('fileViewer.imageMeta', { size: humanSize(file.size) })}
          </span>
        </div>
        <div className="viewer-toolbar-actions">
          <a
            className="ghost-link"
            href={projectFileUrl(projectId, file.name)}
            download={file.name}
          >
            {t('fileViewer.download')}
          </a>
          <a
            className="ghost-link"
            href={projectFileUrl(projectId, file.name)}
            target="_blank"
            rel="noreferrer noopener"
          >
            {t('fileViewer.open')}
          </a>
          <button
            type="button"
            className={`viewer-action${drawMode ? ' active' : ''}`}
            disabled={!onSavePreviewComment || !onSendPreviewComment || streaming}
            title={t('fileViewer.draw')}
            aria-pressed={drawMode}
            onClick={() => setDrawMode((value) => !value)}
          >
            <Icon name="draw" size={13} />
            <span>{t('fileViewer.draw')}</span>
          </button>
        </div>
      </div>
      <div className="viewer-body image-body">
        <div className="image-draw-wrap">
          <img alt={file.name} src={url} />
          {drawMode ? (
            <PreviewDrawOverlay
              fileName={file.name}
              scale={1}
              liveTargets={new Map()}
              disabled={streaming}
              onClose={() => setDrawMode(false)}
              onSubmit={sendDraw}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function VideoViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useT();
  const url = `${projectFileUrl(projectId, file.name)}?v=${Math.round(file.mtime)}`;
  return (
    <div className="viewer video-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {t('fileViewer.videoMeta', { size: humanSize(file.size) })}
          </span>
        </div>
        <FileActions projectId={projectId} file={file} />
      </div>
      <div className="viewer-body video-body">
        <video src={url} controls playsInline preload="metadata" />
      </div>
    </div>
  );
}

function AudioViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useT();
  const url = `${projectFileUrl(projectId, file.name)}?v=${Math.round(file.mtime)}`;
  return (
    <div className="viewer audio-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {t('fileViewer.audioMeta', { size: humanSize(file.size) })}
          </span>
        </div>
        <FileActions projectId={projectId} file={file} />
      </div>
      <div className="viewer-body audio-body">
        <div className="audio-card">
          <Icon name="mic" size={28} />
          <div className="audio-card-name">{file.name}</div>
          <audio src={url} controls preload="metadata" />
        </div>
      </div>
    </div>
  );
}

type SvgViewerMode = 'preview' | 'source';

interface SvgViewerProps {
  projectId: string;
  file: ProjectFile;
  initialMode?: SvgViewerMode;
  initialSource?: string | null | undefined;
}

export function SvgViewer({
  projectId,
  file,
  initialMode = 'preview',
  initialSource,
}: SvgViewerProps) {
  const t = useT();
  const [mode, setMode] = useState<SvgViewerMode>(initialMode);
  const [source, setSource] = useState<string | null>(initialSource ?? null);
  const [loadingSource, setLoadingSource] = useState(false);
  const [sourceError, setSourceError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const url = `${projectFileUrl(projectId, file.name)}?v=${Math.round(file.mtime)}&r=${reloadKey}`;

  useEffect(() => {
    if (mode !== 'source') return;
    if (initialSource !== undefined && reloadKey === 0) return;
    let cancelled = false;
    setLoadingSource(true);
    setSourceError(false);
    void fetchProjectFileText(projectId, file.name, {
      cache: 'no-store',
      cacheBustKey: `${Math.round(file.mtime)}-${reloadKey}`,
    }).then((next) => {
      if (cancelled) return;
      if (next === null) {
        setSource('');
        setSourceError(true);
      } else {
        setSource(next);
      }
      setLoadingSource(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, file.name, file.mtime, initialSource, mode, reloadKey]);

  return (
    <div className="viewer svg-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {t('fileViewer.imageMeta', { size: humanSize(file.size) })}
          </span>
        </div>
        <div className="viewer-toolbar-actions">
          <div className="viewer-tabs">
            <button
              type="button"
              className={`viewer-tab ${mode === 'preview' ? 'active' : ''}`}
              aria-pressed={mode === 'preview'}
              onClick={() => setMode('preview')}
            >
              {t('fileViewer.preview')}
            </button>
            <button
              type="button"
              className={`viewer-tab ${mode === 'source' ? 'active' : ''}`}
              aria-pressed={mode === 'source'}
              onClick={() => setMode('source')}
            >
              {t('fileViewer.source')}
            </button>
          </div>
          <span className="viewer-divider" aria-hidden />
          <button
            type="button"
            className="viewer-action"
            onClick={() => setReloadKey((n) => n + 1)}
            title={t('fileViewer.reloadDisk')}
          >
            <Icon name="reload" size={13} />
            <span>{t('fileViewer.reload')}</span>
          </button>
          <a
            className="ghost-link"
            href={projectFileUrl(projectId, file.name)}
            download={file.name}
          >
            {t('fileViewer.download')}
          </a>
          <a
            className="ghost-link"
            href={projectFileUrl(projectId, file.name)}
            target="_blank"
            rel="noreferrer noopener"
          >
            {t('fileViewer.open')}
          </a>
        </div>
      </div>
      <div className={`viewer-body ${mode === 'preview' ? 'image-body' : ''}`}>
        {mode === 'preview' ? (
          <img alt={file.name} src={url} />
        ) : loadingSource ? (
          <div className="viewer-empty">{t('fileViewer.loading')}</div>
        ) : sourceError ? (
          <div className="viewer-empty">{t('fileViewer.previewUnavailable')}</div>
        ) : (
          <pre className="viewer-source">{source ?? ''}</pre>
        )}
      </div>
    </div>
  );
}

function TextViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useT();
  const [text, setText] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setText(null);
    let cancelled = false;
    void fetchProjectFileText(projectId, file.name).then((t) => {
      if (!cancelled) setText(t ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, file.name, file.mtime, reloadKey]);

  async function copy() {
    if (text == null) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // best-effort fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  const lineCount = text ? text.split('\n').length : 0;

  return (
    <div className="viewer text-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left" />
        <div className="viewer-toolbar-actions">
          <button
            type="button"
            className="viewer-action"
            onClick={() => setReloadKey((n) => n + 1)}
            title={t('fileViewer.reloadDisk')}
          >
            <Icon name="reload" size={13} />
            <span>{t('fileViewer.reload')}</span>
          </button>
          <button
            type="button"
            className="viewer-action"
            disabled
            title={t('fileViewer.saveDisabled')}
          >
            <Icon name="check" size={13} />
            <span>{t('fileViewer.save')}</span>
          </button>
          <button
            type="button"
            className="viewer-action"
            onClick={() => void copy()}
            title={t('fileViewer.copyTitle')}
          >
            <Icon name={copied ? 'check' : 'copy'} size={13} />
            <span>{copied ? t('fileViewer.copied') : t('fileViewer.copy')}</span>
          </button>
        </div>
      </div>
      <div className="viewer-body">
        {text === null ? (
          <div className="viewer-empty">{t('fileViewer.loading')}</div>
        ) : lineCount > 0 ? (
          <CodeWithLines text={text} />
        ) : (
          <pre className="viewer-source">{text}</pre>
        )}
      </div>
    </div>
  );
}

function MarkdownViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useT();
  const [text, setText] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const status = file.artifactManifest?.status ?? 'complete';
  const isStreaming = status === 'streaming';
  const isError = status === 'error';

  useEffect(() => {
    setText(null);
    let cancelled = false;
    void fetchProjectFileText(projectId, file.name).then((next) => {
      if (!cancelled) setText(next ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, file.name, file.mtime, reloadKey]);

  async function copy() {
    if (text == null) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  const html = useMemo(() => {
    if (text === null) return null;
    const renderPartial = MarkdownRenderer.renderPartial ?? renderMarkdownToSafeHtml;
    return renderPartial(text);
  }, [text]);

  return (
    <div className="viewer text-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          {isStreaming ? <span className="viewer-meta">{t('fileViewer.markdownStreamingMeta')}</span> : null}
          {isError ? <span className="viewer-meta">{t('fileViewer.markdownErrorMeta')}</span> : null}
        </div>
        <div className="viewer-toolbar-actions">
          <button
            type="button"
            className="viewer-action"
            onClick={() => setReloadKey((n) => n + 1)}
            title={t('fileViewer.reloadDisk')}
          >
            <Icon name="reload" size={13} />
            <span>{t('fileViewer.reload')}</span>
          </button>
          <button
            type="button"
            className="viewer-action"
            onClick={() => void copy()}
            title={t('fileViewer.copyTitle')}
          >
            <Icon name={copied ? 'check' : 'copy'} size={13} />
            <span>{copied ? t('fileViewer.copied') : t('fileViewer.copy')}</span>
          </button>
        </div>
      </div>
      <div className="viewer-body">
        {html === null ? (
          <div className="viewer-empty">{t('fileViewer.loading')}</div>
        ) : (
          <>
            {isStreaming ? <div className="markdown-status">{t('fileViewer.markdownStreamingStatus')}</div> : null}
            {isError ? <div className="markdown-status markdown-status-error">{t('fileViewer.markdownErrorStatus')}</div> : null}
            {/* Safe by contract: renderMarkdownToSafeHtml escapes raw HTML and rejects unsafe link protocols. */}
            <article
              className="markdown-rendered"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </>
        )}
      </div>
    </div>
  );
}

function CodeWithLines({ text }: { text: string }) {
  const lines = text.split('\n');
  // Trailing newline produces a phantom empty line — keep gutter aligned.
  const gutter = lines.map((_, i) => `${i + 1}`).join('\n');
  return (
    <pre className="code-viewer">
      <code className="gutter" aria-hidden>
        {gutter}
      </code>
      <code className="lines">{text}</code>
    </pre>
  );
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function documentMetaLabel(file: ProjectFile, t: TranslateFn): string {
  if (file.kind === 'pdf') return t('fileViewer.pdfMeta');
  if (file.kind === 'document') return t('fileViewer.documentMeta');
  if (file.kind === 'presentation') return t('fileViewer.presentationMeta');
  if (file.kind === 'spreadsheet') return t('fileViewer.spreadsheetMeta');
  return t('fileViewer.binaryMeta', { size: humanSize(file.size) });
}
