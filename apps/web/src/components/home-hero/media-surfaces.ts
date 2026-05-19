import type { InputFieldSpec, ProjectKind } from '@open-design/contracts';
import type { AudioKind, MediaAspect, ProjectMetadata, PromptTemplateSummary } from '../../types';
import {
  AUDIO_DURATIONS_SEC,
  AUDIO_MODELS_BY_KIND,
  DEFAULT_AUDIO_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  IMAGE_MODELS,
  MEDIA_ASPECTS,
  VIDEO_LENGTHS_SEC,
  VIDEO_MODELS,
} from '../../media/models';

export type HomeComposerMediaSurface = 'image' | 'video' | 'hyperframes' | 'audio';
export const ELEVENLABS_DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';
export const ELEVENLABS_DEFAULT_VOICE_LABEL = 'Rachel (default)';

export interface HomeMediaComposerState {
  surface: HomeComposerMediaSurface;
  projectKind: ProjectKind;
  queryTemplate: string;
  fields: InputFieldSpec[];
  inputs: Record<string, unknown>;
  editableFieldNames: string[];
}

export const HOME_MEDIA_CHIP_IDS = ['image', 'video', 'hyperframes', 'audio'] as const;
const NO_TEMPLATE_PLACEHOLDER = 'No template';
const SFX_AUDIO_DURATIONS_SEC = AUDIO_DURATIONS_SEC.filter((sec) => sec <= 30);

export function homeMediaSurfaceForChipId(chipId: string): HomeComposerMediaSurface | null {
  if (chipId === 'image') return 'image';
  if (chipId === 'video') return 'video';
  if (chipId === 'hyperframes') return 'hyperframes';
  if (chipId === 'audio') return 'audio';
  return null;
}

export function buildHomeMediaComposer(
  surface: HomeComposerMediaSurface,
  promptTemplates: PromptTemplateSummary[],
  seedInputs: Record<string, unknown> = {},
  voiceOptions: Array<{ voiceId: string; name: string }> = [],
  options: { elevenLabsVoiceWarning?: string | null; elevenLabsVoicesLoading?: boolean } = {},
): HomeMediaComposerState {
  const inputs = normalizeHomeMediaInputs(
    surface,
    {
      ...defaultInputsForSurface(surface, promptTemplates),
      ...seedInputs,
    },
    promptTemplates,
    voiceOptions,
  );
  const fields = fieldsForSurface(surface, promptTemplates, inputs, voiceOptions, options);
  const editableFieldNames = fields.map((field) => field.name);
  const queryTemplate = queryTemplateForSurface(surface, inputs);
  return {
    surface,
    projectKind: surface === 'hyperframes' ? 'video' : surface,
    queryTemplate,
    fields,
    inputs,
    editableFieldNames,
  };
}

export function normalizeHomeMediaInputs(
  surface: HomeComposerMediaSurface,
  raw: Record<string, unknown>,
  promptTemplates: PromptTemplateSummary[] = [],
  voiceOptions: Array<{ voiceId: string; name: string }> = [],
): Record<string, unknown> {
  if (surface === 'image') {
    const ratio = validOption(stringValue(raw.ratio) || stringValue(raw.aspect), MEDIA_ASPECTS, '16:9');
    return {
      mediaKind: 'image',
      subject: stringValue(raw.subject) || 'a polished product concept',
      style: stringValue(raw.style) || 'cinematic, high-quality, on-brand',
      aspect: ratio,
      template: validTemplateId(surface, stringValue(raw.template), promptTemplates),
      model: validOption(stringValue(raw.model), IMAGE_MODELS.map((m) => m.id), DEFAULT_IMAGE_MODEL),
      ratio,
    };
  }
  if (surface === 'video') {
    const ratio = validOption(stringValue(raw.ratio) || stringValue(raw.aspect), MEDIA_ASPECTS, '16:9');
    return {
      mediaKind: 'video',
      subject: stringValue(raw.subject) || 'a short product reveal',
      style: stringValue(raw.style) || 'cinematic, high-quality, on-brand',
      aspect: ratio,
      template: validTemplateId(surface, stringValue(raw.template), promptTemplates),
      model: validOption(
        stringValue(raw.model),
        VIDEO_MODELS.filter((m) => m.id !== 'hyperframes-html').map((m) => m.id),
        DEFAULT_VIDEO_MODEL === 'hyperframes-html'
          ? VIDEO_MODELS.find((m) => m.id !== 'hyperframes-html')?.id ?? DEFAULT_VIDEO_MODEL
          : DEFAULT_VIDEO_MODEL,
      ),
      ratio,
      duration: validNumber(raw.duration, VIDEO_LENGTHS_SEC, 5),
    };
  }
  if (surface === 'hyperframes') {
    const ratio = validOption(stringValue(raw.ratio) || stringValue(raw.aspect), MEDIA_ASPECTS, '16:9');
    return {
      mediaKind: 'video',
      subject: stringValue(raw.subject) || 'an HTML-driven motion composition',
      style: stringValue(raw.style) || 'polished, kinetic, on-brand',
      aspect: ratio,
      template: validTemplateId(surface, stringValue(raw.template), promptTemplates),
      model: 'hyperframes-html',
      ratio,
      duration: validNumber(raw.duration, VIDEO_LENGTHS_SEC, 10),
    };
  }

  const audioType = validOption(stringValue(raw.audioType), audioKinds(), 'speech') as AudioKind;
  const model = validOption(
    stringValue(raw.model),
    homeAudioModels(audioType).map((m) => m.id),
    defaultHomeAudioModel(audioType),
  );
  const source = audioType === 'sfx'
    ? stringValue(raw.prompt) || stringValue(raw.text) || stringValue(raw.subject) || 'a crisp product notification sound'
    : stringValue(raw.text) || stringValue(raw.subject) || 'the user\'s brief';
  return {
    mediaKind: 'audio',
    subject: source,
    ...(audioType === 'sfx'
      ? { prompt: source }
      : { text: source }),
    style: stringValue(raw.style) || 'clear, polished, modern',
    aspect: validOption(stringValue(raw.aspect), MEDIA_ASPECTS, '16:9'),
    audioType,
    model,
    duration: validAudioDuration(audioType, raw.duration),
    ...(model === 'elevenlabs-v3'
      ? { voice: normalizedElevenLabsVoice(stringValue(raw.voice), voiceOptions) }
      : {}),
  };
}

