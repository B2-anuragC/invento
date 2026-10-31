/**
 * Order-independent snapshot of a form's values, compared against the snapshot
 * taken when editing began to tell whether leaving would lose changes.
 */
export function formSnapshot(value: unknown): string {
  return JSON.stringify(value, (_key, field: unknown) =>
    field && typeof field === 'object' && !Array.isArray(field)
      ? Object.fromEntries(Object.entries(field as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : field,
  );
}

export function hasUnsavedChanges(baseline: string | undefined, current: string): boolean {
  return baseline !== undefined && baseline !== current;
}
