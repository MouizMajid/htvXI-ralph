import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ApiError, staffApi } from '../lib/api';

/** Shows `children` only to a signed-in staff member; otherwise sends them to sign in. */
export function RequireStaff({ children }: { children: ReactNode }) {
  const location = useLocation();
  const me = useQuery({ queryKey: ['staff-me'], queryFn: staffApi.me, retry: false, staleTime: 60_000 });

  if (me.isPending) {
    return <p className="p-10 text-center text-sm text-ink-muted">Checking sign-in…</p>;
  }
  if (me.isError) {
    if (me.error instanceof ApiError && me.error.status === 401) {
      const next = encodeURIComponent(location.pathname);
      return <Navigate to={`/staff/login?next=${next}`} replace />;
    }
    return <p className="p-10 text-center text-sm text-danger">Can’t reach the server. Refresh to try again.</p>;
  }
  return <>{children}</>;
}
