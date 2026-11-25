import type { RarePuzzle } from '../types';

export const MISSES_ALLOWED = 3;

/** Lower case, no accents or punctuation, no leading article. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '');
}

export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev[j - 1]); // swapped pair ~ one slip
      low = Math.min(low, cur[j]);
    }
    if (low > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const singular = (s: string) => (s.length > 3 && s.endsWith('s') && !s.endsWith('ss') ? s.slice(0, -1) : s);

/**
 * Find the accepted answer a typed guess means. Exact matches (ignoring case,
 * punctuation and a plural s) win; otherwise a small typo allowance that grows
 * with length, and only when one answer is clearly the closest.
 */
export function matchAnswer(prompt: RarePuzzle['prompts'][number], typed: string): { a: string; pts: number } | null {
  const guess = singular(normalize(typed));
  if (guess.length < 2) return null;
  const slack = guess.length <= 4 ? 0 : guess.length <= 8 ? 1 : 2;
  let best: { a: string; pts: number } | null = null;
  let bestD = slack + 1;
  let tie = false;
  for (const ans of prompt.answers) {
    for (const name of [ans.a, ...(ans.alt ?? [])]) {
      const target = singular(normalize(name));
      if (target === guess) return { a: ans.a, pts: ans.pts };
      const d = editDistance(guess, target, slack);
      if (d < bestD) {
        bestD = d;
        best = { a: ans.a, pts: ans.pts };
        tie = false;
      } else if (d === bestD && best && best.a !== ans.a) {
        tie = true;
      }
    }
  }
  return tie ? null : best;
}

export function tierLabel(pts: number): string {
  if (pts >= 85) return 'Long shot!';
  if (pts >= 65) return 'Out of left field';
  if (pts >= 45) return 'Good call';
  if (pts >= 25) return 'Safe bet';
  return 'Crowd favorite';
}

/** The day's score is the average of the five answers. */
export function rarePoints(scores: number[], prompts: number): number {
  return Math.round(scores.reduce((s, n) => s + n, 0) / Math.max(1, prompts));
}
