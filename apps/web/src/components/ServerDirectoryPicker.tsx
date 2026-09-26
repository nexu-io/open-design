import { useEffect, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import { useI18n } from '../i18n';
import styles from './ServerDirectoryPicker.module.css';

type Listing = { path: string; parent: string | null; directories: Array<{ name: string; path: string }> };
type Roots = { roots: Array<{ path: string; name: string; directories: Listing['directories'] }> };

export function ServerDirectoryPicker({ open, onCancel, onSelect }: { open: boolean; onCancel: () => void; onSelect: (path: string) => void }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [roots, setRoots] = useState<Roots['roots']>([]);
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const fetchPath = async (path?: string) => {
    setLoading(true); setError(false);
    try {
      const url = path ? `/api/directories/browse?path=${encodeURIComponent(path)}` : '/api/directories/browse';
      const response = await fetch(url);
      if (!response.ok) throw new Error('Browse failed');
      const data = await response.json();
      if (path) setListing(data as Listing);
      else { const available = (data as Roots).roots; setRoots(available); setListing(null); }
    } catch { setError(true); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      if (typeof element.showModal === 'function') element.showModal();
      else element.setAttribute('open', '');
      void fetchPath();
    }
    if (!open && element.open) {
      if (typeof element.close === 'function') element.close();
      else element.removeAttribute('open');
    }
  }, [open]);
  const current = listing?.path;
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="server-directory-title" onCancel={(event) => { event.preventDefault(); onCancel(); }}>
    <header className={styles.header}><h2 id="server-directory-title">{t('workingDirPicker.serverTitle')}</h2><Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button></header>
    <div className={styles.path} aria-live="polite">{current ?? t('workingDirPicker.roots')}</div>
    <nav className={styles.actions} aria-label={t('workingDirPicker.roots')}>
      {listing?.parent && <Button variant="secondary" onClick={() => void fetchPath(listing.parent!)}>{t('workingDirPicker.up')}</Button>}
      {current && <Button variant="secondary" onClick={() => void fetchPath()}>{t('workingDirPicker.roots')}</Button>}
    </nav>
    <div className={styles.list} aria-live="polite">
      {loading ? <p role="status">{t('common.loading')}</p> : error ? <p role="alert">{t('workingDirPicker.loadError')}</p> : listing ? (listing.directories ?? []).length ? (listing.directories ?? []).map((item) => <button className={styles.entry} key={item.path} onClick={() => void fetchPath(item.path)}>{item.name}</button>) : <p>{t('workingDirPicker.empty')}</p> : roots.length ? roots.map((root) => <button className={styles.entry} key={root.path} onClick={() => void fetchPath(root.path)}>{root.path}</button>) : <p>{t('workingDirPicker.empty')}</p>}
    </div>
    <footer className={styles.footer}><Button variant="secondary" onClick={onCancel}>{t('common.cancel')}</Button><Button disabled={!current || loading} onClick={() => current && onSelect(current)}>{t('workingDirPicker.selectCurrent')}</Button></footer>
  </dialog>;
}
