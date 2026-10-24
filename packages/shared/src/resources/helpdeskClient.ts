import type { ApiClient } from '../api/client';
import type { PagedData } from '../models/envelope';
import type { ListQuery } from '../models/query';
import type { Ticket, TicketAttachment, TicketComment, TicketAnalytics } from '../models/helpdesk';
import { buildQuery, listQueryParams } from './query';
import { newIdempotencyKey } from './idempotency';

/** Extra server-side filters for the ticket list (Req 32.4). */
export interface TicketListFilters {
  readonly status?: string;
  readonly category?: string;
  readonly subcategory?: string;
  readonly priority?: string;
  readonly hostUnitId?: string;
  readonly assignedToUserId?: string;
}

/** Body for a resident to raise a ticket for their OWN unit (Req 32.1, 32.3). */
export interface CreateTicketBody {
  readonly hostUnitId: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly subcategory?: string;
  /** Priority code; omit to use the configured community default (Req 32.1). */
  readonly priority?: string;
  /** Optional File_Service references (photo/video/document) to associate with the ticket (Req 32.3). */
  readonly attachmentFileIds?: string[];
}

/** Body to assign/re-assign a ticket to a maintenance-staff member (Req 33.1, 33.4). */
export interface AssignTicketBody {
  readonly assignedToUserId: string;
}

/** Body to drive a ticket through its configurable status lifecycle (Req 34.1–34.3). */
export interface ChangeTicketStatusBody {
  readonly toStatus: string;
  readonly reason?: string;
}

/** Body for a resident to submit feedback/rating on their resolved ticket (Req 34.4). */
export interface SubmitTicketFeedbackBody {
  readonly rating: number;
  readonly comment?: string;
}

/**
 * Typed client for the Phase 5 Helpdesk_Service HTTP surface (Req 32.x, 33.x, 34.x). Thin,
 * envelope-aware wrapper over {@link ApiClient} — screens call `helpdesk.createTicket(...)` instead
 * of hand-rolling fetch + query strings (steering: reuse the shared client). Lists are tenant/self
 * scoped server-side by the EF global query filter, so a resident principal's `tickets` list returns
 * only their own unit's tickets without the screen asking for a scope. Mirrors {@link ParcelClient}.
 *
 * <p>Write actions send an `Idempotency-Key` so a retried create/status/feedback replays the
 * original result instead of re-executing.</p>
 */
export class HelpdeskClient {
  constructor(
    private readonly api: ApiClient,
    private readonly idempotencyKey: () => string = newIdempotencyKey,
  ) {}

  /** Resident raises a ticket for their own unit; starts `new`, recipient staff notified (Req 32.1). */
  createTicket(body: CreateTicketBody, idempotencyKey?: string): Promise<Ticket> {
    return this.api.post<Ticket>('/api/v1/tickets', {
      body,
      idempotencyKey: idempotencyKey ?? this.idempotencyKey(),
    });
  }

  listTickets(
    query: ListQuery = {},
    filters: TicketListFilters = {},
    options?: { signal?: AbortSignal },
  ): Promise<PagedData<Ticket>> {
    const qs = buildQuery({
      ...listQueryParams(query),
      status: filters.status,
      category: filters.category,
      subcategory: filters.subcategory,
      priority: filters.priority,
      hostUnitId: filters.hostUnitId,
      assignedToUserId: filters.assignedToUserId,
    });
    return this.api.get<PagedData<Ticket>>(`/api/v1/tickets${qs}`, options);
  }

  getTicket(id: string, options?: { signal?: AbortSignal }): Promise<Ticket> {
    return this.api.get<Ticket>(`/api/v1/tickets/${id}`, options);
  }

  /** The ticket's File_Service attachment references (Req 32.3). */
  getAttachments(id: string, options?: { signal?: AbortSignal }): Promise<TicketAttachment[]> {
    return this.api.get<TicketAttachment[]>(`/api/v1/tickets/${id}/attachments`, options);
  }

  /** The ticket's discussion thread, oldest-first. */
  getComments(id: string, options?: { signal?: AbortSignal }): Promise<TicketComment[]> {
    return this.api.get<TicketComment[]>(`/api/v1/tickets/${id}/comments`, options);
  }

  /** Post a comment to the ticket (resident or staff). */
  addComment(id: string, body: string): Promise<TicketComment> {
    return this.api.post<TicketComment>(`/api/v1/tickets/${id}/comments`, { body: { body } });
  }

  /** Aggregated helpdesk analytics, optionally narrowed to one authorized community (Req 34.5). */
  getAnalytics(communityId?: string, options?: { signal?: AbortSignal }): Promise<TicketAnalytics> {
    const qs = buildQuery({ communityId });
    return this.api.get<TicketAnalytics>(`/api/v1/tickets/analytics${qs}`, options);
  }

  /** Assign/re-assign the ticket to maintenance staff (Req 33.1, 33.4, 33.5). */
  assign(id: string, body: AssignTicketBody): Promise<Ticket> {
    return this.api.post<Ticket>(`/api/v1/tickets/${id}/assign`, {
      body,
      idempotencyKey: this.idempotencyKey(),
    });
  }

  /** Drive the ticket through its configurable status lifecycle (Req 34.1–34.3). */
  changeStatus(id: string, body: ChangeTicketStatusBody): Promise<Ticket> {
    return this.api.post<Ticket>(`/api/v1/tickets/${id}/status`, {
      body,
      idempotencyKey: this.idempotencyKey(),
    });
  }

  /** Resident submits feedback/rating on their resolved ticket (Req 34.4). */
  submitFeedback(id: string, body: SubmitTicketFeedbackBody): Promise<Ticket> {
    return this.api.post<Ticket>(`/api/v1/tickets/${id}/feedback`, {
      body,
      idempotencyKey: this.idempotencyKey(),
    });
  }
}
