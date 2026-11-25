/**
 * 5x5 crossword construction: pick a template, seat a few theme words, and
 * backtrack over a word list until every across and down entry is a real,
 * distinct word. Pure TypeScript - no Deno APIs - so it runs under node tests.
 */
import type { CrossClue } from "./types.ts";
import { type Rng, randInt, shuffle } from "./rng.ts";

export const SIZE = 5;

/** '#' = black square. Every run of white squares is 3+ long, every white square is crossed. */
export const TEMPLATES: string[][] = [
  ["#....", ".....", ".....", ".....", "....#"],
  ["....#", ".....", ".....", ".....", "#...."],
  ["#...#", ".....", ".....", ".....", "#...#"],
  ["##...", ".....", ".....", ".....", "...##"],
  ["...##", ".....", ".....", ".....", "##..."],
  ["##...", "#....", ".....", "....#", "...##"],
  ["...##", "....#", ".....", "#....", "##..."],
  ["#...#", ".....", ".....", ".....", "....#"],
  ["#....", ".....", ".....", ".....", "#...#"],
];

export interface Slot {
  dir: "across" | "down";
  row: number;
  col: number;
  len: number;
  /** Cell indices (row * 5 + col) in reading order. */
  cells: number[];
}

/** Every across and down run of 2+ white squares, in standard numbering order per direction. */
export function slotsOf(grid: readonly string[]): Slot[] {
  const white = (r: number, c: number) => r >= 0 && c >= 0 && r < SIZE && c < SIZE && grid[r][c] !== "#";
  const slots: Slot[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!white(r, c)) continue;
      if (!white(r, c - 1) && white(r, c + 1)) {
        const cells: number[] = [];
        for (let k = c; white(r, k); k++) cells.push(r * SIZE + k);
        slots.push({ dir: "across", row: r, col: c, len: cells.length, cells });
      }
      if (!white(r - 1, c) && white(r + 1, c)) {
        const cells: number[] = [];
        for (let k = r; white(k, c); k++) cells.push(k * SIZE + c);
        slots.push({ dir: "down", row: r, col: c, len: cells.length, cells });
      }
    }
  }
  return slots;
}

/** Standard crossword numbering for a filled grid. Clue text is left empty. */
export function numberGrid(grid: readonly string[]): { across: CrossClue[]; down: CrossClue[] } {
  const slots = slotsOf(grid);
  const starts = [...new Set(slots.map((s) => s.row * SIZE + s.col))].sort((a, b) => a - b);
  const num = new Map(starts.map((cell, i) => [cell, i + 1]));
  const clue = (s: Slot): CrossClue => ({
    num: num.get(s.row * SIZE + s.col)!,
    row: s.row,
    col: s.col,
    len: s.len,
    answer: s.cells.map((i) => grid[Math.floor(i / SIZE)][i % SIZE]).join(""),
    clue: "",
  });
  return {
    across: slots.filter((s) => s.dir === "across").map(clue),
    down: slots.filter((s) => s.dir === "down").map(clue),
  };
}

// ---------------------------------------------------------------- word index

interface LenIndex {
  words: string[];
  /** bits[pos * 26 + letter] = bitset of the words with that letter at that position. */
  bits: Uint32Array[];
  n32: number;
  /** Lower = try first. */
  rank: Uint8Array;
}

function buildIndex(words: Iterable<string>, rankOf: (w: string) => number): Map<number, LenIndex> {
  const byLen = new Map<number, string[]>();
  for (const w of words) {
    if (!/^[A-Z]{3,5}$/.test(w)) continue;
    let list = byLen.get(w.length);
    if (!list) byLen.set(w.length, (list = []));
    list.push(w);
  }
  const index = new Map<number, LenIndex>();
  for (const [len, list] of byLen) {
    const n32 = Math.ceil(list.length / 32);
    const bits = Array.from({ length: len * 26 }, () => new Uint32Array(n32));
    const rank = new Uint8Array(list.length);
    list.forEach((w, i) => {
      rank[i] = rankOf(w);
      for (let p = 0; p < len; p++) bits[p * 26 + w.charCodeAt(p) - 65][i >>> 5] |= 1 << (i & 31);
    });
    index.set(len, { words: list, bits, n32, rank });
  }
  return index;
}

function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

// ---------------------------------------------------------------- fill

export interface FillOptions {
  /** Upper-case candidate theme words (3-5 letters). Seated where possible, never required. */
  theme: string[];
  /** Upper-case dictionary. Theme words are added to it. */
  words: Iterable<string>;
  /** Words to prefer when there is a choice (the very common ones). */
  preferred?: Set<string>;
  /** Words that must not appear. */
  exclude?: Set<string>;
  rng: Rng;
  /** Wall-clock budget; the search returns null when it runs out. Default 400ms. */
  budgetMs?: number;
}

export interface FillResult {
  grid: string[];
  across: CrossClue[];
  down: CrossClue[];
  /** Theme words that made it into the grid. */
  themeUsed: string[];
  template: number;
}

