import { useEffect, useState } from 'react';
import type { UserDTO } from '@innsyn/shared';
import { useAccount } from './useAccount';

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; user: UserDTO }
  | { status: 'error'; message: string };

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

/**
 * Fetches GET /api/me once the user is signed in. Backend creates the
 * User row on first call, so this also bootstraps the DB-side user.
 */
export function useMe() {
  const { isAuthenticated, acquireToken } = useAccount();
  const [state, setState] = useState<State>({ status: 'idle' });

  useEffect(() => {
    if (!isAuthenticated) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    void (async () => {
      const token = await acquireToken();
      if (!token) {
        if (!cancelled) setState({ status: 'error', message: 'Ingen access-token' });
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/api/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status} ${body || res.statusText}`);
        }
        const user = (await res.json()) as UserDTO;
        if (!cancelled) setState({ status: 'ready', user });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [acquireToken, isAuthenticated]);

  return state;
}
