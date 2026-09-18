import { useState } from 'react';

// NOTE on this feature: the original app ran inside a claude.ai artifact, where
// fetch("https://api.anthropic.com/v1/messages") is whitelisted and needs no key.
// A standalone app has no such privilege — Anthropic's API does support direct
// browser calls, but only with your own API key and the
// "anthropic-dangerous-direct-browser-access" header, which means the key sits
// in this browser's localStorage. That's a real tradeoff (anyone with access to
// this browser profile can read it), not a security best practice — it's the
// only way to keep this feature working with zero backend. If that's not
// acceptable, leave the key field blank and add recipes by hand instead.

const KEY_STORAGE = 'stacks.anthropicApiKey';

interface FoundRecipe { name: string; page: string; }

interface WebImportPanelProps {
  initialTitle: string;
  initialAuthor: string;
  onImport: (recipes: FoundRecipe[]) => Promise<void>;
  onCancel: () => void;
}

export function WebImportPanel({ initialTitle, initialAuthor, onImport, onCancel }: WebImportPanelProps) {
  const [title, setTitle] = useState(initialTitle);
  const [author, setAuthor] = useState(initialAuthor);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(KEY_STORAGE) || '');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<FoundRecipe[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!apiKey.trim()) { setError('Paste an Anthropic API key below to use this — or add recipes by hand instead.'); return; }
    localStorage.setItem(KEY_STORAGE, apiKey.trim());
    setLoading(true);
    setError(null);
    setStatus('Searching the web...');
    setResults([]);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{
            role: 'user',
            content: `Find the recipes contained in the cookbook "${title}"${author ? ' by ' + author : ''}. ` +
              `Respond with ONLY a JSON array, no markdown fences, no commentary, shaped like: ` +
              `[{"name":"Recipe name","page":"12"}]. Page can be an empty string if unknown. List as many real recipes as you can find.`
          }]
        })
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${text ? ' — ' + text.slice(0, 200) : ''}`);
      }
      const data = await res.json();
      const text = (data.content || []).map((b: any) => (b.type === 'text' ? b.text : '')).join('\n');
      const match = text.replace(/```json|```/g, '').trim().match(/\[[\s\S]*\]/);
      const parsed: FoundRecipe[] = match ? JSON.parse(match[0]) : [];
      if (!parsed.length) { setStatus(null); setError("Couldn't find recipes for that book. Try adjusting the title/author, or add recipes by hand."); return; }
      setResults(parsed);
      setSelected(new Set(parsed.map((_, i) => i)));
      setStatus(`Found ${parsed.length} recipe${parsed.length === 1 ? '' : 's'} — review and add the ones you want.`);
    } catch (err: any) {
      setError(`Search failed: ${err.message || err}`);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (i: number) => {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i); else next.add(i);
    setSelected(next);
  };

  const addSelected = async () => {
    const chosen = results.filter((_, i) => selected.has(i));
    if (!chosen.length) return;
    await onImport(chosen);
  };

  return (
    <div className="import-panel" style={{ display: 'block' }}>
      <div className="field-row">
        <div className="field"><label>Book title</label><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="field"><label>Author</label><input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} /></div>
      </div>
      <div className="field">
        <label>Your Anthropic API key</label>
        <input type="password" placeholder="sk-ant-..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        <div className="hint">Stored only in this browser's local storage, used only for this search. See the note in the README about this tradeoff.</div>
      </div>
      <div className="modal-actions" style={{ marginTop: 0 }}>
        <button type="button" className="btn small" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn primary small" onClick={search} disabled={loading}>
          {loading ? 'Searching...' : 'Search the web'}
        </button>
      </div>
      {status && <p className="hint">{status}</p>}
      {error && <p className="hint" style={{ color: 'var(--spine-red)' }}>{error}</p>}
      {results.length > 0 && (
        <>
          <ul style={{ listStyle: 'none', margin: '10px 0', padding: 0, maxHeight: 220, overflowY: 'auto' }}>
            {results.map((r, i) => (
              <li key={i} style={{ padding: '5px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'baseline', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                  <span>{r.name}{r.page ? <span className="muted"> — p.{r.page}</span> : null}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="modal-actions" style={{ marginTop: 0 }}>
            <button type="button" className="btn primary small" onClick={addSelected}>
              Add {selected.size} recipe{selected.size === 1 ? '' : 's'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
