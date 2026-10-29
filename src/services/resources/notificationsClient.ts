import type { ApiClient } from '@/services/api/client';
import type { PagedData } from '@/types/envelope';
import type { ListQuery } from '@/types/query';
import type { AppNotification } from '@/types/notification';
import { buildQuery, listQueryParams } from './query';

/** Unread-count response shape. */
interface UnreadCount {
  readonly unreadCount: number;
}

/**
 * Typed client for `/api/v1/notifications` — the signed-in user's in-app INBOX. The rows are the
 * same transactional-outbox entries the backend writes via its one common enqueue helper for every
 * event; this just lists the caller's own (self-scoped server-side) and flips the read flag. Thin,
 * envelope-aware wrapper over {@link ApiClient}.
 */
export class NotificationsClient {
  constructor(private readonly api: ApiClient) {}

  /** The caller's notifications, newest-first, paginated. `unreadOnly` filters to unread. */
  list(
    query: ListQuery = {},
    options: { unreadOnly?: boolean; signal?: AbortSignal } = {},
  ): Promise<PagedData<AppNotification>> {
    const qs = buildQuery({
      ...listQueryParams(query),
      ...(options.unreadOnly ? { unreadOnly: true } : {}),
    });
    return this.api.get<PagedData<AppNotification>>(
      `/api/v1/notifications${qs}`,
      options.signal ? { signal: options.signal } : undefined,
    );
  }

  /** The caller's unread count (bell badge). */
  async unreadCount(options?: { signal?: AbortSignal }): Promise<number> {
    const data = await this.api.get<UnreadCount>('/api/v1/notifications/unread-count', options);
    return data.unreadCount;
  }

  /** Mark one of the caller's notifications read (idempotent). */
  markRead(id: string): Promise<unknown> {
    return this.api.post<unknown>(`/api/v1/notifications/${id}/read`);
  }

  /** Mark ALL the caller's unread notifications read. */
  markAllRead(): Promise<unknown> {
    return this.api.post<unknown>('/api/v1/notifications/read-all');
  }

  /** Soft-delete one of the caller's notifications (hidden from the inbox; retained in the table). */
  delete(id: string): Promise<unknown> {
    return this.api.delete<unknown>(`/api/v1/notifications/${id}`);
  }

  /** Soft-delete ALL the caller's notifications (clear the inbox). */
  deleteAll(): Promise<unknown> {
    return this.api.delete<unknown>('/api/v1/notifications');
  }
}
