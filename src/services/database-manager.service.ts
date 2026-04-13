/**
 * Database Manager Service
 * Uses Tauri invoke to manage database connections and run queries via Rust backend.
 */

export type DbType = 'postgresql' | 'mysql' | 'sqlite';

export interface DbConfig {
  db_type: DbType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export interface SavedConnection {
  id: string;
  name: string;
  config: DbConfig;
}

export interface DbQueryResult {
  columns: string[];
  column_types: string[];
  rows: (string | null)[][];
  row_count: number;
  affected_rows: number;
  execution_time_ms: number;
}

export interface DbTableInfo {
  name: string;
  table_type: string;
}

export interface DbColumnInfo {
  name: string;
  data_type: string;
  is_nullable: boolean;
  is_primary_key: boolean;
  default_value: string | null;
}

let _isTauri: boolean | null = null;

export function isTauriEnvironment(): boolean {
  if (_isTauri === null) {
    _isTauri = !!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  }
  return _isTauri;
}

async function getTauriInvoke(): Promise<typeof import('@tauri-apps/api/core').invoke | null> {
  try {
    const mod = await import('@tauri-apps/api/core');
    return mod.invoke;
  } catch {
    return null;
  }
}

export async function dbTestConnection(config: DbConfig): Promise<string> {
  const invoke = await getTauriInvoke();
  if (!invoke) throw new Error('Database Manager requires the desktop app');
  return invoke<string>('db_test_connection', { config });
}

export async function dbConnect(config: DbConfig): Promise<string> {
  const invoke = await getTauriInvoke();
  if (!invoke) throw new Error('Database Manager requires the desktop app');
  return invoke<string>('db_connect', { config });
}

export async function dbDisconnect(connectionId: string): Promise<void> {
  const invoke = await getTauriInvoke();
  if (!invoke) throw new Error('Database Manager requires the desktop app');
  return invoke<void>('db_disconnect', { connectionId });
}

export async function dbExecuteQuery(connectionId: string, query: string): Promise<DbQueryResult> {
  const invoke = await getTauriInvoke();
  if (!invoke) throw new Error('Database Manager requires the desktop app');
  return invoke<DbQueryResult>('db_execute_query', { connectionId, query });
}

export async function dbListDatabases(connectionId: string): Promise<string[]> {
  const invoke = await getTauriInvoke();
  if (!invoke) throw new Error('Database Manager requires the desktop app');
  return invoke<string[]>('db_list_databases', { connectionId });
}

export async function dbListTables(connectionId: string): Promise<DbTableInfo[]> {
  const invoke = await getTauriInvoke();
  if (!invoke) throw new Error('Database Manager requires the desktop app');
  return invoke<DbTableInfo[]>('db_list_tables', { connectionId });
}

export async function dbDescribeTable(connectionId: string, tableName: string): Promise<DbColumnInfo[]> {
  const invoke = await getTauriInvoke();
  if (!invoke) throw new Error('Database Manager requires the desktop app');
  return invoke<DbColumnInfo[]>('db_describe_table', { connectionId, tableName });
}

// --- Saved connections (localStorage) ---

const STORAGE_KEY = 'dext_db_connections';

export function loadSavedConnections(): SavedConnection[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveConnection(conn: SavedConnection): void {
  const connections = loadSavedConnections();
  const idx = connections.findIndex(c => c.id === conn.id);
  if (idx >= 0) {
    connections[idx] = conn;
  } else {
    connections.push(conn);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
}

export function deleteSavedConnection(id: string): void {
  const connections = loadSavedConnections().filter(c => c.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
}

export function getDefaultPort(dbType: DbType): number {
  switch (dbType) {
    case 'postgresql': return 5432;
    case 'mysql': return 3306;
    case 'sqlite': return 0;
  }
}
