import type { SecureStorage } from '@/services/storage/tokenStore';
import type { EntryExitEvent } from '@/types/gate';
import type { GateClient, RecordEntryBody, RecordExitBody } from './gateClient';
import { newIdempotencyKey } from './idempotency';
import { ApiRequestError } from '@/services/api/errors';

/** A gate entry/exit capture waiting to reach the server, with the stable key that dedupes its retry. */
export interface QueuedGateCapture {
  /** Local id for list keys / removal. */
  readonly localId: string;
  /** Stable idempotency key: a re-send after reconnect is at-most-once (Req 63.3). */
  readonly idempotencyKey: string;
  readonly kind: 'entry' | 'exit';
  readonly body: RecordEntryBody | RecordExitBody;
  /** When it was captured (ISO-8601 UTC) — shown to the guard so a late sync is honest about timing. */
  readonly capturedAtUtc: string;
}

/** Outcome of one flush pass. */
export interface FlushResult {
  readonly synced: number;
  readonly remaining: number;
}

const STORAGE_KEY = 'communityos.gate.offlineQueue';

/**
 * A tiny persisted offline queue for gate entry/exit captures (Task 17.1 "offline-aware: queue +
 * idempotency key on sync"). A capture happens at the gate where connectivity can drop; when the
 * write fails as a transport error the guard screen enqueues it here and flushes on reconnect. Each
 * queued item carries a stable {@link QueuedGateCapture.idempotencyKey} so re-sending records the
 * entry/exit at most once, even if the first attempt actually reached the server before the socket
 * dropped (the backend's Idempotency-Key store replays the original result).
 *
 * <p>Backed by the same {@link SecureStorage} the token store uses (expo-secure-store), so it
 * survives app restarts. ponytail: a single JSON blob under one key, read-modify-write — a gate's
 * backlog is a handful of items, not a database; a structured store would be more than this needs.
 * The known ceiling is in-process serialization of flushes (not concurrent-safe across instances),
 * which is fine for one device's one queue.</p>
 */
export class GateOfflineQueue {
  private flushing = false;

  constructor(
    private readonly storage: SecureStorage,
    private readonly gate: GateClient,
  ) {}

  /** Read the current queue (oldest first). Returns [] on any read/parse failure (fail-safe). */
  async list(): Promise<QueuedGateCapture[]> {
    try {
      const raw = await this.storage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as QueuedGateCapture[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Enqueue a capture to sync later. Assigns a stable idempotency key up front so the eventual
   * send (and any retry) is at-most-once. Returns the stored item.
   */
  async enqueue(kind: 'entry' | 'exit', body: RecordEntryBody | RecordExitBody, idempotencyKey?: string): Promise<QueuedGateCapture> {
    const item: QueuedGateCapture = {
      localId: newIdempotencyKey(),
      idempotencyKey: idempotencyKey ?? newIdempotencyKey(),
      kind,
      body,
      capturedAtUtc: new Date().toISOString(),
    };
    const queue = await this.list();
    await this.write([...queue, item]);
    return item;
  }

  /**
   * Try to send every queued capture, oldest first. Each item sends with its stored idempotency key
   * (at-most-once). A per-item transport failure (network down / HTTP 0) stops the pass and leaves
   * that item and the rest queued for next time. A per-item PERMANENT rejection (validation/conflict
   * from the server — e.g. a pass that is now expired) is dropped from the queue so it can't wedge
   * the backlog forever; the caller surfaces that the item was discarded. Returns counts.
   */
  async flush(): Promise<FlushResult> {
    if (this.flushing) {
      const queue = await this.list();
      return { synced: 0, remaining: queue.length };
    }
    this.flushing = true;
    try {
      let queue = await this.list();
      let synced = 0;
      let item = queue[0];
      while (item) {
        try {
          await this.send(item);
          synced += 1;
        } catch (err) {
          if (isTransient(err)) {
            // Still offline / server unreachable — keep this and the rest for next time.
            break;
          }
          // Permanent server rejection — drop it so the backlog can drain; fall through to dequeue.
        }
        queue = queue.slice(1);
        await this.write(queue);
        item = queue[0];
      }
      return { synced, remaining: queue.length };
    } finally {
      this.flushing = false;
    }
  }

  private send(item: QueuedGateCapture): Promise<EntryExitEvent> {
    return item.kind === 'entry'
      ? this.gate.recordEntry(item.body as RecordEntryBody, item.idempotencyKey)
      : this.gate.recordExit(item.body as RecordExitBody, item.idempotencyKey);
  }

  private async write(queue: QueuedGateCapture[]): Promise<void> {
    await this.storage.setItem(STORAGE_KEY, JSON.stringify(queue));
  }
}

function isTransient(err: unknown): boolean {
  if (err instanceof ApiRequestError) {
    if (err.httpStatus === 0 || err.code === 'INTEGRATION_FAILURE') return true;
    if (err.code === 'UNAUTHENTICATED' || err.code === 'RATE_LIMITED' || err.code === 'INTERNAL_ERROR') return true;
    if (err.httpStatus === 401 || err.httpStatus === 429 || err.httpStatus >= 500) return true;
    return false;
  }
  return true;
}
