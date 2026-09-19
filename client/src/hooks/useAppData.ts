import { useCallback, useEffect, useRef, useState } from 'react';
import { openDatabase, persistNow } from '../db/sqlite';
import * as repo from '../db/repository';
import { todayIso } from '../utils/dates';
import type { Cookbook, Recipe, GroceryItem, MealPlan, RecipeEntry } from '../types';
import type {
  CookbookInput as CookbookInputType, RecipeInput as RecipeInputType,
  CookingSessionInput as CookingSessionInputType
} from '../db/repository';
import type { CsvGroup } from '../utils/csv';

export type CookbookInput = CookbookInputType;
export type RecipeInput = RecipeInputType;
export type CookingSessionInput = CookingSessionInputType;

export interface AppData {
  ready: boolean;
  saveError: boolean;

  books: Cookbook[];
  standaloneRecipes: Recipe[];
  grocery: GroceryItem[];
  mealPlan: MealPlan;

  getAllRecipeEntries: () => RecipeEntry[];
  locateRecipeEntry: (id: string) => RecipeEntry | null;
  allTags: () => string[];

  // cookbooks
  addCookbook: (input: CookbookInput) => Promise<Cookbook>;
  editCookbook: (id: string, input: CookbookInput) => Promise<void>;
  removeCookbook: (id: string) => Promise<void>;

  // recipes
  addRecipe: (cookbookId: string | null, input: RecipeInput) => Promise<Recipe>;
  editRecipe: (id: string, input: RecipeInput) => Promise<void>;
  removeRecipe: (id: string) => Promise<void>;
  toggleRecipeFlag: (id: string, flag: 'favorite' | 'wantToTry') => Promise<void>;

  // cooking history
  cookRecipe: (recipeId: string, session: CookingSessionInput, planEntryId?: string | null) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;

  // grocery
  addRecipeToGrocery: (recipeId: string, silent?: boolean) => Promise<{ added: number; merged: number } | null>;
  addManualGroceryItem: (line: string) => Promise<void>;
  toggleGroceryItem: (id: string) => Promise<void>;
  deleteGroceryItem: (id: string) => Promise<void>;
  clearCheckedGrocery: () => Promise<void>;
  clearAllGrocery: () => Promise<void>;

  // meal plan
  addToMealPlan: (recipeId: string, day?: number | null) => Promise<{ addedIngredients: boolean }>;
  removePlanEntry: (id: string) => Promise<void>;
  setPlanDay: (id: string, day: number | null) => Promise<void>;
  startNewWeek: () => Promise<void>;
  sendWeekToGrocery: () => Promise<number>;

  // csv / backup
  importCsvGroups: (groups: CsvGroup[]) => Promise<{ newBooksAdded: boolean }>;
  exportBackup: () => repo.BackupPayload;
  importBackupJson: (parsed: any) => Promise<repo.ImportSummary>;

  retrySave: () => Promise<void>;
}

