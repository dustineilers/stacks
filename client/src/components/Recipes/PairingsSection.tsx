import { useState } from 'react';
import { CookingLoader } from './CookingLoader';
import { fetchPairings } from '../../utils/Recipepairing';
import type { RecipeEntry, RecipePairing } from '../../types';

interface PairingsSectionProps {
  recipeId: string;
  entries: RecipeEntry[];
  onOpenRecipe: (id: string) => void;
}

/** "Pairs well with" — an on-demand AI search across the whole collection
 *  (every cookbook, not just this recipe's book) for what would make a great
 *  meal alongside the recipe currently open. Self-contained: drop
 *  <PairingsSection recipeId={r.id} entries={entries} onOpenRecipe={...} />
 *  anywhere in RecipeViewModal's body. */
export function PairingsSection({ recipeId, entries, onOpenRecipe }: PairingsSectionProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pairings, setPairings] = useState<RecipePairing[] | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchPairings(recipeId, entries);
      setPairings(result.pairings);
    } catch (err: any) {
      setError(err.message || 'Could not find pairings.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rv-sec">
      <h3>Pairs well with</h3>

      {!pairings && !loading && !error && (
        <button type="button" className="btn small" onClick={run}>Find pairings across your shelf</button>
      )}

      {loading && <CookingLoader label="Looking across your whole shelf..." />}

      {error && (
        <>
          <p className="hint" style={{ color: 'var(--spine-red)' }}>{error}</p>
          <button type="button" className="btn small" onClick={run}>Try again</button>
        </>
      )}

      {pairings && !loading && (
        pairings.length === 0 ? (
          <p className="empty-inline">Nothing jumped out as a strong pairing \u2014 your shelf might not have the right fit for this one yet.</p>
        ) : (
          <ul className="ing-list">
            {pairings.map((p) => {
              const entry = entries.find((e) => e.recipe.id === p.recipe_id);
              return (
                <li key={p.recipe_id} style={{ display: 'block', padding: '9px 0', cursor: entry ? 'pointer' : 'default' }}
                  onClick={() => entry && onOpenRecipe(p.recipe_id)}>
                  <span className="tag" style={{ marginRight: 8 }}>{p.role}</span>
                  <b style={{ fontFamily: "'Fraunces',serif" }}>{p.name}</b>
                  <div className="coverage-note">{p.reason}</div>
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
}