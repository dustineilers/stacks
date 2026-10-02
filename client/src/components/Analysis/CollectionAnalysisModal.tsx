import { useState } from 'react';
import { Overlay } from '../common/Overlay';
import { CookingLoader } from '../Recipes/CookingLoader';
import { analyzeCollection } from '../../utils/collectionAnalysis';
import type { Cookbook, CollectionAnalysis, CoverageItem, Recipe } from '../../types';

interface CollectionAnalysisModalProps {
  show: boolean;
  books: Cookbook[];
  standaloneRecipes: Recipe[];
  onClose: () => void;
}

const STATUS_ORDER: CoverageItem['status'][] = ['missing', 'some', 'strong'];
const STATUS_LABEL: Record<CoverageItem['status'], string> = { missing: 'Missing', some: 'Some coverage', strong: 'Well covered' };

function CoverageGroup({ title, items }: { title: string; items: CoverageItem[] }) {
  if (!items.length) return null;
  return (
    <div className="rv-sec">
      <h3>{title}</h3>
      {STATUS_ORDER.map((status) => {
        const rows = items.filter((i) => i.status === status);
        if (!rows.length) return null;
        return (
          <div key={status} style={{ marginBottom: 10 }}>
            <div className={`coverage-status ${status}`}>{STATUS_LABEL[status]}</div>
            {rows.map((r) => (
              <div key={r.name} className="coverage-row">
                <b>{r.name}</b>
                <span className="coverage-note">{r.note}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function CollectionAnalysisModal({ show, books, standaloneRecipes, onClose }: CollectionAnalysisModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CollectionAnalysis | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const analysis = await analyzeCollection(books, standaloneRecipes);
      setResult(analysis);
    } catch (err: any) {
      setError(err.message || 'Analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    onClose();
  };

  const totalRecipes = books.reduce((n, b) => n + b.recipes.length, 0) + standaloneRecipes.length;

  return (
    <Overlay show={show} onClose={close} modalStyle={{ width: 'min(640px,100%)' }}>
      <h2 style={{ marginTop: 0 }}>Your collection, mapped</h2>

      {!result && !loading && (
        <>
          <p className="hint" style={{ marginBottom: 16 }}>
            Looks across all {books.length} cookbook{books.length === 1 ? '' : 's'} and {totalRecipes} recipe{totalRecipes === 1 ? '' : 's'}
            {' '}to find real gaps in cuisines, meal types, and techniques and what specifically would fill them.
          </p>
          <div className="modal-actions" style={{ marginTop: 0 }}>
            <button type="button" className="btn" onClick={close}>Not now</button>
            <button type="button" className="btn primary" onClick={run}>Analyze my collection</button>
          </div>
        </>
      )}

      {loading && <CookingLoader label="Reading through your whole shelf..." />}

      {error && (
        <>
          <p className="hint" style={{ color: 'var(--spine-red)' }}>{error}</p>
          <div className="modal-actions" style={{ marginTop: 0 }}>
            <button type="button" className="btn" onClick={close}>Close</button>
            <button type="button" className="btn primary" onClick={run}>Try again</button>
          </div>
        </>
      )}

      {result && !loading && (
        <>
          <p style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 4 }}>{result.summary}</p>

          <CoverageGroup title="Cuisines" items={result.cuisines} />
          <CoverageGroup title="Meal types" items={result.meal_types} />
          <CoverageGroup title="Techniques" items={result.techniques} />

          {result.recipe_suggestions.length > 0 && (
            <div className="rv-sec">
              <h3>Recipes worth trying</h3>
              <ul className="ing-list">
                {result.recipe_suggestions.map((s, i) => (
                  <li key={i} style={{ display: 'block', padding: '8px 0' }}>
                    <div style={{ fontFamily: "'Fraunces',serif", fontWeight: 600, fontSize: 14 }}>
                      {s.name}{s.cuisine ? <span className="tag" style={{ marginLeft: 8 }}>{s.cuisine}</span> : null}
                    </div>
                    <div className="coverage-note">{s.reason}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.book_recommendations.length > 0 && (
            <div className="rv-sec">
              <h3>Cookbooks that would fill the gaps</h3>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))' }}>
                {result.book_recommendations.map((b, i) => (
                  <div key={i} className="web-recipe-card" style={{ cursor: 'default' }}>
                    <span className="src-label">{b.fills_gap}</span>
                    <h4>{b.title}</h4>
                    {b.author && <p style={{ fontStyle: 'italic', marginBottom: 6 }}>{b.author}</p>}
                    <p>{b.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn" onClick={close}>Close</button>
            <button type="button" className="btn primary" onClick={run}>Re-analyze</button>
          </div>
        </>
      )}
    </Overlay>
  );
}