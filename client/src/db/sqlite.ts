import initSqlJs, { type Database, type SqlJsStatic, type BindParams } from 'sql.js';
import { SCHEMA_SQL } from './schema';
import { loadBlob, saveBlob, loadMeta, saveMeta } from './idbBlobStore';
import { pullFromServer, pushToServer } from './syncClient';

const IDB_KEY = 'stacks.sqlite';
const ETAG_META_KEY = 'stacks.sync.etag';
const DIRTY_META_KEY = 'stacks.sync.dirty';

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSaveOk = true;

let lastKnownEtag: string | null = null;
let isDirty = false;

// Reading the app's data can itself write to the database — getMealPlan()
// seeds a meal_plan row when none exists, which happens on every fresh or
// freshly-adopted database. Those startup writes are bookkeeping, not user
// edits, and they used to do real damage: the resulting debounced save
// pushed the still-empty local database to the server before the first
// reconciliation had a chance to pull, wiping out the shared copy. Hence two
// guards: no network push until the first sync has completed, and the first
// sync judges "do I have local changes?" from the flag as it was on disk at
// startup, not from one these incidental writes have already flipped.
let initialSyncDone = false;
let dirtyAtOpen = false;

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'synced' | 'conflict';
let syncStatus: SyncStatus = 'idle';
const syncListeners = new Set<(status: SyncStatus) => void>();

function setSyncStatus(status: SyncStatus): void {
  syncStatus = status;
  syncListeners.forEach((cb) => cb(status));
}

export function getSyncStatus(): SyncStatus {
  return syncStatus;
}

export function onSyncStatusChange(cb: (status: SyncStatus) => void): () => void {
  syncListeners.add(cb);
  return () => syncListeners.delete(cb);
}

function migrateSchema(database: Database): void {
  // Recipes migrations
  const recipeCols =
    database.exec(`PRAGMA table_info(recipes)`)[0]?.values.map((r) => r[1]) || [];

  const addRecipeCol = (name: string, ddl: string) => {
    if (!recipeCols.includes(name)) {
      database.run(`ALTER TABLE recipes ADD COLUMN ${ddl}`);
    }
  };

  addRecipeCol('instructions', `instructions TEXT NOT NULL DEFAULT '[]'`);
  addRecipeCol('source_url', `source_url TEXT NOT NULL DEFAULT ''`);
  addRecipeCol('author', `author TEXT NOT NULL DEFAULT ''`);

  // Meal plan migrations
  const planCols =
    database.exec(`PRAGMA table_info(meal_plan_entries)`)[0]?.values.map((r) => r[1]) || [];

  if (!planCols.includes('date')) {
    database.run(`ALTER TABLE meal_plan_entries ADD COLUMN date TEXT`);
  }
}

/** Boots sql.js (WASM) and either restores a saved database from IndexedDB
 *  or creates a fresh one and applies the schema. Call once, near app start.
 *  Deliberately local-only and fast — LAN sync happens separately via
 *  syncWithServer() so a slow or unreachable backend never blocks startup. */
export async function openDatabase(): Promise<Database> {
  if (db) return db;

  SQL = await initSqlJs({
    // sql-wasm.wasm is copied next to the built app by vite.config.ts.
    locateFile: (file: string) => `/${file}`
  });

  const existing = await loadBlob(IDB_KEY);
  db = existing ? new SQL.Database(existing) : new SQL.Database();
  db.run(SCHEMA_SQL);
  migrateSchema(db);

  lastKnownEtag = await loadMeta(ETAG_META_KEY);
  isDirty = (await loadMeta(DIRTY_META_KEY)) === '1';
  dirtyAtOpen = isDirty;

  if (!existing) {
    // Local-only on purpose: this must NOT attempt a network push. A brand-new
    // device has no way yet to know whether the shared backend already holds
    // real data from another device — that reconciliation is syncWithServer()'s
    // job, called by the caller right after this resolves. Pushing here first
    // could silently overwrite another device's data with an empty database.
    await persistLocalOnly();
  }

  return db;
}

async function persistLocalOnly(): Promise<boolean> {
  if (!db) return false;
  const bytes = db.export();
  const ok = await saveBlob(IDB_KEY, bytes);
  lastSaveOk = ok;
  return ok;
}

export function getDatabase(): Database {
  if (!db) throw new Error('Database not initialized yet — call openDatabase() first.');
  return db;
}

/** Replaces the live database with bytes pulled from the server — used when
 *  another device's changes are adopted. Closes the old handle, reopens from
 *  the new bytes, re-runs migrations (the shared copy may be from an older
 *  schema version), and saves it as this device's local copy too. */
async function replaceDatabaseFromBytes(bytes: Uint8Array): Promise<void> {
  if (!SQL) throw new Error('sql.js not initialized yet.');
  db?.close();
  db = new SQL.Database(bytes);
  migrateSchema(db);
  await saveBlob(IDB_KEY, bytes);
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

  if (ok) {
    isDirty = true;
    await saveMeta(DIRTY_META_KEY, '1');
    void pushIfPossible(bytes);
  }

  return ok;
}

export function wasLastSaveOk(): boolean {
  return lastSaveOk;
}

/** Best-effort push to the shared backend — never awaited by callers, so a
 *  slow or offline network never blocks a mutation finishing locally.
 *
 *  `fromSync` marks the deliberate pushes syncWithServer() makes once it has
 *  established what the server holds. Everything else (i.e. ordinary saves)
 *  must wait for that first reconciliation: pushing beforehand means
 *  uploading whatever happens to be local before we know whether the server
 *  has something better, which is how an empty database can destroy a real
 *  one. */
