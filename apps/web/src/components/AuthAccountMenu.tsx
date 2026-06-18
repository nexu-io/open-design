import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@open-design/components';
import { authClient } from '../auth-client';
import { useT } from '../i18n';
import { RemixIcon } from './RemixIcon';
import styles from './AuthAccountMenu.module.css';

type AuthMode = 'sign-in' | 'sign-up';

function displayInitial(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name || email || '?').trim();
  return source.charAt(0).toUpperCase();
}

function displayName(
  name: string | null | undefined,
  email: string | null | undefined,
  fallback: string,
): string {
  const source = (name || email || fallback).trim();
  return source.length > 0 ? source : fallback;
}

export function AuthAccountMenu() {
  const t = useT();
  const session = authClient.useSession();
  // Auth is opt-in: the daemon only mounts /api/auth when OPEN_DESIGN_DATABASE_URL
  // is set. Probe once and render nothing when it's absent (a 404), so instances
  // without accounts don't show a dead Sign in affordance. null = still checking.
  const [authEnabled, setAuthEnabled] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const user = session.data?.user;
  const signedIn = Boolean(user);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/get-session', { headers: { origin: window.location.origin } })
      .then((res) => {
        if (!cancelled) setAuthEnabled(res.status !== 404);
      })
      .catch(() => {
        if (!cancelled) setAuthEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = mode === 'sign-in'
        ? await authClient.signIn.email({
            email: email.trim(),
            password,
          })
        : await authClient.signUp.email({
            email: email.trim(),
            password,
            name: name.trim() || email.trim(),
          });
      if (result.error) {
        setError(result.error.message || t('auth.failed'));
        return;
      }
      await session.refetch();
      setPassword('');
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('auth.failed'));
    } finally {
      setPending(false);
    }
  }

  async function handleSignOut() {
    setPending(true);
    setError(null);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError(result.error.message || t('auth.signOutFailed'));
        return;
      }
      await session.refetch();
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('auth.signOutFailed'));
    } finally {
      setPending(false);
    }
  }

  const accountName = displayName(user?.name, user?.email, t('auth.account'));
  const triggerLabel = signedIn ? t('auth.accountLabel', { name: accountName }) : t('auth.signIn');

  // Hide entirely until we've confirmed auth is enabled on this daemon.
  if (authEnabled !== true) return null;

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={`${styles.trigger} od-tooltip`}
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-tooltip={triggerLabel}
        data-tooltip-placement="bottom"
        onClick={() => setOpen((value) => !value)}
      >
        {signedIn ? (
          <span className={styles.initial} aria-hidden>
            {displayInitial(user?.name, user?.email)}
          </span>
        ) : (
          <RemixIcon name="user-line" size={17} />
        )}
      </button>
      {open ? (
        <div className={styles.popover} role="dialog" aria-label={t('auth.account')}>
          {signedIn ? (
            <>
              <div className={styles.identity}>
                <span className={styles.avatar} aria-hidden>
                  {displayInitial(user?.name, user?.email)}
                </span>
                <div className={styles.identityText}>
                  <strong>{accountName}</strong>
                  {user?.email ? <span>{user.email}</span> : null}
                </div>
              </div>
              {error ? <p className={styles.error}>{error}</p> : null}
              <Button
                className={styles.submit}
                disabled={pending}
                onClick={() => void handleSignOut()}
              >
                {pending ? t('auth.signingOut') : t('auth.signOut')}
              </Button>
            </>
          ) : (
            <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
              <div className={styles.modes} role="tablist" aria-label={t('auth.modeLabel')}>
                <button
                  type="button"
                  className={mode === 'sign-in' ? `${styles.modeButton} ${styles.modeButtonActive}` : styles.modeButton}
                  role="tab"
                  aria-selected={mode === 'sign-in'}
                  onClick={() => {
                    setMode('sign-in');
                    setError(null);
                  }}
                >
                  {t('auth.signIn')}
                </button>
                <button
                  type="button"
                  className={mode === 'sign-up' ? `${styles.modeButton} ${styles.modeButtonActive}` : styles.modeButton}
                  role="tab"
                  aria-selected={mode === 'sign-up'}
                  onClick={() => {
                    setMode('sign-up');
                    setError(null);
                  }}
                >
                  {t('auth.create')}
                </button>
              </div>
              {mode === 'sign-up' ? (
                <label className={styles.field}>
                  <span>{t('auth.name')}</span>
                  <input
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.currentTarget.value)}
                  />
                </label>
              ) : null}
              <label className={styles.field}>
                <span>{t('auth.email')}</span>
                <input
                  autoComplete="email"
                  inputMode="email"
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.currentTarget.value)}
                />
              </label>
              <label className={styles.field}>
                <span>{t('auth.password')}</span>
                <input
                  autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                  minLength={8}
                  required
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                />
              </label>
              {error ? <p className={styles.error}>{error}</p> : null}
              <Button type="submit" className={styles.submit} disabled={pending}>
                {pending ? t('auth.working') : mode === 'sign-in' ? t('auth.signIn') : t('auth.createAccount')}
              </Button>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
