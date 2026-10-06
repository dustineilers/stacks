// ---------- domain model ----------
// Mirrors the SQL schema in src/db/schema.ts. Nothing here is persisted directly —
// the repository layer reads/writes rows and assembles these shapes for the UI.

export type CookbookStatus = 'want' | 'cooking' | 'favorite' | 'reference';

export interface Cookbook {
  id: string;
  title: string;
  author: string;
  cover: string;
  cuisine: string;
  status: CookbookStatus;
  rating: number;
  notes: string;
  dateAdded: number;
  recipes: Recipe[];
}

export interface Ingredient {
  id: string;
  qty: string;
  unit: string;
  name: string;
  note: string;
  category: string;
}

export interface CookingSession {
  id: string;
  date: string; // yyyy-mm-dd
  rating: number;
  notes: string;
  wouldMakeAgain: boolean;
}

export interface Recipe {
  id: string;
  cookbookId: string | null;
  dateAdded: number;
  name: string;
  page: string;
  servings: string;
  rating: number;
  notes: string;
  image: string;
  tags: string[];
  favorite: boolean;
  wantToTry: boolean;
  tried: boolean;
  ingredients: Ingredient[];
  cookingHistory: CookingSession[];
  instructions: string[];
  sourceUrl: string;
  author: string;
}

export interface GroceryItem {
  id: string;
  qty: string;
  unit: string;
  name: string;
  note: string;
  category: string;
  checked: boolean;
  sources: string[];
}

export interface MealPlanEntry {
  id: string;
  recipeId: string;
  day: number | null; // 0=Monday .. 6=Sunday, null = unassigned
  cooked: boolean;
}

export interface MealPlan {
  weekStart: string; // yyyy-mm-dd, Monday of the week
  entries: MealPlanEntry[];
}

// A recipe plus the cookbook it belongs to (or null for standalone) —
// the shape most UI list/filter code actually wants to work with.
export interface RecipeEntry {
  recipe: Recipe;
  book: Cookbook | null;
}

export type RecipeStatusFilter = 'all' | 'never' | 'cooked' | 'favorite' | 'want';
export type RecipeSort =
  | 'recent' | 'alpha' | 'rating_hi' | 'rating_lo'
  | 'cooked_most' | 'cooked_least' | 'never' | 'cooked_recent' | 'book';

export interface RecipeFilters {
  book: 'all' | 'none' | string;
  tags: string[];
  status: RecipeStatusFilter;
  rating: number;
  sort: RecipeSort;
}

export type ShelfStatusFilter = 'all' | CookbookStatus;
export type ShelfSort = 'recent' | 'title' | 'author' | 'rating' | 'recipes';

export interface ShelfFilters {
  status: ShelfStatusFilter;
  sort: ShelfSort;
}

export interface AIRecipeSearchResult {
  recipe_id: string;
  reason: string;
}

export interface WebSearchResult {
  title: string;
  url: string;
  description: string;
  source?: string;
  thumbnail?: string;
}

export interface AIRecipeSearchResponse {
  success: boolean;
  query: string;
  results: AIRecipeSearchResult[];
  web_results?: WebSearchResult[];
}

export interface CoverageItem {
  name: string;
  status: 'strong' | 'some' | 'missing';
  note: string;
}
 
export interface RecipeSuggestionAI {
  name: string;
  cuisine?: string | null;
  reason: string;
}
 
export interface BookRecommendation {
  title: string;
  author?: string | null;
  reason: string;
  fills_gap: string;
}
 
export interface CollectionAnalysis {
  summary: string;
  cuisines: CoverageItem[];
  meal_types: CoverageItem[];
  techniques: CoverageItem[];
  recipe_suggestions: RecipeSuggestionAI[];
  book_recommendations: BookRecommendation[];
}
 
export type TabName = 'shelf' | 'recipes' | 'plan' | 'menu' | 'grocery';

// Add this new type:
export interface CalendarEvent {
  id: string;
  date: string;   // ISO yyyy-mm-dd
  title: string;
}

export interface MealPlanEntry {
  id: string;
  recipeId: string;
  day: number | null;
  cooked: boolean;
  date: string | null;
}

export interface PantryItem {
  id: string;
  name: string;
  category: string;
  qty: string;
  unit: string;
  note: string;
  lowStock: boolean;
}

export interface RecipePairing {
  recipe_id: string;
  name: string;
  role: string;
  reason: string;
}

export interface MenuSlot {
  id: string;
  course: string;
  recipeId: string | null;
  locked: boolean;
  suggestionName: string;
  suggestionReason: string;
}

export interface Menu {
  id: string;
  title: string;
  context: string;
  dateAdded: number;
  slots: MenuSlot[];
}