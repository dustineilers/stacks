import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Overlay } from '../common/Overlay';
import { StarRating } from '../common/StarRating';
import { ingredientToLine, parseIngredientLine } from '../../utils/ingredients';
import { resizeImageFile } from '../../utils/image';
import type { Cookbook, Recipe } from '../../types';
import type { RecipeInput } from '../../hooks/useAppData';

const COMMON_TAGS = ['Quick', 'Weeknight', 'Project', 'Comfort Food', 'Date Night', 'Spicy', 'Cheap', 'Healthy', 'Vegetarian', 'Baking', 'Dessert', 'Summer', 'Winter', 'Meal Prep', 'Impressive', 'One Pot'];

interface RecipeEditorModalProps {
  show: boolean;
  editingRecipe: Recipe | null;
  initialBookId: string | null;
  books: Cookbook[];
  allTags: string[];
  onClose: () => void;
  onSave: (cookbookId: string | null, input: RecipeInput) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

const blankForm = () => ({
  name: '', page: '', servings: '', rating: 0, notes: '', image: '',
  favorite: false, wantToTry: false, tags: [] as string[]
});

export function RecipeEditorModal({ show, editingRecipe, initialBookId, books, allTags, onClose, onSave, onDelete }: RecipeEditorModalProps) {
  const [form, setForm] = useState(blankForm());
  const [ingredientsText, setIngredientsText] = useState('');
  const [bookId, setBookId] = useState<string>('');
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (!show) return;
    if (editingRecipe) {
      setForm({
        name: editingRecipe.name, page: editingRecipe.page, servings: editingRecipe.servings,
        rating: editingRecipe.rating, notes: editingRecipe.notes, image: editingRecipe.image,
        favorite: editingRecipe.favorite, wantToTry: editingRecipe.wantToTry, tags: editingRecipe.tags.slice()
      });
      setIngredientsText(editingRecipe.ingredients.map(ingredientToLine).join('\n'));
      setBookId(editingRecipe.cookbookId || '');
    } else {
      setForm(blankForm());
      setIngredientsText('');
      setBookId(initialBookId || '');
    }
    setTagInput('');
  }, [show, editingRecipe, initialBookId]);

  const tagSuggestions = useMemo(() => {
    const used = new Set(form.tags.map((t) => t.toLowerCase()));
    return [...new Set([...allTags, ...COMMON_TAGS])].filter((t) => !used.has(t.toLowerCase())).slice(0, 10);
  }, [form.tags, allTags]);

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/,+$/, '');
    if (!t) return;
    if (!form.tags.some((x) => x.toLowerCase() === t.toLowerCase())) setForm((f) => ({ ...f, tags: [...f.tags, t] }));
  };
  const addTagsFromInput = () => { tagInput.split(',').forEach(addTag); setTagInput(''); };
  const removeTag = (i: number) => setForm((f) => ({ ...f, tags: f.tags.filter((_, idx) => idx !== i) }));

  const onImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await resizeImageFile(file, 900);
    setForm((f) => ({ ...f, image: dataUrl }));
  };

  const save = async () => {
    if (!form.name.trim()) return;
    const ingredients = ingredientsText.split('\n').map(parseIngredientLine).filter((x): x is NonNullable<typeof x> => !!x);
    await onSave(bookId || null, { ...form, name: form.name.trim(), ingredients });
    onClose();
  };

  const remove = async () => {
    if (!editingRecipe || !onDelete) return;
    if (!confirm(`Delete "${editingRecipe.name}"? This can't be undone.`)) return;
    await onDelete(editingRecipe.id);
    onClose();
  };

  return (
    <Overlay show={show} onClose={onClose}>
      <h2 style={{ marginTop: 0 }}>{editingRecipe ? 'Edit recipe' : 'Add a recipe'}</h2>

      <div className="field">
        <label htmlFor="re-name">Recipe name</label>
        <input type="text" id="re-name" placeholder="e.g. Brown butter chocolate chip cookies" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>

      <div className="field">
        <label htmlFor="re-book">Book</label>
        <select id="re-book" value={bookId} onChange={(e) => setBookId(e.target.value)}>
          <option value="">No book (standalone)</option>
          {books.slice().sort((a, b) => a.title.localeCompare(b.title)).map((b) => (
            <option key={b.id} value={b.id}>{b.title}{b.author ? ' \u2014 ' + b.author : ''}</option>
          ))}
        </select>
        <div className="hint">Leave as "No book" for recipes you found online or elsewhere.</div>
      </div>

      <div className="field">
        <label htmlFor="re-image">Photo (optional)</label>
        <input type="file" id="re-image" accept="image/*" onChange={onImageChange} />
        {form.image && (
          <div className="recipe-preview" style={{ display: 'block' }}>
            <img src={form.image} alt="" style={{ maxWidth: '100%', borderRadius: 8 }} />
          </div>
        )}
      </div>

      <div className="field" style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="re-page">Page</label>
          <input type="text" id="re-page" placeholder="127" value={form.page} onChange={(e) => setForm({ ...form, page: e.target.value })} />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="re-servings">Servings</label>
          <input type="text" id="re-servings" placeholder="4" value={form.servings} onChange={(e) => setForm({ ...form, servings: e.target.value })} />
        </div>
      </div>

      <div className="field" style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <label className="tried-toggle">
          <input type="checkbox" checked={form.favorite} onChange={(e) => setForm({ ...form, favorite: e.target.checked, wantToTry: e.target.checked ? false : form.wantToTry })} /> Favorite
        </label>
        <label className="tried-toggle">
          <input type="checkbox" checked={form.wantToTry} onChange={(e) => setForm({ ...form, wantToTry: e.target.checked })} /> Want to try
        </label>
      </div>

      <div className="field">
        <label htmlFor="re-tag-input">Tags</label>
        <div className="tag-input-wrap">
          <input type="text" id="re-tag-input" placeholder="Weeknight, Spicy..." value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTagsFromInput(); } }} />
          <button type="button" className="btn small" onClick={addTagsFromInput}>Add</button>
        </div>
        <div className="tag-row">
          {form.tags.map((t, i) => (
            <span key={t} className="tag-chip">{t}<button type="button" onClick={() => removeTag(i)} aria-label="Remove tag">{'\u2715'}</button></span>
          ))}
        </div>
        <div className="tag-suggest">
          {tagSuggestions.map((t) => <button key={t} type="button" className="tag" onClick={() => addTag(t)}>+ {t}</button>)}
        </div>
      </div>

      <div className="field">
        <label htmlFor="re-ingredients">Ingredients — one per line</label>
        <textarea id="re-ingredients" rows={6} placeholder={'2 tbsp olive oil\n1 lb ground beef\n3 cloves garlic, minced'} value={ingredientsText} onChange={(e) => setIngredientsText(e.target.value)} />
        <div className="hint">Quantities and units are picked up automatically so they can go on your grocery list.</div>
      </div>

      <div className="field">
        <label>Overall rating</label>
        <StarRating value={form.rating} onChange={(rating) => setForm({ ...form, rating })} />
      </div>

      <div className="field">
        <label htmlFor="re-notes">Review / notes</label>
        <textarea id="re-notes" placeholder="What worked, what you'd change next time..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>

      <div className="modal-actions">
        {editingRecipe && onDelete && <button type="button" className="btn danger" onClick={remove}>Delete</button>}
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" onClick={save}>Save recipe</button>
      </div>
    </Overlay>
  );
}
