import type { ApiClient } from '@/services/api/client';
import type { HierarchyNode } from '@/types/community';

/** Body to create a hierarchy node (wing / building / block / floor) in a community (Req 13.1). */
export interface CreateHierarchyNodeBody {
  readonly communityId: string;
  /** Optional parent node; omit for a top-level node (e.g. a wing directly under the community). */
  readonly parentId?: string;
  /** Configurable level code (`Hierarchy_Level` list): phase / building_tower / block / zone / floor. */
  readonly level: string;
  readonly name: string;
}

/**
 * Editable hierarchy-node fields (mirror of backend UpdateHierarchyNodeBody, Req 13.3). Only send
 * what changes; `updateParent` distinguishes "apply this (possibly null) parent" from "leave the
 * parent untouched".
 */
export interface UpdateHierarchyNodeBody {
  readonly parentId?: string | null;
  readonly updateParent?: boolean;
  readonly level?: string;
  readonly name?: string;
}

/**
 * Typed client for the configurable property hierarchy (Req 13.x). The hierarchy is a small
 * parent/child tree per community, so the read returns the whole tenant-scoped tree in one call
 * (`GET /api/v1/communities/{id}/hierarchy`) rather than a paginated list. Thin, envelope-aware
 * wrapper over {@link ApiClient}. Mirrors {@link CommunitiesClient}.
 */
export class HierarchyClient {
  constructor(private readonly api: ApiClient) {}

  /** The community's full hierarchy tree (wings/buildings/floors), tenant-scoped (Req 13.4). */
  listForCommunity(communityId: string, options?: { signal?: AbortSignal }): Promise<HierarchyNode[]> {
    return this.api.get<HierarchyNode[]>(`/api/v1/communities/${communityId}/hierarchy`, options);
  }

  /** Create a hierarchy node (wing/building/floor). Requires Create on HierarchyNode (Req 13.1). */
  create(body: CreateHierarchyNodeBody): Promise<HierarchyNode> {
    return this.api.post<HierarchyNode>('/api/v1/hierarchy-nodes', { body });
  }

  /** Edit a hierarchy node (Req 13.3). Requires Edit on HierarchyNode; a re-parent is re-validated. */
  update(id: string, body: UpdateHierarchyNodeBody): Promise<HierarchyNode> {
    return this.api.put<HierarchyNode>(`/api/v1/hierarchy-nodes/${id}`, { body });
  }

  /** Soft-delete a hierarchy node (Req 13.5). Requires Delete on HierarchyNode; retained + traceable. */
  delete(id: string): Promise<unknown> {
    return this.api.delete<unknown>(`/api/v1/hierarchy-nodes/${id}`);
  }
}
