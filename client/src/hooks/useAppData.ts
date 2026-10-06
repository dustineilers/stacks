import { useCallback, useEffect, useRef, useState } from 'react';
import { openDatabase, persistNow, syncWithServer, resolveSyncConflict, getSyncStatus, onSyncStatusChange, type SyncStatus } from '../db/sqlite';
import * as repo from '../db/repository';
import { todayIso } from '../utils/dates';
import type { Cookbook, Recipe, GroceryItem, MealPlan, RecipeEntry, CalendarEvent, PantryItem, Menu } from '../types';
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
  syncStatus: SyncStatus;
  resolveSyncConflict: (choice: 'keepLocal' | 'useServer') => Promise<void>;
  syncNow: () => Promise<SyncStatus>;

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

  calendarEvents: CalendarEvent[];
  scheduleRecipeOnDate: (recipeId: string, date: string) => Promise<void>;
  setEntryDate: (entryId: string, date: string | null) => Promise<void>;
  addCalendarEvent: (date: string, title: string) => Promise<void>;
  deleteCalendarEvent: (id: string) => Promise<void>;

  pantry: PantryItem[];
  addPantryItem: (line: string) => Promise<void>;
  editPantryItem: (id: string, data: repo.PantryItemInput) => Promise<void>;
  togglePantryLowStock: (id: string) => Promise<void>;
  deletePantryItem: (id: string) => Promise<void>;
  sendLowStockToGrocery: () => Promise<{ added: number; merged: number }>;

  menus: Menu[];
  createMenu: (title: string, context: string, courseNames: string[]) => Promise<Menu>;
  deleteMenu: (id: string) => Promise<void>;
  updateMenuContext: (id: string, title: string, context: string) => Promise<void>;
  addMenuSlot: (menuId: string, course: string) => Promise<void>;
  removeMenuSlot: (slotId: string) => Promise<void>;
  updateMenuSlotCourse: (slotId: string, course: string) => Promise<void>;
  setMenuSlotRecipe: (slotId: string, recipeId: string | null) => Promise<void>;
  setMenuSlotSuggestion: (slotId: string, name: string, reason: string) => Promise<void>;
  setMenuSlotLocked: (slotId: string, locked: boolean) => Promise<void>;
  clearMenuSlot: (slotId: string) => Promise<void>;
}

