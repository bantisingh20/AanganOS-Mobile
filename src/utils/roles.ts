/**
 * Heuristic: does any of the signed-in roles look like an admin/management/staff role that should
 * see the Phase 2 management tools? Role names are configurable (RBAC is data-driven), so this is a
 * best-effort match on common substrings to decide what to *offer* in the menu — never what is
 * *allowed*. The backend permission gate is the real authority on every call, so a false positive
 * here just means a menu entry whose screens' actions the server will reject (Req 4.1); a resident
 * with no admin role simply doesn't see the section.
 */
export function hasAdminRole(roles: readonly string[]): boolean {
  return roles.some((role) => {
    const r = role.toLowerCase();
    return (
      r.includes('admin') ||
      r.includes('manager') ||
      r.includes('management') ||
      r.includes('staff') ||
      r.includes('operator') ||
      r.includes('committee')
    );
  });
}

/**
 * Does any signed-in role look like a SECURITY / GUARD role? Decides whether to OFFER the gate
 * operations (verify pass, walk-in, entry/exit, watchlist, SOS, parcels) in the merged app. Same
 * best-effort substring match as {@link hasAdminRole}; the backend permission gate is the real
 * authority — a false positive just shows a menu whose actions the server will reject.
 */
export function hasSecurityRole(roles: readonly string[]): boolean {
  return roles.some((role) => {
    const r = role.toLowerCase();
    return r.includes('security') || r.includes('guard') || r.includes('watch') || r.includes('gate');
  });
}

/**
 * Does the signed-in user look like a plain RESIDENT (owner/tenant/family)? Used to decide whether
 * to offer the resident self-service features. A user with ONLY a security/admin role (e.g. a pure
 * guard or superadmin) is not treated as a resident, so they don't get the resident self-view they
 * have no data for. Best-effort; the server enforces real authz.
 */
export function hasResidentRole(roles: readonly string[]): boolean {
  return roles.some((role) => {
    const r = role.toLowerCase();
    return r.includes('resident') || r.includes('owner') || r.includes('tenant') || r.includes('member') || r.includes('family');
  });
}
