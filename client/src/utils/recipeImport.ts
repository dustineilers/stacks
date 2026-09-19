export interface RecipeImportDraft {
  name: string;
  author: string;
  notes: string;
  image: string;
  servings: string;
  sourceUrl: string;
  ingredientsText: string;
  instructionsText: string;
}

export async function fetchRecipeFromUrl(url: string): Promise<RecipeImportDraft> {
  const res = await fetch('http://localhost:8000/api/import/recipe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  if (!res.ok) throw new Error(`Import failed (HTTP ${res.status})`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Import failed');

  const r = data.recipe;
  const ingredientsText = (r.ingredients || [])
    .map((i: any) => i.raw || [i.quantity, i.unit, i.name].filter(Boolean).join(' '))
    .join('\n');
  const instructionsText = (r.instructions || [])
    .map((s: any) => s.text || s)
    .join('\n');

  return {
    name: r.name || '',
    author: r.author || '',
    notes: r.description || '',
    image: r.image || '',
    servings: (r.yield_text || '').replace(/[^\d]/g, '') || r.yield_text || '',
    sourceUrl: r.source_url || url,
    ingredientsText,
    instructionsText
  };
}