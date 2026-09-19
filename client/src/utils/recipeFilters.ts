import type { RecipeEntry, RecipeFilters } from '../types';
import { cookCount, effectiveRating, lastCooked, matchesStatusFilter } from './recipeStats';

export function filterAndSortRecipeEntries(entries: RecipeEntry[], filters: RecipeFilters, searchTerm: string): RecipeEntry[] {
  let result = entries;

  if (filters.book === 'none') result = result.filter((e) => !e.book);
  else if (filters.book !== 'all') result = result.filter((e) => e.book && e.book.id === filters.book);

  if (filters.status !== 'all') result = result.filter((e) => matchesStatusFilter(e.recipe, filters.status));

  if (filters.rating > 0) result = result.filter((e) => effectiveRating(e.recipe) >= filters.rating);

  if (filters.tags.length) result = result.filter((e) => filters.tags.every((t) => e.recipe.tags.includes(t)));

  const q = searchTerm.trim().toLowerCase();
  if (q) {
    result = result.filter((e) => {
      const r = e.recipe, b = e.book;
      return (r.name || '').toLowerCase().includes(q) ||
        (r.notes || '').toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q)) ||
        r.ingredients.some((i) => i.name.toLowerCase().includes(q)) ||
        (b && b.title.toLowerCase().includes(q)) ||
        (b && b.author.toLowerCase().includes(q));
    });
  }

  const byName = (a: RecipeEntry, b: RecipeEntry) => a.recipe.name.localeCompare(b.recipe.name);
  const sorters: Record<string, (a: RecipeEntry, b: RecipeEntry) => number> = {
    recent: (a, b) => b.recipe.dateAdded - a.recipe.dateAdded,
    alpha: byName,
    rating_hi: (a, b) => effectiveRating(b.recipe) - effectiveRating(a.recipe) || byName(a, b),
    rating_lo: (a, b) => effectiveRating(a.recipe) - effectiveRating(b.recipe) || byName(a, b),
    cooked_most: (a, b) => cookCount(b.recipe) - cookCount(a.recipe) || byName(a, b),
    cooked_least: (a, b) => cookCount(a.recipe) - cookCount(b.recipe) || byName(a, b),
    never: (a, b) => (cookCount(a.recipe) ? 1 : 0) - (cookCount(b.recipe) ? 1 : 0) || byName(a, b),
    cooked_recent: (a, b) => String(lastCooked(b.recipe) || '').localeCompare(String(lastCooked(a.recipe) || '')) || byName(a, b),
    book: (a, b) => (a.book ? a.book.title : '\uffff').localeCompare(b.book ? b.book.title : '\uffff') || byName(a, b)
  };

  return result.slice().sort(sorters[filters.sort] || sorters.recent);
}

export function activeRecipeFilterCount(filters: RecipeFilters, searchTerm: string): number {
  let n = 0;
  if (filters.book !== 'all') n++;
  if (filters.tags.length) n++;
  if (filters.status !== 'all') n++;
  if (filters.rating > 0) n++;
  if (searchTerm.trim()) n++;
  return n;
}
