import type { ApiClient } from '@/services/api/client';
import type { PagedData } from '@/types/envelope';
import type { ListQuery } from '@/types/query';
import type { Unit, UnitHistory, UnitHouseholdMember } from '@/types/community';
import type { Vehicle, Pet } from '@/types/resident';
import { buildQuery, listQueryParams } from './query';

/** Extra server-side filters for the unit list (Req 14.5), on top of the shared {@link ListQuery}. */
export interface UnitListFilters {
  readonly unitStatus?: string;
  readonly unitType?: string;
  readonly floor?: string;
  readonly hierarchyNodeId?: string;
  readonly availableForOwner?: boolean;
}

/** Register a vehicle against a unit (Req 19.1, 19.2). */
export interface RegisterVehicleBody {
  readonly unitId: string;
  readonly registrationNumber: string;
  readonly vehicleType: string;
}

/** Body to create a unit (flat) in a community, optionally under a hierarchy node/wing (Req 14.1). */
export interface CreateUnitBody {
  readonly communityId: string;
  /** The wing/building/floor this unit sits under (optional). */
  readonly hierarchyNodeId?: string;
  readonly unitNumber: string;
  /** Configurable unit-type code (`Unit_Type` list). */
  readonly unitType: string;
  readonly area?: number;
  readonly floor?: string;
  readonly bedrooms?: number;
  /** Configurable unit-status code (`Unit_Status` list). */
  readonly unitStatus: string;
  readonly customAttributes?: Record<string, string>;
}

/**
 * Editable unit fields (mirror of backend UpdateUnitBody, Req 14.x). The `update*` flags distinguish
 * "apply this (possibly null) value" from "leave unchanged", matching the backend contract. Only
 * send what changes.
 */
export interface UpdateUnitBody {
  readonly hierarchyNodeId?: string | null;
  readonly updateHierarchyNode?: boolean;
  readonly unitNumber?: string;
  readonly unitType?: string;
  readonly area?: number | null;
  readonly updateArea?: boolean;
  readonly floor?: string | null;
  readonly updateFloor?: boolean;
  readonly bedrooms?: number | null;
  readonly updateBedrooms?: boolean;
  readonly unitStatus?: string;
  readonly customAttributes?: Record<string, string>;
}

/**
 * Typed client for `/api/v1/units` and its per-unit asset/history reads (Req 14.x, 16.4, 19.5).
 * Thin, envelope-aware wrapper over {@link ApiClient}. The list is tenant-scoped server-side; the
 * per-unit vehicle/pet reads are additionally resident self-scoped, so a resident principal only
 * sees their own unit's assets (Req 66.3).
 */
export class UnitsClient {
  constructor(private readonly api: ApiClient) {}

  list(
    query: ListQuery = {},
    filters: UnitListFilters = {},
    options?: { signal?: AbortSignal },
  ): Promise<PagedData<Unit>> {
    const qs = buildQuery({
      ...listQueryParams(query),
      unitStatus: filters.unitStatus,
      unitType: filters.unitType,
      floor: filters.floor,
      hierarchyNodeId: filters.hierarchyNodeId,
      availableForOwner: filters.availableForOwner,
    });
    return this.api.get<PagedData<Unit>>(`/api/v1/units${qs}`, options);
  }

  get(id: string, options?: { signal?: AbortSignal }): Promise<Unit> {
    return this.api.get<Unit>(`/api/v1/units/${id}`, options);
  }

  /** Create a unit (flat). Requires Create on Unit; a duplicate number in the community → conflict (Req 14.1). */
  create(body: CreateUnitBody): Promise<Unit> {
    return this.api.post<Unit>('/api/v1/units', { body });
  }

  /** Edit a unit (Req 14.x). Requires Edit on Unit; a duplicate number / concurrency → CONFLICT. */
  update(id: string, body: UpdateUnitBody): Promise<Unit> {
    return this.api.put<Unit>(`/api/v1/units/${id}`, { body });
  }

  /** Soft-delete a unit (Req 14.6). Requires Delete on Unit; retained + traceable. */
  delete(id: string): Promise<unknown> {
    return this.api.delete<unknown>(`/api/v1/units/${id}`);
  }

  /** A unit's registered vehicles (Req 19.1, 19.5). */
  listVehicles(unitId: string, options?: { signal?: AbortSignal }): Promise<Vehicle[]> {
    return this.api.get<Vehicle[]>(`/api/v1/units/${unitId}/vehicles`, options);
  }

  /** Register a vehicle against a unit (Req 19.1, 19.2). Registration number is unique per community. */
  registerVehicle(body: RegisterVehicleBody): Promise<Vehicle> {
    return this.api.post<Vehicle>(`/api/v1/vehicles`, { body });
  }

  /** A unit's registered pets (Req 19.3, 19.5). */
  listPets(unitId: string, options?: { signal?: AbortSignal }): Promise<Pet[]> {
    return this.api.get<Pet[]>(`/api/v1/units/${unitId}/pets`, options);
  }

  /** A unit's combined ownership + tenancy history (Req 16.4). */
  history(unitId: string, options?: { signal?: AbortSignal }): Promise<UnitHistory> {
    return this.api.get<UnitHistory>(`/api/v1/units/${unitId}/history`, options);
  }

  /** A unit's active household members (name + type) — used for the owner-first add rule (Req 15.2). */
  listHousehold(unitId: string, options?: { signal?: AbortSignal }): Promise<UnitHouseholdMember[]> {
    return this.api.get<UnitHouseholdMember[]>(`/api/v1/units/${unitId}/household`, options);
  }
}
