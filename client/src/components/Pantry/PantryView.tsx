import { useRef, useState } from 'react';
import { GROCERY_CATEGORIES } from '../../utils/ingredients';
import type { PantryItem } from '../../types';
import type { PantryItemInput } from '../../db/repository';

interface PantryViewProps {
  items: PantryItem[];
  onAdd: (line: string) => Promise<void>;
  onEdit: (id: string, data: PantryItemInput) => Promise<void>;
  onToggleLowStock: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSendLowStockToGrocery: () => Promise<{ added: number; merged: number }>;
}

export function PantryView({ items, onAdd, onEdit, onToggleLowStock, onDelete, onSendLowStockToGrocery }: PantryViewProps) {
  const [newItem, setNewItem] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const lowCount = items.filter((p) => p.lowStock).length;

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
      <input ref={inputRef} type="text" value={newItem} onChange={(e) => setNewItem(e.target.value)}
        placeholder="Add an item — e.g. 2 cans black beans"
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitAdd(); } }} />
      <button type="button" className="btn primary" onClick={submitAdd}>Add</button>
    </div>
  );

  if (items.length === 0) {
    return (
      <div className="grocery-wrap">
        <div className="grocery-head"><div><h2>Pantry</h2><div className="sub">Nothing logged yet</div></div></div>
        <div className="grocery-sheet">
          {addRow}
          <p className="empty-inline">Add what you've got on hand, sorted by aisle — same categories as your grocery list.</p>
        </div>
      </div>
    );
  }

  const groups = GROCERY_CATEGORIES
    .map((cat) => ({ cat, list: items.filter((p) => p.category === cat) }))
    .filter((g) => g.list.length > 0);

  return (
    <div className="grocery-wrap">
      <div className="grocery-head">
        <div>
          <h2>Pantry</h2>
          <div className="sub">{items.length} item{items.length === 1 ? '' : 's'}{lowCount ? ` \u00b7 ${lowCount} running low` : ''}</div>
        </div>
        {lowCount > 0 && (
          <button type="button" className="btn small" onClick={onSendLowStockToGrocery}>Send low-stock to grocery</button>
        )}
      </div>
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
                <button className="g-del" onClick={() => onDelete(p.id)} aria-label="Remove">{'\u2715'}</button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}