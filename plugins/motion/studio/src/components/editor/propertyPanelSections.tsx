import { useI18n } from "../../i18n/I18n";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Plus, Type } from "../../icons/SystemIcons";
import { isTextEditableSelection, type DomEditSelection } from "./domEditing";
import type { ImportedFontAsset } from "./fontAssets";
import { FIELD, LABEL, normalizeTextMetricValue, RESPONSIVE_GRID } from "./propertyPanelHelpers";
import { MetricField, Section, SelectField } from "./propertyPanelPrimitives";
import { ColorField } from "./propertyPanelColor";
import { FontFamilyField } from "./propertyPanelFont";
import { PromotableControl } from "./PromotableControl";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";

/* ------------------------------------------------------------------ */
/*  Text helpers (used only by text section components)                */
/* ------------------------------------------------------------------ */

export function formatTextFieldPreview(value: string): string {
  const collapsed = value.trim().replace(/\s+/g, " ");
  if (collapsed.length <= 56) return collapsed;
  return `${collapsed.slice(0, 55)}…`;
}

export function getTextFieldColor(
  field: { computedStyles: Record<string, string> },
  inheritedStyles: Record<string, string>,
): string {
  return field.computedStyles.color || inheritedStyles.color || "rgb(0, 0, 0)";
}

export function getTextStyleValue(
  field: { computedStyles: Record<string, string> },
  inheritedStyles: Record<string, string>,
  property: string,
  fallback: string,
): string {
  return field.computedStyles[property] || inheritedStyles[property] || fallback;
}

const ALL_WEIGHTS = ["100", "200", "300", "400", "500", "600", "700", "800", "900"];
export const WEIGHT_LABELS: Record<string, string> = {
  "100": "100 · Thin",
  "200": "200 · Extra Light",
  "300": "300 · Light",
  "400": "400 · Regular",
  "500": "500 · Medium",
  "600": "600 · Semi Bold",
  "700": "700 · Bold",
  "800": "800 · Extra Bold",
  "900": "900 · Black",
};

export function detectAvailableWeights(fontFamily: string): string[] {
  const fonts = document.fonts;
  if (!fonts) return ALL_WEIGHTS;
  const family = fontFamily.split(",")[0]?.trim().replace(/['"]/g, "");
  if (!family) return ALL_WEIGHTS;
  const available: string[] = [];
  for (const w of ALL_WEIGHTS) {
    if (fonts.check(`${w} 16px "${family}"`)) available.push(w);
  }
  return available.length > 0 ? available : ALL_WEIGHTS;
}

export function TextAreaField({
  label,
  value,
  disabled,
  autoFocus,
  flat,
  onCommit,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  autoFocus?: boolean;
  flat?: boolean;
  onCommit: (nextValue: string) => void;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionChangedRef = useRef(false);
  const focusedRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (focusedRef.current) return;
    setDraft(value);
  }, [value]);
  useEffect(
    () => () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    },
    [],
  );
  useEffect(() => {
    if (!autoFocus) return;
    textareaRef.current?.focus();
  }, [autoFocus]);

  const commitDraft = (d: string) => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    if (interactionChangedRef.current) {
      interactionChangedRef.current = false;
      track("text", label);
    }
    if (d !== valueRef.current) onCommit(d);
  };
  const scheduleCommit = (d: string) => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => {
      if (d !== valueRef.current) {
        if (interactionChangedRef.current) {
          interactionChangedRef.current = false;
          track("text", label);
        }
        onCommit(d);
      }
    }, 120);
  };

  const handleFocus = () => {
    focusedRef.current = true;
  };
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value);
    interactionChangedRef.current = true;
    scheduleCommit(e.target.value);
  };
  const handleBlur = () => {
    focusedRef.current = false;
    commitDraft(draft);
  };

  if (flat) {
    return (
      <div className="border-l-2 border-panel-border-input py-0.5 pl-[10px]">
        <div className="mb-[3px] text-[9px] font-semibold uppercase tracking-[0.12em] text-panel-text-5">
          {t(label)}
        </div>
        <textarea
          ref={textareaRef}
          value={draft}
          disabled={disabled}
          rows={2}
          onFocus={handleFocus}
          onChange={handleChange}
          onBlur={handleBlur}
          className="field-sizing-content max-h-[40vh] min-h-12 w-full resize-y overflow-x-hidden overflow-y-auto bg-transparent font-mono text-[11px] leading-normal text-panel-text-0 outline-hidden disabled:cursor-not-allowed disabled:text-panel-text-4"
        />
      </div>
    );
  }

  return (
    <label className="grid min-w-0 gap-1.5">
      <span className={LABEL}>{t(label)}</span>
      <div className={FIELD}>
        <textarea
          ref={textareaRef}
          value={draft}
          disabled={disabled}
          rows={4}
          onFocus={handleFocus}
          onChange={handleChange}
          onBlur={handleBlur}
          className="field-sizing-content max-h-[40vh] min-h-20 w-full resize-y overflow-x-hidden overflow-y-auto bg-transparent text-[11px] font-medium text-neutral-100 outline-hidden disabled:cursor-not-allowed disabled:text-neutral-600"
        />
      </div>
    </label>
  );
}

