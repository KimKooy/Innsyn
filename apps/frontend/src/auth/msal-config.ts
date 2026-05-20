import { LogLevel, PublicClientApplication, type Configuration } from '@azure/msal-browser';

const tenantId = (import.meta.env.VITE_AUTH_TENANT_ID as string | undefined) ?? '';
const clientId = (import.meta.env.VITE_AUTH_CLIENT_ID as string | undefined) ?? '';
const apiScope = (import.meta.env.VITE_AUTH_API_SCOPE as string | undefined) ?? '';

export const authConfigured = Boolean(tenantId && clientId && apiScope);

const msalConfig: Configuration = {
  auth: {
    clientId: clientId || 'unconfigured',
    authority: `https://login.microsoftonline.com/${tenantId || 'common'}`,
    redirectUri: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
  },
  cache: {
    cacheLocation: 'sessionStorage',
  },
  system: {
    loggerOptions: {
      loggerCallback: () => {
        // MSAL writes to console by default; route through nothing in committed
        // code (per CLAUDE.md no console.log). Hook in real logging later.
      },
      logLevel: LogLevel.Warning,
    },
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

/** Scopes requested at login time — enough for sign-in plus our API. */
export const loginRequest = {
  scopes: ['openid', 'profile', 'email', ...(apiScope ? [apiScope] : [])],
};

/** Scopes requested when silently fetching an API access token. */
export const apiTokenRequest = {
  scopes: apiScope ? [apiScope] : [],
};
