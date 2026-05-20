import { useCallback } from 'react';
import {
  useAccount as useMsalAccount,
  useIsAuthenticated,
  useMsal,
} from '@azure/msal-react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { apiTokenRequest, authConfigured, loginRequest } from './msal-config';

type AcquireToken = () => Promise<string | null>;

type AccountState = {
  isAuthenticated: boolean;
  isReady: boolean;
  account: ReturnType<typeof useMsalAccount> | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  acquireToken: AcquireToken;
};

/**
 * Auth state + token-acquisition for components. When Entra isn't
 * configured, returns a no-op shape so callers don't have to branch.
 */
export function useAccount(): AccountState {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const account = useMsalAccount(accounts[0] ?? {});

  const acquireToken = useCallback<AcquireToken>(async () => {
    if (!authConfigured || !account) return null;
    try {
      const result = await instance.acquireTokenSilent({
        ...apiTokenRequest,
        account,
      });
      return result.accessToken;
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        try {
          const result = await instance.acquireTokenPopup({
            ...apiTokenRequest,
            account,
          });
          return result.accessToken;
        } catch {
          return null;
        }
      }
      return null;
    }
  }, [account, instance]);

  const signIn = useCallback(async () => {
    if (!authConfigured) return;
    // Use redirect flow rather than popup. Popups are flaky when the user is
    // already SSO'd into Entra (silent flow gets lost in the popup→parent
    // postMessage handshake) and Edge/Chrome popup blockers can swallow
    // them on first click. Redirect re-loads the SPA after auth and MSAL
    // picks up the hash on init.
    await instance.loginRedirect(loginRequest);
  }, [instance]);

  const signOut = useCallback(async () => {
    if (!authConfigured || !account) return;
    await instance.logoutRedirect({ account });
  }, [account, instance]);

  return {
    isAuthenticated,
    isReady: authConfigured,
    account: account ?? null,
    signIn,
    signOut,
    acquireToken,
  };
}
