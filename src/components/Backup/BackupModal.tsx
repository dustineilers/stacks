import { useState } from 'react';
import { Overlay } from '../common/Overlay';
import type { BackupPayload, ImportSummary } from '../../db/repository';

interface BackupModalProps {
  show: boolean;
  onClose: () => void;
  onExport: () => BackupPayload;
  onImport: (parsed: any) => Promise<ImportSummary>;
}

export function BackupModal({ show, onClose, onExport, onImport }: BackupModalProps) {
  const [exportHint, setExportHint] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const download = () => {
    const payload = onExport();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stacks-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportHint('Downloaded.');
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    setImportError(null);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const parsed = JSON.parse(String(evt.target?.result || ''));
        const summary = await onImport(parsed);
        const parts = [
          summary.addedBooks ? `${summary.addedBooks} new book${summary.addedBooks === 1 ? '' : 's'}` : null,
          summary.addedRecipes ? `${summary.addedRecipes} recipe${summary.addedRecipes === 1 ? '' : 's'} into existing books` : null,
          summary.addedStandalone ? `${summary.addedStandalone} standalone recipe${summary.addedStandalone === 1 ? '' : 's'}` : null,
          summary.addedGrocery ? `${summary.addedGrocery} grocery item${summary.addedGrocery === 1 ? '' : 's'}` : null
        ].filter(Boolean);
        setImportResult(parts.length ? `Added ${parts.join(', ')}.` : 'Nothing new to add — everything in that file is already on your shelf.');
      } catch (err: any) {
        setImportError(`Couldn't read that file: ${err.message || err}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <Overlay show={show} onClose={onClose}>
      <h2 style={{ marginTop: 0 }}>Backup your shelf</h2>
      <p className="hint" style={{ marginBottom: 16 }}>
        Save a copy of everything on your shelf, or load one back in — handy for moving your data to a newer version of this app, or just keeping a backup.
      </p>

      <div className="field">
        <label>Export</label>
        <button type="button" className="btn primary" onClick={download}>Download backup (.json)</button>
        {exportHint && <div className="hint">{exportHint}</div>}
      </div>

      <div className="field" style={{ marginTop: 22 }}>
        <label htmlFor="backup-file">Import a backup file</label>
        <input type="file" id="backup-file" accept=".json,application/json" onChange={onFile} />
        <div className="hint">Books already on your shelf are kept — this only adds books/recipes that aren't already there.</div>
        {importResult && <div className="hint">{importResult}</div>}
        {importError && <div className="hint" style={{ color: 'var(--spine-red)' }}>{importError}</div>}
      </div>

      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
    </Overlay>
  );
}
