import { useEffect, useState } from 'react';
import { Overlay } from '../common/Overlay';
import { StarRating } from '../common/StarRating';
import type { Cookbook, CookbookStatus } from '../../types';
import type { CookbookInput } from '../../hooks/useAppData';

interface BookFormModalProps {
  show: boolean;
  editingBook: Cookbook | null; // null = adding a new one
  onClose: () => void;
  onSave: (input: CookbookInput) => Promise<void>;
}

const BLANK: CookbookInput = { title: '', author: '', cover: '', cuisine: '', status: 'want', rating: 0, notes: '' };

export function BookFormModal({ show, editingBook, onClose, onSave }: BookFormModalProps) {
  const [form, setForm] = useState<CookbookInput>(BLANK);

  useEffect(() => {
    if (!show) return;
    setForm(editingBook
      ? { title: editingBook.title, author: editingBook.author, cover: editingBook.cover, cuisine: editingBook.cuisine, status: editingBook.status, rating: editingBook.rating, notes: editingBook.notes }
      : BLANK);
  }, [show, editingBook]);

  const save = async () => {
    if (!form.title.trim()) return;
    await onSave({ ...form, title: form.title.trim() });
    onClose();
  };

  return (
    <Overlay show={show} onClose={onClose}>
      <h2 style={{ marginTop: 0 }}>{editingBook ? 'Edit cookbook' : 'Add a cookbook'}</h2>
      <form onSubmit={(e) => e.preventDefault()}>
        <div className="field">
          <label htmlFor="f-title">Title</label>
          <input type="text" id="f-title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="f-author">Author</label>
          <input type="text" id="f-author" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="f-cover">Cover image URL (optional)</label>
          <input type="url" id="f-cover" placeholder="https://..." value={form.cover} onChange={(e) => setForm({ ...form, cover: e.target.value })} />
          <div className="hint">Shown at its real proportions — never cropped or padded.</div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="f-cuisine">Cuisine / category</label>
            <input type="text" id="f-cuisine" placeholder="e.g. Baking, Thai" value={form.cuisine} onChange={(e) => setForm({ ...form, cuisine: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="f-status">Shelf status</label>
            <select id="f-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CookbookStatus })}>
              <option value="want">Want to try</option>
              <option value="cooking">Cooking through</option>
              <option value="favorite">Favorite</option>
              <option value="reference">Reference</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>Rating</label>
          <StarRating value={form.rating} onChange={(rating) => setForm({ ...form, rating })} />
        </div>
        <div className="field">
          <label htmlFor="f-notes">Notes</label>
          <textarea id="f-notes" placeholder="Favorite recipes, gift from..., go-to for weeknights..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={save}>Save</button>
        </div>
      </form>
    </Overlay>
  );
}
