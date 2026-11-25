/**
 * Word Trails board construction. A random Hamiltonian path over the grid is
 * cut into consecutive word-length pieces, so every letter belongs to exactly
 * one word and each word is a connected trail. Pure TypeScript.
 */
import type { TrailsPuzzle } from "./types.ts";
import { type Rng, randInt, shuffle } from "./rng.ts";

export const TRAIL_ROWS = 8;
export const TRAIL_COLS = 6;

/** Letters only, upper case ("ice cream" -> "ICECREAM"). */
export const lettersOf = (s: string): string => s.toUpperCase().replace(/[^A-Z]/g, "");

/**
 * Chooses candidate words whose lengths, with the spanning word, add up to
 * exactly `total`. Prefers about seven words. Returns null if no subset works.
 */
export function pickWords(span: string, candidates: string[], total: number, rng: Rng): string[] | null {
  const target = total - span.length;
  const pool = shuffle(rng, [...new Set(candidates)].filter((w) => w !== span));
  // reach[i][s] = can some subset of pool[i..] sum to s
  const reach: Uint8Array[] = Array.from({ length: pool.length + 1 }, () => new Uint8Array(target + 1));
  reach[pool.length][0] = 1;
  for (let i = pool.length - 1; i >= 0; i--) {
    for (let s = 0; s <= target; s++) {
      reach[i][s] = reach[i + 1][s] || (s >= pool[i].length && reach[i + 1][s - pool[i].length]) ? 1 : 0;
    }
  }
  if (!reach[0][target]) return null;
  let best: string[] | null = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const chosen: string[] = [];
    let s = target;
    for (let i = 0; i < pool.length && s > 0; i++) {
      const canTake = s >= pool[i].length && reach[i + 1][s - pool[i].length];
      const canSkip = reach[i + 1][s];
      if (canTake && (!canSkip || rng() < 0.6)) { chosen.push(pool[i]); s -= pool[i].length; }
    }
    if (s !== 0) continue;
    // With the span that makes about eight finds, which plays best on a 48-letter board.
    const score = Math.abs(chosen.length - 7);
    if (!best || score < Math.abs(best.length - 7)) best = chosen;
    if (score === 0) break;
  }
  return best;
}

/** A uniformly-ish random Hamiltonian path over the grid (backbite moves from a snake). */
export function randomPath(rows: number, cols: number, rng: Rng): number[] {
  const n = rows * cols;
  const path: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) path.push(r * cols + (r % 2 === 0 ? k : cols - 1 - k));
  }
  const at = new Int32Array(n);
  path.forEach((cell, i) => (at[cell] = i));
  const reverse = (i: number, j: number) => {
    for (; i < j; i++, j--) {
      const a = path[i], b = path[j];
      path[i] = b; path[j] = a;
      at[b] = i; at[a] = j;
    }
  };
  const moves = n * 12;
  for (let m = 0; m < moves; m++) {
    const head = rng() < 0.5;
    const end = head ? path[0] : path[n - 1];
    const r = Math.floor(end / cols), c = end % cols;
    const dir = randInt(rng, 4);
    const nr = r + (dir === 0 ? -1 : dir === 1 ? 1 : 0);
    const nc = c + (dir === 2 ? -1 : dir === 3 ? 1 : 0);
    if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
    const j = at[nr * cols + nc];
    if (head) {
      if (j === 1) continue;
      reverse(0, j - 1);
    } else {
      if (j === n - 2) continue;
      reverse(j + 1, n - 1);
    }
  }
  return path;
}

const touchesOppositeEdges = (cells: number[], rows: number, cols: number): boolean => {
  let top = false, bottom = false, left = false, right = false;
  for (const cell of cells) {
    const r = Math.floor(cell / cols), c = cell % cols;
    if (r === 0) top = true;
    if (r === rows - 1) bottom = true;
    if (c === 0) left = true;
    if (c === cols - 1) right = true;
  }
  return (top && bottom) || (left && right);
};

/**
 * Lays the words out so they tile the grid exactly. `span` must be one of
 * `words`; its trail will touch two opposite edges. Null if the lengths do not
 * sum to rows * cols or no layout was found within `tries` paths.
 */
export function packTrails(
  theme: string,
  span: string,
  words: string[],
  rng: Rng,
  rows = TRAIL_ROWS,
  cols = TRAIL_COLS,
  tries = 3000,
): TrailsPuzzle | null {
  const all = [span, ...words.filter((w) => w !== span)];
  if (all.reduce((s, w) => s + w.length, 0) !== rows * cols) return null;
  for (let t = 0; t < tries; t++) {
    const path = randomPath(rows, cols, rng);
    const order = shuffle(rng, all);
    let pos = 0;
    const placed: TrailsPuzzle["words"] = [];
    let ok = true;
    for (const word of order) {
      let cells = path.slice(pos, pos + word.length);
      pos += word.length;
      if (word === span && !touchesOppositeEdges(cells, rows, cols)) { ok = false; break; }
      if (rng() < 0.5) cells = cells.reverse();
      placed.push(word === span ? { word, path: cells, span: true } : { word, path: cells });
    }
    if (!ok) continue;
    const letters = new Array<string>(rows * cols);
    for (const p of placed) p.path.forEach((cell, k) => (letters[cell] = p.word[k]));
    const grid: string[] = [];
    for (let r = 0; r < rows; r++) grid.push(letters.slice(r * cols, r * cols + cols).join(""));
    // Reading order of first letters, so the answer list is not in path order.
    placed.sort((a, b) => Math.min(...a.path) - Math.min(...b.path));
    return { theme, rows, cols, grid, words: placed };
  }
  return null;
}
