import { aiEndpoint, buildRecipeCatalog } from './aiCatalog';
import type { MenuCourse, RecipeEntry } from '../types';

export interface MenuPlanResult {
  theme: string;
  courses: MenuCourse[];
}

export async function planMenu(occasion: string, entries: RecipeEntry[]): Promise<MenuPlanResult> {
  const res = await fetch(aiEndpoint('/api/menu/plan'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ occasion, recipes: buildRecipeCatalog(entries) })
  });

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).detail || ''; } catch { /* ignore */ }
    throw new Error(`Menu planning failed (HTTP ${res.status})${detail ? ': ' + detail : ''}`);
  }

  const data = await res.json();
  if (!data.success) throw new Error('Menu planning failed.');
  return { theme: data.theme, courses: data.courses };
}