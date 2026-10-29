/**
 * Idempotency-key generator shared by the resource clients. A fresh key per intended write makes a
 * retried mutation replay the server's original result instead of re-executing (Req 63.3) — and it
 * is the stable handle an offline write queue stores so a re-send after reconnect is at-most-once.
 * Uses `crypto.randomUUID` when the runtime exposes it, else a timestamp+random fallback.
 * ponytail: the fallback is a non-cryptographic id — fine for request dedupe, not for anything
 * security-bearing.
 */
export function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) {
    return c.randomUUID();
  }
  return `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
