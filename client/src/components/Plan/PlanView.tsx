import { useCallback, useRef, useState } from 'react';
import type { MealPlan, MealPlanEntry, RecipeEntry } from '../../types';
import { mondayOf } from '../../utils/dates';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const BEYOND_DAY = -1; // sentinel: "beyond this week" — survives "Start a new week"

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
  onOpenCalendar: () => void;
}

function weekLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T12:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const f = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${f(start)} \u2013 ${f(end)}`;
}

type Row = { e: MealPlanEntry; entry: RecipeEntry };
type DropZone = number | 'unassigned' | 'beyond';

export function PlanView({
  plan, getEntry, onOpenRecipe, onCook, onRemove, onSetDay, onStartNewWeek, onSendToGrocery, onBrowseRecipes, onOpenCalendar
}: PlanViewProps) {
  const rows: Row[] = plan.entries
    .map((e) => ({ e, entry: getEntry(e.recipeId) }))
    .filter((x): x is Row => !!x.entry);

  const thisWeekRows = rows.filter((r) => r.e.day !== BEYOND_DAY);
  const beyondRows = rows.filter((r) => r.e.day === BEYOND_DAY);

  const planned = thisWeekRows.length;
  const cooked = thisWeekRows.filter((r) => r.e.cooked).length;
  const isCurrentWeek = plan.weekStart === mondayOf(new Date());
  const todayIdx = (new Date().getDay() + 6) % 7;
  const unassigned = thisWeekRows.filter((r) => r.e.day == null);

  // ---------------- drag and drop (pointer events: works for mouse + touch) ----------------
  const ghostRef = useRef<HTMLDivElement>(null);
  const dragEntryRef = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverZone, setHoverZone] = useState<DropZone | null>(null);

  const moveGhost = (x: number, y: number) => {
    if (ghostRef.current) ghostRef.current.style.transform = `translate(${x + 14}px, ${y + 10}px)`;
  };

  const zoneFromPoint = (x: number, y: number): DropZone | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const zoneEl = el?.closest<HTMLElement>('[data-dropzone]');
    const raw = zoneEl?.dataset.dropzone;
    if (raw == null) return null;
    if (raw === 'unassigned' || raw === 'beyond') return raw;
    return Number(raw);
  };

  const handlePointerMove = useCallback((e: PointerEvent) => {
    moveGhost(e.clientX, e.clientY);
    setHoverZone(zoneFromPoint(e.clientX, e.clientY));
  }, []);

  const handlePointerUp = useCallback((e: PointerEvent) => {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    const zone = zoneFromPoint(e.clientX, e.clientY);
    const entryId = dragEntryRef.current;
    dragEntryRef.current = null;
    setDraggingId(null);
    setHoverZone(null);
    if (!entryId || zone == null) return;
    const day = zone === 'unassigned' ? null : zone === 'beyond' ? BEYOND_DAY : zone;
    onSetDay(entryId, day);
  }, [handlePointerMove, onSetDay]);

  const startDrag = (e: React.PointerEvent, entryId: string) => {
    e.preventDefault();
    e.stopPropagation();
    dragEntryRef.current = entryId;
    setDraggingId(entryId);
    moveGhost(e.clientX, e.clientY);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const draggedName = draggingId ? rows.find((r) => r.e.id === draggingId)?.entry.recipe.name : null;

  // ---------------- rendering ----------------

  const card = ({ e, entry }: Row, withDayPicker: boolean) => (
    <div key={e.id} className={`plan-card${e.cooked ? ' cooked' : ''}${draggingId === e.id ? ' dragging' : ''}`} onClick={() => onOpenRecipe(entry.recipe.id)}>
      <div className="plan-card-top">
        <span className="plan-drag-handle" title="Drag to a day" style={{ touchAction: 'none' }}
          onClick={(ev) => ev.stopPropagation()} onPointerDown={(ev) => startDrag(ev, e.id)}>{'\u22ee\u22ee'}</span>
        <b>{entry.recipe.name}</b>
      </div>
      <span className="pc-book">{entry.book ? entry.book.title : 'Standalone'}</span>
      <div className="plan-row" onClick={(ev) => ev.stopPropagation()}>
        {e.cooked
          ? <span className="pc-book">Cooked {'\u2713'}</span>
          : <button onClick={() => onCook(e.id, entry.recipe.id)}>Cook</button>}
        <button onClick={() => onRemove(e.id)}>Remove</button>
      </div>
      {withDayPicker && (
        <select onChange={(ev) => onSetDay(e.id, ev.target.value === '' ? null : Number(ev.target.value))} style={{ fontSize: 12, padding: 5, marginTop: 6 }} defaultValue="">
          <option value="" disabled>Move to...</option>
          {DAY_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
          <option value="">Any day this week</option>
          <option value={BEYOND_DAY}>Beyond this week</option>
        </select>
      )}
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
          <button type="button" className="btn small" onClick={onOpenCalendar}>Open calendar</button>
          <button type="button" className="btn small" onClick={onStartNewWeek}>Start a new week</button>
        </div>
      </div>

      {planned === 0 && beyondRows.length === 0 ? (
        <div className="plan-day" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p className="plan-empty">Nothing planned yet. Open a recipe and choose <b>Add to this week</b> — its ingredients go onto your grocery list at the same time.</p>
          <div style={{ marginTop: 12 }}><button type="button" className="btn primary" onClick={onBrowseRecipes}>Browse recipes</button></div>
        </div>
      ) : (
        <>
          <div className="week-grid">
            {DAY_NAMES.map((name, i) => {
              const dayItems = thisWeekRows.filter((r) => r.e.day === i);
              return (
                <div key={name} className={`plan-day${isCurrentWeek && i === todayIdx ? ' today' : ''}${hoverZone === i ? ' drop-hover' : ''}`} data-dropzone={i}>
                  <h3><span>{name}</span></h3>
                  {dayItems.length ? dayItems.map((r) => card(r, false)) : <p className="plan-empty">{'\u2014'}</p>}
                </div>
              );
            })}
          </div>

          <div className="plan-unassigned">
            <h3 className="plan-section-label">Any day this week</h3>
            <div className={`plan-grid dropzone-area${hoverZone === 'unassigned' ? ' drop-hover' : ''}`} data-dropzone="unassigned">
              {unassigned.length
                ? unassigned.map((r) => (
                    <div key={r.e.id} className="plan-day">{card(r, true)}</div>
                  ))
                : <p className="plan-empty" style={{ padding: '10px 2px' }}>Drag a card here, or leave it flexible for later in the week.</p>}
            </div>
          </div>

          <div className="plan-unassigned">
            <h3 className="plan-section-label">Beyond this week</h3>
            <p className="hint" style={{ margin: '0 0 8px' }}>Recipes you want to get to eventually — these stick around even after you start a new week.</p>
            <div className={`plan-grid dropzone-area${hoverZone === 'beyond' ? ' drop-hover' : ''}`} data-dropzone="beyond">
              {beyondRows.length
                ? beyondRows.map((r) => (
                    <div key={r.e.id} className="plan-day">{card(r, true)}</div>
                  ))
                : <p className="plan-empty" style={{ padding: '10px 2px' }}>Nothing queued up. Drag a card here, or pick "Beyond this week" from a card's menu.</p>}
            </div>
          </div>
        </>
      )}

      {draggingId && (
        <div ref={ghostRef} className="drag-ghost" style={{ position: 'fixed', left: 0, top: 0, zIndex: 999, pointerEvents: 'none' }}>
          {draggedName}
        </div>
      )}
    </div>
  );
}