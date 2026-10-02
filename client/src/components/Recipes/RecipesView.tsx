import { useMemo } from 'react';
import { RecipeCard, planCountFor } from './RecipeCard';
import { CookingLoader } from './CookingLoader';
import { filterAndSortRecipeEntries, activeRecipeFilterCount } from '../../utils/recipeFilters';
import { relDays } from '../../utils/dates';
import { starStr } from '../../utils/stars';
import { colorFor } from '../../utils/colors';
import type { MealPlanEntry, RecipeEntry, RecipeFilters, AIRecipeSearchResult, WebSearchResult } from '../../types';

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

  aiMode: boolean;
  aiLoading: boolean;
  aiError: string | null;
  aiQuery: string;
  aiResults?: AIRecipeSearchResult[];
  webResults?: WebSearchResult[];
  onExitAiMode: () => void;
  onImportRecipe?: (url: string) => void;
}

export function RecipesView({
  entries = [],
  filters,
  searchTerm = '',
  planEntries = [],
  onOpenRecipe,
  onCookRecipe,
  onPlanRecipe,
  onClearFilters,
  onAddRecipe,
  aiMode = false,
  aiLoading = false,
  aiError = null,
  aiQuery = '',
  aiResults = [],
  webResults = [],
  onExitAiMode,
  onImportRecipe
}: RecipesViewProps) {
  const safeAiResults = Array.isArray(aiResults) ? aiResults : [];
  const safeWebResults = Array.isArray(webResults) ? webResults : [];
  const safeEntries = Array.isArray(entries) ? entries : [];

  const filtered = useMemo(
    () => filterAndSortRecipeEntries(safeEntries, filters, searchTerm),
    [safeEntries, filters, searchTerm]
  );
  const activeCount = activeRecipeFilterCount(filters, searchTerm);

  const recentlyCooked = useMemo(() => {
    const rows: { entry: RecipeEntry; date: string; rating: number }[] = [];
    safeEntries.forEach((entry) => {
      if (entry?.recipe?.cookingHistory) {
        entry.recipe.cookingHistory.forEach((sn) =>
          rows.push({ entry, date: sn.date, rating: sn.rating })
        );
      }
    });
    rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return rows.slice(0, 8);
  }, [safeEntries]);

  const handleImportClick = (url: string) => {
    if (onImportRecipe) {
      onImportRecipe(url);
    } else {
      onAddRecipe();
    }
  };

  if (safeEntries.length === 0 && !aiMode) {
    return (
      <div id="recipesView">
        <div className="recipe-cards" />
        <div className="recipes-tab-empty" style={{ display: 'flex' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4}>
            <path d="M8 3v7a3 3 0 0 0 6 0V3" /><path d="M11 10v11" /><path d="M18 3c-1.5 1-2 3-2 5s1 4 2 5 2-1 2-3-.5-6-2-7Z" />
          </svg>
          <h2>No recipes yet</h2>
          <p>Log recipes from your cookbooks, or add ones you found online that don't belong to any book. Tag them, cook them, and Stacks keeps the record.</p>
          <button type="button" className="btn primary" onClick={onAddRecipe}>Add a recipe</button>
        </div>
      </div>
    );
  }

  return (
    <div id="recipesView">
      <div className="recipes-top">
        {aiMode && (
          <div className="ai-mode-banner">
            <span className="result-line" style={{ textAlign: 'left' }}>
              {aiLoading ? (
                <>Asking about your recipes...</>
              ) : (
                <>{'\u2728'} {safeAiResults.length} match{safeAiResults.length === 1 ? '' : 'es'} for "<b>{aiQuery}</b>"</>
              )}
            </span>
            <button type="button" onClick={onExitAiMode}>Back to browsing</button>
          </div>
        )}

        {!aiMode && activeCount === 0 && recentlyCooked.length > 0 && (
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

        {!aiMode && (
          <div className="result-line" style={{ textAlign: 'left', marginTop: activeCount === 0 ? 10 : 0 }}>
            {filtered.length} recipe{filtered.length === 1 ? '' : 's'}
            {activeCount ? <> {'\u00b7'} {activeCount} filter{activeCount === 1 ? '' : 's'} active {'\u00b7'} <button type="button" onClick={onClearFilters}>clear</button></> : null}
          </div>
        )}
      </div>

      {aiMode ? (
        aiLoading ? (
          <CookingLoader />
        ) : aiError ? (
          <p className="muted" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--spine-red)' }}>{aiError}</p>
        ) : (
          <>
            {safeAiResults.length === 0 ? (
              <p className="muted" style={{ textAlign: 'center', padding: '40px 0' }}>Nothing in your collection matched that.</p>
            ) : (
              <div className="recipe-cards">
                {safeAiResults.map((result) => {
                  const entry = safeEntries.find((e) => e.recipe.id === result.recipe_id);
                  if (!entry) return null;
                  return (
                    <div key={result.recipe_id}>
                      <RecipeCard
                        recipe={entry.recipe}
                        book={entry.book}
                        planned={planCountFor(entry.recipe.id, planEntries) > 0}
                        onOpen={() => onOpenRecipe(entry.recipe.id)}
                        onCook={() => onCookRecipe(entry.recipe.id)}
                        onPlan={() => onPlanRecipe(entry.recipe.id)}
                      />
                      <div className="ai-reason">{'\u2728'} {result.reason}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {safeWebResults.length > 0 && (
              <div className="web-results-section" style={{ marginTop: 40 }}>
                <h3 style={{ marginBottom: 16, fontSize: 16 }}>Not in your cookbook — from the web</h3>
                <div className="recipe-cards">
                  {safeWebResults.map((item, idx) => (
                    <div key={idx} className="rcard" onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}>
                      <div className="rcard-img">
                        {item.thumbnail ? (
                          <img src={item.thumbnail} alt="" />
                        ) : (
                          <div className="rcard-initial" style={{ background: colorFor(item.title || 'W') }}>
                            {(item.title || '?').trim().charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="card-flags">
                          <span className="card-flag" title="Web Result" style={{ background: 'var(--ink-soft)', color: '#fff' }}>
                            {'\uD83C\uDF10'}
                          </span>
                        </div>
                      </div>
                      <div className="rcard-body">
                        <div className="rcard-name">{item.title}</div>
                        <div className="rcard-book">{item.source || 'Web Recipe'}</div>
                        <div className="rcard-meta" style={{ marginTop: 8, color: 'var(--ink-soft)', fontSize: 12 }}>
                          {item.description}
                        </div>
                      </div>
                      <div className="rcard-actions" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}>
                          View {'\u2192'}
                        </button>
                        <button type="button" onClick={() => handleImportClick(item.url)}>
                          Import
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )
      ) : filtered.length === 0 ? (
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