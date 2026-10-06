import { all, one, run, transaction } from './sqlite';
import { uid } from '../utils/id';
import { guessCategory, addQuantities } from '../utils/ingredients';
import { mondayOf, todayIso } from '../utils/dates';
import type {
  Cookbook, CookbookStatus, Recipe, Ingredient, CookingSession,
  GroceryItem, MealPlan, MealPlanEntry, RecipeEntry,
  CalendarEvent,
  PantryItem,
  Menu, MenuSlot
} from '../types';

// ============================================================================
// row <-> domain mapping
// ============================================================================

interface CookbookRow {
  id: string; title: string; author: string; cover: string; cuisine: string;
  status: string; rating: number; notes: string; date_added: number;
}
interface RecipeRow {
  id: string; cookbook_id: string | null; name: string; page: string; servings: string;
  rating: number; notes: string; image: string; favorite: number; want_to_try: number; date_added: number;
  instructions: string; source_url: string; author: string;
}
interface IngredientRow {
  id: string; recipe_id: string; position: number; qty: string; unit: string; name: string; note: string; category: string;
}
interface SessionRow {
  id: string; recipe_id: string; date: string; rating: number; notes: string; would_make_again: number;
}
interface GroceryRow {
  id: string; qty: string; unit: string; name: string; note: string; category: string; checked: number; sources: string;
}
interface PlanEntryRow {
  id: string; recipe_id: string; day: number | null; cooked: number;
}

function ingredientsForRecipe(recipeId: string): Ingredient[] {
  return all<IngredientRow>(
    `SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY position ASC`,
    [recipeId]
  ).map((r) => ({ id: r.id, qty: r.qty, unit: r.unit, name: r.name, note: r.note, category: r.category }));
}

function tagsForRecipe(recipeId: string): string[] {
  return all<{ name: string }>(
    `SELECT t.name AS name FROM tags t
     JOIN recipe_tags rt ON rt.tag_id = t.id
     WHERE rt.recipe_id = ? ORDER BY t.name COLLATE NOCASE`,
    [recipeId]
  ).map((r) => r.name);
}

function sessionsForRecipe(recipeId: string): CookingSession[] {
  return all<SessionRow>(
    `SELECT * FROM cooking_sessions WHERE recipe_id = ? ORDER BY date DESC`,
    [recipeId]
  ).map((r) => ({
    id: r.id, date: r.date, rating: r.rating, notes: r.notes, wouldMakeAgain: !!r.would_make_again
  }));
}

function assembleRecipe(row: RecipeRow): Recipe {
  const history = sessionsForRecipe(row.id);
  let instructions: string[] = [];
  try { instructions = JSON.parse(row.instructions || '[]'); } catch { instructions = []; }
  return {
    id: row.id,
    cookbookId: row.cookbook_id,
    dateAdded: row.date_added,
    name: row.name,
    page: row.page,
    servings: row.servings,
    rating: row.rating,
    notes: row.notes,
    image: row.image,
    tags: tagsForRecipe(row.id),
    favorite: !!row.favorite,
    wantToTry: !!row.want_to_try,
    tried: history.length > 0,
    ingredients: ingredientsForRecipe(row.id),
    cookingHistory: history,
    instructions: instructions,
    sourceUrl: row.source_url,
    author: row.author
  };
}

function recipesForCookbook(cookbookId: string): Recipe[] {
  return all<RecipeRow>(
    `SELECT * FROM recipes WHERE cookbook_id = ? ORDER BY date_added ASC`,
    [cookbookId]
  ).map(assembleRecipe);
}

function assembleCookbook(row: CookbookRow): Cookbook {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    cover: row.cover,
    cuisine: row.cuisine,
    status: row.status as CookbookStatus,
    rating: row.rating,
    notes: row.notes,
    dateAdded: row.date_added,
    recipes: recipesForCookbook(row.id)
  };
}

// ============================================================================
// tags
// ============================================================================

function getOrCreateTagId(name: string): string {
  const existing = one<{ id: string }>(`SELECT id FROM tags WHERE name = ? COLLATE NOCASE`, [name]);
  if (existing) return existing.id;
  const id = uid('t');
  run(`INSERT INTO tags (id, name) VALUES (?, ?)`, [id, name]);
  return id;
}

