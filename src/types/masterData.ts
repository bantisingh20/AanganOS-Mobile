/**
 * Master-data (configurable reference lists) — mirrors the backend `MasterDataEntry` read shape and
 * the well-known list keys. Dropdowns resolve their options from `GET /api/v1/master-data/{listKey}`
 * rather than hardcoding option arrays in the app (steering: no hardcoding; Req 8.4, 12.2, 14.2,
 * 14.3, 15.1, 19.1, 19.3, 20.1). The constants here are only the stable list KEYS used in the path —
 * the labels/codes themselves come from the backend and stay editable per community.
 */

/** Mirror of the backend `MasterDataEntry` DTO (code + label + ordering + active flag). */
export interface MasterDataEntry {
  readonly code: string;
  readonly label: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
}

/**
 * Well-known master-data list keys the platform seeds (mirror of `MasterDataKeys` on the backend).
 * The set is open — later modules add keys by seeding rows — so these are a convenience for the
 * Phase 2 lists the screens reference directly, never a closed universe.
 */
export const MasterDataKeys = {
  UnitType: 'Unit_Type',
  UnitStatus: 'Unit_Status',
  CommunityType: 'Community_Type',
  AnnouncementCategory: 'Announcement_Category',
  HierarchyLevel: 'Hierarchy_Level',
  ResidentType: 'Resident_Type',
  ResidentVerificationStatus: 'Resident_Verification_Status',
  VehicleType: 'Vehicle_Type',
  PetType: 'Pet_Type',
  NotificationCategory: 'Notification_Category',
} as const;

export type MasterDataKey = (typeof MasterDataKeys)[keyof typeof MasterDataKeys];
