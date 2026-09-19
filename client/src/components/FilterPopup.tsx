import { useState } from 'react';
import { Overlay } from './common/Overlay';
import { starStr } from '../utils/stars';
import type { Cookbook, RecipeFilters, RecipeSort, ShelfFilters, ShelfSort } from '../types';

const SORTS: [RecipeSort, string][] = [
  ['recent', 'Recently added'], ['alpha', 'Alphabetical'], ['rating_hi', 'Highest rated'],
  ['rating_lo', 'Lowest rated'], ['cooked_most', 'Most cooked'], ['cooked_least', 'Least cooked'],
  ['never', 'Never cooked'], ['cooked_recent', 'Recently cooked'], ['book', 'Cookbook']
];
const RECIPE_STATUSES: [RecipeFilters['status'], string][] = [
  ['all', 'All'], ['never', 'Never cooked'], ['cooked', 'Cooked'], ['favorite', 'Favorites'], ['want', 'Want to try']
];
const SHELF_STATUSES: [ShelfFilters['status'], string][] = [
  ['all', 'All'], ['want', 'Want to try'], ['cooking', 'Cooking through'], ['favorite', 'Favorite'], ['reference', 'Reference']
];
const SHELF_SORTS: [ShelfSort, string][] = [
  ['recent', 'Recently added'], ['title', 'Title'], ['author', 'Author'], ['rating', 'Highest rated'], ['recipes', 'Most recipes']
];

function OptRow<T extends string>({ list, current, onPick }: { list: [T, string][]; current: T; onPick: (v: T) => void }) {
  return (
    <div className="fp-opts">
      {list.map(([v, l]) => (
        <button key={v} type="button" className={`fp-opt${current === v ? ' on' : ''}`} onClick={() => onPick(v)}>{l}</button>
      ))}
    </div>
  );
}

interface SharedProps {
  show: boolean;
  onClose: () => void;
  resultCount: number;
  totalCount: number;
}

interface RecipesFilterPopupProps extends SharedProps {
  mode: 'recipes';
  filters: RecipeFilters;
  onChange: (next: RecipeFilters) => void;
  onClear: () => void;
  books: Cookbook[];
  allTags: string[];
}

interface ShelfFilterPopupProps extends SharedProps {
  mode: 'shelf';
  filters: ShelfFilters;
  onChange: (next: ShelfFilters) => void;
  onClear: () => void;
}

export function FilterPopup(props: RecipesFilterPopupProps | ShelfFilterPopupProps) {
  const { show, onClose, onClear, resultCount, totalCount } = props;
  const [bookSearch, setBookSearch] = useState('');
  const activeCount = props.mode === 'shelf'
    ? (props.filters.status !== 'all' ? 1 : 0) + (props.filters.sort !== 'recent' ? 1 : 0)
    : (props.filters.book !== 'all' ? 1 : 0) + (props.filters.tags.length ? 1 : 0) +
      (props.filters.status !== 'all' ? 1 : 0) + (props.filters.rating > 0 ? 1 : 0);

  return (
    <Overlay show={show} onClose={onClose} modalStyle={{ width: 'min(470px,100%)' }}>
      <h2 style={{ margin: '0 0 4px' }}>{props.mode === 'shelf' ? 'Filter cookbooks' : 'Filter recipes'}</h2>
      <p className="hint" style={{ marginBottom: 16 }}>
        {resultCount} of {totalCount} {props.mode === 'shelf' ? 'cookbook' : 'recipe'}{totalCount === 1 ? '' : 's'}
        {activeCount ? ` \u00b7 ${activeCount} filter${activeCount === 1 ? '' : 's'} active` : ''}
      </p>

      {props.mode === 'shelf' ? (
        <>
          <div className="fp-sec"><h3>Status</h3>
            <OptRow list={SHELF_STATUSES} current={props.filters.status} onPick={(status) => props.onChange({ ...props.filters, status })} />
          </div>
          <div className="fp-sec"><h3>Sort by</h3>
            <OptRow list={SHELF_SORTS} current={props.filters.sort} onPick={(sort) => props.onChange({ ...props.filters, sort })} />
          </div>
        </>
      ) : (
        <>
          <div className="fp-sec"><h3>Status</h3>
            <OptRow list={RECIPE_STATUSES} current={props.filters.status} onPick={(status) => props.onChange({ ...props.filters, status })} />
          </div>

          <div className="fp-sec">
            <h3>Cookbook</h3>
            {props.books.length > 6 && (
              <input type="text" className="dsearch" style={{ width: '100%', padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 7, background: 'var(--bg-alt)', color: 'var(--ink)', fontSize: 13 }}
                placeholder="Find a cookbook..." value={bookSearch} onChange={(e) => setBookSearch(e.target.value)} />
            )}
            <div className="fp-booklist">
              <BookRow label="All cookbooks" active={props.filters.book === 'all'} onClick={() => props.onChange({ ...props.filters, book: 'all' })} />
              <BookRow label="Standalone / no cookbook" active={props.filters.book === 'none'} onClick={() => props.onChange({ ...props.filters, book: 'none' })} />
              {props.books
                .slice().sort((a, b) => a.title.localeCompare(b.title))
                .filter((b) => !bookSearch.trim() || b.title.toLowerCase().includes(bookSearch.trim().toLowerCase()))
                .map((b) => (
                  <BookRow key={b.id} label={b.title} active={props.filters.book === b.id} onClick={() => props.onChange({ ...props.filters, book: b.id })} />
                ))}
            </div>
          </div>

          <div className="fp-sec">
            <h3>Tags</h3>
            {props.allTags.length ? (
              <div className="fp-opts">
                {props.allTags.map((t) => (
                  <button key={t} type="button" className={`fp-opt${props.filters.tags.includes(t) ? ' on' : ''}`}
                    onClick={() => {
                      const tags = props.filters.tags.includes(t) ? props.filters.tags.filter((x) => x !== t) : [...props.filters.tags, t];
                      props.onChange({ ...props.filters, tags });
                    }}>{t}</button>
                ))}
              </div>
            ) : <p className="hint" style={{ margin: 0 }}>No tags yet — add some when you edit a recipe.</p>}
          </div>

          <div className="fp-sec"><h3>Rating</h3>
            <div className="fp-opts">
              {[0, 5, 4, 3, 2, 1].map((n) => (
                <button key={n} type="button" className={`fp-opt${props.filters.rating === n ? ' on' : ''}`}
                  onClick={() => props.onChange({ ...props.filters, rating: n })}>
                  {n === 0 ? 'Any' : starStr(n).slice(0, n) + '+'}
                </button>
              ))}
            </div>
          </div>

          <div className="fp-sec"><h3>Sort by</h3>
            <OptRow list={SORTS} current={props.filters.sort} onPick={(sort) => props.onChange({ ...props.filters, sort })} />
          </div>
        </>
      )}

      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClear}>Clear all</button>
        <button type="button" className="btn primary" onClick={onClose}>Done</button>
      </div>
    </Overlay>
  );
}

function BookRow({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`fp-book${active ? ' on' : ''}`} onClick={onClick}>
      <span className="check">{active ? '\u2713' : ''}</span>{label}
    </button>
  );
}
