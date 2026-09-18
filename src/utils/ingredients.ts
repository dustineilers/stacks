import { uid } from './id';
import type { Ingredient } from '../types';

export const GROCERY_CATEGORIES = [
  'Produce', 'Meat / Seafood', 'Dairy / Eggs', 'Pantry',
  'Spices / Seasonings', 'Bakery', 'Frozen', 'Other'
] as const;

const CATEGORY_HINTS: Record<string, string[]> = {
  'Produce': ['onion','garlic','shallot','tomato','potato','carrot','celery','pepper','lettuce','spinach','kale','herb','parsley','cilantro','basil','thyme','rosemary','mint','lemon','lime','orange','apple','banana','berry','berries','mushroom','zucchini','squash','cucumber','avocado','ginger','scallion','leek','broccoli','cauliflower','cabbage','sprouts','corn','pea','bean sprout','chile','jalape','eggplant','radish','beet','apricot','peach','pear','grape','melon','fennel','arugula','chard','turnip','yam','sweet potato','mango','pineapple'],
  'Meat / Seafood': ['beef','chicken','pork','lamb','turkey','bacon','sausage','steak','ground','shrimp','fish','salmon','tuna','cod','crab','lobster','scallop','clam','mussel','anchov','prosciutto','pancetta','chorizo','duck','veal','ham','brisket','thigh','breast'],
  'Dairy / Eggs': ['milk','cream','butter','cheese','yogurt','egg','parmesan','mozzarella','cheddar','ricotta','feta','mascarpone','sour cream','creme fraiche','buttermilk','ghee','gruy'],
  'Bakery': ['bread','baguette','tortilla','pita','bun','roll','brioche','croissant','naan','sourdough','crouton'],
  'Frozen': ['frozen','ice cream','peas frozen'],
  'Spices / Seasonings': ["salt","pepper","paprika","cumin","coriander","turmeric","cinnamon","nutmeg","clove","cardamom","chili powder","chile flakes","red pepper flakes","oregano","bay leaf","curry","garam","seasoning","vanilla","saffron","fennel seed","mustard seed","sumac","za'atar","allspice","cayenne","spice"],
  'Pantry': ['flour','sugar','oil','vinegar','rice','pasta','noodle','stock','broth','can','canned','tomato paste','soy sauce','fish sauce','honey','syrup','mustard','mayo','ketchup','beans','lentil','chickpea','yeast','baking powder','baking soda','cornstarch','breadcrumb','wine','sesame','tahini','coconut milk','nut','almond','walnut','pecan','cashew','peanut','olive','caper','chocolate','cocoa','oat','quinoa','couscous','polenta','gelatin','miso','sriracha','worcestershire']
};

const UNITS = [
  'tbsp','tablespoon','tablespoons','tsp','teaspoon','teaspoons','cup','cups','oz','ounce','ounces',
  'lb','lbs','pound','pounds','g','gram','grams','kg','ml','l','liter','liters','clove','cloves',
  'can','cans','jar','jars','bunch','bunches','sprig','sprigs','slice','slices','stick','sticks',
  'head','heads','pinch','pinches','dash','handful','package','packages','pkg','quart','quarts',
  'pint','pints','stalk','stalks','ear','ears','piece','pieces','fillet','fillets','box','boxes',
  'bag','bags'
];

export function guessCategory(text: string): string {
  const t = (text || '').toLowerCase();
  for (const cat of ['Produce', 'Meat / Seafood', 'Dairy / Eggs', 'Bakery', 'Frozen', 'Spices / Seasonings', 'Pantry']) {
    if ((CATEGORY_HINTS[cat] || []).some((k) => t.includes(k))) return cat;
  }
  return 'Other';
}

/** Parses a free-text ingredient line ("2 tbsp olive oil", "3 cloves garlic, minced")
 *  into a structured ingredient. Deliberately simple — this is a personal cookbook
 *  app, not a commercial-grade ingredient parser. */
export function parseIngredientLine(line: string): Ingredient | null {
  const raw = String(line || '').trim();
  if (!raw) return null;
  let rest = raw, qty = '', unit = '', note = '';

  const commaIdx = rest.indexOf(',');
  if (commaIdx > -1) {
    note = rest.slice(commaIdx + 1).trim();
    rest = rest.slice(0, commaIdx).trim();
  }

  // leading quantity: 2, 1/2, 1 1/2, 1.5, 2-3
  const qm = rest.match(/^((\d+\s+\d\/\d)|(\d+\s*[-\u2013]\s*\d+)|(\d*\.?\d+\s*\/\s*\d+)|(\d*\.?\d+))\s*/);
  if (qm) {
    qty = qm[1].replace(/\s*([-\u2013/])\s*/g, '$1').trim();
    rest = rest.slice(qm[0].length).trim();
  }

  const um = rest.match(/^([a-zA-Z.]+)\s+/);
  if (um) {
    const cand = um[1].replace(/\.$/, '').toLowerCase();
    if (UNITS.includes(cand)) {
      unit = cand;
      rest = rest.slice(um[0].length).trim();
    }
  }

  const name = rest || raw;
  return { id: uid('i'), qty, unit, name, note, category: guessCategory(name + ' ' + note) };
}

export function ingredientToLine(i: Ingredient): string {
  return [i.qty, i.unit, i.name].filter(Boolean).join(' ') + (i.note ? ', ' + i.note : '');
}

/** Adds two grocery-list quantities together where both are plain numbers;
 *  otherwise falls back to a readable "a + b" so nothing is lost. */
export function addQuantities(a: string, b: string): string {
  const na = parseFloat(a), nb = parseFloat(b);
  if (!isNaN(na) && !isNaN(nb) && /^[\d.]+$/.test(a) && /^[\d.]+$/.test(b)) {
    return String(Math.round((na + nb) * 100) / 100);
  }
  if (!a) return b || '';
  if (!b) return a || '';
  return a + ' + ' + b;
}
