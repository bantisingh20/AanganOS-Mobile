/**
 * Phase 5 Maintenance_Service read models — mirror the backend `CommunityOS.Application.Maintenance`
 * DTOs 1:1 (Req 35.x, 36.x). Read-only shapes the mobile maintenance (staff) screens list/view; the
 * write actions live on the {@link MaintenanceClient}. Every type/category/status/priority is a
 * configurable code resolved from master-data (steering: no hardcoding) — the constants here are
 * only the stable list KEYS and the well-known status codes the UI branches on, never a closed set.
 *
 * <p>Only the asset + work-order (incl. parts/labour) shapes the Task 22.1 staff screens need are
 * modelled here; plans / inspections / AMC / meters stay server-side until a screen needs them
 * (ponytail: YAGNI — model what the screen renders, not the whole service surface).</p>
 */

/** Mirror of `AssetDto` (Req 35.1, 35.2). */
export interface Asset {
  readonly id: string;
  readonly communityId: string;
  readonly name: string;
  readonly serialNumber: string;
  readonly location: string;
  /** Configurable asset-type code (`Asset_Type` list). */
  readonly assetType: string;
  /** Configurable asset-category code (`Asset_Category` list), or null. */
  readonly category: string | null;
  /** Configurable asset lifecycle-status code (`Asset_Status` list). */
  readonly status: string;
  /** The opaque, community-unique scannable QR token identifying the asset (Req 35.2). */
  readonly qrToken: string;
  readonly unitId: string | null;
  readonly warrantyProvider: string | null;
  readonly warrantyReference: string | null;
  readonly warrantyStartUtc: string | null;
  readonly warrantyEndUtc: string | null;
  readonly installedOnUtc: string | null;
  readonly notes: string | null;
  readonly createdAtUtc: string;
}

/** Mirror of `WorkOrderDto` (Req 36.1–36.5). */
export interface WorkOrder {
  readonly id: string;
  readonly communityId: string;
  readonly assetId: string;
  readonly maintenancePlanId: string | null;
  readonly sourceTicketId: string | null;
  readonly title: string;
  readonly description: string;
  /** Configurable type code (`Work_Order_Type` list — preventive/corrective). */
  readonly workOrderType: string;
  /** Configurable priority code (`Work_Order_Priority` list). */
  readonly priority: string;
  /** Configurable status code (`Work_Order_Status` list). */
  readonly status: string;
  readonly assignedToUserId: string | null;
  readonly assignedAtUtc: string | null;
  readonly completedAtUtc: string | null;
  readonly scheduledForUtc: string | null;
  readonly completionNotes: string | null;
  readonly createdAtUtc: string;
}

/** Mirror of `WorkOrderPartDto` — a part/material recorded against a work order (Req 36.4). */
export interface WorkOrderPart {
  readonly id: string;
  readonly communityId: string;
  readonly workOrderId: string;
  readonly partName: string;
  readonly partNumber: string | null;
  readonly quantity: number;
  readonly unitCost: number;
  readonly lineTotal: number;
}

/** Mirror of `WorkOrderLabourDto` — a labour entry recorded against a work order (Req 36.4). */
export interface WorkOrderLabour {
  readonly id: string;
  readonly communityId: string;
  readonly workOrderId: string;
  readonly workerUserId: string | null;
  readonly workerName: string;
  readonly hours: number;
  readonly hourlyRate: number;
  readonly labourCost: number;
  readonly notes: string | null;
}

/** Well-known work-order-status codes (mirror of `WorkOrderStatuses`). Branch hints only; the list is editable. */
export const WorkOrderStatus = {
  Open: 'open',
  Assigned: 'assigned',
  InProgress: 'in_progress',
  OnHold: 'on_hold',
  Completed: 'completed',
  Cancelled: 'cancelled',
} as const;

/** Well-known asset lifecycle-status codes (mirror of `AssetStatuses`). Branch hints only; the list is editable. */
export const AssetStatus = {
  Active: 'active',
  UnderMaintenance: 'under_maintenance',
  Inactive: 'inactive',
  Retired: 'retired',
  Disposed: 'disposed',
} as const;

/**
 * Maintenance master-data list keys the backend seeds (mirror of the Maintenance `ConfigKeys`).
 * Dropdowns resolve their options from `GET /api/v1/master-data/{listKey}` — never a hardcoded
 * option array (steering: no hardcoding; Req 8.4, 35.1, 36.1, 36.2).
 */
export const MaintenanceMasterDataKeys = {
  AssetType: 'Asset_Type',
  AssetStatus: 'Asset_Status',
  AssetCategory: 'Asset_Category',
  WorkOrderType: 'Work_Order_Type',
  WorkOrderPriority: 'Work_Order_Priority',
  WorkOrderStatus: 'Work_Order_Status',
} as const;
