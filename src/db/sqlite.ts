import initSqlJs, { type Database, type SqlJsStatic, type BindParams } from 'sql.js';
import { SCHEMA_SQL } from './schema';
import { loadBlob, saveBlob } from './idbBlobStore';

const IDB_KEY = 'stacks.sqlite';

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSaveOk = true;

/** Boots sql.js (WASM) and either restores a saved database from IndexedDB
 *  or creates a fresh one and applies the schema. Call once, near app start. */
export async function openDatabase(): Promise<Database> {
  if (db) return db;

  SQL = await initSqlJs({
    // sql-wasm.wasm is copied next to the built app by vite.config.ts.
    locateFile: (file: string) => `/${file}`
  });

  const existing = await loadBlob(IDB_KEY);
  db = existing ? new SQL.Database(existing) : new SQL.Database();
  db.run(SCHEMA_SQL);

  if (!existing) {
    await persistNow();
  }

  return db;
}

export function getDatabase(): Database {
  if (!db) throw new Error('Database not initialized yet — call openDatabase() first.');
  return db;
}

/** Debounced persistence: writes the whole exported database to IndexedDB.
 *  SQLite databases this size (a personal cookbook) export in well under a
 *  millisecond, so a simple export-and-store on every mutation is plenty. */
export function schedulePersist(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void persistNow();
  }, 200);
}

export async function persistNow(): Promise<boolean> {
  if (!db) return false;
  const bytes = db.export();
  const ok = await saveBlob(IDB_KEY, bytes);
  lastSaveOk = ok;
  return ok;
}

export function wasLastSaveOk(): boolean {
  return lastSaveOk;
}

/** Runs a statement with no result rows expected (INSERT/UPDATE/DELETE/DDL). */
export function run(sql: string, params: BindParams = []): void {
  getDatabase().run(sql, params);
  schedulePersist();
}

/** Runs a SELECT and returns every row as a plain object, typed by the caller. */
export function all<T = Record<string, unknown>>(sql: string, params: BindParams = []): T[] {
  const d = getDatabase();
  const stmt = d.prepare(sql);
  try {
    stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
    return rows;
  } finally {
    stmt.free();
  }
}

/** Runs a SELECT expected to return zero or one row. */
export function one<T = Record<string, unknown>>(sql: string, params: BindParams = []): T | null {
  const rows = all<T>(sql, params);
  return rows.length ? rows[0] : null;
}

/** Runs several statements as a single transaction (all-or-nothing). */
export function transaction(fn: () => void): void {
  const d = getDatabase();
  d.run('BEGIN');
  try {
    fn();
    d.run('COMMIT');
  } catch (err) {
    d.run('ROLLBACK');
    throw err;
  }
  schedulePersist();
}

/** Wipes every table (used when restoring a full JSON backup). */
export function wipeAllData(): void {
  const d = getDatabase();
  d.run(`
    DELETE FROM meal_plan_entries;
    DELETE FROM meal_plan;
    DELETE FROM grocery_items;
    DELETE FROM cooking_sessions;
    DELETE FROM recipe_tags;
    DELETE FROM tags;
    DELETE FROM ingredients;
    DELETE FROM recipes;
    DELETE FROM cookbooks;
  `);
}
