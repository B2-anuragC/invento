import { openDatabaseAsync } from 'expo-sqlite';

let database: ReturnType<typeof openDatabaseAsync> | undefined;
async function db() {
  if (!database) database = openDatabaseAsync('invento-offline-v1.db').then(async (connection) => {
    await connection.execAsync('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS business_state (scope TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);');
    return connection;
  }).catch((error) => { database = undefined; throw error; });
  return database;
}
export async function readOfflineState(scope: string): Promise<string | null> {
  return (await (await db()).getFirstAsync<{ value: string }>('SELECT value FROM business_state WHERE scope = ?', scope))?.value ?? null;
}
// The snapshot, local records and outbox commit in one atomic SQLite statement.
export async function writeOfflineState(scope: string, value: string) {
  await (await db()).runAsync('INSERT INTO business_state (scope, value) VALUES (?, ?) ON CONFLICT(scope) DO UPDATE SET value = excluded.value', scope, value);
}
