import { useEffect, useState } from 'react';
import { MenuSlotCard } from './MenuSlotCard';
import { CookingLoader } from '../Recipes/CookingLoader';
import { fillMenuSlots } from '../../utils/menuSlots';
import type { Menu, RecipeEntry } from '../../types';

interface MenuViewProps {
  menus: Menu[];
  entries: RecipeEntry[];
  onOpenRecipe: (id: string) => void;
  onCreateMenu: (title: string, context: string, courseNames: string[]) => Promise<Menu>;
  onDeleteMenu: (id: string) => Promise<void>;
  onUpdateMenuContext: (id: string, title: string, context: string) => Promise<void>;
  onAddSlot: (menuId: string, course: string) => Promise<void>;
  onRemoveSlot: (slotId: string) => Promise<void>;
  onUpdateSlotCourse: (slotId: string, course: string) => Promise<void>;
  onAssignSlotRecipe: (slotId: string, recipeId: string | null) => Promise<void>;
  onSetSlotSuggestion: (slotId: string, name: string, reason: string) => Promise<void>;
  onToggleSlotLocked: (slotId: string, locked: boolean) => Promise<void>;
  onClearSlot: (slotId: string) => Promise<void>;
  onAddFilledToPlan: (recipeIds: string[]) => Promise<void>;
}

const DEFAULT_COURSES = ['Appetizer', 'Side', 'Side', 'Drink', 'Dessert', 'Entree', 'Sauce'];

