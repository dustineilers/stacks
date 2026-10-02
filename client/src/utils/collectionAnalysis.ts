import { cookCount } from './recipeStats';
import type { Cookbook, Recipe, CollectionAnalysis } from '../types';

const ANALYSIS_ENDPOINT = `${window.location.protocol}//${window.location.hostname}:8000/api/analyze/collection`;

export async function analyzeCollection(books: Cookbook[], standaloneRecipes: Recipe[]): Promise<CollectionAnalysis> {
  const cookbooks = books.map((b) => ({
    id: b.id,
    title: b.title,
    author: b.author || null,
    cuisine: b.cuisine || null,
    status: b.status,
    recipe_count: b.recipes.length
  }));

  const allEntries = [
    ...books.flatMap((b) => b.recipes.map((r) => ({ recipe: r, cookbook: b.title }))),
    ...standaloneRecipes.map((r) => ({ recipe: r, cookbook: null as string | null }))
  ];

  const recipes = allEntries.map(({ recipe: r, cookbook }) => ({
    id: r.id,
    name: r.name,
    cookbook,
    tags: r.tags,
    ingredient_names: r.ingredients.map((i) => i.name),
    rating: r.rating || null,
    times_cooked: cookCount(r),
    favorite: r.favorite,
    want_to_try: r.wantToTry
  }));

  const res = await fetch(ANALYSIS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookbooks, recipes })
  });

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).detail || ''; } catch { /* ignore */ }
    throw new Error(`Analysis failed (HTTP ${res.status})${detail ? ': ' + detail : ''}`);
  }

  const data = await res.json();
  if (!data.success) throw new Error('Analysis failed.');
  return data as CollectionAnalysis;
}