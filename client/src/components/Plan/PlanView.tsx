import type { MealPlan, RecipeEntry } from '../../types';
import { mondayOf } from '../../utils/dates';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface PlanViewProps {
  plan: MealPlan;
  getEntry: (recipeId: string) => RecipeEntry | null;
  onOpenRecipe: (id: string) => void;
  onCook: (entryId: string, recipeId: string) => void;
  onRemove: (entryId: string) => void;
  onSetDay: (entryId: string, day: number | null) => void;
  onStartNewWeek: () => void;
  onSendToGrocery: () => void;
  onBrowseRecipes: () => void;
}

function weekLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T12:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const f = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${f(start)} \u2013 ${f(end)}`;
}

export function PlanView({ plan, getEntry, onOpenRecipe, onCook, onRemove, onSetDay, onStartNewWeek, onSendToGrocery, onBrowseRecipes }: PlanViewProps) {
  const rows = plan.entries.map((e) => ({ e, entry: getEntry(e.recipeId) })).filter((x): x is { e: typeof plan.entries[number]; entry: RecipeEntry } => !!x.entry);
  const planned = rows.length;
  const cooked = rows.filter((x) => x.e.cooked).length;
  const isCurrentWeek = plan.weekStart === mondayOf(new Date());
  const todayIdx = (new Date().getDay() + 6) % 7;
  const unassigned = rows.filter((x) => x.e.day == null);

  const card = ({ e, entry }: { e: typeof plan.entries[number]; entry: RecipeEntry }) => (
    <div key={e.id} className={`plan-card${e.cooked ? ' cooked' : ''}`} onClick={() => onOpenRecipe(entry.recipe.id)}>
      <b>{entry.recipe.name}</b>
      <span className="pc-book">{entry.book ? entry.book.title : 'Standalone'}</span>
      <div className="plan-row" onClick={(ev) => ev.stopPropagation()}>
        {e.cooked
          ? <span className="pc-book">Cooked {'\u2713'}</span>
          : <button onClick={() => onCook(e.id, entry.recipe.id)}>Cook</button>}
        <button onClick={() => onRemove(e.id)}>Remove</button>
      </div>
    </div>
  );

  return (
    <div className="plan-wrap">
      <div className="plan-head">
        <div>
          <h2>This week</h2>
          <div className="sub">
            {weekLabel(plan.weekStart)}
            {planned ? ` \u00b7 ${planned} meal${planned === 1 ? '' : 's'} planned${cooked ? `, ${cooked} cooked` : ''}` : ''}
            {isCurrentWeek ? '' : ' \u00b7 from a previous week'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {planned > 0 && <button type="button" className="btn small" onClick={onSendToGrocery}>Send ingredients to grocery</button>}
          <button type="button" className="btn small" onClick={onStartNewWeek}>Start a new week</button>
        </div>
      </div>

      {planned === 0 ? (
        <div className="plan-day" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p className="plan-empty">Nothing planned yet. Open a recipe and choose <b>Add to this week</b> — its ingredients go onto your grocery list at the same time.</p>
          <div style={{ marginTop: 12 }}><button type="button" className="btn primary" onClick={onBrowseRecipes}>Browse recipes</button></div>
        </div>
      ) : (
        <>
          <div className="plan-grid">
            {DAY_NAMES.map((name, i) => {
              const dayItems = rows.filter((x) => x.e.day === i);
              return (
                <div key={name} className={`plan-day${isCurrentWeek && i === todayIdx ? ' today' : ''}`}>
                  <h3><span>{name}</span></h3>
                  {dayItems.length ? dayItems.map(card) : <p className="plan-empty">{'\u2014'}</p>}
                </div>
              );
            })}
          </div>

          {unassigned.length > 0 && (
            <div className="plan-unassigned">
              <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-soft)' }}>Any day this week</h3>
              <div className="plan-grid">
                {unassigned.map((x) => (
                  <div key={x.e.id} className="plan-day">
                    {card(x)}
                    <select onChange={(e) => onSetDay(x.e.id, e.target.value === '' ? null : Number(e.target.value))} style={{ fontSize: 12, padding: 5 }} defaultValue="">
                      <option value="">Pick a day...</option>
                      {DAY_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