async function pushIfPossible(bytes: Uint8Array, fromSync = false): Promise<void> {
  if (syncStatus === 'conflict') return; // don't push over an unresolved conflict
  if (!initialSyncDone && !fromSync) return; // stays dirty; pushed once reconciliation finishes

  setSyncStatus('syncing');
  const result = await pushToServer(bytes, lastKnownEtag);

  if (result.status === 'ok') {
    lastKnownEtag = result.etag;
    isDirty = false;
    await saveMeta(ETAG_META_KEY, result.etag);
    await saveMeta(DIRTY_META_KEY, '0');
    setSyncStatus('synced');
  } else if (result.status === 'conflict') {
    setSyncStatus('conflict');
  } else {
    setSyncStatus('offline');
  }
}

/** Whether this device's database holds anything a person actually created.
 *  Deliberately ignores `meal_plan`, whose single row is seeded automatically
 *  on read and is therefore present even in a brand-new, empty database. */
function localHasUserData(): boolean {
  if (!db) return false;
  const tables = [
    'cookbooks', 'recipes', 'grocery_items', 'pantry_items',
    'menus', 'calendar_events', 'meal_plan_entries'
  ];
  return tables.some((table) => {
    try {
      const row = one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
      return (row?.n ?? 0) > 0;
    } catch {
      return false; // table may not exist yet on an older database
    }
  });
}

/** Reconciles this device's local copy with the shared backend copy. Safe to
 *  call any time after openDatabase() resolves — never blocks it. Returns the
 *  resulting status so the caller can refresh UI state if data changed. */
export async function syncWithServer(): Promise<SyncStatus> {
  setSyncStatus('syncing');

  // The first reconciliation must not count the database's own startup
  // bookkeeping writes as user changes — otherwise every fresh device looks
  // "dirty" the moment it reads its meal plan, and gets asked to resolve a
  // conflict it doesn't actually have.
  const locallyChanged = initialSyncDone ? isDirty : dirtyAtOpen;

  const result = await pullFromServer();
  initialSyncDone = true;

  if (result.status === 'unreachable') {
    setSyncStatus('offline');
    return 'offline';
  }

  if (result.status === 'not-found') {
    // Nothing shared yet — seed it, but only from a database that actually
    // holds something. Seeding from an empty one publishes a copy that other
    // devices will then dutifully adopt, turning any blank device into a
    // source of truth that erases everyone else's data.
    if (db && localHasUserData()) await pushIfPossible(db.export(), true);
    else setSyncStatus('synced');
    return syncStatus;
  }

  // A device that has never completed a sync has local data of unknown
  // relationship to the server — treat it like a dirty device rather than
  // risk silently discarding real local data just because this happens to
  // be its first sync (both devices will hit this the first time the
  // feature is turned on, likely each with real pre-existing local data).
  // Unless there is nothing there to lose: an empty database has no user
  // data to protect, so making someone arbitrate a "conflict" between
  // nothing and the shared copy is just noise.
  const neverSynced = lastKnownEtag === null && localHasUserData();
  const effectiveDirty = locallyChanged || neverSynced;

  if (!effectiveDirty && result.etag !== lastKnownEtag) {
    // The shared copy moved on and we have no local changes to lose — adopt it.
    await replaceDatabaseFromBytes(result.bytes);
    lastKnownEtag = result.etag;
    // Local is now byte-for-byte the shared copy, so any dirty mark left over
    // from startup bookkeeping is stale — clearing it keeps the next launch
    // from reading it back and reporting a conflict that doesn't exist.
    isDirty = false;
    dirtyAtOpen = false;
    await saveMeta(ETAG_META_KEY, result.etag);
    await saveMeta(DIRTY_META_KEY, '0');
    setSyncStatus('synced');
    return 'synced';
  }

  if (!effectiveDirty && result.etag === lastKnownEtag) {
    setSyncStatus('synced');
    return 'synced';
  }

  if (effectiveDirty && result.etag === lastKnownEtag) {
    // Nobody else has changed it since we last saw it — safe to push ours.
    if (db) await pushIfPossible(db.export(), true);
    return syncStatus;
  }

  // effectiveDirty && etag mismatch: local has unconfirmed or offline changes
  // AND the shared copy differs. Don't guess — surface it instead of silently
  // discarding either side.
  setSyncStatus('conflict');
  return 'conflict';
}

/** Resolves a sync conflict in the direction the person chooses. */
export async function resolveSyncConflict(choice: 'keepLocal' | 'useServer'): Promise<SyncStatus> {
  if (choice === 'useServer') {
    const result = await pullFromServer();
    if (result.status !== 'ok') return syncStatus; // still unreachable — nothing to adopt
    await replaceDatabaseFromBytes(result.bytes);
    lastKnownEtag = result.etag;
    isDirty = false;
    await saveMeta(ETAG_META_KEY, result.etag);
    await saveMeta(DIRTY_META_KEY, '0');
    setSyncStatus('synced');
    return 'synced';
  }

  // keepLocal: force-push, ignoring whatever the server currently has.
  if (!db) return syncStatus;
  const result = await pushToServer(db.export(), null);
  if (result.status === 'ok') {
    lastKnownEtag = result.etag;
    isDirty = false;
    await saveMeta(ETAG_META_KEY, result.etag);
    await saveMeta(DIRTY_META_KEY, '0');
    setSyncStatus('synced');
    return 'synced';
  }
  setSyncStatus(result.status === 'conflict' ? 'conflict' : 'offline');
  return syncStatus;
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