function FontWeightField({
  value,
  disabled,
  fontFamily,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  fontFamily?: string;
  onCommit: (nextValue: string) => void;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  const options = fontFamily ? detectAvailableWeights(fontFamily) : ALL_WEIGHTS;
  const displayOptions = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <div className={FIELD}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 text-[11px] font-medium text-neutral-500">{t("Weight")}</span>
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => {
            track("select", "Weight");
            onCommit(e.target.value);
          }}
          className="min-w-0 w-full appearance-none bg-transparent text-[11px] font-medium text-neutral-100 outline-hidden disabled:cursor-not-allowed disabled:text-neutral-600"
        >
          {displayOptions.map((o) => (
            <option key={o} value={o}>
              {t(WEIGHT_LABELS[o] ?? o)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function AdvancedTextControls({
  field,
  inheritedStyles,
  disabled,
  onCommit,
}: {
  field: DomEditSelection["textFields"][number];
  inheritedStyles: Record<string, string>;
  disabled?: boolean;
  onCommit: (property: string, value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div className={RESPONSIVE_GRID}>
        <SelectField
          label={t("Line")}
          value={getTextStyleValue(field, inheritedStyles, "line-height", "normal")}
          disabled={disabled}
          options={["normal", "1", "1.1", "1.2", "1.25", "1.3", "1.4", "1.5", "1.6", "1.75", "2"]}
          onChange={(n) => onCommit("line-height", normalizeTextMetricValue("line-height", n))}
        />
        <SelectField
          label={t("Track")}
          value={getTextStyleValue(field, inheritedStyles, "letter-spacing", "0px")}
          disabled={disabled}
          options={[
            "0px",
            "-0.05em",
            "-0.04em",
            "-0.03em",
            "-0.02em",
            "-0.01em",
            "0em",
            "0.01em",
            "0.02em",
            "0.03em",
            "0.05em",
            "0.1em",
            "0.15em",
            "0.2em",
          ]}
          onChange={(n) =>
            onCommit("letter-spacing", normalizeTextMetricValue("letter-spacing", n))
          }
        />
      </div>
      <div className={RESPONSIVE_GRID}>
        <SelectField
          label={t("Align")}
          value={getTextStyleValue(field, inheritedStyles, "text-align", "start")}
          disabled={disabled}
          onChange={(n) => onCommit("text-align", n)}
          options={["start", "left", "center", "right", "justify", "end"]}
        />
        <SelectField
          label={t("Case")}
          value={getTextStyleValue(field, inheritedStyles, "text-transform", "none")}
          disabled={disabled}
          onChange={(n) => onCommit("text-transform", n)}
          options={["none", "uppercase", "lowercase", "capitalize"]}
        />
      </div>
      <SelectField
        label={t("Style")}
        value={getTextStyleValue(field, inheritedStyles, "font-style", "normal")}
        disabled={disabled}
        onChange={(n) => onCommit("font-style", n)}
        options={["normal", "italic"]}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Text section                                                       */
/* ------------------------------------------------------------------ */

function TextFieldEditor({
  field,
  styles,
  fontAssets,
  onImportFonts,
  showRemove,
  onSetText,
  onSetTextFieldStyle,
  onRemoveTextField,
}: {
  field: DomEditSelection["textFields"][number];
  styles: Record<string, string>;
  fontAssets: ImportedFontAsset[];
  onImportFonts?: (files: FileList | File[]) => Promise<ImportedFontAsset[]>;
  showRemove: boolean;
  onSetText: (value: string, fieldKey?: string) => void;
  onSetTextFieldStyle: (fieldKey: string, property: string, value: string) => void;
  onRemoveTextField: (fieldKey: string) => void;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  return (
    <div className="space-y-3">
      <div className={showRemove ? "flex min-w-0 items-center justify-between gap-2" : "min-w-0"}>
        <div className="min-w-0">
          <div className="truncate text-[11px] font-medium text-neutral-100">
            {formatTextFieldPreview(field.value) || "Text"}
          </div>
          <div className="text-[10px] text-neutral-500">{field.tagName}</div>
        </div>
        {showRemove && (
          <button
            type="button"
            onClick={() => {
              track("button", "Remove text field");
              onRemoveTextField(field.key);
            }}
            className="inline-flex h-7 shrink-0 items-center rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 text-[11px] font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:text-text-0"
          >
            {t("Remove")}</button>
        )}
      </div>
      <PromotableControl channel={{ kind: "text" }} enabled={field.source === "self"}>
        {({ value, onCommit }) => (
          <TextAreaField
            key={field.key}
            label={t("Content")}
            value={value ?? field.value}
            disabled={false}
            autoFocus={showRemove}
            onCommit={onCommit ?? ((next) => onSetText(next, field.key))}
          />
        )}
      </PromotableControl>
      <PromotableControl
        channel={{ kind: "style", prop: "color" }}
        enabled={field.source === "self"}
      >
        {({ value, onCommit }) => (
          <ColorField
            label={t("Text color")}
            value={value ?? getTextFieldColor(field, styles)}
            disabled={false}
            onCommit={onCommit ?? ((next) => onSetTextFieldStyle(field.key, "color", next))}
          />
        )}
      </PromotableControl>
      <div className={RESPONSIVE_GRID}>
        <MetricField
          label={t("Size")}
          value={field.computedStyles["font-size"] || styles["font-size"] || "16px"}
          disabled={false}
          liveCommit
          onCommit={(next) => onSetTextFieldStyle(field.key, "font-size", next)}
        />
        <FontWeightField
          value={field.computedStyles["font-weight"] || styles["font-weight"] || "400"}
          fontFamily={field.computedStyles["font-family"] || styles["font-family"]}
          disabled={false}
          onCommit={(next) => onSetTextFieldStyle(field.key, "font-weight", next)}
        />
      </div>
      <PromotableControl
        channel={{ kind: "style", prop: "font-family" }}
        enabled={field.source === "self"}
      >
        {({ value, onCommit }) => (
          <FontFamilyField
            value={
              value ?? (field.computedStyles["font-family"] || styles["font-family"] || "inherit")
            }
            disabled={false}
            importedFonts={fontAssets}
            onImportFonts={onImportFonts}
            onCommit={onCommit ?? ((next) => onSetTextFieldStyle(field.key, "font-family", next))}
          />
        )}
      </PromotableControl>
      <AdvancedTextControls
        field={field}
        inheritedStyles={styles}
        disabled={false}
        onCommit={(property, value) => onSetTextFieldStyle(field.key, property, value)}
      />
    </div>
  );
}

export function TextSection({
  element,
  styles,
  fontAssets,
  onImportFonts,
  onSetText,
  onSetTextFieldStyle,
  onAddTextField,
  onRemoveTextField,
  hideOwnHeading = false,
}: {
  element: DomEditSelection;
  styles: Record<string, string>;
  fontAssets: ImportedFontAsset[];
  onImportFonts?: (files: FileList | File[]) => Promise<ImportedFontAsset[]>;
  onSetText: (value: string, fieldKey?: string) => void;
  onSetTextFieldStyle: (fieldKey: string, property: string, value: string) => void;
  onAddTextField: (afterFieldKey?: string) => string | Promise<string | null> | null;
  onRemoveTextField: (fieldKey: string) => void;
  /** Skip TextSection's own "Text" Section heading/wrapper — for callers (the
   *  flat inspector's multi-field fallback) that already render their own
   *  "Text" heading one level up, to avoid a doubled heading. Defaults to
   *  false so the legacy (non-flat) call site is unaffected. */
  hideOwnHeading?: boolean;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  const hasTextControls = isTextEditableSelection(element);
  const [activeTextFieldKey, setActiveTextFieldKey] = useState<string | null>(
    element.textFields[0]?.key ?? null,
  );

  useEffect(() => {
    const nextFields = element.textFields;
    setActiveTextFieldKey((current) => {
      if (current && nextFields.some((field) => field.key === current)) return current;
      return nextFields[0]?.key ?? null;
    });
  }, [element.id, element.selector, element.textFields]);

  if (!hasTextControls) return null;

  const textFields = element.textFields;
  const activeField = textFields.find((field) => field.key === activeTextFieldKey) ?? textFields[0];
  if (!activeField) return null;

  if (textFields.length === 1) {
    const content = (
      <TextFieldEditor
        field={activeField}
        styles={styles}
        fontAssets={fontAssets}
        onImportFonts={onImportFonts}
        showRemove={false}
        onSetText={onSetText}
        onSetTextFieldStyle={onSetTextFieldStyle}
        onRemoveTextField={onRemoveTextField}
      />
    );
    if (hideOwnHeading) return content;
    return (
      <Section title={t("Text")} icon={<Type size={15} />} defaultCollapsed>
        {content}
      </Section>
    );
  }

  const content = (
    <div className="space-y-4">
      <div className="grid gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <span className={LABEL}>{t("Text layers")}</span>
          <button
            type="button"
            onClick={() => {
              track("button", "Add text field");
              void Promise.resolve(onAddTextField(activeField.key)).then((nextKey) => {
                if (nextKey) setActiveTextFieldKey(nextKey);
              });
            }}
            className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 text-[11px] font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:text-text-0"
          >
            <Plus size={12} className="shrink-0" />
            <span className="truncate">{t("Add text")}</span>
          </button>
        </div>
        <div className="grid gap-2">
          {textFields.map((field, index) => {
            const active = field.key === activeField.key;
            return (
              <button
                key={field.key}
                type="button"
                onClick={() => setActiveTextFieldKey(field.key)}
                className={`min-w-0 w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                  active
                    ? "border-studio-accent/50 bg-studio-accent/10"
                    : "border-neutral-800 bg-neutral-900/80 hover:border-neutral-700 hover:bg-neutral-900"
                }`}
              >
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-4 w-4 shrink-0 rounded-sm border border-neutral-700 bg-neutral-950"
                      style={{ backgroundColor: getTextFieldColor(field, styles) }}
                    />
                    <span className="min-w-0 truncate text-[11px] font-medium text-neutral-100">
                      {formatTextFieldPreview(field.value) || `Text ${index + 1}`}
                    </span>
                  </div>
                  <span className="shrink-0 rounded-md border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 text-[10px] text-neutral-500">
                    {field.tagName}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <TextFieldEditor
        field={activeField}
        styles={styles}
        fontAssets={fontAssets}
        onImportFonts={onImportFonts}
        showRemove={true}
        onSetText={onSetText}
        onSetTextFieldStyle={onSetTextFieldStyle}
        onRemoveTextField={onRemoveTextField}
      />
    </div>
  );
  if (hideOwnHeading) return content;
  return (
    <Section title={t("Text")} icon={<Type size={15} />}>
      {content}
    </Section>
  );
}

export { StyleSections } from "./propertyPanelStyleSections";
