import { useState } from 'react';
import { Overlay } from '../common/Overlay';
import { parseCsv, groupCsvRows, type CsvGroup } from '../../utils/csv';
import type { Cookbook } from '../../types';

interface CsvImportModalProps {
  show: boolean;
  books: Cookbook[];
  onClose: () => void;
  onImport: (groups: CsvGroup[]) => Promise<{ newBooksAdded: boolean }>;
}

export function CsvImportModal({ show, books, onClose, onImport }: CsvImportModalProps) {
  const [groups, setGroups] = useState<CsvGroup[]>([]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const [done, setDone] = useState<string | null>(null);

  const findMatch = (title: string, author: string): string | null => {
    const t = title.trim().toLowerCase();
    const a = author.trim().toLowerCase();
    const match = books.find((b) => b.title.trim().toLowerCase() === t && (!a || b.author.trim().toLowerCase() === a));
    return match ? match.id : null;
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null); setDone(null); setGroups([]);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const rows = parseCsv(String(evt.target?.result || ''));
      const { groups: found, error: err } = groupCsvRows(rows);
      if (err) { setError(err); return; }
      const withMatches = found.map((g) => ({ ...g, matchId: findMatch(g.bookTitle, g.author) }));
      setGroups(withMatches);
      setChecked(new Set(withMatches.map((_, i) => i)));
      setRowCount(rows.length - 1);
    };
    reader.readAsText(file);
  };

  const toggle = (i: number) => {
    const next = new Set(checked);
    if (next.has(i)) next.delete(i); else next.add(i);
    setChecked(next);
  };

  const runImport = async () => {
    const selected = groups.filter((_, i) => checked.has(i));
    if (!selected.length) return;
    const result = await onImport(selected);
    setDone(`Imported ${selected.reduce((n, g) => n + g.recipes.length, 0)} recipes${result.newBooksAdded ? ' into new and existing cookbooks.' : ' into your existing cookbooks.'}`);
    setGroups([]);
  };

  return (
    <Overlay show={show} onClose={onClose}>
      <h2 style={{ marginTop: 0 }}>Import recipes from CSV</h2>
      <p className="hint" style={{ marginBottom: 14 }}>
        Expects columns for recipe title, book title, and (optionally) author and page number — like the ones you'd export from a recipe-tracking spreadsheet.
      </p>
      <div className="field">
        <input type="file" accept=".csv,text/csv" onChange={onFile} />
      </div>

      {error && <p className="hint" style={{ color: 'var(--spine-red)' }}>{error}</p>}
      {done && <p className="hint">{done}</p>}

      {groups.length > 0 && (
        <>
          <p className="hint">Found {groups.length} book{groups.length === 1 ? '' : 's'} across {rowCount} rows.</p>
          {groups.map((g, i) => (
            <div className="csv-group" key={i}>
              <label className="csv-group-head">
                <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} />
                <span>
                  <div className="csv-group-title">{g.bookTitle}{g.author ? ' \u2014 ' + g.author : ''}</div>
                  <div className="csv-group-meta">{g.recipes.length} recipe{g.recipes.length === 1 ? '' : 's'}</div>
                  {g.matchId
                    ? <span className="csv-tag match">Adds to your existing "{g.bookTitle}"</span>
                    : <span className="csv-tag new">Will create a new book</span>}
                </span>
              </label>
            </div>
          ))}
          <div className="modal-actions" style={{ marginTop: 14 }}>
            <button type="button" className="btn primary" onClick={runImport}>Import selected</button>
          </div>
        </>
      )}

      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
    </Overlay>
  );
}
