export enum PermissionAction {
  View = 0,
  Create = 1,
  Edit = 2,
  Delete = 3,
  Approve = 4,
  Export = 5,
  Assign = 6,
}

/** A permission claim is "ResourceType:actionInt" (e.g. "Vehicle:0"). */
export function permissionCode(action: PermissionAction, resource: string): string {
  return `${resource}:${action}`;
}

export function hasPermissionIn(
  permissions: readonly string[],
  action: PermissionAction,
  resource: string,
): boolean {
  return permissions.includes(permissionCode(action, resource));
}
