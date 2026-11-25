import type { CrossClue, CrossPuzzle } from '../types';

export const N = 5;
export type Dir = 'across' | 'down';

export const isBlock = (p: CrossPuzzle, i: number) => p.grid[Math.floor(i / N)][i % N] === '#';
export const solutionAt = (p: CrossPuzzle, i: number) => p.grid[Math.floor(i / N)][i % N];

export function clueCells(c: CrossClue, dir: Dir): number[] {
  return Array.from({ length: c.len }, (_, k) => (dir === 'across' ? c.row * N + c.col + k : (c.row + k) * N + c.col));
}

/** The clue running through cell i in the given direction, if any. */
export function clueAt(p: CrossPuzzle, i: number, dir: Dir): CrossClue | undefined {
  return p[dir].find((c) => clueCells(c, dir).includes(i));
}

/** The small number printed in each cell that starts an entry. */
export function cellNumbers(p: CrossPuzzle): Record<number, number> {
  const nums: Record<number, number> = {};
  for (const c of [...p.across, ...p.down]) nums[c.row * N + c.col] = c.num;
  return nums;
}

export function isSolved(p: CrossPuzzle, fill: string[]): boolean {
  for (let i = 0; i < N * N; i++) if (!isBlock(p, i) && fill[i] !== solutionAt(p, i)) return false;
  return true;
}

export function isFull(p: CrossPuzzle, fill: string[]): boolean {
  for (let i = 0; i < N * N; i++) if (!isBlock(p, i) && !fill[i]) return false;
  return true;
}

/** Full marks inside 90 seconds, then a point every 4 seconds down to 40; each check or reveal costs extra. */
export function crossPoints(seconds: number, checks: number, reveals: number, gaveUp: boolean): number {
  if (gaveUp) return 10;
  const timed = Math.max(40, 100 - Math.max(0, Math.ceil((seconds - 90) / 4)));
  return Math.max(20, timed - checks * 8 - reveals * 12);
}
