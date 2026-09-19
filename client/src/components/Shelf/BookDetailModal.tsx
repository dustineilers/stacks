import { useMemo, useState } from 'react';
import { Overlay } from '../common/Overlay';
import { WebImportPanel } from './WebImportPanel';
import { starStr } from '../../utils/stars';
import { relDays } from '../../utils/dates';
import { colorFor } from '../../utils/colors';
import { buildRing } from '../../shelf/ShelfEngine';
import type { Cookbook, Recipe } from '../../types';
import { cookCount, lastCooked } from '../../utils/recipeStats';

const STATUS_LABELS: Record<string, string> = {
  want: 'Want to try', cooking: 'Cooking through', favorite: 'Favorite', reference: 'Reference'
};

interface BookDetailModalProps {
  show: boolean;
  book: Cookbook | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddRecipe: () => void;
  onImportRecipes: (recipes: { name: string; page: string }[]) => Promise<void>;
  onOpenRecipeView: (recipeId: string) => void;
  onOpenCookSheet: (recipeId: string) => void;
  onDeleteRecipe: (recipeId: string) => void;
}

export function BookDetailModal({
  show, book, onClose, onEdit, onDelete, onAddRecipe, onImportRecipes,
  onOpenRecipeView, onOpenCookSheet, onDeleteRecipe
}: BookDetailModalProps) {
  const [search, setSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  const filteredRecipes = useMemo(() => {
    if (!book) return [];
    const q = search.trim().toLowerCase();
    if (!q) return book.recipes;
    return book.recipes.filter((r) =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.notes || '').toLowerCase().includes(q) ||
      (r.tags || []).some((t) => t.toLowerCase().includes(q)));
  }, [book, search]);

  if (!book) return <Overlay show={show} onClose={onClose}><div /></Overlay>;

  const initial = (book.title || '?').trim().charAt(0).toUpperCase();
  const color = colorFor(book.title || 'x');
  const total = book.recipes.length;
  const triedCount = book.recipes.filter((r) => r.tried).length;
  const pct = total > 0 ? Math.round((triedCount / total) * 100) : 0;
  const dateStr = new Date(book.dateAdded).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <Overlay show={show} onClose={onClose} closeButton={false}>
      <div className="modal-header-sticky">
        <div className="header-actions">
          <button className="btn danger small" onClick={onDelete}>Delete</button>
          <button className="btn small" onClick={onEdit}>Edit</button>
          <button className="btn primary small" onClick={onClose}>Done</button>
          <button className="modal-close" style={{ float: 'none', margin: 0 }} onClick={onClose} aria-label="Close">{'\u2715'}</button>
        </div>
        <div className="header-top-row">
          <div className="detail-cover">
            {book.cover
              ? <img src={book.cover} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              : <div className="cover-fallback" style={{ background: color }}>{initial}</div>}
          </div>
          <div className="header-info">
            <h2 className="detail-title">{book.title}</h2>
            <div className="detail-author">{book.author || 'Author unknown'}</div>
            <div className="detail-meta">
              <span className="status-tag" style={{ background: `var(--status-${book.status})` }}>{STATUS_LABELS[book.status]}</span>
              {book.cuisine && <span className="cuisine-tag">{book.cuisine}</span>}
              {book.rating > 0 && <span style={{ color: 'var(--accent)', fontSize: 14 }}>{starStr(book.rating)}</span>}
            </div>
          </div>
        </div>
        {book.notes && <div className="detail-notes">{book.notes}</div>}
        <div className="detail-date">Added {dateStr}</div>
        {total > 0 && (
          <div className="completion-row">
            <span dangerouslySetInnerHTML={{ __html: buildRing(pct, 52, 6, true) }} />
            <div className="completion-caption"><strong>{pct}% complete</strong><br />{triedCount} of {total} recipes tried</div>
          </div>
        )}
      </div>

      <div className="modal-body-scroll">
        <div className="recipes-section">
          <div className="recipes-toolbar">
            <div className="recipes-header">
              <h3>Recipes</h3>
              <div className="actions">
                <button type="button" className="btn small" onClick={() => setImportOpen((v) => !v)}>Import from web</button>
                <button type="button" className="btn small" onClick={onAddRecipe}>+ Add recipe</button>
              </div>
            </div>
            {total > 0 && (
              <input type="text" className="inline-search" placeholder="Search recipes in this book..." value={search} onChange={(e) => setSearch(e.target.value)} />
            )}
          </div>

          {importOpen && (
            <WebImportPanel
              initialTitle={book.title}
              initialAuthor={book.author}
              onCancel={() => setImportOpen(false)}
              onImport={async (recipes) => { await onImportRecipes(recipes); setImportOpen(false); }}
            />
          )}

          <div className="recipe-list">
            {total === 0 ? (
              <p className="muted">No recipes logged yet — add one, or try importing a list from the web.</p>
            ) : filteredRecipes.length === 0 ? (
              <p className="muted">No recipes match that search.</p>
            ) : (
              filteredRecipes.map((r) => <RecipeRow key={r.id} r={r} book={book} onOpenView={onOpenRecipeView} onCook={onOpenCookSheet} onDelete={onDeleteRecipe} />)
            )}
          </div>
        </div>
      </div>
    </Overlay>
  );
}

function RecipeRow({ r, onOpenView, onCook, onDelete }: {
  r: Recipe; book: Cookbook; onOpenView: (id: string) => void; onCook: (id: string) => void; onDelete: (id: string) => void;
}) {
  const count = cookCount(r);
  const tags = (r.tags || []).slice(0, 3);
  return (
    <div className="recipe-row" style={{ cursor: 'pointer' }} onClick={() => onOpenView(r.id)}>
      <div className="recipe-thumb">{r.image && <img src={r.image} alt="" />}</div>
      <div className="recipe-info">
        <div className={`recipe-name${count ? ' tried' : ''}`}>
          {r.name}{r.page ? <span className="muted" style={{ fontSize: 12 }}> p.{r.page}</span> : null}
        </div>
        {r.rating > 0 && <div className="recipe-stars">{starStr(r.rating)}</div>}
        <div className="recipe-notes">{count ? `Cooked ${count}\u00d7 \u00b7 last ${relDays(lastCooked(r))}` : 'Never cooked'}</div>
        {r.notes && <div className="recipe-notes">{r.notes}</div>}
        {tags.length > 0 && <div className="tag-row">{tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>}
      </div>
      <div className="recipe-actions" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => onCook(r.id)} aria-label="Log a cooking session" title="Cook this">{'\u25cf'}</button>
        <button onClick={() => onOpenView(r.id)} aria-label="Edit recipe" title="Edit">{'\u270e'}</button>
        <button onClick={() => onDelete(r.id)} aria-label="Delete recipe" title="Delete">{'\u2715'}</button>
      </div>
    </div>
  );
}
