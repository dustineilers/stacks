import type { Recipe, RecipeStatusFilter } from '../types';

export function cookCount(r: Recipe): number {
  return (r.cookingHistory || []).length;
}

export function lastCooked(r: Recipe): string | null {
  const h = r.cookingHistory || [];
  if (!h.length) return null;
  return h.map((s) => s.date).sort().slice(-1)[0];
}

export function avgSessionRating(r: Recipe): number {
  const rated = (r.cookingHistory || []).filter((s) => s.rating > 0);
  if (!rated.length) return 0;
  return rated.reduce((a, s) => a + s.rating, 0) / rated.length;
}

export function effectiveRating(r: Recipe): number {
  return r.rating || Math.round(avgSessionRating(r));
}

export function isFavorite(r: Recipe): boolean {
  return !!r.favorite || effectiveRating(r) >= 4;
}

export function recipeStatus(r: Recipe): 'never' | 'cooked' | 'favorite' {
  if (cookCount(r) === 0) return 'never';
  if (isFavorite(r)) return 'favorite';
  return 'cooked';
}

export function matchesStatusFilter(r: Recipe, status: RecipeStatusFilter): boolean {
  if (status === 'all') return true;
  if (status === 'favorite') return isFavorite(r);
  if (status === 'want') return !!r.wantToTry;
  if (status === 'never') return cookCount(r) === 0;
  if (status === 'cooked') return cookCount(r) > 0;
  return true;
}
