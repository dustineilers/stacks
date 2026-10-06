import { useRef, useState } from 'react';
import { GROCERY_CATEGORIES } from '../../utils/ingredients';
import type { GroceryItem, PantryItem } from '../../types';
import type { PantryItemInput } from '../../db/repository';
import { ShareGroceryButton } from './ShareGroceryButton';
import { PantrySection } from '../Pantry/PantrySection';

interface GroceryViewProps {
  items: GroceryItem[];
  onAdd: (line: string) => Promise<void>;
  onToggle: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClearChecked: () => Promise<void>;
  onClearAll: () => Promise<void>;

  pantryItems: PantryItem[];
  onPantryAdd: (line: string) => Promise<void>;
  onPantryEdit: (id: string, data: PantryItemInput) => Promise<void>;
  onPantryToggleLowStock: (id: string) => Promise<void>;
  onPantryDelete: (id: string) => Promise<void>;
  onSendLowStockToGrocery: () => Promise<{ added: number; merged: number }>;
}

export function GroceryView({
  items, onAdd, onToggle, onDelete, onClearChecked, onClearAll,
  pantryItems, onPantryAdd, onPantryEdit, onPantryToggleLowStock, onPantryDelete, onSendLowStockToGrocery
}: GroceryViewProps) {
  const [section, setSection] = useState<'list' | 'pantry'>('list');
  const [newItem, setNewItem] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const done = items.filter((g) => g.checked).length;
  const lowCount = pantryItems.filter((p) => p.lowStock).length;

  const submitAdd = async () => {
    if (!newItem.trim()) return;
    await onAdd(newItem.trim());
    setNewItem('');
    inputRef.current?.focus();
  };

  const groups = GROCERY_CATEGORIES
    .map((cat) => ({ cat, list: items.filter((g) => g.category === cat) }))
    .filter((g) => g.list.length > 0);

  const addRow = (
    <div className="g-add">
      <input id="g-new" ref={inputRef} type="text" value={newItem} onChange={(e) => setNewItem(e.target.value)}
        placeholder="Add an item — e.g. 2 lbs carrots"
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitAdd(); } }} />
      <button type="button" className="btn primary" onClick={submitAdd}>Add</button>
    </div>
  );

  return (
    <div className="grocery-wrap">
      <div className="grocery-head">
        <div>
          <h2>{section === 'list' ? 'Grocery list' : 'Pantry'}</h2>
          <div className="sub">
            {section === 'list'
              ? `${items.length} item${items.length === 1 ? '' : 's'}${done ? ` · ${done} checked off` : ''}`
              : `${pantryItems.length} item${pantryItems.length === 1 ? '' : 's'}${lowCount ? ` · ${lowCount} running low` : ''}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {section === 'list' ? (
            <>
              <ShareGroceryButton items={items} />
              {done > 0 && <button type="button" className="btn small" onClick={onClearChecked}>Clear checked</button>}
              <button type="button" className="btn small danger" onClick={() => { if (confirm('Clear the whole grocery list?')) onClearAll(); }}>Clear all</button>
            </>
          ) : (
            lowCount > 0 && <button type="button" className="btn small" onClick={onSendLowStockToGrocery}>Send low-stock to grocery</button>
          )}
        </div>
      </div>

      <div className="grocery-tabs">
        <button type="button" className={`grocery-tab${section === 'list' ? ' active' : ''}`} onClick={() => setSection('list')}>
          Shopping list
        </button>
        <button type="button" className={`grocery-tab${section === 'pantry' ? ' active' : ''}`} onClick={() => setSection('pantry')}>
          Pantry{lowCount > 0 ? ` (${lowCount})` : ''}
        </button>
      </div>

      {section === 'list' ? (
        items.length === 0 ? (
          <div className="grocery-sheet">
            {addRow}
            <p className="empty-inline">Open a recipe and choose <b>Add to grocery list</b> — its ingredients land here, sorted by aisle.</p>
          </div>
        ) : (
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
                    <button className="g-del" onClick={() => onDelete(g.id)} aria-label="Remove">{'✕'}</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      ) : (
        <PantrySection
          items={pantryItems}
          onAdd={onPantryAdd}
          onEdit={onPantryEdit}
          onToggleLowStock={onPantryToggleLowStock}
          onDelete={onPantryDelete}
        />
      )}
    </div>
  );
}