function replaceRecipeTags(recipeId: string, tagNames: string[]): void {
  run(`DELETE FROM recipe_tags WHERE recipe_id = ?`, [recipeId]);
  const seen = new Set<string>();
  tagNames.forEach((raw) => {
    const name = raw.trim();
    if (!name || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    const tagId = getOrCreateTagId(name);
    run(`INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)`, [recipeId, tagId]);
  });
}

export function allTagNames(): string[] {
  return all<{ name: string }>(
    `SELECT DISTINCT t.name AS name FROM tags t
     JOIN recipe_tags rt ON rt.tag_id = t.id
     ORDER BY t.name COLLATE NOCASE`
  ).map((r) => r.name);
}

function replaceRecipeIngredients(recipeId: string, ingredients: Ingredient[]): void {
  run(`DELETE FROM ingredients WHERE recipe_id = ?`, [recipeId]);
  ingredients.forEach((ing, idx) => {
    run(
      `INSERT INTO ingredients (id, recipe_id, position, qty, unit, name, note, category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [ing.id || uid('i'), recipeId, idx, ing.qty, ing.unit, ing.name, ing.note, ing.category || guessCategory(ing.name)]
    );
  });
}

// ============================================================================
// cookbooks
// ============================================================================

export function listCookbooks(): Cookbook[] {
  return all<CookbookRow>(`SELECT * FROM cookbooks ORDER BY date_added DESC`).map(assembleCookbook);
}

export interface CookbookInput {
  title: string; author: string; cover: string; cuisine: string;
  status: CookbookStatus; rating: number; notes: string;
}

export function createCookbook(data: CookbookInput): Cookbook {
  const id = uid('b');
  const dateAdded = Date.now();
  run(
    `INSERT INTO cookbooks (id, title, author, cover, cuisine, status, rating, notes, date_added)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.title, data.author, data.cover, data.cuisine, data.status, data.rating, data.notes, dateAdded]
  );
  return { id, dateAdded, recipes: [], ...data };
}

export function updateCookbook(id: string, data: CookbookInput): void {
  run(
    `UPDATE cookbooks SET title=?, author=?, cover=?, cuisine=?, status=?, rating=?, notes=? WHERE id=?`,
    [data.title, data.author, data.cover, data.cuisine, data.status, data.rating, data.notes, id]
  );
}

export function deleteCookbook(id: string): void {
  run(`DELETE FROM cookbooks WHERE id=?`, [id]);
}

// ============================================================================
// recipes
// ============================================================================

export function listStandaloneRecipes(): Recipe[] {
  return all<RecipeRow>(
    `SELECT * FROM recipes WHERE cookbook_id IS NULL ORDER BY date_added ASC`
  ).map(assembleRecipe);
}

export function getRecipe(id: string): Recipe | null {
  const row = one<RecipeRow>(`SELECT * FROM recipes WHERE id=?`, [id]);
  return row ? assembleRecipe(row) : null;
}

/** Every recipe in the library paired with its cookbook (or null if standalone) —
 *  the shape the Recipes tab, filters and meal plan all work with. */
export function getAllRecipeEntries(): RecipeEntry[] {
  const books = listCookbooks();
  const entries: RecipeEntry[] = [];
  books.forEach((book) => book.recipes.forEach((recipe) => entries.push({ recipe, book })));
  listStandaloneRecipes().forEach((recipe) => entries.push({ recipe, book: null }));
  return entries;
}

export function locateRecipeEntry(recipeId: string): RecipeEntry | null {
  const row = one<RecipeRow>(`SELECT * FROM recipes WHERE id=?`, [recipeId]);
  if (!row) return null;
  const recipe = assembleRecipe(row);
  if (!row.cookbook_id) return { recipe, book: null };
  const bookRow = one<CookbookRow>(`SELECT * FROM cookbooks WHERE id=?`, [row.cookbook_id]);
  return { recipe, book: bookRow ? assembleCookbook(bookRow) : null };
}

export interface RecipeInput {
  name: string; page: string; servings: string; rating: number; notes: string; image: string;
  favorite: boolean; wantToTry: boolean; tags: string[]; ingredients: Ingredient[];
  instructions: string[]; sourceUrl: string; author: string;
}

export function createRecipe(cookbookId: string | null, data: RecipeInput): Recipe {
  const id = uid('r');
  const dateAdded = Date.now();

  transaction(() => {
    run(
      `INSERT INTO recipes (
        id, cookbook_id, name, page, servings, rating, notes, image,
        favorite, want_to_try, date_added, instructions, source_url, author
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        cookbookId,
        data.name,
        data.page,
        data.servings,
        data.rating,
        data.notes,
        data.image,
        data.favorite ? 1 : 0,
        data.wantToTry ? 1 : 0,
        dateAdded,
        JSON.stringify(data.instructions || []),
        data.sourceUrl || '',
        data.author || ''
      ]
    );

    replaceRecipeIngredients(id, data.ingredients);
    replaceRecipeTags(id, data.tags);
  });

  return getRecipe(id)!;
}

export function updateRecipe(id: string, data: RecipeInput): void {
  transaction(() => {
    run(
      `UPDATE recipes SET
        name=?,
        page=?,
        servings=?,
        rating=?,
        notes=?,
        image=?,
        favorite=?,
        want_to_try=?,
        instructions=?,
        source_url=?,
        author=?
      WHERE id=?`,
      [
        data.name,
        data.page,
        data.servings,
        data.rating,
        data.notes,
        data.image,
        data.favorite ? 1 : 0,
        data.wantToTry ? 1 : 0,
        JSON.stringify(data.instructions || []),
        data.sourceUrl || '',
        data.author || '',
        id
      ]
    );

    replaceRecipeIngredients(id, data.ingredients);
    replaceRecipeTags(id, data.tags);
  });
}

export function deleteRecipe(id: string): void {
  run(`DELETE FROM recipes WHERE id=?`, [id]);
}

export function setRecipeFlag(id: string, flag: 'favorite' | 'wantToTry', value: boolean): void {
  const column = flag === 'favorite' ? 'favorite' : 'want_to_try';
  transaction(() => {
    run(`UPDATE recipes SET ${column}=? WHERE id=?`, [value ? 1 : 0, id]);
    // marking a recipe favorite clears "want to try", mirroring the original UI
    if (flag === 'favorite' && value) {
      run(`UPDATE recipes SET want_to_try=0 WHERE id=?`, [id]);
    }
  });
}

// ============================================================================
// cooking sessions
// ============================================================================

export interface CookingSessionInput {
  date: string; rating: number; notes: string; wouldMakeAgain: boolean;
}

export function addCookingSession(recipeId: string, data: CookingSessionInput): CookingSession {
  const id = uid('c');
  run(
    `INSERT INTO cooking_sessions (id, recipe_id, date, rating, notes, would_make_again) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, recipeId, data.date, data.rating, data.notes, data.wouldMakeAgain ? 1 : 0]
  );
  // if the recipe has no standalone rating yet, adopt this session's rating —
  // matches the original "first session sets the overall rating" behavior
  const recipe = one<{ rating: number }>(`SELECT rating FROM recipes WHERE id=?`, [recipeId]);
  if (recipe && !recipe.rating && data.rating) {
    run(`UPDATE recipes SET rating=? WHERE id=?`, [data.rating, recipeId]);
  }
  if (data.rating) {
    // clearing want-to-try once you've actually cooked it
  }
  run(`UPDATE recipes SET want_to_try=0 WHERE id=? AND want_to_try=1`, [recipeId]);
  return { id, date: data.date, rating: data.rating, notes: data.notes, wouldMakeAgain: data.wouldMakeAgain };
}

export function deleteCookingSession(sessionId: string): void {
  run(`DELETE FROM cooking_sessions WHERE id=?`, [sessionId]);
}

// ============================================================================
// grocery list
// ============================================================================

function groceryRowToItem(r: GroceryRow): GroceryItem {
  let sources: string[] = [];
  try { sources = JSON.parse(r.sources); } catch { sources = []; }
  return { id: r.id, qty: r.qty, unit: r.unit, name: r.name, note: r.note, category: r.category, checked: !!r.checked, sources };
}

export function listGrocery(): GroceryItem[] {
  return all<GroceryRow>(`SELECT * FROM grocery_items ORDER BY rowid ASC`).map(groceryRowToItem);
}

function groceryKey(name: string, unit: string): string {
  return (name || '').trim().toLowerCase() + '|' + (unit || '').trim().toLowerCase();
}

export interface GroceryItemInput {
  qty: string; unit: string; name: string; note: string; category?: string;
}

export function addManualGroceryItem(data: GroceryItemInput): GroceryItem {
  const id = uid('g');
  const category = data.category || guessCategory(data.name);
  run(
    `INSERT INTO grocery_items (id, qty, unit, name, note, category, checked, sources) VALUES (?, ?, ?, ?, ?, ?, 0, '[]')`,
    [id, data.qty, data.unit, data.name, data.note, category]
  );
  return { id, qty: data.qty, unit: data.unit, name: data.name, note: data.note, category, checked: false, sources: [] };
}

/** Adds a recipe's ingredients to the grocery list, merging quantities into any
 *  existing unchecked item with the same name+unit. Returns counts for the toast. */
export function addRecipeIngredientsToGrocery(recipeName: string, ingredients: Ingredient[]): { added: number; merged: number } {
  let added = 0, merged = 0;
  transaction(() => {
    ingredients.forEach((ing) => {
      const key = groceryKey(ing.name, ing.unit);
      const existing = all<GroceryRow>(`SELECT * FROM grocery_items WHERE checked = 0`)
        .find((r) => groceryKey(r.name, r.unit) === key);
      if (existing) {
        const item = groceryRowToItem(existing);
        const newQty = addQuantities(item.qty, ing.qty);
        const sources = item.sources.includes(recipeName) ? item.sources : [...item.sources, recipeName];
        run(`UPDATE grocery_items SET qty=?, sources=? WHERE id=?`, [newQty, JSON.stringify(sources), item.id]);
        merged++;
      } else {
        const id = uid('g');
        const category = ing.category || guessCategory(ing.name);
        run(
          `INSERT INTO grocery_items (id, qty, unit, name, note, category, checked, sources) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
          [id, ing.qty, ing.unit, ing.name, ing.note, category, JSON.stringify([recipeName])]
        );
        added++;
      }
    });
  });
  return { added, merged };
}

export function toggleGroceryItem(id: string): void {
  run(`UPDATE grocery_items SET checked = 1 - checked WHERE id=?`, [id]);
}

export function deleteGroceryItem(id: string): void {
  run(`DELETE FROM grocery_items WHERE id=?`, [id]);
}

export function clearCheckedGrocery(): void {
  run(`DELETE FROM grocery_items WHERE checked = 1`, []);
}

export function clearAllGrocery(): void {
  run(`DELETE FROM grocery_items`, []);
}

// ============================================================================
// meal plan
// ============================================================================

export function getMealPlan(): MealPlan {
  const row = one<{ week_start: string }>(`SELECT week_start FROM meal_plan WHERE id = 1`);
  const weekStart = row?.week_start || mondayOf(new Date());
  if (!row) {
    run(`INSERT OR REPLACE INTO meal_plan (id, week_start) VALUES (1, ?)`, [weekStart]);
  }
  const entries = all<PlanEntryRow>(`SELECT * FROM meal_plan_entries ORDER BY rowid ASC`).map(planEntryRowToEntry);
  return { weekStart, entries };
}

export function removeMealPlanEntry(entryId: string): void {
  run(`DELETE FROM meal_plan_entries WHERE id=?`, [entryId]);
}

export function setMealPlanEntryDay(entryId: string, day: number | null): void {
  run(`UPDATE meal_plan_entries SET day=? WHERE id=?`, [day, entryId]);
}

export function markMealPlanEntryCooked(entryId: string): void {
  run(`UPDATE meal_plan_entries SET cooked=1 WHERE id=?`, [entryId]);
}

/** Marks the most recent open (uncooked) plan entry for a recipe as cooked —
 *  used when "Cook this" is triggered from the recipe view rather than the plan. */
export function markAnyOpenPlanEntryForRecipeCooked(recipeId: string): void {
  const open = one<{ id: string }>(
    `SELECT id FROM meal_plan_entries WHERE recipe_id=? AND cooked=0 ORDER BY rowid ASC LIMIT 1`,
    [recipeId]
  );
  if (open) run(`UPDATE meal_plan_entries SET cooked=1 WHERE id=?`, [open.id]);
}

export function startNewWeek(): MealPlan {
  transaction(() => {
    run(`DELETE FROM meal_plan_entries WHERE day IS NULL OR day >= 0`, []);
    run(`INSERT OR REPLACE INTO meal_plan (id, week_start) VALUES (1, ?)`, [mondayOf(new Date())]);
  });
  return getMealPlan();
}

// ============================================================================
// backup export / import
// ============================================================================

export interface BackupPayload {
  app: 'stacks';
  version: 2;
  exportedAt: string;
  books: Cookbook[];
  standaloneRecipes: Recipe[];
  groceryList: GroceryItem[];
  mealPlan: MealPlan;
}

export function exportBackup(): BackupPayload {
  return {
    app: 'stacks',
    version: 2,
    exportedAt: new Date().toISOString(),
    books: listCookbooks(),
    standaloneRecipes: listStandaloneRecipes(),
    groceryList: listGrocery(),
    mealPlan: getMealPlan()
  };
}

export interface ImportSummary {
  addedBooks: number;
  addedRecipes: number;
  addedStandalone: number;
  skippedBooks: number;
  addedGrocery: number;
}

function insertRecipeRaw(cookbookId: string | null, raw: any): string {
  const id = uid('r');
  const dateAdded = typeof raw.dateAdded === 'number' ? raw.dateAdded : Date.now();
  run(
    `INSERT INTO recipes (id, cookbook_id, name, page, servings, rating, notes, image, favorite, want_to_try, date_added)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, cookbookId, raw.name || 'Untitled recipe', String(raw.page ?? ''), String(raw.servings ?? ''),
      raw.rating || 0, raw.notes || '', raw.image || '', raw.favorite ? 1 : 0, raw.wantToTry ? 1 : 0, dateAdded]
  );
  const ingredients: Ingredient[] = Array.isArray(raw.ingredients)
    ? raw.ingredients.map((ri: any) => ({
        id: uid('i'), qty: String(ri.qty ?? ''), unit: ri.unit || '', name: ri.name || '',
        note: ri.note || '', category: ri.category || guessCategory(ri.name || '')
      }))
    : [];
  replaceRecipeIngredients(id, ingredients);
  if (Array.isArray(raw.tags)) replaceRecipeTags(id, raw.tags.map(String));
  if (Array.isArray(raw.cookingHistory)) {
    raw.cookingHistory.forEach((sn: any) => {
      run(
        `INSERT INTO cooking_sessions (id, recipe_id, date, rating, notes, would_make_again) VALUES (?, ?, ?, ?, ?, ?)`,
        [uid('c'), id, sn.date || todayIso(), sn.rating || 0, sn.notes || '', sn.wouldMakeAgain !== false ? 1 : 0]
      );
    });
  } else if (raw.tried) {
    // legacy backups: a bare `tried: true` becomes one historical session, same as the original migration
    run(
      `INSERT INTO cooking_sessions (id, recipe_id, date, rating, notes, would_make_again) VALUES (?, ?, ?, ?, ?, 1)`,
      [uid('c'), id, new Date(dateAdded).toISOString().slice(0, 10), raw.rating || 0, 'Logged before cooking history existed.']
    );
  }
  return id;
}

/** Merges a JSON backup (this app's own export, or the older pre-SQL format)
 *  into the current data: matching cookbooks by title+author, matching recipes
 *  by name, so importing the same file twice is harmless. */
export function importBackup(parsed: any): ImportSummary {
  const summary: ImportSummary = { addedBooks: 0, addedRecipes: 0, addedStandalone: 0, skippedBooks: 0, addedGrocery: 0 };

  const incoming: any[] | null = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.books) ? parsed.books : null;
  if (!incoming) return summary;
  const incomingStandalone: any[] = Array.isArray(parsed.standaloneRecipes) ? parsed.standaloneRecipes : [];

  transaction(() => {
    const existingBooks = listCookbooks();
    const titleKey = (title: string, author: string) => (title || '').trim().toLowerCase() + '|' + (author || '').trim().toLowerCase();
    const existingByKey = new Map(existingBooks.map((b) => [titleKey(b.title, b.author), b]));
    const recipeIdMap = new Map<string, string>(); // old recipe id (from the backup) -> new id actually inserted

    incoming.forEach((raw) => {
      if (!raw || !raw.title) return;
      const key = titleKey(raw.title, raw.author || '');
      const match = existingByKey.get(key);

      if (match) {
        const haveNames = new Set(match.recipes.map((r) => r.name.trim().toLowerCase()));
        (Array.isArray(raw.recipes) ? raw.recipes : []).forEach((r: any) => {
          if (!r || !r.name) return;
          const nameKey = r.name.trim().toLowerCase();
          if (haveNames.has(nameKey)) return;
          const newId = insertRecipeRaw(match.id, r);
          if (r.id) recipeIdMap.set(r.id, newId);
          haveNames.add(nameKey);
          summary.addedRecipes++;
        });
        summary.skippedBooks++;
        return;
      }

      const status: CookbookStatus = ['want', 'cooking', 'favorite', 'reference'].includes(raw.status) ? raw.status : 'want';
      const newBook = createCookbook({
        title: raw.title, author: raw.author || '', cover: raw.cover || '', cuisine: raw.cuisine || '',
        status, rating: raw.rating || 0, notes: raw.notes || ''
      });
      (Array.isArray(raw.recipes) ? raw.recipes : []).forEach((r: any) => {
        const newId = insertRecipeRaw(newBook.id, r);
        if (r && r.id) recipeIdMap.set(r.id, newId);
      });
      existingByKey.set(key, { ...newBook, recipes: [] });
      summary.addedBooks++;
    });

    const existingStandaloneNames = new Set(listStandaloneRecipes().map((r) => r.name.trim().toLowerCase()));
    incomingStandalone.forEach((r) => {
      if (!r || !r.name) return;
      const nameKey = r.name.trim().toLowerCase();
      if (existingStandaloneNames.has(nameKey)) return;
      const newId = insertRecipeRaw(null, r);
      if (r.id) recipeIdMap.set(r.id, newId);
      existingStandaloneNames.add(nameKey);
      summary.addedStandalone++;
    });

    if (Array.isArray(parsed.groceryList)) {
      const existingKeys = new Set(listGrocery().map((g) => groceryKey(g.name, g.unit)));
      parsed.groceryList.forEach((raw: any) => {
        if (!raw || !raw.name) return;
        const key = groceryKey(raw.name, raw.unit || '');
        if (existingKeys.has(key)) return;
        const id = uid('g');
        run(
          `INSERT INTO grocery_items (id, qty, unit, name, note, category, checked, sources) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, String(raw.qty ?? ''), raw.unit || '', raw.name, raw.note || '',
            raw.category || guessCategory(raw.name), raw.checked ? 1 : 0,
            JSON.stringify(Array.isArray(raw.sources) ? raw.sources : raw.source ? [raw.source] : [])]
        );
        existingKeys.add(key);
        summary.addedGrocery++;
      });
    }
    if (parsed.mealPlan && Array.isArray(parsed.mealPlan.entries)) {
      const current = getMealPlan();
      if (current.entries.length === 0) {
        run(`INSERT OR REPLACE INTO meal_plan (id, week_start) VALUES (1, ?)`, [parsed.mealPlan.weekStart || mondayOf(new Date())]);
        parsed.mealPlan.entries.forEach((e: any) => {
          if (!e || !e.recipeId) return;
          // The recipe this entry pointed to got a brand-new id during this import
          // (or wasn't imported at all, e.g. it was a duplicate) — remap or drop it,
          // rather than inserting a dangling reference that trips the FK constraint.
          const resolvedRecipeId = recipeIdMap.get(e.recipeId) || (getRecipe(e.recipeId) ? e.recipeId : null);
          if (!resolvedRecipeId) return;
          run(`INSERT INTO meal_plan_entries (id, recipe_id, day, cooked) VALUES (?, ?, ?, ?)`,
            [uid('m'), resolvedRecipeId, typeof e.day === 'number' ? e.day : null, e.cooked ? 1 : 0]);
        });
      }
    }
  });

  return summary;
}

/** CSV import: adds recipes (name + page) to matching or brand-new cookbooks. */
export function importCsvGroups(
  groups: { bookTitle: string; author: string; recipes: { name: string; page: string }[]; matchId: string | null }[]
): { newBooksAdded: boolean; touchedBookIds: string[] } {
  let newBooksAdded = false;
  const touchedBookIds = new Set<string>();

  transaction(() => {
    groups.forEach((g) => {
      let bookId = g.matchId;
      if (!bookId) {
        const book = createCookbook({
          title: g.bookTitle, author: g.author, cover: '', cuisine: '', status: 'want', rating: 0, notes: ''
        });
        bookId = book.id;
        newBooksAdded = true;
      }
      const existingRecipes = recipesForCookbook(bookId!);
      const existingNames = new Set(existingRecipes.map((r) => r.name.trim().toLowerCase()));
      g.recipes.forEach((r) => {
        const nameKey = r.name.trim().toLowerCase();
        if (existingNames.has(nameKey)) return;
        insertRecipeRaw(bookId!, { name: r.name, page: r.page ? r.page.replace(/[^\d]/g, '') : '' });
        existingNames.add(nameKey);
      });
      touchedBookIds.add(bookId!);
    });
  });

  return { newBooksAdded, touchedBookIds: [...touchedBookIds] };
}

export function findMatchingCookbook(title: string, author: string): Cookbook | null {
  const t = title.trim().toLowerCase();
  const a = (author || '').trim().toLowerCase();
  return listCookbooks().find(
    (b) => b.title.trim().toLowerCase() === t && (!a || b.author.trim().toLowerCase() === a)
  ) || null;
}


// ============================================================================
// 1. Find your PlanEntryRow interface and planEntryRowToEntry function.
//    Add the new column both places:
// ============================================================================

// Row interface — add `date`:
interface PlanEntryRow { id: string; recipe_id: string; day: number | null; cooked: number; date: string | null; }

// Mapper — add `date`:
function planEntryRowToEntry(r: PlanEntryRow): MealPlanEntry {
  return { id: r.id, recipeId: r.recipe_id, day: r.day, cooked: !!r.cooked, date: r.date };
}


// ============================================================================
// 2. Update addMealPlanEntry's INSERT to include the new column (defaulting
//    to NULL for the existing "this week" flow — nothing about its existing
//    call sites needs to change):
// ============================================================================

export function addMealPlanEntry(recipeId: string, day: number | null): MealPlanEntry {
  getMealPlan();
  const id = uid('m');
  run(`INSERT INTO meal_plan_entries (id, recipe_id, day, cooked, date) VALUES (?, ?, ?, 0, NULL)`, [id, recipeId, day]);
  return { id, recipeId, day, cooked: false, date: null };
}


// ============================================================================
// 3. New function — schedules a recipe on a specific future calendar date,
//    independent of the current week's day-of-week grid:
// ============================================================================

export function scheduleRecipeOnDate(recipeId: string, date: string): MealPlanEntry {
  const id = uid('m');
  run(`INSERT INTO meal_plan_entries (id, recipe_id, day, cooked, date) VALUES (?, ?, NULL, 0, ?)`, [id, recipeId, date]);
  return { id, recipeId, day: null, cooked: false, date };
}

export function setMealPlanEntryDate(entryId: string, date: string | null): void {
  run(`UPDATE meal_plan_entries SET date=? WHERE id=?`, [date, entryId]);
}

export function listCalendarPlanEntries(): MealPlanEntry[] {
  return all<PlanEntryRow>(`SELECT * FROM meal_plan_entries WHERE date IS NOT NULL ORDER BY date ASC`).map(planEntryRowToEntry);
}


// ============================================================================
// 5. New: calendar events CRUD — add these as new exported functions
//    anywhere in the file:
// ============================================================================

interface CalendarEventRow { id: string; date: string; title: string; }

export function listCalendarEvents(): CalendarEvent[] {
  return all<CalendarEventRow>(`SELECT * FROM calendar_events ORDER BY date ASC`).map((r) => ({ id: r.id, date: r.date, title: r.title }));
}

export function addCalendarEvent(date: string, title: string): CalendarEvent {
  const id = uid('e');
  run(`INSERT INTO calendar_events (id, date, title) VALUES (?, ?, ?)`, [id, date, title]);
  return { id, date, title };
}

export function deleteCalendarEvent(id: string): void {
  run(`DELETE FROM calendar_events WHERE id=?`, [id]);
}


// ============================================================================
// 6. getMealPlan() itself does NOT need to change — it already
//    `SELECT * FROM meal_plan_entries` with no WHERE clause, so calendar-
//    dated entries come along for free. Just make sure `CalendarEvent` is
//    imported from '../types' at the top of this file (or wherever
//    MealPlanEntry etc. are already imported from).
// ============================================================================


// ============================================================================
// Add these anywhere in repository.ts — no changes to any existing function
// needed. Uses the same `guessCategory` helper your grocery code already has.
// ============================================================================

interface PantryRow { id: string; name: string; category: string; qty: string; unit: string; note: string; low_stock: number; }

function pantryRowToItem(r: PantryRow): PantryItem {
  return { id: r.id, name: r.name, category: r.category, qty: r.qty, unit: r.unit, note: r.note, lowStock: !!r.low_stock };
}

export function listPantryItems(): PantryItem[] {
  return all<PantryRow>(`SELECT * FROM pantry_items ORDER BY name COLLATE NOCASE ASC`).map(pantryRowToItem);
}

export interface PantryItemInput { name: string; category?: string; qty: string; unit: string; note: string; }

export function addPantryItem(data: PantryItemInput): PantryItem {
  const id = uid('p');
  const category = data.category || guessCategory(data.name);
  run(
    `INSERT INTO pantry_items (id, name, category, qty, unit, note, low_stock) VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [id, data.name, category, data.qty, data.unit, data.note]
  );
  return { id, name: data.name, category, qty: data.qty, unit: data.unit, note: data.note, lowStock: false };
}

export function updatePantryItem(id: string, data: PantryItemInput): void {
  const category = data.category || guessCategory(data.name);
  run(
    `UPDATE pantry_items SET name=?, category=?, qty=?, unit=?, note=? WHERE id=?`,
    [data.name, category, data.qty, data.unit, data.note, id]
  );
}

export function togglePantryLowStock(id: string): void {
  run(`UPDATE pantry_items SET low_stock = 1 - low_stock WHERE id=?`, [id]);
}

export function deletePantryItem(id: string): void {
  run(`DELETE FROM pantry_items WHERE id=?`, [id]);
}

// Pushes every currently low-stock pantry item onto the grocery list, using
// the same merge-by-name+unit logic your recipe->grocery flow already has.
export function sendLowStockToGrocery(): { added: number; merged: number } {
  const lowItems = listPantryItems().filter((p) => p.lowStock);
  let added = 0, merged = 0;
  const tx = transaction(() => {
    lowItems.forEach((p) => {
      const key = (name: string, unit: string) => (name || '').trim().toLowerCase() + '|' + (unit || '').trim().toLowerCase();
      const existing = all<{ id: string; qty: string; unit: string; name: string }>(`SELECT * FROM grocery_items WHERE checked = 0`)
        .find((g) => key(g.name, g.unit) === key(p.name, p.unit));
      if (existing) {
        run(`UPDATE grocery_items SET qty=? WHERE id=?`, [addQuantities(existing.qty, p.qty), existing.id]);
        merged++;
      } else {
        run(
          `INSERT INTO grocery_items (id, qty, unit, name, note, category, checked, sources) VALUES (?, ?, ?, ?, ?, ?, 0, '[]')`,
          [uid('g'), p.qty, p.unit, p.name, p.note, p.category]
        );
        added++;
      }
    });
  });
  return { added, merged };
}

// ============================================================================
// menus (course-based menu planning)
// ============================================================================

interface MenuRow { id: string; title: string; context: string; date_added: number; }
interface MenuSlotRow {
  id: string; menu_id: string; position: number; course: string; recipe_id: string | null;
  locked: number; suggestion_name: string; suggestion_reason: string;
}

function slotsForMenu(menuId: string): MenuSlot[] {
  return all<MenuSlotRow>(`SELECT * FROM menu_slots WHERE menu_id=? ORDER BY position ASC`, [menuId]).map((r) => ({
    id: r.id, course: r.course, recipeId: r.recipe_id, locked: !!r.locked,
    suggestionName: r.suggestion_name, suggestionReason: r.suggestion_reason
  }));
}

function assembleMenu(row: MenuRow): Menu {
  return { id: row.id, title: row.title, context: row.context, dateAdded: row.date_added, slots: slotsForMenu(row.id) };
}

export function listMenus(): Menu[] {
  return all<MenuRow>(`SELECT * FROM menus ORDER BY date_added DESC`).map(assembleMenu);
}

export function getMenu(id: string): Menu | null {
  const row = one<MenuRow>(`SELECT * FROM menus WHERE id=?`, [id]);
  return row ? assembleMenu(row) : null;
}

export function createMenu(title: string, context: string, courseNames: string[]): Menu {
  const id = uid('mn');
  const dateAdded = Date.now();
  transaction(() => {
    run(`INSERT INTO menus (id, title, context, date_added) VALUES (?, ?, ?, ?)`, [id, title, context, dateAdded]);
    courseNames.forEach((course, idx) => {
      run(
        `INSERT INTO menu_slots (id, menu_id, position, course, recipe_id, locked, suggestion_name, suggestion_reason)
         VALUES (?, ?, ?, ?, NULL, 0, '', '')`,
        [uid('ms'), id, idx, course]
      );
    });
  });
  return getMenu(id)!;
}

export function deleteMenu(id: string): void {
  run(`DELETE FROM menus WHERE id=?`, [id]);
}

export function updateMenuContext(id: string, title: string, context: string): void {
  run(`UPDATE menus SET title=?, context=? WHERE id=?`, [title, context, id]);
}

export function addMenuSlot(menuId: string, course: string): MenuSlot {
  const id = uid('ms');
  const row = one<{ maxPos: number | null }>(`SELECT MAX(position) AS maxPos FROM menu_slots WHERE menu_id=?`, [menuId]);
  const position = (row?.maxPos ?? -1) + 1;
  run(
    `INSERT INTO menu_slots (id, menu_id, position, course, recipe_id, locked, suggestion_name, suggestion_reason)
     VALUES (?, ?, ?, ?, NULL, 0, '', '')`,
    [id, menuId, position, course]
  );
  return { id, course, recipeId: null, locked: false, suggestionName: '', suggestionReason: '' };
}

export function removeMenuSlot(slotId: string): void {
  run(`DELETE FROM menu_slots WHERE id=?`, [slotId]);
}

export function updateMenuSlotCourse(slotId: string, course: string): void {
  run(`UPDATE menu_slots SET course=? WHERE id=?`, [course, slotId]);
}

/** Assigning a real recipe clears any AI suggestion placeholder — the slot is settled now. */
export function setMenuSlotRecipe(slotId: string, recipeId: string | null): void {
  run(`UPDATE menu_slots SET recipe_id=?, suggestion_name='', suggestion_reason='' WHERE id=?`, [recipeId, slotId]);
}

/** Only ever fills a slot that doesn't already have a real recipe assigned. */
export function setMenuSlotSuggestion(slotId: string, name: string, reason: string): void {
  run(`UPDATE menu_slots SET suggestion_name=?, suggestion_reason=? WHERE id=? AND recipe_id IS NULL`, [name, reason, slotId]);
}

export function setMenuSlotLocked(slotId: string, locked: boolean): void {
  run(`UPDATE menu_slots SET locked=? WHERE id=?`, [locked ? 1 : 0, slotId]);
}

export function clearMenuSlot(slotId: string): void {
  run(`UPDATE menu_slots SET recipe_id=NULL, suggestion_name='', suggestion_reason='' WHERE id=?`, [slotId]);
}