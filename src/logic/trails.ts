import type { TrailsPuzzle } from '../types';

export function adjacent(a: number, b: number, cols: number): boolean {
  const dr = Math.abs(Math.floor(a / cols) - Math.floor(b / cols));
  const dc = Math.abs((a % cols) - (b % cols));
  return a !== b && dr <= 1 && dc <= 1;
}

export const letterAt = (p: TrailsPuzzle, i: number) => p.grid[Math.floor(i / p.cols)][i % p.cols];

/**
 * Which unfound word a traced path finds, or -1. The trace must spell the word
 * (forwards or backwards) over that word's own letters, since every letter on
 * the board belongs to exactly one word.
 */
export function matchTrail(p: TrailsPuzzle, path: number[], found: number[]): number {
  const key = [...path].sort((x, y) => x - y).join(',');
  const spelled = path.map((i) => letterAt(p, i)).join('');
  const reversed = [...spelled].reverse().join('');
  return p.words.findIndex(
    (w, i) =>
      !found.includes(i) &&
      w.path.length === path.length &&
      (w.word === spelled || w.word === reversed) &&
      [...w.path].sort((x, y) => x - y).join(',') === key,
  );
}

export function trailsPoints(hints: number): number {
  return Math.max(20, 100 - hints * 12);
}
