import { useEffect, useState, type ReactNode } from 'react';
import { MsalProvider } from '@azure/msal-react';
import { authConfigured, msalInstance } from './msal-config';

type Props = {
  children: ReactNode;
};

/**
 * Wraps the app with MSAL's React context. MSAL v3+ requires explicit
 * initialize() before any auth operation can run, and the redirect flow
 * additionally requires handleRedirectPromise() to be awaited so MSAL
 * can claim the auth hash from the URL on return from Entra. We gate
 * render on both completing.
 *
 * When Entra env vars aren't set (authConfigured=false), we skip MSAL
 * setup entirely — the rest of the app still works without auth.
 */
export function AuthProvider({ children }: Props) {
  const [ready, setReady] = useState(!authConfigured);

  useEffect(() => {
    if (!authConfigured || ready) return;
    let cancelled = false;
    void (async () => {
      await msalInstance.initialize();
      // If the page just loaded from a redirect back from Entra, this
      // resolves with the auth response and MSAL stores the account.
      // On a normal page load it resolves with null and is a no-op.
      await msalInstance.handleRedirectPromise();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  if (!authConfigured) return <>{children}</>;
  if (!ready) return null;
  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}
