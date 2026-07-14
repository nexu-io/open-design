// Feature-local hook for the composer's simple modal/detail-panel visibility
// state: the plugin/skill details panels, and the library/Figma-import/
// Figma-help/project-reference modal toggles. Pure UI state — no transport,
// no DOM — so there is no port and no `useWiredX` wirer, matching the
// memory canary's `useMemoryFlash` (also a no-port hook).
import { useState } from 'react';
import type { InstalledPluginRecord } from '@open-design/contracts';
import type { SkillSummary } from '../../../types';

export interface ComposerDetailsSkill {
  id: string;
  summary?: SkillSummary | null;
}

export interface ComposerModalsController {
  detailsRecord: InstalledPluginRecord | null;
  setDetailsRecord: (record: InstalledPluginRecord | null) => void;
  detailsSkill: ComposerDetailsSkill | null;
  setDetailsSkill: (detail: ComposerDetailsSkill | null) => void;
  libraryPickerOpen: boolean;
  setLibraryPickerOpen: (open: boolean) => void;
  figmaModalOpen: boolean;
  setFigmaModalOpen: (open: boolean) => void;
  figmaHelpOpen: boolean;
  setFigmaHelpOpen: (open: boolean) => void;
  projectReferenceOpen: boolean;
  setProjectReferenceOpen: (open: boolean) => void;
}

export function useComposerModals(): ComposerModalsController {
  const [detailsRecord, setDetailsRecord] = useState<InstalledPluginRecord | null>(null);
  const [detailsSkill, setDetailsSkill] = useState<ComposerDetailsSkill | null>(null);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const [figmaModalOpen, setFigmaModalOpen] = useState(false);
  const [figmaHelpOpen, setFigmaHelpOpen] = useState(false);
  const [projectReferenceOpen, setProjectReferenceOpen] = useState(false);

  return {
    detailsRecord,
    setDetailsRecord,
    detailsSkill,
    setDetailsSkill,
    libraryPickerOpen,
    setLibraryPickerOpen,
    figmaModalOpen,
    setFigmaModalOpen,
    figmaHelpOpen,
    setFigmaHelpOpen,
    projectReferenceOpen,
    setProjectReferenceOpen,
  };
}
