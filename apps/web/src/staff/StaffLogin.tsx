import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, staffApi } from '../lib/api';

/**
 * Staff sign-in: badge number + PIN, checked on the server. In a real hospital this screen is
 * replaced by the hospital's own sign-in (SSO with multi-factor auth).
 */
export function StaffLogin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const next = params.get('next')?.startsWith('/staff') ? params.get('next')! : '/staff';
  const [badge, setBadge] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { staff } = await staffApi.login(badge, pin);
      queryClient.setQueryData(['staff-me'], { staff });
      navigate(next, { replace: true });
    } catch (err) {
      setPin('');
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Badge number or PIN not recognised. Try again.'
          : 'Can’t reach the server right now. Try again in a moment.',
      );
    } finally {
      setBusy(false);
    }
  };

  const field =
    'w-full rounded-lg border border-staff-line bg-surface px-3 py-2.5 text-lg tracking-wide focus:border-secondary focus:outline-none';

  return (
    <main className="flex min-h-full items-center justify-center bg-transparent px-4 py-10 text-ink">
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-staff-line bg-surface p-6">
        <div>
          <p className="text-xs font-semibold tracking-widest text-ink-muted uppercase">RALPH · Staff</p>
          <h1 className="mt-1 text-2xl font-bold">Sign in</h1>
          <p className="mt-1 text-sm text-ink-muted">Use your badge number and PIN.</p>
        </div>

        <label className="flex flex-col gap-1 text-sm font-semibold" htmlFor="badge">
          Badge number
          <input
            id="badge"
            className={field}
            value={badge}
            onChange={(e) => setBadge(e.target.value)}
            inputMode="numeric"
            autoComplete="username"
            autoFocus
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold" htmlFor="pin">
          PIN
          <input
            id="pin"
            className={field}
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            inputMode="numeric"
            autoComplete="current-password"
            required
          />
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !badge.trim() || !pin.trim()}
          className="rounded-lg bg-secondary px-4 py-2.5 font-semibold text-on-secondary disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-xs text-ink-muted">
          Hospital deployments use the hospital’s own sign-in with multi-factor authentication.
        </p>
        {params.has('demo') && (
          <p className="rounded-lg bg-staff-bg px-3 py-2 text-xs text-ink-muted">
            Demo accounts (synthetic data): badge <strong>1042</strong> / PIN <strong>4821</strong>, or badge{' '}
            <strong>2077</strong> / PIN <strong>3156</strong>.
          </p>
        )}
      </form>
    </main>
  );
}
