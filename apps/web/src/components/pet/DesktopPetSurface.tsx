'use client';

import { useEffect, useRef, useState } from 'react';
import { setHostPetVisible } from '@open-design/host';
import type { ChatRunStatusResponse } from '@open-design/contracts';
import { RUNS_CHANGED_EVENT, listProjectRuns } from '../../providers/daemon';
import { loadConfig } from '../../state/config';
import { listProjects } from '../../state/projects';
import type { AppConfig, Project } from '../../types';
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
  // Last-good inputs: a transport error is not an authoritative empty task
  // center, so a failed read keeps the previous data instead of blanking
  // the pet's task summary.
  const lastGoodRef = useRef<{ projects: Project[]; runs: ChatRunStatusResponse[] }>({
    projects: [],
    runs: [],
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

  useEffect(() => {
    if (!pet) {
      setTaskCenter({ running: [], queued: [], recent: [] });
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      const [projects, runs] = await Promise.all([
        listProjects({ throwOnError: true }).catch((err: unknown) => {
          console.error('[pet] project list refresh failed; keeping last-good', err);
          return null;
        }),
        listProjectRuns(undefined, { throwOnError: true }).catch((err: unknown) => {
          console.error('[pet] run list refresh failed; keeping last-good', err);
          return null;
        }),
      ]);
      if (cancelled) return;
      lastGoodRef.current = {
        projects: projects ?? lastGoodRef.current.projects,
        runs: runs ?? lastGoodRef.current.runs,
      };
      setTaskCenter(buildPetTaskCenter(lastGoodRef.current.projects, lastGoodRef.current.runs));
    };
    const handleRunsChanged = () => {
      void refresh();
    };
    void refresh();
    window.addEventListener(RUNS_CHANGED_EVENT, handleRunsChanged);
    const id = window.setInterval(refresh, TASK_POLL_MS);
    return () => {
      cancelled = true;
      window.removeEventListener(RUNS_CHANGED_EVENT, handleRunsChanged);
      window.clearInterval(id);
    };
  }, [pet]);

  return (
    <PetOverlay
      pet={pet}
      taskCenter={taskCenter}
      persistentBubble
    />
  );
}
