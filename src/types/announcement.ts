/**
 * MVP notices-slice read model — mirrors the backend `CommunityOS.Application.Community`
 * `AnnouncementDto` 1:1. Read-only shape the mobile notice board lists/views. The category is a
 * configurable code resolved from master-data (steering: no hardcoding) — the UI only branches on
 * the well-known codes for a tint, never a closed set.
 */

/** Mirror of `AnnouncementDto`. */
export interface Announcement {
  readonly id: string;
  readonly communityId: string;
  readonly title: string;
  readonly body: string;
  /** Configurable category code (`Announcement_Category` list): general / event / maintenance / emergency / ... */
  readonly category: string;
  readonly publishedAtUtc: string;
  /** Whether the notice is live on the resident board (admin can toggle). */
  readonly isActive: boolean;
}
