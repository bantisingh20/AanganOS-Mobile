/**
 * Phase 5 Helpdesk_Service read models — mirror the backend `CommunityOS.Application.Helpdesk` DTOs
 * 1:1 (Req 32.x, 33.x, 34.x). Read-only shapes the mobile helpdesk screens list/view; the write
 * actions live on the {@link HelpdeskClient}. Every category/subcategory/priority/status is a
 * configurable code resolved from master-data (steering: no hardcoding) — the constants here are
 * only the stable list KEYS and the well-known status codes the UI branches on, never a closed set.
 */

/** Mirror of `TicketDto` (Req 32.1, 33.x, 34.4). */
export interface Ticket {
  readonly id: string;
  readonly communityId: string;
  readonly hostUnitId: string;
  readonly raisedByResidentId: string | null;
  readonly title: string;
  readonly description: string;
  /** Configurable ticket-category code (`Ticket_Category` list). */
  readonly category: string;
  /** Configurable ticket-subcategory code (`Ticket_Subcategory` list), or null. */
  readonly subcategory: string | null;
  /** Configurable ticket-priority code (`Ticket_Priority` list). */
  readonly priority: string;
  /** Configurable ticket-status code (`Ticket_Status` list). */
  readonly status: string;
  readonly assignedToUserId: string | null;
  readonly assignedAtUtc: string | null;
  /** The per-priority SLA target instant, or null while unassigned (Req 33.2). */
  readonly slaDueAtUtc: string | null;
  readonly slaEscalatedAtUtc: string | null;
  /** The resident's feedback rating on the configurable scale, or null until given (Req 34.4). */
  readonly rating: number | null;
  readonly feedbackComment: string | null;
  readonly feedbackAtUtc: string | null;
  readonly createdAtUtc: string;
}

/** Mirror of `TicketAttachmentDto` — a File_Service reference on a ticket (Req 32.3). */
export interface TicketAttachment {
  readonly id: string;
  readonly communityId: string;
  readonly ticketId: string;
  /** Opaque File_Service reference to the stored bytes (streamed via File_Service). */
  readonly fileId: string;
}

/** Mirror of `TicketCommentDto` — one message in a ticket's discussion thread. */
export interface TicketComment {
  readonly id: string;
  readonly communityId: string;
  readonly ticketId: string;
  readonly body: string;
  /** The acting user id that posted it (audit column), or null. */
  readonly createdBy: string | null;
  readonly createdAtUtc: string;
}

/** Mirror of `TicketCountByKeyDto` — one grouped analytics bucket (Req 34.5). */
export interface TicketCountByKey {
  readonly key: string;
  readonly count: number;
}

/** Mirror of `TicketAnalyticsDto` — aggregated helpdesk analytics (Req 34.5). */
export interface TicketAnalytics {
  readonly totalTickets: number;
  readonly byStatus: TicketCountByKey[];
  readonly byCategory: TicketCountByKey[];
  readonly byPriority: TicketCountByKey[];
  readonly resolvedWithinSla: number;
  readonly resolvedBreachedSla: number;
  readonly averageResolutionHours: number | null;
}

/** Well-known ticket-status codes (mirror of `TicketStatuses`). Branch hints only; the list is editable. */
export const TicketStatus = {
  New: 'new',
  Assigned: 'assigned',
  InProgress: 'in_progress',
  Waiting: 'waiting',
  Resolved: 'resolved',
  Closed: 'closed',
  Reopened: 'reopened',
} as const;

/**
 * Helpdesk master-data list keys the backend seeds (mirror of the Helpdesk `ConfigKeys`). Dropdowns
 * resolve their options from `GET /api/v1/master-data/{listKey}` — never a hardcoded option array
 * (steering: no hardcoding; Req 8.4, 32.1, 32.2, 34.1).
 */
export const HelpdeskMasterDataKeys = {
  TicketCategory: 'Ticket_Category',
  TicketSubcategory: 'Ticket_Subcategory',
  TicketPriority: 'Ticket_Priority',
  TicketStatus: 'Ticket_Status',
} as const;
