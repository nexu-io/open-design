import type { ComponentType } from 'react';

export interface LabsAutosaveController {
  claim(): number;
  settle(claim: number, status: 'saved' | 'error' | 'idle'): void;
}

export interface LabsExperimentProps {
  autosave?: LabsAutosaveController;
}

export interface LabsExperiment {
  id: string;
  Component: ComponentType<LabsExperimentProps>;
}

// Register each available experiment here, regardless of its switch value.
// Navigation and page content consume this same list; no experiments are active today.
export const LABS_EXPERIMENTS: readonly LabsExperiment[] = [];