export function fillCrossword(opts: FillOptions): FillResult | null {
  const { rng } = opts;
  const exclude = opts.exclude ?? new Set<string>();
  const themeSet = new Set(opts.theme.filter((w) => /^[A-Z]{3,5}$/.test(w) && !exclude.has(w)));
  const dict = new Set<string>();
  for (const w of opts.words) if (!exclude.has(w)) dict.add(w);
  for (const w of themeSet) dict.add(w);
  const preferred = opts.preferred ?? new Set<string>();
  const index = buildIndex(dict, (w) => (themeSet.has(w) ? 0 : preferred.has(w) ? 1 : 2));
  const deadline = Date.now() + (opts.budgetMs ?? 400);

  const theme = shuffle(rng, [...themeSet]);
  // Aim high first (three theme words), then settle for fewer, then none.
  const aim = (attempt: number) => (attempt < 40 ? 3 : attempt < 100 ? 2 : attempt < 160 ? 1 : 0);
  let best: FillResult | null = null;
  for (let attempt = 0; attempt < 400 && Date.now() < deadline; attempt++) {
    const want = Math.min(aim(attempt), theme.length);
    if (best && best.themeUsed.length >= Math.max(1, want)) break;
    const t = randInt(rng, TEMPLATES.length);
    const found = tryFill(TEMPLATES[t], index, shuffle(rng, theme).slice(0, want), rng, deadline);
    if (!found) continue;
    const { across, down } = numberGrid(found);
    const used = [...across, ...down].map((e) => e.answer).filter((w) => themeSet.has(w));
    if (!best || used.length > best.themeUsed.length) best = { grid: found, across, down, themeUsed: used, template: t };
    if (used.length >= want) break;
  }
  return best;
}

function tryFill(template: string[], index: Map<number, LenIndex>, seat: string[], rng: Rng, deadline: number): string[] | null {
  const slots = slotsOf(template);
  const cells = new Array<string>(SIZE * SIZE).fill("");
  for (let i = 0; i < cells.length; i++) if (template[Math.floor(i / SIZE)][i % SIZE] === "#") cells[i] = "#";
  const used = new Set<string>();
  const done = new Array<boolean>(slots.length).fill(false);
  const crossing: number[][] = slots.map((s, i) =>
    slots.map((o, j) => (j !== i && o.cells.some((c) => s.cells.includes(c)) ? j : -1)).filter((j) => j >= 0)
  );

  const fits = (s: Slot, w: string) => s.cells.every((c, k) => cells[c] === "" || cells[c] === w[k]);
  const place = (si: number, w: string): number[] => {
    const set: number[] = [];
    slots[si].cells.forEach((c, k) => {
      if (cells[c] === "") { cells[c] = w[k]; set.push(c); }
    });
    done[si] = true;
    used.add(w);
    return set;
  };
  const unplace = (si: number, w: string, set: number[]) => {
    for (const c of set) cells[c] = "";
    done[si] = false;
    used.delete(w);
  };

  // Scratch buffers per word length for candidate bitsets.
  const scratch = new Map<number, Uint32Array>();
  /** Fills the scratch bitset for the slot's current pattern and returns how many words match. */
  const candidates = (s: Slot): { ix: LenIndex; bits: Uint32Array; count: number } | null => {
    const ix = index.get(s.len);
    if (!ix) return null;
    let buf = scratch.get(s.len);
    if (!buf) scratch.set(s.len, (buf = new Uint32Array(ix.n32)));
    buf.fill(0xffffffff);
    for (let k = 0; k < s.len; k++) {
      const ch = cells[s.cells[k]];
      if (ch === "") continue;
      const b = ix.bits[k * 26 + ch.charCodeAt(0) - 65];
      for (let i = 0; i < ix.n32; i++) buf[i] &= b[i];
    }
    let count = 0;
    const last = ix.words.length & 31;
    if (last) buf[ix.n32 - 1] &= (1 << last) - 1;
    for (let i = 0; i < ix.n32; i++) count += popcount(buf[i]);
    return { ix, bits: buf, count };
  };
  const count = (si: number): number => candidates(slots[si])?.count ?? 0;

  // Seat the theme words in random slots that take them (crossings must agree).
  const seated: Array<[number, string, number[]]> = [];
  for (const w of seat) {
    const options = shuffle(rng, slots.map((_, i) => i).filter((i) => !done[i] && slots[i].len === w.length && fits(slots[i], w)));
    let ok = false;
    for (const si of options) {
      const set = place(si, w);
      if (crossing[si].every((j) => done[j] || count(j) > 0)) { seated.push([si, w, set]); ok = true; break; }
      unplace(si, w, set);
    }
    if (!ok) return null;
  }

  let nodes = 0;
  const solve = (): boolean => {
    if (++nodes > 4000 || ((nodes & 63) === 0 && Date.now() > deadline)) return false;
    // Most-constrained slot first.
    let pick = -1, fewest = Infinity;
    for (let i = 0; i < slots.length; i++) {
      if (done[i]) continue;
      const n = count(i);
      if (n === 0) return false;
      if (n < fewest) { fewest = n; pick = i; }
    }
    if (pick < 0) return true;
    const c = candidates(slots[pick])!;
    const list: number[] = [];
    for (let i = 0; i < c.ix.n32; i++) {
      let word = c.bits[i];
      while (word) {
        const bit = word & -word;
        list.push((i << 5) + (31 - Math.clz32(bit)));
        word ^= bit;
      }
    }
    // Theme words, then everyday words, then the rest; random within each tier.
    const keyed = list.map((wi) => [c.ix.rank[wi] + rng(), wi] as const).sort((a, b) => a[0] - b[0]);
    const words = c.ix.words;
    let tried = 0;
    for (const [, wi] of keyed) {
      const w = words[wi];
      if (used.has(w)) continue;
      if (++tried > 24) break;
      const set = place(pick, w);
      if (crossing[pick].every((j) => done[j] || count(j) > 0) && solve()) return true;
      unplace(pick, w, set);
    }
    return false;
  };

  if (!solve()) return null;
  // Slots completed purely by crossings were never "placed": verify them and reject duplicates.
  const answers = slots.map((s) => s.cells.map((c) => cells[c]).join(""));
  if (new Set(answers).size !== answers.length) return null;
  for (const a of answers) if (!index.get(a.length)?.words.includes(a)) return null;
  const rows: string[] = [];
  for (let r = 0; r < SIZE; r++) rows.push(cells.slice(r * SIZE, r * SIZE + SIZE).join(""));
  return rows;
}
