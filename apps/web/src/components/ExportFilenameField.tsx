import { useId } from 'react';
import { Input } from '@open-design/components';
import { useT } from '../i18n';
import { CustomSelect } from './CustomSelect';
import styles from './ExportFilenameField.module.css';

export interface ExportFilenameFieldProps<Format extends string = string> {
  filename: string;
  onFilenameChange: (filename: string) => void;
  format: Format;
  onFormatChange: (format: Format) => void;
  formats: ReadonlyArray<{ value: Format; label: string }>;
  disabled?: boolean;
}

export function ExportFilenameField<Format extends string>({
  filename,
  onFilenameChange,
  format,
  onFormatChange,
  formats,
  disabled = false,
}: ExportFilenameFieldProps<Format>) {
  const t = useT();
  const filenameId = useId();
  const formatLabelId = useId();

  return (
    <div className={styles.row}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={filenameId}>
          {t('pasteDialog.fileNameLabel')}
        </label>
        <Input
          id={filenameId}
          className={styles.filename}
          value={filename}
          onChange={(event) => onFilenameChange(event.currentTarget.value)}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.label} id={formatLabelId}>
          {t('fileViewer.exportImageFormatLabel')}
        </span>
        <CustomSelect
          value={format}
          options={formats.map((option) => ({ ...option }))}
          onChange={(value) => {
            const option = formats.find((item) => item.value === value);
            if (option) onFormatChange(option.value);
          }}
          ariaLabel={t('fileViewer.exportImageFormatLabel')}
          labelledBy={formatLabelId}
          className={styles.select}
          triggerClassName={styles.trigger}
          menuClassName={styles.menu}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
