import { Overlay } from '../common/Overlay';
import { starStr } from '../../utils/stars';
import { fmtDate, relDays } from '../../utils/dates';
import { avgSessionRating, cookCount, effectiveRating, lastCooked } from '../../utils/recipeStats';
import type { Cookbook, MealPlanEntry, Recipe } from '../../types';

interface RecipeViewModalProps {
  show: boolean;
  recipe: Recipe | null;
  book: Cookbook | null;
  planEntries: MealPlanEntry[];
  onClose: () => void;
  onCook: () => void;
  onAddToPlan: () => void;
  onAddToGrocery: () => void;
  onEdit: () => void;
  onToggleFlag: (flag: 'favorite' | 'wantToTry') => void;
  onDeleteSession: (sessionId: string) => void;
  onDeleteRecipe: () => void;
}

export function RecipeViewModal({
  show, recipe: r, book: b, planEntries, onClose, onCook, onAddToPlan, onAddToGrocery,
  onEdit, onToggleFlag, onDeleteSession, onDeleteRecipe
}: RecipeViewModalProps) {
  if (!r) return <Overlay show={show} onClose={onClose}><div /></Overlay>;

  const count = cookCount(r);
  const avg = avgSessionRating(r);
  const last = lastCooked(r);
  const rating = effectiveRating(r);
  const planned = planEntries.filter((e) => e.recipeId === r.id).length > 0;
  const history = r.cookingHistory.slice().sort((a, c) => c.date.localeCompare(a.date));

  const sub = [
    b ? `${b.title}${b.author ? ' \u00b7 ' + b.author : ''}` : 'Standalone recipe',
    r.page ? `Page ${r.page}` : '',
    r.servings ? `${r.servings} servings` : ''
  ].filter(Boolean).join(' \u00b7 ');

  return (
    <Overlay show={show} onClose={onClose}>
      {r.image && <img className="rv-photo" src={r.image} alt="" />}
      <h2 className="rv-title">{r.name}</h2>
      <div className="rv-sub">{sub}</div>
      {rating > 0 && <div style={{ color: 'var(--accent)', marginTop: 5 }}>{starStr(rating)}</div>}
      {r.tags.length > 0 && <div className="tag-row">{r.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>}

      <div className="rv-actions">
        <button type="button" className="btn primary" onClick={onCook}>Cook this</button>
        <button type="button" className="btn" onClick={onAddToPlan}>Add to this week</button>
        <button type="button" className="btn" onClick={onAddToGrocery}>Add to grocery list</button>
        <button type="button" className="btn" onClick={onEdit}>Edit</button>
      </div>
      <div className="rv-actions" style={{ marginTop: 0 }}>
        <button type="button" className={`flagbtn${r.favorite ? ' on' : ''}`} onClick={() => onToggleFlag('favorite')}>
          {'\u2665'} {r.favorite ? 'Favorite' : 'Mark favorite'}
        </button>
        <button type="button" className={`flagbtn want${r.wantToTry ? ' on' : ''}`} onClick={() => onToggleFlag('wantToTry')}>
          {'\u2691'} {r.wantToTry ? 'On the want list' : 'Want to try'}
        </button>
      </div>
      {planned && <p className="hint" style={{ marginTop: 8 }}>On this week's plan.</p>}

      <div className="rv-sec">
        <div className="rv-stats">
          <div className="rv-stat"><b>{count}</b><span>times cooked</span></div>
          <div className="rv-stat"><b>{avg ? avg.toFixed(1) + ' \u2605' : '\u2014'}</b><span>average session</span></div>
          <div className="rv-stat"><b>{last ? relDays(last) : 'never'}</b><span>last cooked</span></div>
        </div>
      </div>

      {r.notes && <div className="rv-sec"><h3>Notes</h3><p style={{ fontSize: 13.5, lineHeight: 1.55, margin: 0 }}>{r.notes}</p></div>}

      <div className="rv-sec">
        <h3>Ingredients</h3>
        {r.ingredients.length ? (
          <ul className="ing-list">
            {r.ingredients.map((i) => (
              <li key={i.id}>
                <span className="ing-q">{[i.qty, i.unit].filter(Boolean).join(' ')}</span>
                <span>{i.name}{i.note ? <span className="ing-note"> {i.note}</span> : null}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-inline">No ingredients yet — <button type="button" className="btn small" onClick={onEdit}>add some</button> and they can go straight to your grocery list.</p>
        )}
      </div>

      <div className="rv-sec">
        <h3>Cooking history</h3>
        {history.length ? history.map((sn) => (
          <div className="session" key={sn.id}>
            <div className="session-top">
              <span className="session-date">{fmtDate(sn.date)}</span>
              {sn.rating > 0 && <span className="session-stars">{starStr(sn.rating)}</span>}
              {sn.wouldMakeAgain === false && <span className="tag">Wouldn't repeat</span>}
              <button className="session-del" onClick={() => onDeleteSession(sn.id)} title="Delete this session">{'\u2715'}</button>
            </div>
            {sn.notes && <div className="session-notes">{sn.notes}</div>}
          </div>
        )) : <p className="empty-inline">Not cooked yet. Hit <b>Cook this</b> after dinner to start the record.</p>}
      </div>

      <div className="modal-actions">
        <button type="button" className="btn danger" onClick={onDeleteRecipe}>Delete recipe</button>
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
    </Overlay>
  );
}
