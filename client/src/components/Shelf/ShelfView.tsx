import { useEffect, useMemo, useRef } from 'react';
import type { Cookbook, ShelfFilters } from '../../types';
import { ShelfEngine } from '../../shelf/ShelfEngine';

interface ShelfViewProps {
  books: Cookbook[];
  filters: ShelfFilters;
  searchTerm: string;
  onOpenBook: (id: string) => void;
  onAddFirst: () => void;
}

export function getFilteredShelfItems(books: Cookbook[], filters: ShelfFilters, searchTerm: string): Cookbook[] {
  const sorters: Record<string, (a: Cookbook, b: Cookbook) => number> = {
    recent: (a, b) => b.dateAdded - a.dateAdded,
    title: (a, b) => (a.title || '').localeCompare(b.title || ''),
    author: (a, b) => (a.author || '').localeCompare(b.author || '') || (a.title || '').localeCompare(b.title || ''),
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || (a.title || '').localeCompare(b.title || ''),
    recipes: (a, b) => (b.recipes || []).length - (a.recipes || []).length || (a.title || '').localeCompare(b.title || '')
  };
  let items = books.slice().sort(sorters[filters.sort] || sorters.recent);
  if (filters.status !== 'all') items = items.filter((b) => b.status === filters.status);
  if (searchTerm.trim()) {
    const q = searchTerm.trim().toLowerCase();
    items = items.filter((b) =>
      (b.title || '').toLowerCase().includes(q) ||
      (b.author || '').toLowerCase().includes(q) ||
      (b.cuisine || '').toLowerCase().includes(q)
    );
  }
  return items;
}

export function ShelfView({ books, filters, searchTerm, onOpenBook, onAddFirst }: ShelfViewProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ShelfEngine | null>(null);

  const filtered = useMemo(() => getFilteredShelfItems(books, filters, searchTerm), [books, filters, searchTerm]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new ShelfEngine(canvasRef.current, { onOpenBook });
    engineRef.current = engine;
    return () => engine.destroy();
    // engine is recreated only when the open-book callback identity would otherwise
    // go stale across renders; items are pushed separately below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setItems(filtered);
  }, [filtered]);

  if (books.length === 0) {
    return (
      <div className="empty show">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4}>
          <path d="M3 5.5C3 4.7 3.7 4 4.5 4H10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4.5A1.5 1.5 0 0 1 3 16.5v-11Z" />
          <path d="M21 5.5c0-.8-.7-1.5-1.5-1.5H14a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h5.5a1.5 1.5 0 0 0 1.5-1.5v-11Z" />
        </svg>
        <h2>Your shelf is empty</h2>
        <p>Add the cookbooks you own, want, or keep coming back to — cover, notes, and all.</p>
        <button className="btn primary" onClick={onAddFirst}>Add your first cookbook</button>
      </div>
    );
  }

  return (
    <>
      <div className="canvas" ref={canvasRef} style={{ display: filtered.length ? 'block' : 'none' }} />
      {filtered.length === 0 && <div id="noMatch" style={{ display: 'block' }}>No cookbooks match that search.</div>}
    </>
  );
}
