export function parseUtc(iso: string): Date {
  if (!iso) return new Date(NaN);
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso.trim());
  return new Date(hasZone ? iso : `${iso}Z`);
}