export function MenuView({
  menus, entries, onOpenRecipe, onCreateMenu, onDeleteMenu, onUpdateMenuContext,
  onAddSlot, onRemoveSlot, onUpdateSlotCourse, onAssignSlotRecipe, onSetSlotSuggestion,
  onToggleSlotLocked, onClearSlot, onAddFilledToPlan
}: MenuViewProps) {
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [contextDraft, setContextDraft] = useState('');
  const [newCourseName, setNewCourseName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const selectedMenu = selectedMenuId ? menus.find((m) => m.id === selectedMenuId) || null : null;

  useEffect(() => {
    if (!selectedMenuId && menus.length) setSelectedMenuId(menus[0].id);
  }, [menus, selectedMenuId]);

  useEffect(() => {
    setTitleDraft(selectedMenu?.title || '');
    setContextDraft(selectedMenu?.context || '');
  }, [selectedMenu?.id]);

  const createNewMenu = async () => {
    const menu = await onCreateMenu('', '', DEFAULT_COURSES);
    setSelectedMenuId(menu.id);
  };

  const deleteMenu = async (id: string) => {
    if (!confirm('Delete this menu? This can’t be undone.')) return;
    await onDeleteMenu(id);
    if (selectedMenuId === id) setSelectedMenuId(null);
  };

  const saveContext = () => {
    if (!selectedMenu) return;
    if (titleDraft === selectedMenu.title && contextDraft === selectedMenu.context) return;
    onUpdateMenuContext(selectedMenu.id, titleDraft, contextDraft);
  };

  const addSlot = () => {
    if (!selectedMenu) return;
    onAddSlot(selectedMenu.id, newCourseName.trim() || 'Course');
    setNewCourseName('');
  };

  const gaps = selectedMenu ? selectedMenu.slots.filter((s) => !s.locked && !s.recipeId) : [];
  const filledRecipeIds = selectedMenu
    ? selectedMenu.slots.filter((s) => s.recipeId).map((s) => s.recipeId as string)
    : [];

  const generateRecommendations = async () => {
    if (!selectedMenu || !gaps.length || generating) return;
    const settled = selectedMenu.slots.filter((s) => s.locked || s.recipeId);
    const filledContext = settled
      .map((s) => {
        const name = s.recipeId
          ? entries.find((e) => e.recipe.id === s.recipeId)?.recipe.name || ''
          : s.suggestionName;
        return { course: s.course, name };
      })
      .filter((f) => f.name);
    const emptySlots = gaps.map((s) => ({ slotId: s.id, course: s.course }));
    const context = contextDraft.trim() || titleDraft.trim() || 'A home-cooked meal, no particular occasion.';

    setGenerating(true);
    setGenerateError(null);
    try {
      const fills = await fillMenuSlots(context, entries, filledContext, emptySlots);
      for (const fill of fills) {
        if (fill.recipeId) await onAssignSlotRecipe(fill.slotId, fill.recipeId);
        else await onSetSlotSuggestion(fill.slotId, fill.name, fill.reason);
      }
    } catch (err: any) {
      setGenerateError(err.message || 'Could not generate recommendations.');
    } finally {
      setGenerating(false);
    }
  };

  const addFilledToPlan = async () => {
    if (!filledRecipeIds.length || adding) return;
    setAdding(true);
    try { await onAddFilledToPlan(filledRecipeIds); } finally { setAdding(false); }
  };

  return (
    <div className="menu-wrap">
      <div className="menu-sidebar">
        <button type="button" className="btn primary" style={{ width: '100%', marginBottom: 12 }} onClick={createNewMenu}>
          + New menu
        </button>
        {menus.length === 0 && (
          <p className="empty-inline">No menus yet — start one for your next occasion.</p>
        )}
        <div className="menu-list">
          {menus.map((m) => (
            <div key={m.id} className={`menu-list-item${m.id === selectedMenuId ? ' active' : ''}`}>
              <button type="button" className="menu-list-item-main" onClick={() => setSelectedMenuId(m.id)}>
                <b>{m.title || 'Untitled menu'}</b>
                {m.context && <span className="muted">{m.context}</span>}
              </button>
              <button type="button" className="menu-list-item-del" onClick={() => deleteMenu(m.id)} aria-label="Delete menu">
                {'✕'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="menu-editor">
        {!selectedMenu ? (
          <div className="recipes-tab-empty">
            <h2>Plan a menu</h2>
            <p>Create a menu to start coursing out your next meal.</p>
          </div>
        ) : (
          <>
            <div className="field">
              <label>Menu name</label>
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveContext}
                placeholder="e.g. Anniversary dinner"
              />
            </div>
            <div className="field">
              <label>What's this menu for?</label>
              <textarea
                rows={2}
                value={contextDraft}
                onChange={(e) => setContextDraft(e.target.value)}
                onBlur={saveContext}
                placeholder={'e.g. "anniversary steak dinner" or "festive Italian Christmas feast"'}
              />
            </div>

            <div className="menu-slots">
              {selectedMenu.slots.map((slot) => (
                <MenuSlotCard
                  key={slot.id}
                  slot={slot}
                  entries={entries}
                  onOpenRecipe={onOpenRecipe}
                  onUpdateCourse={(course) => onUpdateSlotCourse(slot.id, course)}
                  onAssignRecipe={(recipeId) => onAssignSlotRecipe(slot.id, recipeId)}
                  onClear={() => onClearSlot(slot.id)}
                  onToggleLocked={() => onToggleSlotLocked(slot.id, !slot.locked)}
                  onRemove={() => onRemoveSlot(slot.id)}
                />
              ))}
            </div>

            <div className="tag-input-wrap" style={{ marginTop: 12 }}>
              <input
                type="text"
                placeholder="New course name..."
                value={newCourseName}
                onChange={(e) => setNewCourseName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addSlot(); }}
              />
              <button type="button" className="btn small" onClick={addSlot}>+ Add course</button>
            </div>

            {generateError && <p className="hint" style={{ color: 'var(--spine-red)', marginTop: 12 }}>{generateError}</p>}

            <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 18 }}>
              <button type="button" className="btn primary" onClick={generateRecommendations} disabled={generating || !gaps.length}>
                {generating ? 'Thinking...' : 'Generate recommendations'}
              </button>
              {filledRecipeIds.length > 0 && (
                <button type="button" className="btn" onClick={addFilledToPlan} disabled={adding}>
                  {adding ? 'Adding...' : `Add ${filledRecipeIds.length} to this week`}
                </button>
              )}
            </div>

            {generating && <CookingLoader label="Working out the rest of the menu..." />}
          </>
        )}
      </div>
    </div>
  );
}