export function metadataForHomeMediaComposer(
  surface: HomeComposerMediaSurface,
  inputs: Record<string, unknown>,
  promptTemplates: PromptTemplateSummary[],
): ProjectMetadata {
  const template = promptTemplates.find((item) => item.id === stringValue(inputs.template)) ?? null;
  const promptTemplate = template
    ? {
        id: template.id,
        surface: template.surface,
        title: template.title,
        prompt: template.summary,
        summary: template.summary,
        category: template.category,
        ...(template.tags ? { tags: template.tags } : {}),
        ...(template.model ? { model: template.model } : {}),
        ...(template.aspect ? { aspect: template.aspect } : {}),
        source: template.source,
      }
    : undefined;

  if (surface === 'image') {
    return {
      kind: 'image',
      imageModel: stringValue(inputs.model) || DEFAULT_IMAGE_MODEL,
      imageAspect: (stringValue(inputs.ratio) || '16:9') as MediaAspect,
      ...(promptTemplate ? { promptTemplate } : {}),
    };
  }
  if (surface === 'video' || surface === 'hyperframes') {
    return {
      kind: 'video',
      videoModel: surface === 'hyperframes' ? 'hyperframes-html' : stringValue(inputs.model) || DEFAULT_VIDEO_MODEL,
      videoAspect: (stringValue(inputs.ratio) || '16:9') as MediaAspect,
      videoLength: validNumber(inputs.duration, VIDEO_LENGTHS_SEC, surface === 'hyperframes' ? 10 : 5),
      ...(promptTemplate ? { promptTemplate } : {}),
    };
  }
  const audioKind = (stringValue(inputs.audioType) || 'speech') as AudioKind;
  const audioModel = stringValue(inputs.model) || defaultHomeAudioModel(audioKind);
  return {
    kind: 'audio',
    audioKind,
    audioModel,
    audioDuration: validAudioDuration(audioKind, inputs.duration),
    ...(audioModel === 'elevenlabs-v3' && stringValue(inputs.voice)
      ? { voice: stringValue(inputs.voice) }
      : {}),
  };
}

export function templatesForHomeMediaSurface(
  surface: HomeComposerMediaSurface,
  promptTemplates: PromptTemplateSummary[],
): PromptTemplateSummary[] {
  if (surface === 'image') {
    return promptTemplates.filter((template) => template.surface === 'image');
  }
  if (surface === 'video') {
    return promptTemplates.filter(
      (template) => template.surface === 'video' && !isHyperFramesTemplate(template),
    );
  }
  if (surface === 'hyperframes') {
    return promptTemplates.filter(
      (template) => template.surface === 'video' && isHyperFramesTemplate(template),
    );
  }
  return [];
}

