import type { ApiClient } from '@/services/api/client';
import type { PagedData } from '@/types/envelope';
import type { ListQuery } from '@/types/query';
import type { Asset, WorkOrder, WorkOrderPart, WorkOrderLabour } from '@/types/maintenance';
import { buildQuery, listQueryParams } from './query';
import { newIdempotencyKey } from './idempotency';

/** Extra server-side filters for the asset list (Req 35.3). */
export interface AssetListFilters {
  readonly status?: string;
  readonly assetType?: string;
  readonly category?: string;
  readonly communityId?: string;
  readonly unitId?: string;
}

/** Extra server-side filters for the work-order list (Req 36.2, 36.3). */
export interface WorkOrderListFilters {
  readonly status?: string;
  readonly workOrderType?: string;
  readonly priority?: string;
  readonly assetId?: string;
  readonly assignedToUserId?: string;
  readonly maintenancePlanId?: string;
}

/** Body to assign/re-assign a work order to a maintenance-staff member (Req 36.3). */
export interface AssignWorkOrderBody {
  readonly assignedToUserId: string;
}

/** Body to change a work order's status through the configurable transition allow-list (Req 36.1–36.5). */
export interface ChangeWorkOrderStatusBody {
  readonly toStatus: string;
  /** Completion notes recorded when moving to `completed`. */
  readonly completionNotes?: string;
}

/** Body to record a part/material used against a work order (Req 36.4). Line total is computed server-side. */
export interface AddWorkOrderPartBody {
  readonly partName: string;
  readonly partNumber?: string;
  readonly quantity: number;
  readonly unitCost: number;
}

/** Body to record a labour entry against a work order (Req 36.4). Labour cost is computed server-side. */
export interface AddWorkOrderLabourBody {
  readonly workerUserId?: string;
  readonly workerName: string;
  readonly hours: number;
  readonly hourlyRate: number;
  readonly notes?: string;
}

/**
 * Typed client for the Phase 5 Maintenance_Service HTTP surface the Task 22.1 staff screens use —
 * the asset register (Req 35.x) and work orders with parts/labour (Req 36.x). Thin, envelope-aware
 * wrapper over {@link ApiClient} — screens call `maintenance.listWorkOrders(...)` instead of
 * hand-rolling fetch + query strings (steering: reuse the shared client). Lists are tenant-scoped
 * server-side by the EF global query filter. Mirrors {@link ParcelClient}.
 *
 * <p>Only the asset-read + work-order (incl. parts/labour) surface the staff screens need is wrapped
 * here; plans / inspections / AMC / meters stay unwrapped until a screen needs them (ponytail:
 * YAGNI — wrap what a screen calls, not the whole service).</p>
 */
export class MaintenanceClient {
  constructor(
    private readonly api: ApiClient,
    private readonly idempotencyKey: () => string = newIdempotencyKey,
  ) {}

  // --- Assets (Req 35.x) ---------------------------------------------------------------------

  /**
   * Paginated/filter/sort/search asset list, tenant-scoped (Req 35.3). `search` matches the asset
   * name / serial number / location server-side — the staff asset-lookup screen drives it with the
   * scanned serial/QR text, then exact-matches the returned `qrToken` client-side (the backend list
   * is not searchable by QR token).
   */
  listAssets(
    query: ListQuery = {},
    filters: AssetListFilters = {},
    options?: { signal?: AbortSignal },
  ): Promise<PagedData<Asset>> {
    const qs = buildQuery({
      ...listQueryParams(query),
      status: filters.status,
      assetType: filters.assetType,
      category: filters.category,
      communityId: filters.communityId,
      unitId: filters.unitId,
    });
    return this.api.get<PagedData<Asset>>(`/api/v1/assets${qs}`, options);
  }

  getAsset(id: string, options?: { signal?: AbortSignal }): Promise<Asset> {
    return this.api.get<Asset>(`/api/v1/assets/${id}`, options);
  }

  // --- Work orders (Req 36.2–36.5) -----------------------------------------------------------

  listWorkOrders(
    query: ListQuery = {},
    filters: WorkOrderListFilters = {},
    options?: { signal?: AbortSignal },
  ): Promise<PagedData<WorkOrder>> {
    const qs = buildQuery({
      ...listQueryParams(query),
      status: filters.status,
      workOrderType: filters.workOrderType,
      priority: filters.priority,
      assetId: filters.assetId,
      assignedToUserId: filters.assignedToUserId,
      maintenancePlanId: filters.maintenancePlanId,
    });
    return this.api.get<PagedData<WorkOrder>>(`/api/v1/work-orders${qs}`, options);
  }

  getWorkOrder(id: string, options?: { signal?: AbortSignal }): Promise<WorkOrder> {
    return this.api.get<WorkOrder>(`/api/v1/work-orders/${id}`, options);
  }

  /** Assign/re-assign the work order to maintenance staff (Req 36.3). */
  assignWorkOrder(id: string, body: AssignWorkOrderBody): Promise<WorkOrder> {
    return this.api.post<WorkOrder>(`/api/v1/work-orders/${id}/assign`, {
      body,
      idempotencyKey: this.idempotencyKey(),
    });
  }

  /** Change the work order's status through the configurable transition allow-list (Req 36.1–36.5). */
  changeWorkOrderStatus(id: string, body: ChangeWorkOrderStatusBody): Promise<WorkOrder> {
    return this.api.post<WorkOrder>(`/api/v1/work-orders/${id}/status`, {
      body,
      idempotencyKey: this.idempotencyKey(),
    });
  }

  /** The work order's recorded parts, chronological (Req 36.4). */
  getWorkOrderParts(id: string, options?: { signal?: AbortSignal }): Promise<WorkOrderPart[]> {
    return this.api.get<WorkOrderPart[]>(`/api/v1/work-orders/${id}/parts`, options);
  }

  /** Record a part/material used against the work order (Req 36.4). */
  addWorkOrderPart(id: string, body: AddWorkOrderPartBody): Promise<WorkOrderPart> {
    return this.api.post<WorkOrderPart>(`/api/v1/work-orders/${id}/parts`, {
      body,
      idempotencyKey: this.idempotencyKey(),
    });
  }

  /** The work order's recorded labour, chronological (Req 36.4). */
  getWorkOrderLabour(id: string, options?: { signal?: AbortSignal }): Promise<WorkOrderLabour[]> {
    return this.api.get<WorkOrderLabour[]>(`/api/v1/work-orders/${id}/labour`, options);
  }

  /** Record a labour entry against the work order (Req 36.4). */
  addWorkOrderLabour(id: string, body: AddWorkOrderLabourBody): Promise<WorkOrderLabour> {
    return this.api.post<WorkOrderLabour>(`/api/v1/work-orders/${id}/labour`, {
      body,
      idempotencyKey: this.idempotencyKey(),
    });
  }
}
