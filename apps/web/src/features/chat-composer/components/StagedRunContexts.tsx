// The wrap row of chips above the composer input: the active design-system
// picker, the applied-plugin chip, staged workspace/skill/mcp/connector
// context, and staged file attachments (with an image-preview trigger).
//
// The attachment preview modal's `preview` state and its
// `window.addEventListener('keydown', …)` Escape-to-close subscription are
// owned by the ORCHESTRATOR, not a feature hook — an accumulating browser
// subscription belongs to the single-instance orchestrator so it isn't
// re-subscribed per slice-hook instance. This component just renders what
// it's given and reports picks via callbacks, staying props-in/JSX-out.
// `previewUrl`/`resolveImageUrl` are passed in rather than computed here so
// the slice never imports `providers/registry`'s `projectRawUrl` directly.
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ConnectorDetail, McpServerConfig, WorkspaceContextItem } from '@open-design/contracts';
import type { ChatAttachment, SkillSummary } from '../../../types';
import { Icon } from '../../../components/Icon';
import {
  workspaceContextIcon,
  workspaceContextKindLabel,
  workspaceContextTitle,
} from '../rules';
import type { TranslateFn } from '../types';

export function StagedRunContexts({
  designSystemPicker,
  workspaceItems,
  currentWorkspaceContextId,
  skills,
  mcpServers,
  connectors,
  attachments,
  pluginChip,
  projectId,
  preview,
  previewUrl,
  modalHost,
  onPreviewAttachment,
  onClosePreview,
  resolveImageUrl,
  onRemoveWorkspace,
  onRemoveSkill,
  onRemoveMcp,
  onRemoveConnector,
  onRemoveAttachment,
  onRemovePlugin,
  onPluginDetails,
  onSkillDetails,
  t,
}: {
  designSystemPicker?: ReactNode;
  workspaceItems: WorkspaceContextItem[];
  currentWorkspaceContextId: string | null;
  skills: SkillSummary[];
  mcpServers: McpServerConfig[];
  connectors: ConnectorDetail[];
  attachments: ChatAttachment[];
  pluginChip?: { id: string; title: string } | null;
  projectId: string | null;
  preview: ChatAttachment | null;
  previewUrl: string | null;
  modalHost: HTMLElement | null;
  onPreviewAttachment: (attachment: ChatAttachment) => void;
  onClosePreview: () => void;
  resolveImageUrl: (path: string) => string | null;
  onRemoveWorkspace: (id: string) => void;
  onRemoveSkill: (id: string) => void;
  onRemoveMcp: (id: string) => void;
  onRemoveConnector: (id: string) => void;
  onRemoveAttachment: (path: string) => void;
  onRemovePlugin?: () => void;
  onPluginDetails?: (id: string) => void;
  onSkillDetails?: (id: string) => void;
  t: TranslateFn;
}) {
  return (
    <>
    <div
      className="staged-row staged-context-row"
      data-testid="staged-contexts"
    >
      {designSystemPicker ? (
        <div className="staged-context-picker staged-context-picker--design-system">
          {designSystemPicker}
        </div>
      ) : null}
      {pluginChip ? (
        <div className="staged-chip staged-context staged-context--plugin">
          {/* Two sibling controls — a details button (icon + name) and the
              remove button — rather than a role=button wrapper containing the
              remove button. Nested interactive controls break focus order and
              assistive-tech announcements. */}
          <button
            type="button"
            className="staged-context-open"
            onClick={() => onPluginDetails?.(pluginChip.id)}
            title={pluginChip.title}
            aria-label={pluginChip.title}
          >
            <span className="staged-icon" aria-hidden>
              <Icon name="sparkles" size={12} />
            </span>
            <span className="staged-name">{pluginChip.title}</span>
          </button>
          <button
            type="button"
            className="staged-remove od-tooltip"
            onClick={() => onRemovePlugin?.()}
            title={t('common.delete')}
            data-tooltip={t('common.delete')}
            aria-label={t('chat.removeAria', { name: pluginChip.title })}
          >
            <Icon name="close" size={11} />
          </button>
        </div>
      ) : null}
      {workspaceItems.map((workspaceItem) => {
        const kindLabel =
          workspaceItem.id === currentWorkspaceContextId
            ? 'Current'
            : workspaceContextKindLabel(workspaceItem.kind);
        return (
          <div
            key={workspaceItem.id}
            className={`staged-chip staged-context staged-context--workspace staged-context--workspace-${workspaceItem.kind}`}
          >
            <span className="staged-icon" aria-hidden>
              <Icon name={workspaceContextIcon(workspaceItem)} size={12} />
            </span>
            <span className="staged-name" title={workspaceContextTitle(workspaceItem)}>
              <span className="staged-context-kind">{kindLabel}</span>
              {workspaceItem.label}
            </span>
            <button
              type="button"
              className="staged-remove od-tooltip"
              onClick={() => onRemoveWorkspace(workspaceItem.id)}
              title={t('common.delete')}
              data-tooltip={t('common.delete')}
              aria-label={t('chat.removeAria', { name: workspaceItem.label })}
            >
              <Icon name="close" size={11} />
            </button>
          </div>
        );
      })}
      {skills.map((s) => (
        <div
          key={s.id}
          className={`staged-chip staged-context staged-context--skill staged-skill-${s.source ?? 'built-in'}`}
        >
          <button
            type="button"
            className="staged-context-open"
            onClick={() => onSkillDetails?.(s.id)}
            title={s.description || s.name}
            aria-label={s.name}
          >
            <span className="staged-icon" aria-hidden>
              <Icon name="sparkles" size={12} />
            </span>
            <span className="staged-name">@{s.name}</span>
          </button>
          <button
            type="button"
            className="staged-remove od-tooltip"
            onClick={() => onRemoveSkill(s.id)}
            title={t('common.delete')}
            data-tooltip={t('common.delete')}
            aria-label={t('chat.removeAria', { name: s.name })}
          >
            <Icon name="close" size={11} />
          </button>
        </div>
      ))}
      {mcpServers.map((server) => {
        const label = server.label || server.id;
        return (
          <div
            key={server.id}
            className="staged-chip staged-context staged-context--mcp"
          >
            <span className="staged-icon" aria-hidden>
              <Icon name="link" size={12} />
            </span>
            <span className="staged-name" title={server.command || server.url || server.id}>
              @{label}
            </span>
            <button
              type="button"
              className="staged-remove od-tooltip"
              onClick={() => onRemoveMcp(server.id)}
              title={t('common.delete')}
              data-tooltip={t('common.delete')}
              aria-label={t('chat.removeAria', { name: label })}
            >
              <Icon name="close" size={11} />
            </button>
          </div>
        );
      })}
      {connectors.map((connector) => (
        <div
          key={connector.id}
          className="staged-chip staged-context staged-context--connector"
        >
          <span className="staged-icon" aria-hidden>
            <Icon name="link" size={12} />
          </span>
          <span className="staged-name" title={connector.accountLabel ?? connector.provider}>
            @{connector.name}
          </span>
          <button
            type="button"
            className="staged-remove od-tooltip"
            onClick={() => onRemoveConnector(connector.id)}
            title={t('common.delete')}
            data-tooltip={t('common.delete')}
            aria-label={t('chat.removeAria', { name: connector.name })}
          >
            <Icon name="close" size={11} />
          </button>
        </div>
      ))}
      {attachments.map((a, index) => {
        const canPreview = a.kind === 'image' && Boolean(projectId);
        const imageUrl = canPreview ? resolveImageUrl(a.path) : null;
        return (
          <div key={a.path} className={`staged-chip staged-${a.kind}`}>
            <span className="staged-order" aria-label={`Attachment ${index + 1}`}>
              {index + 1}
            </span>
            {canPreview && imageUrl ? (
              <button
                type="button"
                className="staged-preview-trigger"
                onClick={() => onPreviewAttachment(a)}
                title={a.path}
                aria-label={`Preview ${a.name}`}
              >
                <img src={imageUrl} alt="" aria-hidden />
                <span className="staged-name">{a.name}</span>
              </button>
            ) : (
              <>
                <span className="staged-icon" aria-hidden>
                  <Icon name="file" size={13} />
                </span>
                <span className="staged-name" title={a.path}>
                  {a.name}
                </span>
              </>
            )}
            <button
              type="button"
              className="staged-remove od-tooltip"
              onClick={() => onRemoveAttachment(a.path)}
              title={t('common.delete')}
              data-tooltip={t('common.delete')}
              aria-label={t('chat.removeAria', { name: a.name })}
            >
              <Icon name="close" size={11} />
            </button>
          </div>
        );
      })}
    </div>
    {preview && previewUrl && modalHost ? createPortal(
      <div
        className="staged-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label={preview.name}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClosePreview();
        }}
      >
        <div className="staged-preview-card">
          <div className="staged-preview-head">
            <span title={preview.path}>{preview.name}</span>
            <button
              type="button"
              className="icon-only od-tooltip"
              onClick={onClosePreview}
              aria-label={t('common.close')}
              title={t('common.close')}
              data-tooltip={t('common.close')}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
          <img src={previewUrl} alt={preview.name} />
        </div>
      </div>,
      modalHost
    ) : null}
    </>
  );
}
