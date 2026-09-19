import { useMemo } from 'react';
import { RecipeCard, planCountFor } from './RecipeCard';
import { filterAndSortRecipeEntries, activeRecipeFilterCount } from '../../utils/recipeFilters';
import { relDays } from '../../utils/dates';
import { starStr } from '../../utils/stars';
import type { MealPlanEntry, RecipeEntry, RecipeFilters } from '../../types';

interface RecipesViewProps {
  entries: RecipeEntry[];
  filters: RecipeFilters;
  searchTerm: string;
  planEntries: MealPlanEntry[];
  onOpenRecipe: (id: string) => void;
  onCookRecipe: (id: string) => void;
  onPlanRecipe: (id: string) => void;
  onClearFilters: () => void;
  onAddRecipe: () => void;
}

export function RecipesView({
  entries, filters, searchTerm, planEntries,
  onOpenRecipe, onCookRecipe, onPlanRecipe, onClearFilters, onAddRecipe
}: RecipesViewProps) {
  const filtered = useMemo(() => filterAndSortRecipeEntries(entries, filters, searchTerm), [entries, filters, searchTerm]);
  const activeCount = activeRecipeFilterCount(filters, searchTerm);

  const recentlyCooked = useMemo(() => {
    const rows: { entry: RecipeEntry; date: string; rating: number }[] = [];
    entries.forEach((entry) => entry.recipe.cookingHistory.forEach((sn) => rows.push({ entry, date: sn.date, rating: sn.rating })));
    rows.sort((a, b) => b.date.localeCompare(a.date));
    return rows.slice(0, 8);
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div id="recipesView">
        <div className="recipe-cards" />
        <div className="recipes-tab-empty" style={{ display: 'flex' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4}>
            <path d="M8 3v7a3 3 0 0 0 6 0V3" /><path d="M11 10v11" /><path d="M18 3c-1.5 1-2 3-2 5s1 4 2 5 2-1 2-3-.5-6-2-7Z" />
          </svg>
          <h2>No recipes yet</h2>
          <p>Log recipes from your cookbooks, or add ones you found online that don't belong to any book. Tag them, cook them, and Stacks keeps the record.</p>
          <button className="btn primary" onClick={onAddRecipe}>Add a recipe</button>
        </div>
      </div>
    );
  }

  return (
    <div id="recipesView">
      <div className="recipes-top">
        {activeCount === 0 && recentlyCooked.length > 0 && (
          <div className="recently-cooked">
            <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-soft)', margin: '0 0 8px' }}>Recently cooked</h3>
            <div className="rc-strip">
              {recentlyCooked.map(({ entry, date, rating }, i) => (
                <div key={i} className="rc-chip" onClick={() => onOpenRecipe(entry.recipe.id)}>
                  <span className="rc-when">{relDays(date)}</span>
                  <b>{entry.recipe.name}</b>
                  {rating > 0 && <span style={{ color: 'var(--accent)' }}>{starStr(rating)}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="result-line" style={{ textAlign: 'left', marginTop: activeCount === 0 ? 10 : 0 }}>
          {filtered.length} recipe{filtered.length === 1 ? '' : 's'}
          {activeCount ? <> {'\u00b7'} {activeCount} filter{activeCount === 1 ? '' : 's'} active {'\u00b7'} <button type="button" onClick={onClearFilters}>clear</button></> : null}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="muted" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 0' }}>
          No recipes match these filters. <button type="button" className="btn small" onClick={onClearFilters}>Clear filters</button>
        </p>
      ) : (
        <div className="recipe-cards">
          {filtered.map(({ recipe, book }) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              book={book}
              planned={planCountFor(recipe.id, planEntries) > 0}
              onOpen={() => onOpenRecipe(recipe.id)}
              onCook={() => onCookRecipe(recipe.id)}
              onPlan={() => onPlanRecipe(recipe.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
