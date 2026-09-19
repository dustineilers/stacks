import { useRef, useState } from 'react';
import { GROCERY_CATEGORIES } from '../../utils/ingredients';
import type { GroceryItem } from '../../types';

interface GroceryViewProps {
  items: GroceryItem[];
  onAdd: (line: string) => Promise<void>;
  onToggle: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClearChecked: () => Promise<void>;
  onClearAll: () => Promise<void>;
}

export function GroceryView({ items, onAdd, onToggle, onDelete, onClearChecked, onClearAll }: GroceryViewProps) {
  const [newItem, setNewItem] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const done = items.filter((g) => g.checked).length;

  const submitAdd = async () => {
    if (!newItem.trim()) return;
    await onAdd(newItem.trim());
    setNewItem('');
    inputRef.current?.focus();
  };

  const addRow = (
    <div className="g-add">
      <input ref={inputRef} type="text" value={newItem} onChange={(e) => setNewItem(e.target.value)}
        placeholder="Add an item — e.g. 2 lbs carrots"
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitAdd(); } }} />
      <button type="button" className="btn primary" onClick={submitAdd}>Add</button>
    </div>
  );

  if (items.length === 0) {
    return (
      <div className="grocery-wrap">
        <div className="grocery-head"><div><h2>Grocery list</h2><div className="sub">Nothing on the list yet</div></div></div>
        <div className="grocery-sheet">
          {addRow}
          <p className="empty-inline">Open a recipe and choose <b>Add to grocery list</b> — its ingredients land here, sorted by aisle.</p>
        </div>
      </div>
    );
  }

  const groups = GROCERY_CATEGORIES
    .map((cat) => ({ cat, list: items.filter((g) => g.category === cat) }))
    .filter((g) => g.list.length > 0);

  return (
    <div className="grocery-wrap">
      <div className="grocery-head">
        <div>
          <h2>Grocery list</h2>
          <div className="sub">{items.length} item{items.length === 1 ? '' : 's'}{done ? ` \u00b7 ${done} checked off` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {done > 0 && <button type="button" className="btn small" onClick={onClearChecked}>Clear checked</button>}
          <button type="button" className="btn small danger" onClick={() => { if (confirm('Clear the whole grocery list?')) onClearAll(); }}>Clear all</button>
        </div>
      </div>
      <div className="grocery-sheet">
        {addRow}
        {groups.map(({ cat, list }) => (
          <div className="g-cat" key={cat}>
            <h3>{cat}</h3>
            {list.map((g) => (
              <div className={`g-item${g.checked ? ' done' : ''}`} key={g.id}>
                <input type="checkbox" checked={g.checked} onChange={() => onToggle(g.id)} aria-label="Check off" />
                <span className="g-text">
                  <span className="g-qty">{[g.qty, g.unit].filter(Boolean).join(' ')}</span> {g.name}
                  {g.note ? <>, <span className="ing-note">{g.note}</span></> : null}
                  {g.sources.length > 0 && <span className="g-src">{g.sources.join(', ')}</span>}
                </span>
                <button className="g-del" onClick={() => onDelete(g.id)} aria-label="Remove">{'\u2715'}</button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
