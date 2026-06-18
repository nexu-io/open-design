import { useEffect, useRef, useState, type FormEvent } from 'react';
import { authClient } from '../auth-client';
import { RemixIcon } from './RemixIcon';

type AuthMode = 'sign-in' | 'sign-up';

function displayInitial(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name || email || '?').trim();
  return source.charAt(0).toUpperCase();
}

function displayName(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name || email || 'Account').trim();
  return source.length > 0 ? source : 'Account';
}

export function AuthAccountMenu() {
  const session = authClient.useSession();
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
        setError(result.error.message || 'Authentication failed');
        return;
      }
      await session.refetch();
      setPassword('');
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Authentication failed');
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
        setError(result.error.message || 'Sign out failed');
        return;
      }
      await session.refetch();
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign out failed');
    } finally {
      setPending(false);
    }
  }

  const triggerLabel = signedIn
    ? `Account: ${displayName(user?.name, user?.email)}`
    : 'Sign in';

  return (
    <div className="auth-account-menu" ref={rootRef}>
      <button
        type="button"
        className="auth-account-menu__trigger od-tooltip"
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-tooltip={triggerLabel}
        data-tooltip-placement="bottom"
        onClick={() => setOpen((value) => !value)}
      >
        {signedIn ? (
          <span className="auth-account-menu__initial" aria-hidden>
            {displayInitial(user?.name, user?.email)}
          </span>
        ) : (
          <RemixIcon name="user-line" size={17} />
        )}
      </button>
      {open ? (
        <div className="auth-account-menu__popover" role="dialog" aria-label="Account">
          {signedIn ? (
            <>
              <div className="auth-account-menu__identity">
                <span className="auth-account-menu__avatar" aria-hidden>
                  {displayInitial(user?.name, user?.email)}
                </span>
                <div className="auth-account-menu__identity-text">
                  <strong>{displayName(user?.name, user?.email)}</strong>
                  {user?.email ? <span>{user.email}</span> : null}
                </div>
              </div>
              {error ? <p className="auth-account-menu__error">{error}</p> : null}
              <button
                type="button"
                className="auth-account-menu__submit"
                disabled={pending}
                onClick={() => void handleSignOut()}
              >
                {pending ? 'Signing out...' : 'Sign out'}
              </button>
            </>
          ) : (
            <form className="auth-account-menu__form" onSubmit={(event) => void handleSubmit(event)}>
              <div className="auth-account-menu__modes" role="tablist" aria-label="Authentication mode">
                <button
                  type="button"
                  className={mode === 'sign-in' ? 'is-active' : ''}
                  role="tab"
                  aria-selected={mode === 'sign-in'}
                  onClick={() => {
                    setMode('sign-in');
                    setError(null);
                  }}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={mode === 'sign-up' ? 'is-active' : ''}
                  role="tab"
                  aria-selected={mode === 'sign-up'}
                  onClick={() => {
                    setMode('sign-up');
                    setError(null);
                  }}
                >
                  Create
                </button>
              </div>
              {mode === 'sign-up' ? (
                <label className="auth-account-menu__field">
                  <span>Name</span>
                  <input
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.currentTarget.value)}
                  />
                </label>
              ) : null}
              <label className="auth-account-menu__field">
                <span>Email</span>
                <input
                  autoComplete="email"
                  inputMode="email"
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.currentTarget.value)}
                />
              </label>
              <label className="auth-account-menu__field">
                <span>Password</span>
                <input
                  autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                  minLength={8}
                  required
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                />
              </label>
              {error ? <p className="auth-account-menu__error">{error}</p> : null}
              <button type="submit" className="auth-account-menu__submit" disabled={pending}>
                {pending ? 'Working...' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
              </button>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
