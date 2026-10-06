import { aiEndpoint, buildRecipeCatalog } from './aiCatalog';
import type { RecipeEntry } from '../types';

export interface FilledSlotContext {
  course: string;
  name: string;
}

export interface EmptySlot {
  slotId: string;
  course: string;
}

export interface SlotFillResult {
  slotId: string;
  recipeId: string | null;
  name: string;
  reason: string;
  inCollection: boolean;
}

export async function fillMenuSlots(
  context: string,
  entries: RecipeEntry[],
  filledSlots: FilledSlotContext[],
  emptySlots: EmptySlot[]
): Promise<SlotFillResult[]> {
  const res = await fetch(aiEndpoint('/api/menu/fill-slots'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context,
      recipes: buildRecipeCatalog(entries),
      filled_slots: filledSlots.map((s) => ({ course: s.course, name: s.name })),
      empty_slots: emptySlots.map((s) => ({ slot_id: s.slotId, course: s.course }))
    })
  });

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).detail || ''; } catch { /* ignore */ }
    throw new Error(`Menu suggestions failed (HTTP ${res.status})${detail ? ': ' + detail : ''}`);
  }

  const data = await res.json();
  if (!data.success) throw new Error('Menu suggestions failed.');
  return (data.fills || []).map((f: any) => ({
    slotId: f.slot_id,
    recipeId: f.recipe_id ?? null,
    name: f.name,
    reason: f.reason,
    inCollection: !!f.in_collection
  }));
}
