// Feature-local hook for the MCP server list: load, draft-row editing, the "Add
// server" picker state, dirty-tracking and save. Its transport dependency is
// INJECTED as the slice port, so it holds no provider import and unit-tests
// against a hand-written fake `McpServersPort`. Business logic (the pure
// `rules`) is imported directly; only the side-effecting transport is injected.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { McpServerConfig, McpTemplate } from '@open-design/contracts';
import { useT } from '../../../i18n';
import type { McpServersPort } from '../ports';
import { mcpServersPort } from '../dependencies';
import {
  rowFromBlank,
  rowFromTemplate,
  rowsFromServers,
  rowsToServers,
  signature,
  validateRow,
} from '../rules';
import type { DraftRow } from '../types';

/** Parent notifications the section forwards up to its host (dialog footer /
 * composer chip count). Optional and side-effect-only. */
export interface UseMcpServersOptions {
  onServersChanged?: (servers: McpServerConfig[]) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/** Everything the External MCP section needs from the server-list hook. */
export interface McpServersController {
  rows: DraftRow[];
  templates: McpTemplate[];
  loaded: boolean;
  saving: boolean;
  savedAt: number | null;
  error: string | null;
  dirty: boolean;
  pickerOpen: boolean;
  pickerQuery: string;
  setPickerQuery: (query: string) => void;
  togglePicker: () => void;
  closePicker: () => void;
  updateRow: (idx: number, patch: Partial<DraftRow>) => void;
  removeRow: (idx: number) => void;
  moveRow: (idx: number, dir: -1 | 1) => void;
  addFromTemplate: (tpl: McpTemplate) => void;
  addBlank: () => void;
  save: () => Promise<boolean>;
}

export function useMcpServers(
  port: McpServersPort,
  options?: UseMcpServersOptions,
): McpServersController {
  const t = useT();
  // Hold the latest translator in a ref so the load effect and save can read the
  // current messages WITHOUT taking `t` as a reactive dependency. `useT()` is
  // only stable under an <I18nProvider>; a bare render (some tests, SSR) hands
  // back a fresh function each render, and a `t` dep on the load effect would
  // then refetch -> setState -> refetch in an infinite loop. The load runs once,
  // exactly as the pre-refactor section did.
  const tRef = useRef(t);
  tRef.current = t;
  const onServersChanged = options?.onServersChanged;
  const onDirtyChange = options?.onDirtyChange;

  const [rows, setRows] = useState<DraftRow[]>([]);
  const [savedSig, setSavedSig] = useState<string>('[]');
  const [templates, setTemplates] = useState<McpTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Free-text filter at the top of the picker. Empty string = show all. Lives
  // in the hook (not the picker render block) so toggling the picker preserves
  // the user's last query while they scan through it.
  const [pickerQuery, setPickerQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await port.fetchMcpServers();
      if (cancelled) return;
      if (!data) {
        setError(tRef.current('mcpClient.daemonError'));
        setLoaded(true);
        return;
      }
      const fresh = rowsFromServers(data.servers);
      setRows(fresh);
      setSavedSig(signature(fresh));
      setTemplates(data.templates);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [port]);

  const dirty = useMemo(() => signature(rows) !== savedSig, [rows, savedSig]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const updateRow = useCallback((idx: number, patch: Partial<DraftRow>) => {
    setRows((curr) => curr.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }, []);

  const removeRow = useCallback((idx: number) => {
    setRows((curr) => curr.filter((_, i) => i !== idx));
  }, []);

  const moveRow = useCallback((idx: number, dir: -1 | 1) => {
    setRows((curr) => {
      const next = [...curr];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return curr;
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return next;
    });
  }, []);

  const addFromTemplate = useCallback((tpl: McpTemplate) => {
    setPickerOpen(false);
    setRows((curr) => [...curr, rowFromTemplate(tpl, new Set(curr.map((r) => r.id)))]);
  }, []);

  const addBlank = useCallback(() => {
    setPickerOpen(false);
    setRows((curr) => [...curr, rowFromBlank(new Set(curr.map((r) => r.id)))]);
  }, []);

  const togglePicker = useCallback(() => setPickerOpen((v) => !v), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);

  const save = useCallback(async (): Promise<boolean> => {
    for (const r of rows) {
      const err = validateRow(r);
      if (err) {
        setError(`${r.label || r.id}: ${err}`);
        return false;
      }
    }
    setError(null);
    setSaving(true);
    const payload = rowsToServers(rows);
    const data = await port.saveMcpServers(payload);
    setSaving(false);
    if (!data) {
      setError(tRef.current('mcpClient.saveFailed'));
      return false;
    }
    const fresh = rowsFromServers(data.servers);
    setRows(fresh);
    setSavedSig(signature(fresh));
    setTemplates(data.templates);
    setSavedAt(Date.now());
    onServersChanged?.(data.servers);
    return true;
  }, [rows, port, onServersChanged]);

  return {
    rows,
    templates,
    loaded,
    saving,
    savedAt,
    error,
    dirty,
    pickerOpen,
    pickerQuery,
    setPickerQuery,
    togglePicker,
    closePicker,
    updateRow,
    removeRow,
    moveRow,
    addFromTemplate,
    addBlank,
    save,
  };
}

/**
 * Wirer: binds the real provider port and returns a ready-to-call hook. This is
 * the default the orchestrator uses; swap it via `useMcpServers(fake)` in tests.
 */
export function useWiredMcpServers(
  options?: UseMcpServersOptions,
): McpServersController {
  return useMcpServers(mcpServersPort, options);
}
