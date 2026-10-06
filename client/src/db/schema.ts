// The relational schema behind Stacks. Replaces the old single JSON blob:
// cookbooks/recipes/ingredients/tags/cooking sessions/grocery items/meal plan
// entries are now real tables with real foreign keys.
export const SCHEMA_SQL = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS cookbooks (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    author      TEXT NOT NULL DEFAULT '',
    cover       TEXT NOT NULL DEFAULT '',
    cuisine     TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'want',
    rating      INTEGER NOT NULL DEFAULT 0,
    notes       TEXT NOT NULL DEFAULT '',
    date_added  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recipes (
    id           TEXT PRIMARY KEY,
    cookbook_id  TEXT REFERENCES cookbooks(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    page         TEXT NOT NULL DEFAULT '',
    servings     TEXT NOT NULL DEFAULT '',
    rating       INTEGER NOT NULL DEFAULT 0,
    notes        TEXT NOT NULL DEFAULT '',
    image        TEXT NOT NULL DEFAULT '',
    favorite     INTEGER NOT NULL DEFAULT 0,
    want_to_try  INTEGER NOT NULL DEFAULT 0,
    date_added   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_recipes_cookbook ON recipes(cookbook_id);

  CREATE TABLE IF NOT EXISTS ingredients (
    id          TEXT PRIMARY KEY,
    recipe_id   TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL DEFAULT 0,
    qty         TEXT NOT NULL DEFAULT '',
    unit        TEXT NOT NULL DEFAULT '',
    name        TEXT NOT NULL DEFAULT '',
    note        TEXT NOT NULL DEFAULT '',
    category    TEXT NOT NULL DEFAULT 'Other'
  );
  CREATE INDEX IF NOT EXISTS idx_ingredients_recipe ON ingredients(recipe_id);

  CREATE TABLE IF NOT EXISTS tags (
    id    TEXT PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE COLLATE NOCASE
  );

  CREATE TABLE IF NOT EXISTS recipe_tags (
    recipe_id  TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    tag_id     TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (recipe_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS cooking_sessions (
    id                 TEXT PRIMARY KEY,
    recipe_id          TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    date               TEXT NOT NULL,
    rating             INTEGER NOT NULL DEFAULT 0,
    notes              TEXT NOT NULL DEFAULT '',
    would_make_again   INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_recipe ON cooking_sessions(recipe_id);

  CREATE TABLE IF NOT EXISTS grocery_items (
    id        TEXT PRIMARY KEY,
    qty       TEXT NOT NULL DEFAULT '',
    unit      TEXT NOT NULL DEFAULT '',
    name      TEXT NOT NULL DEFAULT '',
    note      TEXT NOT NULL DEFAULT '',
    category  TEXT NOT NULL DEFAULT 'Other',
    checked   INTEGER NOT NULL DEFAULT 0,
    sources   TEXT NOT NULL DEFAULT '[]'   -- JSON array of recipe names
  );

  -- single-row table holding the current plan's week start
  CREATE TABLE IF NOT EXISTS meal_plan (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    week_start  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meal_plan_entries (
    id         TEXT PRIMARY KEY,
    recipe_id  TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    day        INTEGER,        -- 0=Monday..6=Sunday, NULL = unassigned
    cooked     INTEGER NOT NULL DEFAULT 0
  );


  CREATE TABLE IF NOT EXISTS calendar_events (
    id    TEXT PRIMARY KEY,
    date  TEXT NOT NULL,   -- ISO yyyy-mm-dd
    title TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(date);


  CREATE TABLE IF NOT EXISTS pantry_items (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    category   TEXT NOT NULL DEFAULT 'Other',
    qty        TEXT NOT NULL DEFAULT '',
    unit       TEXT NOT NULL DEFAULT '',
    note       TEXT NOT NULL DEFAULT '',
    low_stock  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS menus (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL DEFAULT '',
    context     TEXT NOT NULL DEFAULT '',
    date_added  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS menu_slots (
    id                 TEXT PRIMARY KEY,
    menu_id            TEXT NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    position           INTEGER NOT NULL DEFAULT 0,
    course             TEXT NOT NULL DEFAULT '',
    recipe_id          TEXT REFERENCES recipes(id) ON DELETE SET NULL,
    locked             INTEGER NOT NULL DEFAULT 0,
    suggestion_name    TEXT NOT NULL DEFAULT '',
    suggestion_reason  TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_menu_slots_menu ON menu_slots(menu_id);
  `;
