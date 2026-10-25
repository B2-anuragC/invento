// Web remains on the existing online transport during the native rollout.
export async function readOfflineState(_scope: string): Promise<string | null> { return null; }
export async function writeOfflineState(_scope: string, _value: string): Promise<void> { throw new Error('Offline storage is not enabled for web yet.'); }
