'use client';

import { useEffect, useState } from 'react';
import { setHostPetVisible } from '@open-design/host';
import { RUNS_CHANGED_EVENT, listProjectRunsWithScope } from '../../providers/daemon';
import { loadConfig } from '../../state/config';
import { listProjects } from '../../state/projects';
import type { AppConfig } from '../../types';
import { PetOverlay, type PetTaskCenter } from './PetOverlay';
import { buildPetTaskCenter } from './taskCenter';

const CONFIG_POLL_MS = 1500;
const TASK_POLL_MS = 2000;

export function DesktopPetSurface() {
  const [config, setConfig] = useState<AppConfig>(() => loadConfig());
  const [taskCenter, setTaskCenter] = useState<PetTaskCenter>({
    running: [],
    queued: [],
    recent: [],
  });
  const pet = config.pet?.enabled ? config.pet : undefined;

  useEffect(() => {
    document.body.classList.add('desktop-pet-shell');
    return () => document.body.classList.remove('desktop-pet-shell');
  }, []);

  useEffect(() => {
    const refresh = () => setConfig(loadConfig());
    window.addEventListener('storage', refresh);
    const id = window.setInterval(refresh, CONFIG_POLL_MS);
    return () => {
      window.removeEventListener('storage', refresh);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    setHostPetVisible(Boolean(pet));
  }, [pet]);

  // `loadConfig` parses a fresh object on every config poll, so keying the
  // task poller on `pet` restarted it (and fired a request) every 1.5s.
  const petEnabled = Boolean(pet);
  useEffect(() => {
    if (!petEnabled) {
      setTaskCenter({ running: [], queued: [], recent: [] });
      return;
    }
    let cancelled = false;
    let id: number | undefined;
    const refresh = async () => {
      const [projects, { runs, scopeRequired }] = await Promise.all([
        listProjects(),
        listProjectRunsWithScope(),
      ]);
      if (cancelled) return;
      if (scopeRequired) window.clearInterval(id);
      setTaskCenter(buildPetTaskCenter(projects, runs));
    };
    const handleRunsChanged = () => {
      void refresh();
    };
    id = window.setInterval(refresh, TASK_POLL_MS);
    void refresh();
    window.addEventListener(RUNS_CHANGED_EVENT, handleRunsChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(RUNS_CHANGED_EVENT, handleRunsChanged);
      window.clearInterval(id);
    };
  }, [petEnabled]);

  return (
    <PetOverlay
      pet={pet}
      taskCenter={taskCenter}
      persistentBubble
    />
  );
}
