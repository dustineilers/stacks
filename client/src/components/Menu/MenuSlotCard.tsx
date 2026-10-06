import { useState } from 'react';
import type { MenuSlot, RecipeEntry } from '../../types';

interface MenuSlotCardProps {
  slot: MenuSlot;
  entries: RecipeEntry[];
  onOpenRecipe: (id: string) => void;
  onUpdateCourse: (course: string) => void;
  onAssignRecipe: (recipeId: string) => void;
  onClear: () => void;
  onToggleLocked: () => void;
  onRemove: () => void;
}

export function MenuSlotCard({
  slot, entries, onOpenRecipe, onUpdateCourse, onAssignRecipe, onClear, onToggleLocked, onRemove
}: MenuSlotCardProps) {
  const [search, setSearch] = useState('');

  const assigned = slot.recipeId ? entries.find((e) => e.recipe.id === slot.recipeId) || null : null;

  const q = search.trim().toLowerCase();
  const matches = q ? entries.filter((e) => e.recipe.name.toLowerCase().includes(q)).slice(0, 8) : [];

  const assign = (recipeId: string) => {
    onAssignRecipe(recipeId);
    setSearch('');
  };

  return (
    <div className="menu-slot">
      <div className="menu-slot-top">
        <input
          type="text"
          className="menu-slot-course"
          value={slot.course}
          onChange={(e) => onUpdateCourse(e.target.value)}
          placeholder="Course name"
        />
        <button
          type="button"
          className={`menu-slot-lock${slot.locked ? ' on' : ''}`}
          onClick={onToggleLocked}
          aria-label={slot.locked ? 'Unlock this course' : 'Lock this course'}
          title={slot.locked ? 'Locked — recommendations will skip this course' : 'Lock this course so recommendations skip it'}
        >
          {slot.locked ? '\u{1F512}' : '\u{1F513}'}
        </button>
        <button type="button" className="menu-slot-remove" onClick={onRemove} aria-label="Remove this course">{'✕'}</button>
      </div>

      {assigned ? (
        <button type="button" className="menu-slot-filled" onClick={() => onOpenRecipe(assigned.recipe.id)}>
          <b>{assigned.recipe.name}</b>
          {assigned.book && <span className="muted"> — {assigned.book.title}</span>}
        </button>
      ) : slot.suggestionName ? (
        <div className="menu-slot-suggestion">
          <b>{slot.suggestionName}</b>
          <span className="tag" style={{ marginLeft: 8 }}>Not in your collection</span>
          {slot.suggestionReason && <div className="coverage-note">{slot.suggestionReason}</div>}
        </div>
      ) : (
        <p className="empty-inline" style={{ margin: '4px 0' }}>No dish chosen yet.</p>
      )}

      {assigned && (
        <button type="button" className="btn small" style={{ marginTop: 6 }} onClick={onClear}>Clear</button>
      )}

      <input
        type="text"
        className="inline-search"
        placeholder={assigned ? 'Replace with a different recipe...' : 'Search your recipes...'}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {matches.length > 0 && (
        <div className="cal-recipe-matches" style={{ marginTop: 6 }}>
          {matches.map((m) => (
            <button type="button" key={m.recipe.id} onClick={() => assign(m.recipe.id)}>
              {m.recipe.name}{m.book ? <span className="muted"> — {m.book.title}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
