import type { Cookbook } from '../types';
import { colorFor } from '../utils/colors';

// This is the one genuinely imperative piece of the app: an "infinite" virtual
// bookshelf where the same books repeat across staggered columns, growing as
// you scroll in any direction. Doing this with React reconciliation (a few
// thousand DOM nodes mounting/unmounting every scroll tick) would be slow and
// fight the framework, so — same as wrapping D3 or Mapbox — it's a small
// self-contained engine that owns a container element directly. React just
// mounts it, feeds it data, and tears it down. The math/behavior below mirrors
// the original implementation exactly.

const TILE_WIDTH = 176;
const GAP = 26;
const COL_PITCH = TILE_WIDTH + GAP;
const DEFAULT_ASPECT = 1.3; // height/width fallback for covers we haven't measured yet
const STAGGER_PATTERN = [0, 34, 14, 44, 20];
const MAX_RADIUS = 40;
const EDGE_THRESHOLD = 900;
const GROW_STEP = 4;
const MAX_TILES_TOTAL = 1400;
const CENTER_X = 500000;
const CENTER_Y = 1000000;

interface ColState { top: number; bottom: number; downN: number; upN: number; }

export interface ShelfEngineCallbacks {
  onOpenBook: (bookId: string) => void;
}

export class ShelfEngine {
  private container: HTMLElement;
  private callbacks: ShelfEngineCallbacks;
  private items: Cookbook[] = [];
  private aspectCache: Record<string, number> = {};

  private tilesByBook: Record<string, HTMLElement[]> = {};
  private colState: Record<number, ColState> = {};
  private minColGen = 0;
  private maxColGen = -1;
  private totalTiles = 0;

