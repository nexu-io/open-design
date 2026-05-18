import { useRef, type ChangeEvent } from 'react';
import { Icon } from './Icon';
import {
  isDesignMdFileName,
  sanitizeDesignMdImport,
} from '../lib/sanitize-design-md';

export interface DesignSystemBriefDraft {
  questionnaireEnabled: boolean;
  advancedGeneration: boolean;
}

interface Props {
  questionnaireEnabled: boolean;
  advancedGeneration: boolean;
  onBriefChange: (next: DesignSystemBriefDraft) => void;
  figmaFile: File | null;
  onPickFigma: (file: File | null) => void;
  designMdFile: File | null;
  onPickDesignMd: (file: File | null) => void;
  designMdWarning: string | null;
  onDesignMdWarning: (message: string | null) => void;
  figmaImportError: string | null;
  onFigmaValidationError: (message: string | null) => void;
  importingFigma: boolean;
  canImport: boolean;
  onImport: () => void;
}

function PanelToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className={`toggle-row${checked ? ' on' : ''}${disabled ? ' disabled' : ''}`}
      onClick={() => { if (!disabled) onChange(!checked); }}
      aria-pressed={checked}
      disabled={disabled}
      data-testid={testId}
    >
      <div className="toggle-row-text">
        <span className="toggle-row-label">{label}</span>
        {hint ? <span className="toggle-row-hint">{hint}</span> : null}
      </div>
      <span className="toggle-row-switch" aria-hidden />
    </button>
  );
}

export function DesignSystemImportPanel({
  questionnaireEnabled,
  advancedGeneration,
  onBriefChange,
  figmaFile,
  onPickFigma,
  designMdFile,
  onPickDesignMd,
  designMdWarning,
  onDesignMdWarning,
  figmaImportError,
  onFigmaValidationError,
  importingFigma,
  canImport,
  onImport,
}: Props) {
  const figmaInputRef = useRef<HTMLInputElement | null>(null);
  const designMdInputRef = useRef<HTMLInputElement | null>(null);

  function patchBrief(patch: Partial<DesignSystemBriefDraft>) {
    onBriefChange({
      questionnaireEnabled,
      advancedGeneration,
      ...patch,
    });
  }

  function handleFigmaInput(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0] ?? null;
    ev.target.value = '';
    onFigmaValidationError(null);
    if (!file) {
      onPickFigma(null);
      return;
    }
    if (!/\.fig$/i.test(file.name)) {
      onPickFigma(null);
      onFigmaValidationError('Please choose a .fig file.');
      return;
    }
    onPickFigma(file);
  }

  async function handleDesignMdInput(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0] ?? null;
    ev.target.value = '';
    onDesignMdWarning(null);
    onFigmaValidationError(null);
    if (!file) {
      onPickDesignMd(null);
      return;
    }
    if (!isDesignMdFileName(file.name)) {
      onPickDesignMd(null);
      onFigmaValidationError('Please choose a .md file.');
      return;
    }
    try {
      const raw = await file.text();
      const { content, warnings } = sanitizeDesignMdImport(raw);
      onPickDesignMd(new File([content], 'DESIGN.md', { type: 'text/markdown' }));
      onDesignMdWarning(warnings.length > 0 ? warnings.join(' ') : null);
    } catch (err) {
      onPickDesignMd(null);
      onFigmaValidationError(err instanceof Error ? err.message : 'Invalid DESIGN.md file.');
    }
  }

  const importLabel = figmaFile
    ? (importingFigma ? 'Importing…' : 'Import from Figma')
    : (importingFigma ? 'Creating…' : 'Create design system');

  return (
    <div className="newproj-ds-panel" data-testid="design-system-import-panel">
      <div className="newproj-ds-options" data-testid="design-system-intake">
        <PanelToggleRow
          label="Advanced generation"
          hint="Creates showcase.html for preview and Edit, DESIGN.md, token files (primitives + semantic), and Tailwind mapping. With this on, also adds React component stubs and Code Connect-style mapping placeholders."
          checked={advancedGeneration}
          onChange={(v) => patchBrief({ advancedGeneration: v })}
          disabled={importingFigma}
          testId="design-system-advanced-toggle"
        />
        <PanelToggleRow
          label="Enable discovery questionnaire in chat"
          checked={questionnaireEnabled}
          onChange={(v) => patchBrief({ questionnaireEnabled: v })}
          disabled={importingFigma}
          testId="design-system-questionnaire-toggle"
        />
      </div>

      <div className="newproj-ds-section">
        <p className="newproj-ds-section__hint">
          Attach source material (optional). A .fig export or existing DESIGN.md helps the first pass.
        </p>

        <div className="newproj-ds-section__card">
          <div className="newproj-ds-dropzone-row">
            <input
              ref={figmaInputRef}
              type="file"
              accept=".fig"
              hidden
              onChange={handleFigmaInput}
            />
            <button
              type="button"
              className={`newproj-ds-dropzone${figmaFile ? ' has-file' : ''}`}
              onClick={() => figmaInputRef.current?.click()}
              disabled={importingFigma}
            >
              {figmaFile ? (
                <>
                  <span className="newproj-ds-dropzone__primary">{figmaFile.name}</span>
                  <span className="newproj-ds-dropzone__secondary">
                    {Math.round(figmaFile.size / 1024)} KB · Click to replace
                  </span>
                </>
              ) : (
                <>
                  <span className="newproj-ds-dropzone__primary">Drop .fig here or browse</span>
                  <span className="newproj-ds-dropzone__secondary">
                    Parsed locally — never uploaded to a third party.
                  </span>
                </>
              )}
            </button>
          </div>

          <div className="newproj-ds-dropzone-row newproj-ds-dropzone-row--divider">
            <input
              ref={designMdInputRef}
              type="file"
              accept=".md,text/markdown"
              hidden
              onChange={(ev) => void handleDesignMdInput(ev)}
            />
            <button
              type="button"
              className={`newproj-ds-dropzone${designMdFile ? ' has-file' : ''}`}
              onClick={() => designMdInputRef.current?.click()}
              disabled={importingFigma}
            >
              {designMdFile ? (
                <>
                  <span className="newproj-ds-dropzone__primary">{designMdFile.name}</span>
                  <span className="newproj-ds-dropzone__secondary">
                    {Math.round(designMdFile.size / 1024)} KB · Click to replace
                  </span>
                </>
              ) : (
                <>
                  <span className="newproj-ds-dropzone__primary">Drop DESIGN.md here or browse</span>
                  <span className="newproj-ds-dropzone__secondary">
                    Unsafe HTML and scripts are removed on import.
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
        {designMdWarning ? (
          <p className="newproj-ds-section__note" role="status">{designMdWarning}</p>
        ) : null}
      </div>

      <button
        type="button"
        className="primary newproj-ds-submit"
        onClick={() => onImport()}
        disabled={!canImport}
      >
        <Icon name="plus" size={13} />
        <span>{importLabel}</span>
      </button>

      {figmaImportError ? (
        <p className="newproj-ds-error" role="alert">{figmaImportError}</p>
      ) : null}
    </div>
  );
}
