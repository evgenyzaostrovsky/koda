/** Nullable SQL DATE boundary only; keep free-form deadlines in the JSON snapshot. */
export function toNullableSqlDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

/** A complete legacy date is unambiguous; a missing year must never be invented. */
export function toLegacySqlDate(value: unknown): string | null {
  const iso = toNullableSqlDate(value);
  if (iso) return iso;
  if (typeof value !== 'string') return null;
  const parts = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  return parts ? toNullableSqlDate(`${parts[3]}-${parts[2]}-${parts[1]}`) : null;
}

export class RequiredSyncDateError extends Error {
  constructor(readonly field: 'routineStart' | 'routineLog') { super('A complete valid date is required'); }
}

export function toRequiredSqlDate(value: unknown, field: 'routineStart' | 'routineLog'): string {
  const date = toLegacySqlDate(value);
  if (!date) throw new RequiredSyncDateError(field);
  return date;
}
