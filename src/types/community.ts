/**
 * Community/Property module read models — mirror the backend `CommunityDto`, `UnitDto`,
 * `HierarchyNodeDto` and the unit-history DTOs 1:1 (Req 12.x, 13.x, 14.x, 16.4). Read-only shapes:
 * the Phase 2 mobile screens list/view these; create/edit flows are a later task.
 */

/** Mirror of `CommunityDto` (Req 12.1, 12.2). `id` IS the CommunityId stamped on all child data. */
export interface Community {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  /** Configurable community-type code (from the `Community_Type` list). */
  readonly communityType: string;
  readonly isArchived: boolean;
}

/** Mirror of `UnitDto` (Req 14.1–14.6). Types/statuses are configurable master-data codes. */
export interface Unit {
  readonly id: string;
  readonly communityId: string;
  /** Optional hierarchy node (Floor/Building/…) the unit sits under. */
  readonly hierarchyNodeId: string | null;
  readonly unitNumber: string;
  /** Configurable unit-type code (`Unit_Type` list). */
  readonly unitType: string;
  readonly area: number | null;
  readonly floor: string | null;
  readonly bedrooms: number | null;
  /** Configurable unit-status code (`Unit_Status` list). */
  readonly unitStatus: string;
  /** Free-form community-specific attributes. */
  readonly customAttributes: Readonly<Record<string, string>>;
  readonly isArchived: boolean;
}

/** Mirror of `UnitHouseholdMemberDto` — one active household member of a unit (name + type). */
export interface UnitHouseholdMember {
  readonly residentId: string;
  readonly name: string;
  /** Configurable resident-type code (`Resident_Type` list), e.g. `owner`. */
  readonly residentType: string;
  readonly relationship: string;
  readonly startDate: string;
}

/** Mirror of `HierarchyNodeDto` (Req 13.1, 13.2). */
export interface HierarchyNode {
  readonly id: string;
  readonly communityId: string;
  readonly parentId: string | null;
  /** Configurable level code (`Hierarchy_Level` list). */
  readonly level: string;
  readonly name: string;
  readonly isArchived: boolean;
}

/** Mirror of `OwnershipHistoryDto` (Req 16.1, 16.4). `endDate` null while this is the current owner. */
export interface OwnershipHistory {
  readonly id: string;
  readonly communityId: string;
  readonly unitId: string;
  readonly residentId: string;
  /** ISO-8601 UTC. */
  readonly startDate: string;
  /** ISO-8601 UTC, or null while current. */
  readonly endDate: string | null;
}

/** Mirror of `TenancyHistoryDto` (Req 16.2, 16.4). `endDate` null while the tenancy is active. */
export interface TenancyHistory {
  readonly id: string;
  readonly communityId: string;
  readonly unitId: string;
  readonly residentId: string;
  readonly startDate: string;
  readonly endDate: string | null;
}

/** Mirror of `UnitHistoryDto` — combined chronological ownership + tenancy for a unit (Req 16.4). */
export interface UnitHistory {
  readonly unitId: string;
  readonly ownership: OwnershipHistory[];
  readonly tenancy: TenancyHistory[];
}
