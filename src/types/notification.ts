/**
 * In-app notification (mirror of the backend `NotificationInboxItemDto`). These are the SAME
 * transactional-outbox rows the server writes via its one common enqueue helper for every event
 * (walk-in registered/approved/rejected, tickets, parcels, SLA, …), surfaced as the signed-in
 * user's readable inbox. Self-scoped server-side — a user only ever sees their own.
 */
export interface AppNotification {
  readonly id: string;
  /** Grouping category code (e.g. `visitor`, `complaint`, `parcel`, `account`) — drives the icon. */
  readonly category: string;
  readonly title: string;
  readonly body: string;
  /** Optional structured payload (e.g. a resource id for deep-linking), or null. */
  readonly payloadJson: string | null;
  readonly isRead: boolean;
  readonly createdAtUtc: string;
}
