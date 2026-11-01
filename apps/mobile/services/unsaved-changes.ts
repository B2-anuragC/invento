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

export type DiscardBillContents = { contactName?: string; itemCount: number; hasFile?: boolean };

/**
 * Wording for the "Discard" confirmation on a new sale or purchase: it names
 * what will be lost, so the person can tell this apart from leaving a saved bill.
 */
export function discardBillDialog(kind: 'sale' | 'purchase', contents: DiscardBillContents) {
  const lost = [
    contents.contactName ? `the ${kind === 'sale' ? 'customer' : 'supplier'} ${contents.contactName}` : '',
    contents.itemCount > 0 ? `${contents.itemCount} ${contents.itemCount === 1 ? 'item' : 'items'}` : '',
    contents.hasFile ? (kind === 'sale' ? 'the reference photo' : 'the attached bill') : '',
  ].filter(Boolean);
  const list = lost.length > 1 ? `${lost.slice(0, -1).join(', ')} and ${lost[lost.length - 1]}` : lost[0];
  const what = list ? `${list.charAt(0).toUpperCase()}${list.slice(1)} will be removed` : `This ${kind} will be removed`;
  return {
    title: `Discard this ${kind}?`,
    message: `${what}. Nothing has been saved, and the draft on this device is deleted.`,
    confirmLabel: `Discard ${kind}`,
    cancelLabel: 'Keep editing',
  };
}
