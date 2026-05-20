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
    await instance.loginPopup(loginRequest);
  }, [instance]);

  const signOut = useCallback(async () => {
    if (!authConfigured || !account) return;
    await instance.logoutPopup({ account });
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
