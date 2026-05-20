import type { RequestHandler } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { authConfigured, config } from '~/lib/config';
import { ServiceUnavailableError, UnauthorizedError } from './errors';

type AuthenticatedUser = {
  oid: string;
  email: string;
  displayName: string;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!authConfigured) return null;
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(
        `https://login.microsoftonline.com/${config.AUTH_TENANT_ID}/discovery/v2.0/keys`,
      ),
    );
  }
  return jwks;
}

/**
 * Entra v2 tokens issued for a custom API can show up with either the bare
 * clientId or the `api://<clientId>` form in the `aud` claim depending on
 * tenant settings. We accept both regardless of which form IT registered
 * AUTH_AUDIENCE as, so configuration mistakes don't reject valid tokens.
 */
function allowedAudiences(): string[] {
  const configured = config.AUTH_AUDIENCE;
  if (!configured) return [];
  const stripped = configured.replace(/^api:\/\//, '');
  const prefixed = `api://${stripped}`;
  return Array.from(new Set([configured, stripped, prefixed]));
}

function extractUser(payload: JWTPayload): AuthenticatedUser {
  const oid = typeof payload.oid === 'string' ? payload.oid : undefined;
  if (!oid) throw new UnauthorizedError('Missing oid claim');

  const email =
    (typeof payload.email === 'string' ? payload.email : undefined) ??
    (typeof payload.preferred_username === 'string' ? payload.preferred_username : undefined) ??
    '';

  const displayName = typeof payload.name === 'string' ? payload.name : '';

  return { oid, email, displayName };
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const keyset = getJwks();
    if (!keyset) {
      throw new ServiceUnavailableError(
        'Entra er ikke konfigurert. Sett AUTH_TENANT_ID og AUTH_AUDIENCE i apps/backend/.env.',
      );
    }
    const header = req.header('authorization');
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedError('Missing Bearer token');
    }
    const token = header.slice(7).trim();
    const { payload } = await jwtVerify(token, keyset, {
      issuer: [
        `https://login.microsoftonline.com/${config.AUTH_TENANT_ID}/v2.0`,
        `https://sts.windows.net/${config.AUTH_TENANT_ID}/`,
      ],
      audience: allowedAudiences(),
    });
    req.user = extractUser(payload);
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError || err instanceof ServiceUnavailableError) {
      next(err);
      return;
    }
    if (err instanceof Error) {
      next(new UnauthorizedError(`JWT verification failed: ${err.message}`));
      return;
    }
    next(err);
  }
};
