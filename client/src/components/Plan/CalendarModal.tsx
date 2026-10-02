import { useMemo, useState } from 'react';
import { Overlay } from '../common/Overlay';
import type { CalendarEvent, MealPlanEntry, RecipeEntry } from '../../types';

interface CalendarModalProps {
  show: boolean;
  onClose: () => void;
  entries: RecipeEntry[];
  planEntries: MealPlanEntry[];
  calendarEvents: CalendarEvent[];
  onOpenRecipe: (id: string) => void;
  onScheduleRecipe: (recipeId: string, date: string) => Promise<void>;
  onUnschedule: (entryId: string) => Promise<void>;
  onAddEvent: (date: string, title: string) => Promise<void>;
  onDeleteEvent: (id: string) => Promise<void>;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday = 0
  const gridStart = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

export function CalendarModal({
  show, onClose, entries, planEntries, calendarEvents,
  onOpenRecipe, onScheduleRecipe, onUnschedule, onAddEvent, onDeleteEvent
}: CalendarModalProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [recipeSearch, setRecipeSearch] = useState('');

  const days = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const todayIso = toIso(today);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, MealPlanEntry[]>();
    planEntries.forEach((e) => {
      if (!e.date) return;
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    });
    return map;
  }, [planEntries]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    calendarEvents.forEach((ev) => {
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date)!.push(ev);
    });
    return map;
  }, [calendarEvents]);

  const goPrevMonth = () => {
    const m = viewMonth === 0 ? 11 : viewMonth - 1;
    const y = viewMonth === 0 ? viewYear - 1 : viewYear;
    setViewMonth(m); setViewYear(y);
  };
  const goNextMonth = () => {
    const m = viewMonth === 11 ? 0 : viewMonth + 1;
    const y = viewMonth === 11 ? viewYear + 1 : viewYear;
    setViewMonth(m); setViewYear(y);
  };
  const goToday = () => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); setSelectedDate(todayIso); };

  const recipeMatches = useMemo(() => {
    const q = recipeSearch.trim().toLowerCase();
    if (!q) return [];
    return entries.filter((e) => e.recipe.name.toLowerCase().includes(q)).slice(0, 8);
  }, [recipeSearch, entries]);

  const selectedEntries = selectedDate ? (entriesByDate.get(selectedDate) || []) : [];
  const selectedEvents = selectedDate ? (eventsByDate.get(selectedDate) || []) : [];

  const submitEvent = async () => {
    if (!selectedDate || !eventTitle.trim()) return;
    await onAddEvent(selectedDate, eventTitle.trim());
    setEventTitle('');
  };

  const assignRecipe = async (recipeId: string) => {
    if (!selectedDate) return;
    await onScheduleRecipe(recipeId, selectedDate);
    setRecipeSearch('');
  };

  return (
    <Overlay show={show} onClose={onClose} modalStyle={{ width: 'min(720px,100%)' }}>
      <h2 style={{ marginTop: 0, marginBottom: 4 }}>Calendar</h2>
      <p className="hint" style={{ marginBottom: 16 }}>Plan recipes and mark holidays or special occasions any time in the future, separate from "This week."</p>

      <div className="cal-header">
        <button type="button" className="btn small" onClick={goPrevMonth}>{'\u2039'}</button>
        <div className="cal-month-label">{MONTH_NAMES[viewMonth]} {viewYear}</div>
        <button type="button" className="btn small" onClick={goNextMonth}>{'\u203a'}</button>
        <button type="button" className="btn small" onClick={goToday} style={{ marginLeft: 'auto' }}>Today</button>
      </div>

      <div className="cal-weekday-row">
        {DAY_LETTERS.map((l, i) => <span key={i}>{l}</span>)}
      </div>

      <div className="cal-grid">
        {days.map((d) => {
          const iso = toIso(d);
          const inMonth = d.getMonth() === viewMonth;
          const dayEntries = entriesByDate.get(iso) || [];
          const dayEvents = eventsByDate.get(iso) || [];
          return (
            <button
              type="button"
              key={iso}
              className={`cal-day${inMonth ? '' : ' outside'}${iso === todayIso ? ' today' : ''}${selectedDate === iso ? ' selected' : ''}`}
              onClick={() => setSelectedDate(iso)}
            >
              <span className="cal-daynum">{d.getDate()}</span>
              {dayEvents.slice(0, 2).map((ev) => <span key={ev.id} className="cal-chip event">{ev.title}</span>)}
              {dayEntries.slice(0, 2).map((e) => {
                const entry = entries.find((x) => x.recipe.id === e.recipeId);
                return entry ? <span key={e.id} className="cal-chip recipe">{entry.recipe.name}</span> : null;
              })}
              {(dayEvents.length + dayEntries.length) > 2 && <span className="cal-more">+{dayEvents.length + dayEntries.length - 2} more</span>}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <div className="cal-daypanel">
          <h3>{new Date(selectedDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h3>

          {(selectedEvents.length > 0 || selectedEntries.length > 0) && (
            <ul className="cal-daylist">
              {selectedEvents.map((ev) => (
                <li key={ev.id}>
                  <span className="cal-chip event">{ev.title}</span>
                  <button type="button" onClick={() => onDeleteEvent(ev.id)} aria-label="Remove">{'\u2715'}</button>
                </li>
              ))}
              {selectedEntries.map((e) => {
                const entry = entries.find((x) => x.recipe.id === e.recipeId);
                if (!entry) return null;
                return (
                  <li key={e.id}>
                    <span className="cal-chip recipe" style={{ cursor: 'pointer' }} onClick={() => onOpenRecipe(entry.recipe.id)}>{entry.recipe.name}</span>
                    <button type="button" onClick={() => onUnschedule(e.id)} aria-label="Remove">{'\u2715'}</button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="field-row" style={{ marginTop: 10 }}>
            <div className="field">
              <label>Add an event or holiday</label>
              <div className="tag-input-wrap">
                <input type="text" placeholder="e.g. Thanksgiving" value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitEvent(); }} />
                <button type="button" className="btn small" onClick={submitEvent}>Add</button>
              </div>
            </div>
          </div>

          <div className="field">
            <label>Schedule a recipe</label>
            <input type="text" placeholder="Search your recipes..." value={recipeSearch} onChange={(e) => setRecipeSearch(e.target.value)} />
            {recipeMatches.length > 0 && (
              <div className="cal-recipe-matches">
                {recipeMatches.map((m) => (
                  <button type="button" key={m.recipe.id} onClick={() => assignRecipe(m.recipe.id)}>
                    {m.recipe.name}{m.book ? <span className="muted"> — {m.book.title}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
    </Overlay>
  );
}