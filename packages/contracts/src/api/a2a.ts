export const OPEN_DESIGN_QUESTION_FORM_MEDIA_TYPE =
  'application/vnd.open-design.question-form+json';

export const OPEN_DESIGN_QUESTION_FORM_ANSWER_MEDIA_TYPE =
  'application/vnd.open-design.question-form-answer+json';

export const OPEN_DESIGN_A2A_ARTIFACT_MEDIA_TYPE =
  'application/vnd.open-design.artifact+json';

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

export interface DirectionCard {
  id: string;
  label: string;
  mood: string;
  references: string[];
  palette: string[];
  displayFont: string;
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
  maxSelections?: number;
  allowCustom?: boolean;
  customLabel?: string;
  customPlaceholder?: string;
  min?: number;
  max?: number;
  step?: number;
  multiple?: boolean;
  accept?: string;
  cards?: DirectionCard[];
}

export interface QuestionForm {
  id: string;
  title: string;
  description?: string;
  questions: FormQuestion[];
  submitLabel?: string;
  lang?: string;
}

export type QuestionFormAnswers = Record<string, string | string[]>;

export interface QuestionFormEnvelope {
  schemaVersion: 1;
  form: QuestionForm;
}

export interface QuestionFormAnswerEnvelope {
  schemaVersion: 1;
  formId: string;
  answers: QuestionFormAnswers;
}

export interface OpenDesignA2ARequestMetadata {
  projectId?: string;
  projectName?: string;
  conversationId?: string;
  agentId?: string;
  model?: string;
  skillId?: string;
  pluginId?: string;
  pluginInputs?: Record<string, unknown>;
}

export interface OpenDesignA2AArtifactData {
  schemaVersion: 1;
  projectId: string;
  conversationId: string;
  runId: string;
  entryFile?: string;
  studioUrl?: string;
  previewUrl?: string;
  outputPolicy?: import('./site-output.js').SiteOutputPolicyResult;
  files: Array<{
    name: string;
    mime?: string;
    size?: number | null;
  }>;
}
