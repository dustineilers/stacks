export function starStr(n: number): string {
  return '\u2605'.repeat(n) + '\u2606'.repeat(5 - n);
}
