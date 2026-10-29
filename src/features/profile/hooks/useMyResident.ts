import { useAsync } from '@/hooks';
import type { AsyncState } from '@/hooks';
import { useAuth } from '@/store/AuthContext';
import type { Resident, ResidentHouseholdUnit } from '@/types/resident';
import type { ResourceClients } from '@/services/resources';

/** The signed-in resident plus their OWN unit memberships (not the whole community). */
export interface MyResident {
  readonly resident: Resident | null;
  /** The resident's own active unit memberships (+ unit details). Empty until a unit is assigned. */
  readonly units: ResidentHouseholdUnit[];
}

/**
 * Resolve the SIGNED-IN resident and THEIR OWN unit(s) in ONE self-targeted call.
 *
 * <p>`residents.me()` hits `GET /residents/me`, which returns the resident row whose `UserId` is the
 * access token's user (the Resident→User link) plus that resident's own active unit memberships — no
 * list-and-filter, no second `/household` round trip. A superadmin/admin with no linked resident row
 * gets `{ resident: null, units: [] }`, so the self-service screens show their empty state instead of
 * a stranger's data.</p>
 *
 * <p>Re-runs when the signed-in user changes (keyed on `userId`).</p>
 */
export function useMyResident(resources: ResourceClients): AsyncState<MyResident> {
  const { userId } = useAuth();
  return useAsync<MyResident>(
    (signal) => resources.residents.me({ signal }),
    [userId],
  );
}
