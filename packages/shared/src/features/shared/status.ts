import type { BadgeTone } from '../../ui/Badge';
import { ResidentVerificationStatus } from '../../models/resident';
import {
  VisitPassStatus,
  VisitorStatus,
  RecurringVisitorStatus,
  WatchlistStatus,
  SosAlertStatus,
} from '../../models/gate';
import { ParcelStatus } from '../../models/parcel';
import { TicketStatus } from '../../models/helpdesk';
import { WorkOrderStatus } from '../../models/maintenance';

/**
 * Map a resident verification status code to a {@link BadgeTone}. Unknown/custom codes fall back to
 * neutral — the code set is configurable master-data, so the UI must not assume a closed set. The
 * badge always shows the code text too, so meaning never rides on colour alone (Req 65.6).
 */
export function verificationTone(status: string): BadgeTone {
  switch (status) {
    case ResidentVerificationStatus.Verified:
      return 'positive';
    case ResidentVerificationStatus.Pending:
      return 'warning';
    case ResidentVerificationStatus.Rejected:
      return 'danger';
    default:
      return 'neutral';
  }
}

/**
 * Map a Phase 3 gate status code to a {@link BadgeTone}. Covers the visit-pass / walk-in /
 * recurring / watchlist / SOS status vocabularies — all configurable codes, so an unknown value
 * falls back to neutral and the badge always shows the code text (meaning never rides on colour
 * alone, Req 65.6). "active/approved/resolved" read positive, "pending/acknowledged" warning,
 * "rejected/revoked/expired/used/cleared" and an active SOS read danger/neutral per their meaning.
 */
export function gateStatusTone(status: string): BadgeTone {
  switch (status) {
    case VisitPassStatus.Active:
    case VisitorStatus.Approved:
    case RecurringVisitorStatus.Active:
    case SosAlertStatus.Resolved:
      return 'positive';
    case VisitorStatus.Pending:
    case SosAlertStatus.Acknowledged:
      return 'warning';
    case VisitorStatus.Rejected:
    case VisitPassStatus.Revoked:
    case RecurringVisitorStatus.Revoked:
    case SosAlertStatus.Active:
      return 'danger';
    case VisitPassStatus.Used:
    case VisitPassStatus.Expired:
    case VisitorStatus.Expired:
    case WatchlistStatus.Cleared:
    default:
      return 'neutral';
  }
}

export function effectiveVisitPassStatus(status: string, validUntilUtc: string, now: Date = new Date()): string {
  if (status !== VisitPassStatus.Active) return status;
  const until = new Date(validUntilUtc);
  return !Number.isNaN(until.getTime()) && now > until ? VisitPassStatus.Expired : status;
}

export function isVisitPassExpired(status: string, validUntilUtc: string, now: Date = new Date()): boolean {
  return effectiveVisitPassStatus(status, validUntilUtc, now) === VisitPassStatus.Expired;
}

/** A watchlist entry's tone: an active flag is danger, a cleared one neutral (Req 26.5). */
export function watchlistTone(status: string): BadgeTone {
  return status === WatchlistStatus.Active ? 'danger' : 'neutral';
}

/**
 * Map a Phase 4 parcel-status code to a {@link BadgeTone}. All configurable codes, so an unknown
 * value falls back to neutral and the badge always shows the code text (meaning never rides on
 * colour alone, Req 65.6). A completed <c>handed_over</c> reads positive; the in-flight states
 * (received/in_custody/ready_for_pickup) read warning; <c>lost_damaged</c> reads danger;
 * <c>owner_not_available</c> and <c>returned/expected</c> stay neutral.
 */
export function parcelStatusTone(status: string): BadgeTone {
  switch (status) {
    case ParcelStatus.HandedOver:
      return 'positive';
    case ParcelStatus.Received:
    case ParcelStatus.InCustody:
    case ParcelStatus.ReadyForPickup:
      return 'warning';
    case ParcelStatus.OwnerNotAvailable:
    case ParcelStatus.LostDamaged:
      return 'danger';
    case ParcelStatus.Expected:
    case ParcelStatus.Returned:
    default:
      return 'neutral';
  }
}

/**
 * Map a Phase 5 ticket-status code to a {@link BadgeTone}. All configurable codes, so an unknown
 * value falls back to neutral and the badge always shows the code text (meaning never rides on
 * colour alone, Req 65.6). A completed <c>resolved/closed</c> reads positive; the active work states
 * (assigned/in_progress) read warning; <c>waiting/reopened</c> read danger; a freshly raised
 * <c>new</c> stays neutral.
 */
export function ticketStatusTone(status: string): BadgeTone {
  switch (status) {
    case TicketStatus.Resolved:
    case TicketStatus.Closed:
      return 'positive';
    case TicketStatus.Assigned:
    case TicketStatus.InProgress:
      return 'warning';
    case TicketStatus.Waiting:
    case TicketStatus.Reopened:
      return 'danger';
    case TicketStatus.New:
    default:
      return 'neutral';
  }
}

/**
 * Map a Phase 5 work-order-status code to a {@link BadgeTone}. All configurable codes, so an unknown
 * value falls back to neutral and the badge always shows the code text (meaning never rides on
 * colour alone, Req 65.6). A <c>completed</c> order reads positive; the active work states
 * (assigned/in_progress) read warning; <c>on_hold/cancelled</c> read danger; a freshly raised
 * <c>open</c> stays neutral.
 */
export function workOrderStatusTone(status: string): BadgeTone {
  switch (status) {
    case WorkOrderStatus.Completed:
      return 'positive';
    case WorkOrderStatus.Assigned:
    case WorkOrderStatus.InProgress:
      return 'warning';
    case WorkOrderStatus.OnHold:
    case WorkOrderStatus.Cancelled:
      return 'danger';
    case WorkOrderStatus.Open:
    default:
      return 'neutral';
  }
}

/**
 * Map an MVP notices-slice announcement-category code to a {@link BadgeTone}. The category list is
 * configurable master-data, so an unknown value falls back to neutral and the badge always shows the
 * code text (meaning never rides on colour alone, Req 65.6). An <c>emergency</c> notice reads danger,
 * <c>maintenance</c> warning, <c>event</c> positive, <c>general</c> (and anything else) neutral.
 */
export function announcementCategoryTone(category: string): BadgeTone {
  switch (category) {
    case 'event':
      return 'positive';
    case 'maintenance':
      return 'warning';
    case 'emergency':
      return 'danger';
    case 'general':
    default:
      return 'neutral';
  }
}

/** Humanize a master-data code for display when no label is available (e.g. `co_owner` → `Co owner`). */
export function humanizeCode(code: string): string {
  const spaced = code.replace(/[_-]+/g, ' ').trim();
  return spaced.length ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : code;
}
