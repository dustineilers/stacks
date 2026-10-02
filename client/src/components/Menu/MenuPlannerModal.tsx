import { useState } from 'react';
import { Overlay } from '../common/Overlay';
import { CookingLoader } from '../Recipes/CookingLoader';
import { planMenu } from '../../utils/menuPlanner';
import type { MenuCourse, RecipeEntry } from '../../types';

interface MenuPlannerModalProps {
  show: boolean;
  entries: RecipeEntry[];
  onClose: () => void;
  onOpenRecipe: (id: string) => void;
  onAddMenuToPlan: (recipeIds: string[]) => Promise<void>;
}

export function MenuPlannerModal({ show, entries, onClose, onOpenRecipe, onAddMenuToPlan }: MenuPlannerModalProps) {
  const [occasion, setOccasion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<string | null>(null);
  const [courses, setCourses] = useState<MenuCourse[]>([]);
  const [adding, setAdding] = useState(false);

  const run = async () => {
    if (!occasion.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await planMenu(occasion.trim(), entries);
      setTheme(result.theme);
      setCourses(result.courses);
    } catch (err: any) {
      setError(err.message || 'Could not plan a menu.');
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    onClose();
  };

  const inCollectionIds = courses.filter((c) => c.in_collection && c.recipe_id).map((c) => c.recipe_id as string);

  const addWholeMenu = async () => {
    if (!inCollectionIds.length) return;
    setAdding(true);
    try {
      await onAddMenuToPlan(inCollectionIds);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Overlay show={show} onClose={close} modalStyle={{ width: 'min(620px,100%)' }}>
      <h2 style={{ marginTop: 0 }}>Plan a menu</h2>
      <p className="hint" style={{ marginBottom: 14 }}>
        Describe the occasion however you'd actually say it \u2014 "mid-autumn dinner party," "casual Sunday lunch for four," "birthday dinner, something impressive." Stacks pulls a full menu from across your whole shelf.
      </p>

      <div className="field">
        <textarea
          rows={2}
          placeholder="What's the occasion?"
          value={occasion}
          onChange={(e) => setOccasion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); } }}
        />
      </div>

      <div className="modal-actions" style={{ marginTop: 0 }}>
        <button type="button" className="btn" onClick={close}>Close</button>
        <button type="button" className="btn primary" onClick={run} disabled={loading || !occasion.trim()}>
          {loading ? 'Planning...' : 'Plan the menu'}
        </button>
      </div>

      {error && <p className="hint" style={{ color: 'var(--spine-red)', marginTop: 12 }}>{error}</p>}

      {loading && <CookingLoader label="Working through courses..." />}

      {!loading && theme && (
        <>
          <p style={{ fontSize: 14, lineHeight: 1.55, margin: '18px 0 4px' }}>{theme}</p>

          <ul className="ing-list" style={{ marginTop: 10 }}>
            {courses.map((c, i) => (
              <li key={i} style={{ display: 'block', padding: '10px 0', cursor: c.in_collection && c.recipe_id ? 'pointer' : 'default' }}
                onClick={() => c.in_collection && c.recipe_id && onOpenRecipe(c.recipe_id)}>
                <span className="tag" style={{ marginRight: 8 }}>{c.course}</span>
                <b style={{ fontFamily: "'Fraunces',serif" }}>{c.name}</b>
                {!c.in_collection && <span className="tag" style={{ marginLeft: 8, background: 'var(--bg-alt)' }}>Not in your collection</span>}
                <div className="coverage-note">{c.reason}</div>
              </li>
            ))}
          </ul>

          {inCollectionIds.length > 0 && (
            <div className="modal-actions" style={{ marginTop: 14 }}>
              <button type="button" className="btn primary" onClick={addWholeMenu} disabled={adding}>
                {adding ? 'Adding...' : `Add ${inCollectionIds.length} recipe${inCollectionIds.length === 1 ? '' : 's'} to this week`}
              </button>
            </div>
          )}
        </>
      )}
    </Overlay>
  );
}