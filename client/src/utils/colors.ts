export const SPINE_COLORS = [
  'var(--spine-red)',
  'var(--spine-forest)',
  'var(--spine-navy)',
  '#B4802B',
  '#5B3F5D',
  '#A85426'
];

export function colorFor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SPINE_COLORS[Math.abs(hash) % SPINE_COLORS.length];
}
