import { useEffect, useState, type ReactNode } from 'react';
import { MsalProvider } from '@azure/msal-react';
import { authConfigured, msalInstance } from './msal-config';

type Props = {
  children: ReactNode;
};

/**
 * Wraps the app with MSAL's React context. MSAL v3+ requires explicit
 * initialize() before any auth operation can run, so we gate render
 * until that promise resolves.
 *
 * When Entra env vars aren't set (authConfigured=false), we skip MSAL
 * setup entirely — the rest of the app still functions, just without
 * the login button.
 */
export function AuthProvider({ children }: Props) {
  const [ready, setReady] = useState(!authConfigured);

  useEffect(() => {
    if (!authConfigured || ready) return;
    let cancelled = false;
    void msalInstance.initialize().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  if (!authConfigured) return <>{children}</>;
  if (!ready) return null;
  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}