function fieldsForSurface(
  surface: HomeComposerMediaSurface,
  promptTemplates: PromptTemplateSummary[],
  inputs: Record<string, unknown>,
  voiceOptions: Array<{ voiceId: string; name: string }>,
  options: { elevenLabsVoiceWarning?: string | null; elevenLabsVoicesLoading?: boolean },
): InputFieldSpec[] {
  if (surface === 'image') {
    return [
      templateField(surface, promptTemplates),
      selectField('model', 'Model', IMAGE_MODELS.map((m) => m.id), modelLabels(IMAGE_MODELS)),
      selectField('ratio', 'Ratio', MEDIA_ASPECTS),
    ];
  }
  if (surface === 'video') {
    return [
      templateField(surface, promptTemplates),
      selectField('model', 'Model', VIDEO_MODELS.filter((m) => m.id !== 'hyperframes-html').map((m) => m.id), modelLabels(VIDEO_MODELS)),
      selectField('ratio', 'Ratio', MEDIA_ASPECTS),
      selectField('duration', 'Duration', VIDEO_LENGTHS_SEC.map(String), secondsLabels(VIDEO_LENGTHS_SEC)),
    ];
  }
  if (surface === 'hyperframes') {
    return [
      templateField(surface, promptTemplates),
      selectField('ratio', 'Ratio', MEDIA_ASPECTS),
      selectField('duration', 'Duration', VIDEO_LENGTHS_SEC.map(String), secondsLabels(VIDEO_LENGTHS_SEC)),
    ];
  }

  const audioType = (stringValue(inputs.audioType) || 'speech') as AudioKind;
  const model = stringValue(inputs.model) || defaultHomeAudioModel(audioType);
  const audioModels = homeAudioModels(audioType);
  const fields: InputFieldSpec[] = [
    audioType === 'sfx'
      ? stringField('prompt', 'Prompt', 'Describe the sound effect')
      : stringField('text', 'Text', 'Text to turn into audio'),
    selectField('audioType', 'Audio type', audioKinds(), {
      speech: 'Speech',
      sfx: 'Sound effect',
    }),
    selectField('model', 'Model', audioModels.map((m) => m.id), modelLabels(audioModels)),
    selectField('duration', 'Duration', audioDurationsForKind(audioType).map(String), secondsLabels(audioDurationsForKind(audioType))),
  ];
  if (model === 'elevenlabs-v3') {
    const voices = homeElevenLabsVoiceOptions(voiceOptions);
    fields.push(withPopoverNote(
      selectField('voice', 'Voice', voices.map((voice) => voice.voiceId), voiceLabels(voices), undefined),
      options.elevenLabsVoiceWarning
        ?? (options.elevenLabsVoicesLoading && voiceOptions.length === 0
          ? 'Loading configured ElevenLabs voices...'
          : null),
      options.elevenLabsVoiceWarning ? 'warning' : 'info',
    ));
  }
  return fields;
}

function queryTemplateForSurface(surface: HomeComposerMediaSurface, inputs: Record<string, unknown>): string {
  if (surface === 'image') {
    return 'Create an image using {{template}}, with {{model}} at {{ratio}}.';
  }
  if (surface === 'video') {
    return 'Create a video using {{template}}, with {{model}} at {{ratio}} for {{duration}} seconds.';
  }
  if (surface === 'hyperframes') {
    return 'Create a HyperFrames video using {{template}} at {{ratio}} for {{duration}} seconds.';
  }
  if (stringValue(inputs.audioType) === 'sfx') {
    return 'Create {{audioType}} audio from {{prompt}} using {{model}} for {{duration}} seconds.';
  }
  return stringValue(inputs.model) === 'elevenlabs-v3'
    ? 'Create {{audioType}} audio from {{text}} using {{model}} for {{duration}} seconds with {{voice}}.'
    : 'Create {{audioType}} audio from {{text}} using {{model}} for {{duration}} seconds.';
}

function defaultInputsForSurface(
  surface: HomeComposerMediaSurface,
  promptTemplates: PromptTemplateSummary[],
): Record<string, unknown> {
  if (surface === 'image') {
    return { template: firstTemplateId(surface, promptTemplates), model: DEFAULT_IMAGE_MODEL, ratio: '16:9' };
  }
  if (surface === 'video') {
    return {
      template: firstTemplateId(surface, promptTemplates),
      model: DEFAULT_VIDEO_MODEL === 'hyperframes-html'
        ? VIDEO_MODELS.find((m) => m.id !== 'hyperframes-html')?.id ?? DEFAULT_VIDEO_MODEL
        : DEFAULT_VIDEO_MODEL,
      ratio: '16:9',
      duration: 5,
    };
  }
  if (surface === 'hyperframes') {
    return { template: firstTemplateId(surface, promptTemplates), model: 'hyperframes-html', ratio: '16:9', duration: 10 };
  }
  return { text: 'the user\'s brief', audioType: 'speech', model: defaultHomeAudioModel('speech'), duration: 10 };
}

function stringField(name: string, label: string, placeholder?: string): InputFieldSpec {
  return {
    name,
    label,
    type: 'string',
    ...(placeholder ? { placeholder } : {}),
  };
}

