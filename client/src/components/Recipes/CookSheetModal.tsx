import { useEffect, useState } from 'react';
import { Overlay } from '../common/Overlay';
import { StarRating } from '../common/StarRating';
import { todayIso } from '../../utils/dates';
import type { Recipe } from '../../types';
import type { CookingSessionInput } from '../../hooks/useAppData';

interface CookSheetModalProps {
  show: boolean;
  recipe: Recipe | null;
  onClose: () => void;
  onSave: (session: CookingSessionInput) => Promise<void>;
}

export function CookSheetModal({ show, recipe, onClose, onSave }: CookSheetModalProps) {
  const [date, setDate] = useState(todayIso());
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState('');
  const [again, setAgain] = useState(true);

  useEffect(() => {
    if (show) { setDate(todayIso()); setRating(0); setNotes(''); setAgain(true); }
  }, [show, recipe]);

  const save = async () => {
    await onSave({ date, rating, notes: notes.trim(), wouldMakeAgain: again });
    onClose();
  };

  return (
    <Overlay show={show} onClose={onClose} modalStyle={{ width: 'min(430px,100%)' }}>
      <h2 style={{ margin: '0 0 2px' }}>Cooked today?</h2>
      <p className="hint" style={{ marginBottom: 16 }}>{recipe?.name}</p>

      <div className="field">
        <label htmlFor="cook-date">Date</label>
        <input type="date" id="cook-date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="field bigstars">
        <label>How was it?</label>
        <StarRating value={rating} onChange={setRating} size="big" />
      </div>
      <div className="field">
        <label htmlFor="cook-notes">Notes</label>
        <textarea id="cook-notes" rows={3} placeholder="Added extra garlic and doubled the sauce..." value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="field">
        <label className="tried-toggle"><input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} /> Would make again</label>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" onClick={save}>Save cooking session</button>
      </div>
    </Overlay>
  );
}
