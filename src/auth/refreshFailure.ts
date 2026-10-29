import { ApiRequestError } from '@/services/api/errors';

/**
 * Did a silent-refresh attempt fail because the refresh token is genuinely dead (the server
 * actively rejected it, or there is no token at all), versus because we simply could not reach the
 * server (offline / timeout / 5xx)?
 *
 * Only a dead token should end the session and send the user to login. A transport failure must
 * NOT discard a still-valid refresh token — that is the difference between "stay logged in like
 * Instagram/WhatsApp" and "bounced to login whenever the network blips". When in doubt we treat the
 * failure as transient (keep the session): worst case the next request/launch re-tries the refresh.
 */
export function isRefreshTokenDead(err: unknown): boolean {
  // No refresh token at all → nothing to restore; treat as logged out.
  if (err instanceof Error && err.message === 'No refresh token') return true;
  if (err instanceof ApiRequestError) {
    // The server reached a verdict and said no: the token is invalid/expired/revoked.
    return err.code === 'UNAUTHENTICATED' || err.code === 'FORBIDDEN';
  }
  // Anything else (INTEGRATION_FAILURE, httpStatus 0, 5xx, parse/transport error) is "couldn't
  // reach the server" → keep the session; a later request/launch will refresh reactively.
  return false;
}
