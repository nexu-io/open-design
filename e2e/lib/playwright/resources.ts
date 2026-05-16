import { playwrightUiScenarios } from '../../resources/playwright.ts';

export type ScenarioKind = 'prototype' | 'deck' | 'hyperframes' | 'template' | 'workspace';

export interface MockArtifactScenario {
  identifier: string;
  title: string;
  html: string;
  fileName: string;
  heading: string;
}

export interface UiScenario {
  id: string;
  title: string;
  kind: ScenarioKind;
  flow?:
    | 'standard'
    | 'design-system-selection'
    | 'example-use-prompt'
    | 'conversation-persistence'
    | 'file-mention'
    | 'deep-link-preview'
    | 'file-upload-send'
    | 'design-files-upload'
    | 'design-files-delete'
    | 'design-files-tab-persistence'
    | 'conversation-delete-recovery'
    | 'question-form-selection-limit'
    | 'question-form-submit-persistence'
    | 'generation-does-not-create-extra-file'
    | 'comment-attachment-flow'
    | 'deck-pagination-next-prev-correctness'
    | 'deck-pagination-per-file-isolated'
    | 'uploaded-image-renders-in-preview'
    | 'python-source-preview'
    | 'plugin-create-import'
    | 'home-rail-generation';
  automated: boolean;
  description: string;
  create: {
    projectName: string;
    tab?: 'prototype' | 'deck' | 'template' | 'other';
    railChip?: 'prototype' | 'deck' | 'hyperframes';
    expectedProjectKind?: 'prototype' | 'deck' | 'video';
    expectedPluginId?: 'example-web-prototype' | 'example-simple-deck' | 'example-hyperframes';
  };
  prompt: string;
  secondaryPrompt?: string;
  mockArtifact?: MockArtifactScenario;
  notes?: string[];
}

export function automatedUiScenarios(): UiScenario[] {
  return playwrightUiScenarios.filter((scenario) => scenario.automated);
}
