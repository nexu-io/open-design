import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from '@open-design/components';
import type { FsBrowserListResponse, FsBrowserRoot } from '@open-design/contracts';
import { useI18n } from '../i18n';
import { listServerDirectory, listServerDirectoryRoots } from '../providers/fs-browser';

export function ServerDirectoryPicker({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (path: string) => void }) {
  const { t } = useI18n();
  const [roots, setRoots] = useState<FsBrowserRoot[]>([]);
  const [listing, setListing] = useState<FsBrowserListResponse | null>(null);
  const [error, setError] = useState(false);
  const requestId = useRef(0);
  async function browse(target: string) {
    const id = ++requestId.current;
    setListing(null);
    setError(false);
    try {
      const result = await listServerDirectory(target);
      if (id === requestId.current) setListing(result);
    } catch {
      if (id === requestId.current) setError(true);
    }
  }
  useEffect(() => {
    if (!open) return;
    const id = ++requestId.current;
    setRoots([]);
    setListing(null);
    setError(false);
    void listServerDirectoryRoots().then((response) => {
      if (id !== requestId.current) return;
      setRoots(response.roots);
      if (response.roots[0]) void browse(response.roots[0].path);
    }).catch(() => { if (id === requestId.current) setError(true); });
    return () => { requestId.current += 1; };
  }, [open]);
  if (!open) return null;
  const dialog = <Dialog onClose={onClose} closeOnEscape ariaLabel={t('settings.projectLocations')}>
    <DialogHeader><DialogTitle>{t('settings.projectLocations')}</DialogTitle><p>{t('settings.projectLocationsDescription')}</p></DialogHeader>
    <DialogBody>
      <div className="row">{roots.map((root) => <Button key={root.path} variant="ghost" onClick={() => void browse(root.path)}>{root.label}</Button>)}</div>
      {error ? <p role="alert">{t('settings.projectLocationsSaveError')}</p> : null}
      {listing ? <><code>{listing.path}</code>{listing.parent ? <Button variant="ghost" onClick={() => void browse(listing.parent!)}>..</Button> : null}<div role="list">{listing.entries.map((entry) => <Button key={entry.path} variant="ghost" onClick={() => void browse(entry.path)}>{entry.name}</Button>)}</div></> : null}
    </DialogBody>
    <DialogFooter><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" disabled={!listing || error} onClick={() => listing && onSelect(listing.path)}>{t('settings.projectLocationsAddFolder')}</Button></DialogFooter>
  </Dialog>;
  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
}
