import { aiEndpoint, buildRecipeCatalog } from './aiCatalog';
import type { RecipeEntry, RecipePairing } from '../types';

export interface PairingResult {
  anchorName: string;
  pairings: RecipePairing[];
}

export async function fetchPairings(anchorRecipeId: string, entries: RecipeEntry[]): Promise<PairingResult> {
  const res = await fetch(aiEndpoint('/api/pair/recipe'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ anchor_recipe_id: anchorRecipeId, recipes: buildRecipeCatalog(entries) })
  });

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).detail || ''; } catch { /* ignore */ }
    throw new Error(`Pairing search failed (HTTP ${res.status})${detail ? ': ' + detail : ''}`);
  }

  const data = await res.json();
  if (!data.success) throw new Error('Pairing search failed.');
  return { anchorName: data.anchor_name, pairings: data.pairings };
}