function templateField(
  surface: HomeComposerMediaSurface,
  promptTemplates: PromptTemplateSummary[],
): InputFieldSpec {
  const templates = templatesForHomeMediaSurface(surface, promptTemplates);
  const labels: Record<string, string> = {};
  for (const template of templates) labels[template.id] = template.title;
  return selectField(
    'template',
    'Template',
    templates.map((template) => template.id),
    labels,
    templates.length === 0 ? NO_TEMPLATE_PLACEHOLDER : undefined,
  );
}

function selectField(
  name: string,
  label: string,
  options: readonly string[],
  optionLabels: Record<string, string> = {},
  placeholder?: string,
): InputFieldSpec {
  return {
    name,
    label,
    type: 'select',
    options: [...options],
    ...(placeholder ? { placeholder } : {}),
    optionLabels,
  };
}

function withPopoverNote(
  field: InputFieldSpec,
  note: string | null | undefined,
  tone: 'info' | 'warning',
): InputFieldSpec {
  if (!note) return field;
  return {
    ...field,
    popoverNote: note,
    popoverNoteTone: tone,
  } as InputFieldSpec;
}

function firstTemplateId(
  surface: HomeComposerMediaSurface,
  promptTemplates: PromptTemplateSummary[],
): string {
  return templatesForHomeMediaSurface(surface, promptTemplates)[0]?.id ?? NO_TEMPLATE_PLACEHOLDER;
}

function validTemplateId(
  surface: HomeComposerMediaSurface,
  rawTemplate: string,
  promptTemplates: PromptTemplateSummary[],
): string {
  const templates = templatesForHomeMediaSurface(surface, promptTemplates);
  if (templates.some((template) => template.id === rawTemplate)) return rawTemplate;
  return templates[0]?.id ?? NO_TEMPLATE_PLACEHOLDER;
}

function isHyperFramesTemplate(template: PromptTemplateSummary): boolean {
  return template.model === 'hyperframes-html' || template.source.repo === 'heygen-com/hyperframes';
}

function modelLabels(models: Array<{ id: string; label: string }>): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const model of models) labels[model.id] = model.label;
  return labels;
}

function secondsLabels(seconds: readonly number[]): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const value of seconds) labels[String(value)] = `${value}s`;
  return labels;
}

function voiceLabels(voices: Array<{ voiceId: string; name: string }>): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const voice of voices) labels[voice.voiceId] = voice.name;
  return labels;
}

function audioKinds(): AudioKind[] {
  return ['speech', 'sfx'];
}

function audioDurationsForKind(kind: AudioKind): number[] {
  return kind === 'sfx' ? SFX_AUDIO_DURATIONS_SEC : AUDIO_DURATIONS_SEC;
}

function validAudioDuration(kind: AudioKind, raw: unknown): number {
  const options = audioDurationsForKind(kind);
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (options.includes(value)) return value;
  if (kind === 'sfx' && Number.isFinite(value) && value > Math.max(...options)) {
    return Math.max(...options);
  }
  return 10;
}

function homeAudioModels(kind: AudioKind) {
  if (kind === 'music') return [];
  const runnableProviders = new Set(['minimax', 'fishaudio', 'senseaudio', 'elevenlabs', 'openai', 'volcengine']);
  return AUDIO_MODELS_BY_KIND[kind].filter((model) => runnableProviders.has(model.provider));
}

function defaultHomeAudioModel(kind: AudioKind): string {
  return homeAudioModels(kind).find((model) => model.default)?.id
    ?? homeAudioModels(kind)[0]?.id
    ?? DEFAULT_AUDIO_MODEL.speech;
}

function homeElevenLabsVoiceOptions(
  voices: Array<{ voiceId: string; name: string }>,
): Array<{ voiceId: string; name: string }> {
  if (voices.length > 0) return voices;
  return [{ voiceId: ELEVENLABS_DEFAULT_VOICE_ID, name: ELEVENLABS_DEFAULT_VOICE_LABEL }];
}

function normalizedElevenLabsVoice(
  rawVoice: string,
  voices: Array<{ voiceId: string; name: string }>,
): string {
  if (voices.length === 0) return rawVoice || ELEVENLABS_DEFAULT_VOICE_ID;
  if (voices.some((voice) => voice.voiceId === rawVoice)) return rawVoice;
  return voices[0]?.voiceId ?? ELEVENLABS_DEFAULT_VOICE_ID;
}

function validOption<T extends string>(
  raw: string,
  options: readonly T[],
  fallback: T,
): T {
  return options.includes(raw as T) ? raw as T : fallback;
}

function validNumber(raw: unknown, options: readonly number[], fallback: number): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  return options.includes(value) ? value : fallback;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
}
