/** A tiny hand-rolled CSV parser (handles quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else { field += c; }
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

export function findColumn(header: string[], keywords: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const h = header[i].toLowerCase();
    if (keywords.some((k) => h.includes(k))) return i;
  }
  return -1;
}

export interface CsvRecipeRow {
  name: string;
  page: string;
}

export interface CsvGroup {
  bookTitle: string;
  author: string;
  recipes: CsvRecipeRow[];
  matchId: string | null;
}

/** Groups CSV rows (Recipe / Book / Author / Page columns) into per-book batches. */
export function groupCsvRows(rows: string[][]): { groups: CsvGroup[]; error: string | null } {
  if (rows.length < 2) return { groups: [], error: 'That file looks empty.' };

  const header = rows[0];
  const recipeCol = findColumn(header, ['recipe']);
  const bookCol = findColumn(header, ['book', 'cookbook']);
  const authorCol = findColumn(header, ['author']);
  const pageCol = findColumn(header, ['page']);

  if (recipeCol === -1 || bookCol === -1) {
    return {
      groups: [],
      error: `Couldn't find "Recipe" and "Book" columns in the header row (found: ${header.join(', ')}).`
    };
  }

  const groupsMap: Record<string, CsvGroup> = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name = (r[recipeCol] || '').trim();
    const bookTitle = (r[bookCol] || '').trim();
    if (!name || !bookTitle) continue;
    const author = authorCol !== -1 ? (r[authorCol] || '').trim() : '';
    const page = pageCol !== -1 ? (r[pageCol] || '').trim() : '';
    const key = bookTitle.toLowerCase() + '|' + author.toLowerCase();
    if (!groupsMap[key]) groupsMap[key] = { bookTitle, author, recipes: [], matchId: null };
    groupsMap[key].recipes.push({ name, page });
  }

  const groups = Object.values(groupsMap);
  if (groups.length === 0) return { groups: [], error: 'No usable rows found.' };
  return { groups, error: null };
}