  private scrollTicking = false;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private onScroll = () => {
    if (this.scrollTicking) return;
    this.scrollTicking = true;
    requestAnimationFrame(() => { this.maybeGrow(); this.scrollTicking = false; });
  };
  private onResize = () => {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => this.maybeGrow(), 200);
  };

  constructor(container: HTMLElement, callbacks: ShelfEngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    window.addEventListener('scroll', this.onScroll);
    window.addEventListener('resize', this.onResize);
  }

  destroy(): void {
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onResize);
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.container.innerHTML = '';
  }

  /** Rebuilds the shelf for a new filtered/sorted set of books, then centers the view. */
  async setItems(items: Cookbook[]): Promise<void> {
    this.items = items;
    this.container.innerHTML = '';
    this.tilesByBook = {};
    this.colState = {};
    this.minColGen = 0;
    this.maxColGen = -1;
    this.totalTiles = 0;

    if (items.length === 0) return;

    await this.preloadAllAspects(items);

    const colsHalf = Math.ceil((window.innerWidth / 2) / COL_PITCH) + 2;
    this.minColGen = -colsHalf;
    this.maxColGen = colsHalf;
    const targetTop = CENTER_Y - window.innerHeight / 2 - 700;
    const targetBottom = CENTER_Y + window.innerHeight / 2 + 700;
    for (let c = this.minColGen; c <= this.maxColGen; c++) {
      this.initColumn(c);
      this.growColumnUp(c, targetTop);
      this.growColumnDown(c, targetBottom);
    }
    requestAnimationFrame(() => requestAnimationFrame(() => this.centerScroll()));
  }

  /** Re-renders the visible tiles for one book after it changes (rating, cover, etc.)
   *  without rebuilding the whole shelf. */
  updateBookVisual(book: Cookbook): void {
    const tiles = this.tilesByBook[book.id];
    if (!tiles) return;
    tiles.forEach((el) => { el.innerHTML = this.tileInnerHTML(book); });
  }

  private centerScroll(): void {
    window.scrollTo(CENTER_X - window.innerWidth / 2, CENTER_Y - window.innerHeight / 2);
  }

  private leftPxForCol(col: number): number { return CENTER_X + col * COL_PITCH - TILE_WIDTH / 2; }
  private rightPxForCol(col: number): number { return this.leftPxForCol(col) + TILE_WIDTH; }

  private preloadAspect(url: string): Promise<void> {
    if (!url || this.aspectCache[url] != null) return Promise.resolve();
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.aspectCache[url] = img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : DEFAULT_ASPECT;
        resolve();
      };
      img.onerror = () => { this.aspectCache[url] = DEFAULT_ASPECT; resolve(); };
      img.src = url;
    });
  }

  private async preloadAllAspects(items: Cookbook[]): Promise<void> {
    const covers = items.map((b) => b.cover).filter(Boolean);
    await Promise.all(covers.map((c) => this.preloadAspect(c)));
  }

  private getAspect(book: Cookbook): number {
    if (!book.cover) return DEFAULT_ASPECT;
    return this.aspectCache[book.cover] ?? DEFAULT_ASPECT;
  }

  private heightFor(book: Cookbook): number {
    return Math.round(TILE_WIDTH * this.getAspect(book));
  }

  private tileInnerHTML(book: Cookbook): string {
    const initial = (book.title || '?').trim().charAt(0).toUpperCase();
    const color = colorFor(book.title || 'x');
    const coverInner = book.cover
      ? `<img src="${escapeHtml(book.cover)}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
         <div class="cover-fallback" style="display:none; background:${color};">${escapeHtml(initial)}</div>`
      : `<div class="cover-fallback" style="background:${color};">${escapeHtml(initial)}</div>`;
    const recipes = book.recipes || [];
    const total = recipes.length;
    const tried = recipes.filter((r) => r.tried).length;
    const pct = total > 0 ? Math.round((tried / total) * 100) : 0;
    const pieBadge = total > 0
      ? `<div class="badge pie" title="${tried}/${total} recipes tried (${pct}%)">${buildRing(pct, 20, 3.5, false)}</div>`
      : '<span></span>';
    const ratingBadge = book.rating > 0 ? `<div class="badge rating">\u2605 ${book.rating}</div>` : '<span></span>';
    return `${coverInner}<div class="badges">${pieBadge}${ratingBadge}</div>`;
  }

  private createTile(book: Cookbook, left: number, top: number, height: number): void {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'tile';
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.width = TILE_WIDTH + 'px';
    el.style.height = height + 'px';
    el.dataset.book = book.id;
    el.innerHTML = this.tileInnerHTML(book);
    el.addEventListener('click', () => this.callbacks.onOpenBook(book.id));
    this.container.appendChild(el);
    if (!this.tilesByBook[book.id]) this.tilesByBook[book.id] = [];
    this.tilesByBook[book.id].push(el);
    this.totalTiles++;
  }

  private pickBook(col: number, n: number, dir: 'up' | 'down'): Cookbook {
    const idx = Math.abs(col * 907 + n * 131 + (dir === 'up' ? 500000 : 0)) % this.items.length;
    return this.items[idx];
  }

  private initColumn(col: number): void {
    const startY = CENTER_Y + STAGGER_PATTERN[((col % STAGGER_PATTERN.length) + STAGGER_PATTERN.length) % STAGGER_PATTERN.length];
    this.colState[col] = { top: startY, bottom: startY, downN: 0, upN: 0 };
  }

  private growColumnDown(col: number, target: number): void {
    if (!this.colState[col]) this.initColumn(col);
    const s = this.colState[col];
    while (s.bottom < target && this.totalTiles < MAX_TILES_TOTAL) {
      const book = this.pickBook(col, s.downN, 'down');
      const h = this.heightFor(book);
      this.createTile(book, this.leftPxForCol(col), s.bottom, h);
      s.bottom += h + GAP;
      s.downN++;
    }
  }

  private growColumnUp(col: number, target: number): void {
    if (!this.colState[col]) this.initColumn(col);
    const s = this.colState[col];
    while (s.top > target && this.totalTiles < MAX_TILES_TOTAL) {
      const book = this.pickBook(col, s.upN, 'up');
      const h = this.heightFor(book);
      const newTop = s.top - h - GAP;
      this.createTile(book, this.leftPxForCol(col), newTop, h);
      s.top = newTop;
      s.upN++;
    }
  }

  private maybeGrow(): void {
    if (this.items.length === 0 || this.totalTiles >= MAX_TILES_TOTAL) return;

    const viewLeft = window.scrollX, viewRight = viewLeft + window.innerWidth;
    const viewTop = window.scrollY, viewBottom = viewTop + window.innerHeight;
    const needTop = viewTop - EDGE_THRESHOLD;
    const needBottom = viewBottom + EDGE_THRESHOLD;

    for (let c = this.minColGen; c <= this.maxColGen; c++) {
      this.growColumnUp(c, needTop);
      this.growColumnDown(c, needBottom);
    }

    if (viewLeft - this.leftPxForCol(this.minColGen) < EDGE_THRESHOLD && this.minColGen > -MAX_RADIUS) {
      const newMin = Math.max(-MAX_RADIUS, this.minColGen - GROW_STEP);
      for (let c = newMin; c < this.minColGen; c++) { this.initColumn(c); this.growColumnUp(c, needTop); this.growColumnDown(c, needBottom); }
      this.minColGen = newMin;
    }
    if (this.rightPxForCol(this.maxColGen) - viewRight < EDGE_THRESHOLD && this.maxColGen < MAX_RADIUS) {
      const newMax = Math.min(MAX_RADIUS, this.maxColGen + GROW_STEP);
      for (let c = this.maxColGen + 1; c <= newMax; c++) { this.initColumn(c); this.growColumnUp(c, needTop); this.growColumnDown(c, needBottom); }
      this.maxColGen = newMax;
    }
  }
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function buildRing(pct: number, size: number, stroke: number, showLabel: boolean): string {
  const r = size / 2 - stroke / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(36,31,26,0.15)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--accent)" stroke-width="${stroke}" stroke-dasharray="${c}" stroke-dashoffset="${offset}" stroke-linecap="round" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    ${showLabel ? `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="${Math.round(size * 0.28)}" font-family="IBM Plex Sans, sans-serif" fill="var(--ink)">${pct}%</text>` : ''}
  </svg>`;
}

export { buildRing };
