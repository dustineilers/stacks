import type { RecipeEntry } from '../types';

const AI_BASE = `${window.location.protocol}//${window.location.hostname}:8000`;

export function aiEndpoint(path: string): string {
  return `${AI_BASE}${path}`;
}

/** Same compact catalog shape used by search/analysis — id, name,
 *  ingredients-as-lines, tags, cookbook, rating, cook history. Kept in one
 *  place so pairing/menu-planning/search all build the payload identically. */
export function buildRecipeCatalog(entries: RecipeEntry[]) {
  return entries.map(({ recipe: r, book }) => {
    const history = r.cookingHistory || [];
    const last = history.length
      ? [...history].sort((a, b) => b.date.localeCompare(a.date))[0].date
      : null;
    return {
      id: r.id,
      name: r.name,
      ingredients: r.ingredients.map((ing) => `${ing.qty ?? ''} ${ing.unit ?? ''} ${ing.name ?? ''}`.trim()),
      tags: r.tags,
      description: r.notes || null,
      cookbook: book?.title,
      rating: r.rating || null,
      times_cooked: history.length,
      last_cooked: last
    };
  });
}