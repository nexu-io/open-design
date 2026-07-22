export type QuestionType =
  | 'radio'
  | 'checkbox'
  | 'select'
  | 'text'
  | 'textarea'
  | 'number'
  | 'range'
  | 'date'
  | 'time'
  | 'datetime-local'
  | 'color'
  | 'url'
  | 'email'
  | 'tel'
  | 'file'
  | 'switch'
  | 'direction-cards';

/**
 * Rich card metadata for a single `direction-cards` option. The picker
 * renders a swatch row, a serif/sans type sample, a mood blurb, and a
 * "refs" line so users can scan visually instead of squinting at radio
 * labels. The agent emits this metadata inline in the form JSON so the
 * UI can render without additional fetches.
 */
export interface DirectionCard {
  /** The radio value — what comes back in the user's answer. Match a label in `options`. */
  id: string;
  /** Short headline on the card (e.g. "Editorial — Monocle / FT magazine"). */
  label: string;
  /** One- or two-sentence mood blurb. */
  mood: string;
  /** Real-world exemplars (≤ 4). */
  references: string[];
  /** 4–6 swatch hex / OKLch strings for the palette row. */
  palette: string[];
  /** Display (headline) font stack, used to render the live "Aa" sample. */
  displayFont: string;
  /** Body font stack, used to render the secondary sample. */
  bodyFont: string;
}

export interface FormOption {
  label: string;
  value: string;
  description?: string;
}

export interface FormQuestion {
  id: string;
  label: string;
  type: QuestionType;
  options?: FormOption[];
  placeholder?: string;
  required?: boolean;
  help?: string;
  defaultValue?: string | string[];
  /** Only applies when `type === 'checkbox'`. Caps the number of selected options. */
  maxSelections?: number;
  /**
   * For finite-choice controls, show a free-form override beside the generated
   * options so the user can take over a choice instead of being trapped by the
   * model's presets.
   */
  allowCustom?: boolean;
  customLabel?: string;
  customPlaceholder?: string;
  /** Numeric/range inputs only. */
  min?: number;
  max?: number;
  step?: number;
  /** File inputs only. The answer serializes selected file names, not bytes. */
  multiple?: boolean;
  /** File inputs only. Mirrors the native file input accept attribute. */
  accept?: string;
  /** Only present when `type === 'direction-cards'`. Mapped to options by `id`. */
  cards?: DirectionCard[];
}

export interface QuestionForm {
  id: string;
  title: string;
  description?: string;
  questions: FormQuestion[];
  submitLabel?: string;
  /**
   * BCP-47 tag of the language the model localized the form into (e.g.
   * "zh-CN"). Host-rendered strings inside the form card (the "Other" chip,
   * custom input copy) follow this language so a Chinese form in an English
   * UI doesn't mix scripts; absent → the app UI locale.
   */
  lang?: string;
}

/**
 * Semantically equivalent discovery keys accepted from project metadata,
 * plugin inputs, or earlier form answers. Keep this list shared so every
 * QuestionForm surface suppresses the same already-answered decisions.
 */
export const QUESTION_FORM_DECISION_ALIAS_GROUPS = [
  ['platform', 'surface', 'platformTargets', 'target'],
  ['slideCount', 'slides', 'pageCount'],
  ['artifactKind', 'mode', 'taskKind'],
  ['designSystem', 'brand'],
] as const;