export function useAppData(): AppData {
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [books, setBooks] = useState<Cookbook[]>([]);
  const [standaloneRecipes, setStandaloneRecipes] = useState<Recipe[]>([]);
  const [grocery, setGrocery] = useState<GroceryItem[]>([]);
  const [mealPlan, setMealPlan] = useState<MealPlan>({ weekStart: '', entries: [] });

  const booksRef = useRef(books);
  booksRef.current = books;
  const standaloneRef = useRef(standaloneRecipes);
  standaloneRef.current = standaloneRecipes;

  const refreshRecipes = useCallback(() => {
    setBooks(repo.listCookbooks());
    setStandaloneRecipes(repo.listStandaloneRecipes());
  }, []);

  const refreshGrocery = useCallback(() => setGrocery(repo.listGrocery()), []);
  const refreshPlan = useCallback(() => setMealPlan(repo.getMealPlan()), []);

  const persistAndCheck = useCallback(async () => {
    const ok = await persistNow();
    setSaveError(!ok);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await openDatabase();
      if (cancelled) return;
      refreshRecipes();
      refreshGrocery();
      refreshPlan();
      setReady(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getAllRecipeEntries = useCallback((): RecipeEntry[] => {
    const entries: RecipeEntry[] = [];
    booksRef.current.forEach((book) => book.recipes.forEach((recipe) => entries.push({ recipe, book })));
    standaloneRef.current.forEach((recipe) => entries.push({ recipe, book: null }));
    return entries;
  }, []);

  const locateRecipeEntry = useCallback((id: string): RecipeEntry | null => {
    for (const book of booksRef.current) {
      const recipe = book.recipes.find((r) => r.id === id);
      if (recipe) return { recipe, book };
    }
    const standalone = standaloneRef.current.find((r) => r.id === id);
    if (standalone) return { recipe: standalone, book: null };
    return null;
  }, []);

  const allTags = useCallback((): string[] => {
    const set = new Set<string>();
    getAllRecipeEntries().forEach((e) => e.recipe.tags.forEach((t) => set.add(t)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [getAllRecipeEntries]);

  // ---------------- cookbooks ----------------

  const addCookbook = useCallback(async (input: CookbookInput) => {
    const book = repo.createCookbook(input);
    refreshRecipes();
    await persistAndCheck();
    return book;
  }, [refreshRecipes, persistAndCheck]);

  const editCookbook = useCallback(async (id: string, input: CookbookInput) => {
    repo.updateCookbook(id, input);
    refreshRecipes();
    await persistAndCheck();
  }, [refreshRecipes, persistAndCheck]);

  const removeCookbook = useCallback(async (id: string) => {
    repo.deleteCookbook(id);
    refreshRecipes();
    await persistAndCheck();
  }, [refreshRecipes, persistAndCheck]);

  // ---------------- recipes ----------------

  const addRecipe = useCallback(async (cookbookId: string | null, input: RecipeInput) => {
    const recipe = repo.createRecipe(cookbookId, input);
    refreshRecipes();
    await persistAndCheck();
    return recipe;
  }, [refreshRecipes, persistAndCheck]);

  const editRecipe = useCallback(async (id: string, input: RecipeInput) => {
    repo.updateRecipe(id, input);
    refreshRecipes();
    await persistAndCheck();
  }, [refreshRecipes, persistAndCheck]);

  const removeRecipe = useCallback(async (id: string) => {
    repo.deleteRecipe(id);
    refreshRecipes();
    await persistAndCheck();
  }, [refreshRecipes, persistAndCheck]);

  const toggleRecipeFlag = useCallback(async (id: string, flag: 'favorite' | 'wantToTry') => {
    const entry = locateRecipeEntry(id);
    const next = entry ? !entry.recipe[flag] : true;
    repo.setRecipeFlag(id, flag, next);
    refreshRecipes();
    await persistAndCheck();
  }, [locateRecipeEntry, refreshRecipes, persistAndCheck]);

  // ---------------- cooking history ----------------

  const cookRecipe = useCallback(async (recipeId: string, session: CookingSessionInput, planEntryId?: string | null) => {
    repo.addCookingSession(recipeId, session);
    if (planEntryId) repo.markMealPlanEntryCooked(planEntryId);
    else repo.markAnyOpenPlanEntryForRecipeCooked(recipeId);
    refreshRecipes();
    refreshPlan();
    await persistAndCheck();
  }, [refreshRecipes, refreshPlan, persistAndCheck]);

  const deleteSession = useCallback(async (sessionId: string) => {
    repo.deleteCookingSession(sessionId);
    refreshRecipes();
    await persistAndCheck();
  }, [refreshRecipes, persistAndCheck]);

  // ---------------- grocery ----------------

  const addRecipeToGrocery = useCallback(async (recipeId: string, silent?: boolean) => {
    const entry = locateRecipeEntry(recipeId);
    if (!entry || entry.recipe.ingredients.length === 0) return null;
    const result = repo.addRecipeIngredientsToGrocery(entry.recipe.name, entry.recipe.ingredients);
    refreshGrocery();
    await persistAndCheck();
    return result;
  }, [locateRecipeEntry, refreshGrocery, persistAndCheck]);

  const addManualGroceryItem = useCallback(async (line: string) => {
    const { parseIngredientLine } = await import('../utils/ingredients');
    const parsed = parseIngredientLine(line);
    if (!parsed) return;
    repo.addManualGroceryItem(parsed);
    refreshGrocery();
    await persistAndCheck();
  }, [refreshGrocery, persistAndCheck]);

  const toggleGroceryItem = useCallback(async (id: string) => {
    repo.toggleGroceryItem(id);
    refreshGrocery();
    await persistAndCheck();
  }, [refreshGrocery, persistAndCheck]);

  const deleteGroceryItem = useCallback(async (id: string) => {
    repo.deleteGroceryItem(id);
    refreshGrocery();
    await persistAndCheck();
  }, [refreshGrocery, persistAndCheck]);

  const clearCheckedGrocery = useCallback(async () => {
    repo.clearCheckedGrocery();
    refreshGrocery();
    await persistAndCheck();
  }, [refreshGrocery, persistAndCheck]);

  const clearAllGrocery = useCallback(async () => {
    repo.clearAllGrocery();
    refreshGrocery();
    await persistAndCheck();
  }, [refreshGrocery, persistAndCheck]);

  // ---------------- meal plan ----------------

  const addToMealPlan = useCallback(async (recipeId: string, day: number | null = null) => {
    repo.addMealPlanEntry(recipeId, day);
    const entry = locateRecipeEntry(recipeId);
    let addedIngredients = false;
    if (entry && entry.recipe.ingredients.length > 0) {
      repo.addRecipeIngredientsToGrocery(entry.recipe.name, entry.recipe.ingredients);
      addedIngredients = true;
      refreshGrocery();
    }
    refreshPlan();
    await persistAndCheck();
    return { addedIngredients };
  }, [locateRecipeEntry, refreshGrocery, refreshPlan, persistAndCheck]);

  const removePlanEntry = useCallback(async (id: string) => {
    repo.removeMealPlanEntry(id);
    refreshPlan();
    await persistAndCheck();
  }, [refreshPlan, persistAndCheck]);

  const setPlanDay = useCallback(async (id: string, day: number | null) => {
    repo.setMealPlanEntryDay(id, day);
    refreshPlan();
    await persistAndCheck();
  }, [refreshPlan, persistAndCheck]);

  const startNewWeek = useCallback(async () => {
    repo.startNewWeek();
    refreshPlan();
    await persistAndCheck();
  }, [refreshPlan, persistAndCheck]);

  const sendWeekToGrocery = useCallback(async () => {
    const plan = repo.getMealPlan();
    const ids = [...new Set(plan.entries.filter((e) => !e.cooked).map((e) => e.recipeId))];
    let count = 0;
    ids.forEach((id) => {
      const entry = locateRecipeEntry(id);
      if (entry && entry.recipe.ingredients.length > 0) {
        repo.addRecipeIngredientsToGrocery(entry.recipe.name, entry.recipe.ingredients);
        count++;
      }
    });
    refreshGrocery();
    await persistAndCheck();
    return count;
  }, [locateRecipeEntry, refreshGrocery, persistAndCheck]);

  // ---------------- csv / backup ----------------

  const importCsvGroups = useCallback(async (groups: CsvGroup[]) => {
    const result = repo.importCsvGroups(groups);
    refreshRecipes();
    await persistAndCheck();
    return { newBooksAdded: result.newBooksAdded };
  }, [refreshRecipes, persistAndCheck]);

  const exportBackup = useCallback(() => repo.exportBackup(), []);

  const importBackupJson = useCallback(async (parsed: any) => {
    const summary = repo.importBackup(parsed);
    refreshRecipes();
    refreshGrocery();
    refreshPlan();
    await persistAndCheck();
    return summary;
  }, [refreshRecipes, refreshGrocery, refreshPlan, persistAndCheck]);

  const retrySave = useCallback(async () => { await persistAndCheck(); }, [persistAndCheck]);

  return {
    ready, saveError, books, standaloneRecipes, grocery, mealPlan,
    getAllRecipeEntries, locateRecipeEntry, allTags,
    addCookbook, editCookbook, removeCookbook,
    addRecipe, editRecipe, removeRecipe, toggleRecipeFlag,
    cookRecipe, deleteSession,
    addRecipeToGrocery, addManualGroceryItem, toggleGroceryItem, deleteGroceryItem, clearCheckedGrocery, clearAllGrocery,
    addToMealPlan, removePlanEntry, setPlanDay, startNewWeek, sendWeekToGrocery,
    importCsvGroups, exportBackup, importBackupJson,
    retrySave
  };
}

// re-exported so components don't need to know it lives in utils/dates
export { todayIso };
