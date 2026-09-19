# Stacks — React + TypeScript + SQLite

A rebuild of the original single-file Stacks app as a proper multi-file
TypeScript React project. Same look, same behavior, same data model — the
implementation is just organized like real software now, and the data lives
in a real relational SQLite database instead of one JSON blob.

## Getting it running

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). That's it —
there's no server to stand up. The "SQL" is [sql.js](https://sql.js.org/), a
WebAssembly build of SQLite that runs entirely in your browser tab. The
database is queried with real SQL and persisted to IndexedDB, so it survives
reloads exactly like the old app's `localStorage` did — it's just a proper
database now instead of a JSON string.

Other scripts:

```bash
npm run build       # production build (outputs to dist/)
npm run typecheck   # tsc --noEmit, no build artifacts
npm run preview     # preview a production build locally
```

## What changed vs. the HTML version, and what didn't

**Didn't change:** every feature — the bookshelf, cookbooks, recipes,
ingredients, tags, cooking history, meal planning, grocery list, CSV import,
JSON backup/restore. Every CSS class name and the whole stylesheet were
carried over verbatim, so the visual identity (paper background, Fraunces
type, the infinite bookshelf) is unchanged. The bookshelf specifically is the
same "infinite virtual scroll" algorithm as before, ported into a
self-contained TypeScript class (`src/shelf/ShelfEngine.ts`) that a small
React wrapper mounts and tears down — that piece is inherently imperative
(hundreds of DOM nodes changing every scroll frame) and would fight React's
reconciler if forced into components, the same reason you'd wrap D3 or
Mapbox this way.

**Did change:** the data model. Instead of one JSON object with everything
nested inside it, there are seven real SQL tables with foreign keys:

```
cookbooks ──< recipes ──< ingredients
                       ├─< cooking_sessions
                       ├─< recipe_tags >── tags
                       └─< meal_plan_entries >── meal_plan
grocery_items (standalone)
```

See `src/db/schema.ts` for the full DDL and `src/db/repository.ts` for every
query. Persistence-wise, mutations go into a debounced `persistNow()` that
exports the whole sql.js database and writes it to IndexedDB.

**One feature needs a decision from you:** the original's "Import from web"
button worked by calling Anthropic's API directly from inside a claude.ai
artifact, which whitelists that one call with no key needed. A standalone app
has no such privilege. I wired up a working version
(`src/components/Shelf/WebImportPanel.tsx`) that calls the Anthropic API
directly from the browser using your own API key and the
`anthropic-dangerous-direct-browser-access` header — but that means the key
sits in this browser's `localStorage`, readable by anything else with access
to this browser profile. That's a real tradeoff, not a recommended pattern.
If you'd rather not do that, options are:
- leave the key field blank and add recipes by hand (nothing else breaks),
- swap in a tiny backend proxy that holds the key server-side instead, or
- remove the panel entirely.

## Project layout

```
src/
  types.ts                     domain types (Cookbook, Recipe, GroceryItem, ...)
  db/
    schema.ts                  SQL DDL
    sqlite.ts                  sql.js bootstrap + IndexedDB persistence
    idbBlobStore.ts             tiny IndexedDB key/value helper
    repository.ts               every typed query (the actual "backend")
  utils/                       pure functions ported from the original:
                                ingredient parsing, CSV parsing, dates,
                                colors, image resizing, recipe stats/filters
  shelf/
    ShelfEngine.ts              the imperative infinite-bookshelf renderer
  hooks/
    useAppData.ts               loads the DB into React state, exposes
                                 every mutation as an action
    AppDataContext.tsx          React context wrapping useAppData
  components/                  one file per piece of UI, grouped by tab
  App.tsx                       tab state + all modal state + wiring
  main.tsx                      entry point
```

## A note on how this was verified

I don't have network access in the environment that built this, so I
couldn't run `npm install` or a real `tsc`/`vite` build against the actual
`@types/react` and `@types/sql.js` packages. What I *did* do:
- Type-checked every non-UI file (`db/`, `utils/`, `shelf/ShelfEngine.ts`,
  `hooks/useAppData.ts`) against the real logic with a hand-written stub for
  `sql.js`'s types — those came back clean.
- Type-checked every component against a minimal hand-written React type
  stub, which caught two real bugs (both fixed — stray `React.X` qualified
  references without importing the namespace). The remaining noise from that
  pass (implicit-`any` event handler params, `key` prop complaints) is a
  known limitation of a quick stub, not the real `@types/react` — those
  resolve automatically once you `npm install`.
- Hand-traced every prop passed from `App.tsx` into each component against
  that component's declared prop types.

Run `npm run typecheck` after installing to get a real, authoritative answer.
If anything surfaces, it'll be narrow — the architecture and logic have
already been verified independently of React's type definitions.
