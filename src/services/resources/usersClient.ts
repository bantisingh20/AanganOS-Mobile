import type { ApiClient } from '@/services/api/client';

/** User lifecycle status (mirror of backend `UserStatus`). Serialized as the enum NAME. */
export const UserStatus = {
  Active: 'Active',
  Suspended: 'Suspended',
} as const;
export type UserStatusCode = (typeof UserStatus)[keyof typeof UserStatus];

/** Mirror of `UserDto` — never includes the password hash. */
export interface User {
  readonly id: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly status: UserStatusCode;
  readonly mfaEnabled: boolean;
  readonly isDeleted: boolean;
}

/** Editable user fields (mirror of backend UpdateUserBody). Only send what changes. */
export interface UpdateUserBody {
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly status?: UserStatusCode;
  readonly mfaEnabled?: boolean;
}

/**
 * Typed client for `/api/v1/users` (Req 3.1, 3.7). Used by the admin to activate/deactivate a login
 * (`status`) and to soft-delete it. Every call is permission-gated server-side on the `User`
 * resource (Edit for update, Delete for delete), so a non-admin caller gets FORBIDDEN. Thin,
 * envelope-aware wrapper over {@link ApiClient}.
 */
export class UsersClient {
  constructor(private readonly api: ApiClient) {}

  get(id: string, options?: { signal?: AbortSignal }): Promise<User> {
    return this.api.get<User>(`/api/v1/users/${id}`, options);
  }

  /** Update a user — e.g. flip status to Suspended (deactivate) / Active (reactivate). */
  update(id: string, body: UpdateUserBody): Promise<User> {
    return this.api.put<User>(`/api/v1/users/${id}`, { body });
  }

  /** Deactivate a login (keeps the record, denies sign-in). */
  deactivate(id: string): Promise<User> {
    return this.update(id, { status: UserStatus.Suspended });
  }

  /** Reactivate a previously deactivated login. */
  activate(id: string): Promise<User> {
    return this.update(id, { status: UserStatus.Active });
  }

  /** Soft-delete a login (retained + retrievable, but gone from normal lists). */
  delete(id: string): Promise<unknown> {
    return this.api.delete<unknown>(`/api/v1/users/${id}`);
  }
}
