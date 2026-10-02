import { colorFor } from '../../utils/colors';
import { starStr } from '../../utils/stars';
import { relDays } from '../../utils/dates';
import { cookCount, effectiveRating, lastCooked } from '../../utils/recipeStats';
import type { Cookbook, MealPlanEntry, Recipe } from '../../types';

interface RecipeCardProps {
  recipe: Recipe;
  book: Cookbook | null;
  planned: boolean;
  onOpen: () => void;
  onCook: () => void;
  onPlan: () => void;
}

export function RecipeCard({ recipe: r, book: b, planned, onOpen, onCook, onPlan }: RecipeCardProps) {
  const count = cookCount(r);
  const last = lastCooked(r);
  const rating = effectiveRating(r);

  const rawTags = r?.tags || [];
  const tags = rawTags.slice(0, 3);

  return (
    <div className="rcard" onClick={onOpen}>
      <div className="rcard-img" style={{ position: 'relative' }}>
        {r.image ? (
          <img src={r.image} alt={r.name || 'Recipe'} />
        ) : (
          <div className="rcard-initial" style={{ background: colorFor(r.name || 'x') }}>
            {(r.name || '?').trim().charAt(0).toUpperCase()}
          </div>
        )}
        <div className="card-flags">
          {r.favorite && <span className="card-flag fav" title="Favorite">{'\u2665'}</span>}
          {r.wantToTry && <span className="card-flag want" title="Want to try">{'\u2691'}</span>}
          {planned && <span className="card-flag" title="On this week's plan">{'\u25cf'}</span>}
        </div>
      </div>

      <div className="rcard-body">
        <div className="rcard-name">{r.name}</div>
        <div className="rcard-book">
          {b ? `${b.title}${b.author ? ' \u00b7 ' + b.author : ''}` : 'No cookbook'}
          {r.page ? ` \u00b7 p.${r.page}` : ''}
        </div>
        {rating > 0 && <div className="rcard-stars">{starStr(rating)}</div>}
        <div className="rcard-meta">
          <span>{count ? `Cooked ${count}\u00d7` : 'Never cooked'}</span>
          {last && <span>Last {relDays(last)}</span>}
        </div>
        {tags.length > 0 && (
          <div className="tag-row">
            {tags.map((t, idx) => (
              <span key={`${t}-${idx}`} className="tag">{t}</span>
            ))}
            {rawTags.length > 3 && <span className="tag">+{rawTags.length - 3}</span>}
          </div>
        )}
      </div>

      <div className="rcard-actions" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onCook}>Cook</button>
        <button type="button" onClick={onPlan}>Plan</button>
      </div>
    </div>
  );
}

export function planCountFor(recipeId: string, entries: MealPlanEntry[] = []): number {
  if (!Array.isArray(entries)) return 0;
  return entries.filter((e) => e?.recipeId === recipeId).length;
}