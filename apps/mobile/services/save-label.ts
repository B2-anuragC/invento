export type SaveOutcome = 'rejected' | 'unknown' | null;

/**
 * Label for a sale or purchase save button. Only an unconfirmed save is a
 * "retry": the request may have reached the server, so the same draft identity
 * is resent. A rejected save just needs corrected details and a normal save,
 * so it keeps the normal label rather than suggesting a connection problem.
 */
export function transactionSaveLabel(input: { busy?: string; saving: boolean; outcome: SaveOutcome; savingLabel: string; saveLabel: string }): string {
  if (input.busy) return input.busy;
  if (input.saving) return input.savingLabel;
  if (input.outcome === 'unknown') return 'Retry the same save safely';
  return input.saveLabel;
}
