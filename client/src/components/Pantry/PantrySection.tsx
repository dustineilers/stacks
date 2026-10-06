import { useRef, useState } from 'react';
import { GROCERY_CATEGORIES } from '../../utils/ingredients';
import type { PantryItem } from '../../types';
import type { PantryItemInput } from '../../db/repository';

interface PantrySectionProps {
  items: PantryItem[];
  onAdd: (line: string) => Promise<void>;
  onEdit: (id: string, data: PantryItemInput) => Promise<void>;
  onToggleLowStock: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

/** The pantry's item sheet — no outer page chrome of its own. Rendered as a
 *  section inside GroceryView, which owns the shared header/sub-tab shell
 *  the grocery list and pantry both use. */
export function PantrySection({ items, onAdd, onEdit, onToggleLowStock, onDelete }: PantrySectionProps) {
  const [newItem, setNewItem] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const submitAdd = async () => {
    if (!newItem.trim()) return;
    await onAdd(newItem.trim());
    setNewItem('');
    inputRef.current?.focus();
  };

  const startEditNote = (item: PantryItem) => {
    setEditingId(item.id);
    setEditNote(item.note);
  };

  const saveNote = async (item: PantryItem) => {
    await onEdit(item.id, { name: item.name, category: item.category, qty: item.qty, unit: item.unit, note: editNote.trim() });
    setEditingId(null);
  };

  const addRow = (
    <div className="g-add">
      <input id="g-new" ref={inputRef} type="text" value={newItem} onChange={(e) => setNewItem(e.target.value)}
        placeholder="Add an item — e.g. 2 cans black beans"
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitAdd(); } }} />
      <button type="button" className="btn primary" onClick={submitAdd}>Add</button>
    </div>
  );

  if (items.length === 0) {
    return (
      <div className="grocery-sheet">
        {addRow}
        <p className="empty-inline">Add what you've got on hand, sorted by aisle — same categories as your grocery list.</p>
      </div>
    );
  }

  const groups = GROCERY_CATEGORIES
    .map((cat) => ({ cat, list: items.filter((p) => p.category === cat) }))
    .filter((g) => g.list.length > 0);

  return (
    <div className="grocery-sheet">
      {addRow}
      {groups.map(({ cat, list }) => (
        <div className="g-cat" key={cat}>
          <h3>{cat}</h3>
          {list.map((p) => (
            <div className={`g-item${p.lowStock ? ' low-stock' : ''}`} key={p.id}>
              <input type="checkbox" checked={p.lowStock} onChange={() => onToggleLowStock(p.id)} aria-label="Running low" title="Running low" />
              <span className="g-text">
                <span className="g-qty">{[p.qty, p.unit].filter(Boolean).join(' ')}</span> {p.name}
                {editingId === p.id ? (
                  <span style={{ display: 'inline-flex', gap: 4, marginLeft: 6 }}>
                    <input type="text" value={editNote} onChange={(e) => setEditNote(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveNote(p); }}
                      style={{ fontSize: 12, padding: '2px 6px', width: 140 }} autoFocus />
                    <button type="button" className="btn small" onClick={() => saveNote(p)}>Save</button>
                  </span>
                ) : (
                  <span onClick={() => startEditNote(p)} style={{ cursor: 'pointer' }}>
                    {p.note ? <>, <span className="ing-note">{p.note}</span></> : <span className="ing-note" style={{ opacity: 0.5 }}> + note</span>}
                  </span>
                )}
              </span>
              <button className="g-del" onClick={() => onDelete(p.id)} aria-label="Remove">{'✕'}</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
