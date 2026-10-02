import { GROCERY_CATEGORIES } from './ingredients';
import type { GroceryItem } from '../types';

export function formatGroceryListAsText(items: GroceryItem[]): string {
  const groups = GROCERY_CATEGORIES
    .map((category) => ({
      category,
      items: items.filter(
        (item) => item.category === category && !item.checked
      ),
    }))
    .filter((group) => group.items.length > 0);

  const lines: string[] = [
    '🛒 Grocery List',
    '',
  ];

  for (const group of groups) {
    lines.push(group.category.toUpperCase());

    for (const item of group.items) {
      const quantity = [item.qty, item.unit]
        .filter(Boolean)
        .join(' ');

      let line = `☐ ${quantity ? `${quantity} ` : ''}${item.name}`;

      if (item.note) {
        line += `, ${item.note}`;
      }

      lines.push(line);
    }

    lines.push('');
  }

  const uncheckedCount = items.filter((item) => !item.checked).length;
  const checkedCount = items.filter((item) => item.checked).length;

  lines.push(
    `${uncheckedCount} item${uncheckedCount === 1 ? '' : 's'}${
      checkedCount
        ? ` · ${checkedCount} already checked`
        : ''
    }`
  );

  return lines.join('\n');
}