export function useAppData(): AppData {
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [books, setBooks] = useState<Cookbook[]>([]);
  const [standaloneRecipes, setStandaloneRecipes] = useState<Recipe[]>([]);
  const [grocery, setGrocery] = useState<GroceryItem[]>([]);
  const [mealPlan, setMealPlan] = useState<MealPlan>({ weekStart: '', entries: [] });
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(getSyncStatus());

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
  const refreshCalendarEvents = useCallback(() => setCalendarEvents(repo.listCalendarEvents()), []);
  const refreshPantry = useCallback(() => setPantry(repo.listPantryItems()), []);
  const refreshMenus = useCallback(() => setMenus(repo.listMenus()), []);

  const refreshAll = useCallback(() => {
    refreshRecipes();
    refreshGrocery();
    refreshPlan();
    refreshCalendarEvents();
    refreshPantry();
    refreshMenus();
  }, [refreshRecipes, refreshGrocery, refreshPlan, refreshCalendarEvents, refreshPantry, refreshMenus]);

  const persistAndCheck = useCallback(async () => {
    const ok = await persistNow();
    setSaveError(!ok);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await openDatabase();
      if (cancelled) return;
      refreshAll();
      setReady(true);

      // LAN sync happens separately, in the background, so a slow or
      // unreachable backend never delays showing the app with local data.
      void syncWithServer().then(() => {
        if (!cancelled) refreshAll();
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => onSyncStatusChange(setSyncStatus), []);

  const handleResolveSyncConflict = useCallback(async (choice: 'keepLocal' | 'useServer') => {
    await resolveSyncConflict(choice);
    refreshAll();
  }, [refreshAll]);

  const syncNow = useCallback(async () => {
    const result = await syncWithServer();
    refreshAll();
    return result;
  }, [refreshAll]);

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

  const scheduleRecipeOnDate = useCallback(async (recipeId: string, date: string) => {
    repo.scheduleRecipeOnDate(recipeId, date);
    refreshPlan();
    await persistAndCheck();
  }, [refreshPlan, persistAndCheck]);
  
  const setEntryDate = useCallback(async (entryId: string, date: string | null) => {
    repo.setMealPlanEntryDate(entryId, date);
    refreshPlan();
    await persistAndCheck();
  }, [refreshPlan, persistAndCheck]);
  
  const addCalendarEvent = useCallback(async (date: string, title: string) => {
    repo.addCalendarEvent(date, title);
    refreshCalendarEvents();
    await persistAndCheck();
  }, [refreshCalendarEvents, persistAndCheck]);
  
  const deleteCalendarEvent = useCallback(async (id: string) => {
    repo.deleteCalendarEvent(id);
    refreshCalendarEvents();
    await persistAndCheck();
  }, [refreshCalendarEvents, persistAndCheck]);

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

  const addPantryItem = useCallback(async (line: string) => {
  const { parseIngredientLine } = await import('../utils/ingredients');
  const parsed = parseIngredientLine(line);
    if (!parsed) return;
    repo.addPantryItem(parsed);
    refreshPantry();
    await persistAndCheck();
  }, [refreshPantry, persistAndCheck]);
 
  const editPantryItem = useCallback(async (id: string, data: repo.PantryItemInput) => {
    repo.updatePantryItem(id, data);
    refreshPantry();
    await persistAndCheck();
  }, [refreshPantry, persistAndCheck]);
  
  const togglePantryLowStock = useCallback(async (id: string) => {
    repo.togglePantryLowStock(id);
    refreshPantry();
    await persistAndCheck();
  }, [refreshPantry, persistAndCheck]);
  
  const deletePantryItem = useCallback(async (id: string) => {
    repo.deletePantryItem(id);
    refreshPantry();
    await persistAndCheck();
  }, [refreshPantry, persistAndCheck]);
  
  const sendLowStockToGrocery = useCallback(async () => {
    const result = repo.sendLowStockToGrocery();
    refreshGrocery(); // your existing grocery refresh function
    await persistAndCheck();
    return result;
  }, [refreshGrocery, persistAndCheck]);

  // ---------------- menus ----------------

  const createMenu = useCallback(async (title: string, context: string, courseNames: string[]) => {
    const menu = repo.createMenu(title, context, courseNames);
    refreshMenus();
    await persistAndCheck();
    return menu;
  }, [refreshMenus, persistAndCheck]);

  const deleteMenu = useCallback(async (id: string) => {
    repo.deleteMenu(id);
    refreshMenus();
    await persistAndCheck();
  }, [refreshMenus, persistAndCheck]);

  const updateMenuContext = useCallback(async (id: string, title: string, context: string) => {
    repo.updateMenuContext(id, title, context);
    refreshMenus();
    await persistAndCheck();
  }, [refreshMenus, persistAndCheck]);

  const addMenuSlot = useCallback(async (menuId: string, course: string) => {
    repo.addMenuSlot(menuId, course);
    refreshMenus();
    await persistAndCheck();
  }, [refreshMenus, persistAndCheck]);

  const removeMenuSlot = useCallback(async (slotId: string) => {
    repo.removeMenuSlot(slotId);
    refreshMenus();
    await persistAndCheck();
  }, [refreshMenus, persistAndCheck]);

  const updateMenuSlotCourse = useCallback(async (slotId: string, course: string) => {
    repo.updateMenuSlotCourse(slotId, course);
    refreshMenus();
    await persistAndCheck();
  }, [refreshMenus, persistAndCheck]);

  const setMenuSlotRecipe = useCallback(async (slotId: string, recipeId: string | null) => {
    repo.setMenuSlotRecipe(slotId, recipeId);
    refreshMenus();
    await persistAndCheck();
  }, [refreshMenus, persistAndCheck]);

  const setMenuSlotSuggestion = useCallback(async (slotId: string, name: string, reason: string) => {
    repo.setMenuSlotSuggestion(slotId, name, reason);
    refreshMenus();
    await persistAndCheck();
  }, [refreshMenus, persistAndCheck]);

  const setMenuSlotLocked = useCallback(async (slotId: string, locked: boolean) => {
    repo.setMenuSlotLocked(slotId, locked);
    refreshMenus();
    await persistAndCheck();
  }, [refreshMenus, persistAndCheck]);

  const clearMenuSlot = useCallback(async (slotId: string) => {
    repo.clearMenuSlot(slotId);
    refreshMenus();
    await persistAndCheck();
  }, [refreshMenus, persistAndCheck]);

  return {
    ready, saveError, syncStatus, resolveSyncConflict: handleResolveSyncConflict, syncNow,
    books, standaloneRecipes, grocery, mealPlan,
    getAllRecipeEntries, locateRecipeEntry, allTags,
    addCookbook, editCookbook, removeCookbook,
    addRecipe, editRecipe, removeRecipe, toggleRecipeFlag,
    cookRecipe, deleteSession,
    addRecipeToGrocery, addManualGroceryItem, toggleGroceryItem, deleteGroceryItem, clearCheckedGrocery, clearAllGrocery,
    addToMealPlan, removePlanEntry, setPlanDay, startNewWeek, sendWeekToGrocery,
    importCsvGroups, exportBackup, importBackupJson,
    retrySave,
    calendarEvents,
    scheduleRecipeOnDate,
    setEntryDate,
    addCalendarEvent,
    deleteCalendarEvent,
    pantry, addPantryItem, editPantryItem, togglePantryLowStock, deletePantryItem, sendLowStockToGrocery,
    menus, createMenu, deleteMenu, updateMenuContext, addMenuSlot, removeMenuSlot, updateMenuSlotCourse,
    setMenuSlotRecipe, setMenuSlotSuggestion, setMenuSlotLocked, clearMenuSlot
  };
}

// re-exported so components don't need to know it lives in utils/dates
export { todayIso };
