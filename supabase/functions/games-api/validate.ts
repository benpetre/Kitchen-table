/**
 * Strict checks for every puzzle type. Each returns a list of problems in
 * plain English (empty = valid); the generator feeds them back to the model
 * on a retry and the tests run them over finished puzzles. Pure TypeScript.
 */
import type { AtlasPuzzle, BlocksPuzzle, CrossPuzzle, GroupsPuzzle, PuzzleSet, RarePuzzle, TrailsPuzzle, WordPuzzle } from "./types.ts";
import { COMMON_WORDS, EASY_FIVES } from "./data/words.ts";
import { COUNTRIES } from "./data/countries.ts";
import { numberGrid, SIZE, slotsOf } from "./crossword.ts";

export const COMMON = new Set(COMMON_WORDS.toUpperCase().split(" "));
export const EASY5 = new Set(EASY_FIVES.toUpperCase().split(" "));
export const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c[0]));

/** Case, spacing, punctuation and accents never make two answers different. */
export const norm = (s: string): string =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

const isStr = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;

export function validateWord(p: WordPuzzle, recent: Set<string> = new Set()): string[] {
  const errs: string[] = [];
  if (typeof p?.answer !== "string" || !/^[A-Z]{5}$/.test(p.answer)) return ["answer must be exactly five letters A-Z, upper case"];
  if (!EASY5.has(p.answer) && !COMMON.has(p.answer)) errs.push(`${p.answer} is not in the common-word list; choose an everyday five-letter word`);
  if (recent.has(p.answer)) errs.push(`${p.answer} was used recently; choose a different word`);
  if (p.note !== undefined && !isStr(p.note, 160)) errs.push("note must be one short line (max 160 characters)");
  return errs;
}

export function validateGroups(p: GroupsPuzzle): string[] {
  const errs: string[] = [];
  if (!Array.isArray(p?.groups) || p.groups.length !== 4) return ["there must be exactly 4 groups"];
  const levels = p.groups.map((g) => g.level).sort().join("");
  if (levels !== "1234") errs.push("levels must be 1, 2, 3 and 4, each used once");
  const seen = new Map<string, string>();
  for (const g of p.groups) {
    if (!isStr(g.title, 60)) errs.push("every group needs a title of at most 60 characters");
    if (!Array.isArray(g.words) || g.words.length !== 4) { errs.push(`group "${g.title}" must have exactly 4 tiles`); continue; }
    for (const w of g.words) {
      if (!isStr(w, 16)) { errs.push(`tile "${w}" must be 1-16 characters`); continue; }
      const k = norm(w);
      if (!k) errs.push(`tile "${w}" has no letters or digits`);
      else if (seen.has(k)) errs.push(`tile "${w}" appears twice`);
      seen.set(k, g.title);
    }
  }
  return errs;
}

type RarePrompt = RarePuzzle["prompts"][number];

/**
 * One Long Shot prompt: distinct answers, scores spread from obvious to deep
 * cut. The generator aims for 35-50 answers; 20 is the floor so that a
 * category whose complete answer set is smaller than 30 is still usable.
 */
export function validateRarePrompt(q: RarePrompt, tag = "prompt"): string[] {
  const errs: string[] = [];
  if (!isStr(q?.prompt, 120)) errs.push(`${tag}: prompt text must be 1-120 characters`);
  if (!Array.isArray(q?.answers) || q.answers.length < 20 || q.answers.length > 60) {
    return [...errs, `${tag}: needs 20-60 accepted answers (has ${Array.isArray(q?.answers) ? q.answers.length : 0})`];
  }
  const seen = new Set<string>();
  for (const a of q.answers) {
    if (!isStr(a.a, 60)) { errs.push(`${tag}: an answer is empty or longer than 60 characters`); continue; }
    if (!Number.isInteger(a.pts) || a.pts < 1 || a.pts > 100) errs.push(`${tag}: "${a.a}" pts must be a whole number 1-100`);
    for (const s of [a.a, ...(a.alt ?? [])]) {
      if (!isStr(s, 60)) { errs.push(`${tag}: "${a.a}" has an empty or over-long alias`); continue; }
      const k = norm(s);
      if (!k) errs.push(`${tag}: "${s}" has no letters or digits`);
      else if (seen.has(k)) errs.push(`${tag}: "${s}" is listed more than once (answers and aliases must all be distinct)`);
      seen.add(k);
    }
  }
  if (!q.answers.some((a) => a.a === q.best)) errs.push(`${tag}: best ("${q.best}") must exactly match one of the answers`);
  const pts = q.answers.map((a) => a.pts);
  if (Math.min(...pts) > 20) errs.push(`${tag}: the most obvious answers should score 20 or less`);
  if (Math.max(...pts) < 80) errs.push(`${tag}: the best deep cuts should score 80 or more`);
  return errs;
}

export function validateRare(p: RarePuzzle): string[] {
  if (!Array.isArray(p?.prompts) || p.prompts.length !== 5) return ["there must be exactly 5 prompts"];
  const errs = p.prompts.flatMap((q, i) => validateRarePrompt(q, `prompt ${i + 1}`));
  const texts = p.prompts.map((q) => norm(q.prompt ?? ""));
  if (new Set(texts).size !== texts.length) errs.push("two prompts are the same");
  return errs;
}

export function validateTrails(p: TrailsPuzzle): string[] {
  const errs: string[] = [];
  if (!isStr(p?.theme, 80)) errs.push("theme hint must be 1-80 characters");
  const { rows, cols } = p;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 4 || cols < 4) return [...errs, "bad grid size"];
  if (!Array.isArray(p.grid) || p.grid.length !== rows || p.grid.some((r) => !new RegExp(`^[A-Z]{${cols}}$`).test(r))) {
    return [...errs, `grid must be ${rows} rows of ${cols} upper-case letters`];
  }
  if (!Array.isArray(p.words) || p.words.length < 4) return [...errs, "needs at least 4 words"];
  const owner = new Int32Array(rows * cols).fill(-1);
  let spans = 0;
  const seen = new Set<string>();
  p.words.forEach((w, wi) => {
    if (!/^[A-Z]{4,}$/.test(w.word)) errs.push(`"${w.word}" must be 4+ letters A-Z`);
    if (seen.has(w.word)) errs.push(`"${w.word}" appears twice`);
    seen.add(w.word);
    if (!Array.isArray(w.path) || w.path.length !== w.word.length) { errs.push(`"${w.word}" path length does not match`); return; }
    w.path.forEach((cell, k) => {
      if (!Number.isInteger(cell) || cell < 0 || cell >= rows * cols) { errs.push(`"${w.word}" path leaves the grid`); return; }
      if (owner[cell] !== -1) errs.push(`cell ${cell} is used twice`);
      owner[cell] = wi;
      if (p.grid[Math.floor(cell / cols)][cell % cols] !== w.word[k]) errs.push(`"${w.word}" does not match the grid at cell ${cell}`);
      if (k > 0) {
        const prev = w.path[k - 1];
        const dr = Math.abs(Math.floor(cell / cols) - Math.floor(prev / cols)), dc = Math.abs((cell % cols) - (prev % cols));
        if (Math.max(dr, dc) !== 1) errs.push(`"${w.word}" path is not connected`);
      }
    });
    if (w.span) {
      spans++;
      const rs = w.path.map((c) => Math.floor(c / cols)), cs = w.path.map((c) => c % cols);
      const tb = rs.includes(0) && rs.includes(rows - 1), lr = cs.includes(0) && cs.includes(cols - 1);
      if (!tb && !lr) errs.push("the spanning word does not touch two opposite edges");
    }
  });
  if (spans !== 1) errs.push("exactly one word must be the spanning word");
  if (owner.includes(-1)) errs.push("some cells belong to no word");
  return errs;
}

/** `extra` = words outside the dictionary that are allowed as entries (the day's theme words). */
export function validateCross(p: CrossPuzzle, extra: Set<string> = new Set()): string[] {
  const errs: string[] = [];
  if (!Array.isArray(p?.grid) || p.grid.length !== SIZE || p.grid.some((r) => !/^[A-Z#]{5}$/.test(r))) {
    return ["grid must be 5 strings of 5 characters, A-Z or #"];
  }
  for (const s of slotsOf(p.grid)) if (s.len < 3) errs.push(`entry at row ${s.row}, col ${s.col} is shorter than 3`);
  const want = numberGrid(p.grid);
  const answers = new Set<string>();
  for (const dir of ["across", "down"] as const) {
    const got = p[dir];
    if (!Array.isArray(got) || got.length !== want[dir].length) { errs.push(`${dir} clues do not match the grid`); continue; }
    got.forEach((c, i) => {
      const w = want[dir][i];
      if (c.num !== w.num || c.row !== w.row || c.col !== w.col || c.len !== w.len || c.answer !== w.answer) {
        errs.push(`${dir} clue ${c.num} does not match the grid (expected ${w.num}: ${w.answer})`);
      }
      if (answers.has(c.answer)) errs.push(`${c.answer} appears twice`);
      answers.add(c.answer);
      if (!COMMON.has(c.answer) && !extra.has(c.answer)) errs.push(`${c.answer} is not a known word`);
      if (!isStr(c.clue, 90)) errs.push(`${c.answer}: clue must be 1-90 characters`);
      else if (c.answer.length > 2 && norm(c.clue).includes(norm(c.answer))) errs.push(`${c.answer}: the clue gives away the answer`);
    });
  }
  // Every white square must be crossed.
  const cover = new Uint8Array(SIZE * SIZE);
  for (const s of slotsOf(p.grid)) for (const c of s.cells) cover[c]++;
  p.grid.forEach((row, r) => [...row].forEach((ch, c) => { if (ch !== "#" && cover[r * SIZE + c] !== 2) errs.push(`square ${r},${c} is not crossed`); }));
  return errs;
}

export function validateAtlas(p: AtlasPuzzle, recent: Set<string> = new Set()): string[] {
  const errs: string[] = [];
  if (!COUNTRY_CODES.has(p?.code)) return [`code "${p?.code}" is not in the list of available countries`];
  if (recent.has(p.code)) errs.push(`${p.code} was used recently; pick another country`);
  if (p.fact !== undefined && !isStr(p.fact, 220)) errs.push("fact must be one or two short sentences (max 220 characters)");
  return errs;
}

export function validateBlocks(p: BlocksPuzzle): string[] {
  return Number.isInteger(p?.seed) && p.seed >= 0 && p.seed <= 0xffffffff ? [] : ["seed must be an unsigned 32-bit integer"];
}

/**
 * One game must never give away another: the Hunch answer may not appear as a
 * crossword entry, a Word Trails word, a Common Ground tile or a Long Shot
 * answer, and the crossword and Word Trails may not share a word.
 */
/** Irregular forms of common five-letter words, which no spelling rule would find. */
const IRREGULAR: Record<string, string[]> = {
  MOUSE: ["MICE"], GOOSE: ["GEESE"], TOOTH: ["TEETH"], CHILD: ["CHILDREN"], WOMAN: ["WOMEN"],
  KNIFE: ["KNIVES"], SHELF: ["SHELVES"], THIEF: ["THIEVES"], WRITE: ["WROTE", "WRITTEN"], DRIVE: ["DROVE"],
  SPEAK: ["SPOKE"], BREAK: ["BROKE"], STEAL: ["STOLE"], THROW: ["THREW"], DRINK: ["DRANK", "DRUNK"],
  BRING: ["BROUGHT"], TEACH: ["TAUGHT"], CATCH: ["CAUGHT"], THINK: ["THOUGHT"], SLEEP: ["SLEPT"],
  SWEEP: ["SWEPT"], STAND: ["STOOD"], BUILD: ["BUILT"], SPEND: ["SPENT"], SHAKE: ["SHOOK"],
  BEGIN: ["BEGAN", "BEGUN"], SWING: ["SWUNG"], STING: ["STUNG"], STICK: ["STUCK"], FIGHT: ["FOUGHT"],
  LEAVE: ["LEFT"], SWEAR: ["SWORE"], FREEZE: ["FROZE"], AWAKE: ["AWOKE"], ARISE: ["AROSE"],
};

/**
 * Matches text that would give a word away: the word itself with any ending
 * (FLOAT, FLOATS, FLOATED), its y-to-i and dropped-e spellings (GRAVIES, DANCING)
 * and its irregular forms (MICE for MOUSE).
 */
export function spoilerPattern(word: string): RegExp {
  const w = word.toUpperCase();
  const forms = [`${w}[A-Z]*`, ...(IRREGULAR[w] ?? []).map((f) => `${f}[A-Z]*`)];
  if (/[^AEIOU]Y$/.test(w)) forms.push(`${w.slice(0, -1)}I[A-Z]+`);
  if (w.endsWith("E")) forms.push(`${w.slice(0, -1)}ING`);
  return new RegExp(`\\b(?:${forms.join("|")})\\b`, "i");
}

export function validateDisjoint(set: PuzzleSet): string[] {
  const errs: string[] = [];
  const cross = set.cross ? [...set.cross.across, ...set.cross.down].map((c) => c.answer) : [];
  const trails = set.trails ? set.trails.words.map((w) => w.word) : [];
  const word = set.word?.answer;
  if (word) {
    const k = norm(word);
    if (cross.includes(word)) errs.push(`cross: ${word} is today's Hunch answer`);
    if (trails.includes(word)) errs.push(`trails: ${word} is today's Hunch answer`);
    for (const g of set.groups?.groups ?? []) for (const t of g.words) if (norm(t) === k) errs.push(`groups: tile "${t}" is today's Hunch answer`);
    set.rare?.prompts.forEach((q, i) => {
      for (const a of q.answers) if ([a.a, ...(a.alt ?? [])].some((s) => norm(s) === k)) errs.push(`rare: prompt ${i + 1} accepts today's Hunch answer (${a.a})`);
    });
  }
  for (const w of cross) if (trails.includes(w)) errs.push(`cross: ${w} is also a Word Trails word`);
  if (word && set.cross) {
    // A clue that names the Hunch answer gives it away just as an entry would.
    const named = spoilerPattern(word);
    for (const c of [...set.cross.across, ...set.cross.down]) if (named.test(c.clue)) errs.push(`cross: the clue for ${c.answer} mentions ${word}, today's Hunch answer`);
  }
  const tiles = (set.groups?.groups ?? []).flatMap((g) => g.words.map((t) => t.toUpperCase().replace(/[^A-Z]/g, "")));
  for (const w of cross) if (tiles.includes(w)) errs.push(`cross: ${w} is also a Common Ground tile`);
  return errs;
}

/** Runs every validator over a finished set; keys are game ids, plus "overlap" across games. */
export function validatePuzzleSet(set: PuzzleSet, crossExtra: Set<string> = new Set()): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (set.word) out.word = validateWord(set.word);
  if (set.groups) out.groups = validateGroups(set.groups);
  if (set.rare) out.rare = validateRare(set.rare);
  if (set.trails) out.trails = validateTrails(set.trails);
  if (set.cross) out.cross = validateCross(set.cross, crossExtra);
  if (set.atlas) out.atlas = validateAtlas(set.atlas);
  if (set.blocks) out.blocks = validateBlocks(set.blocks);
  out.overlap = validateDisjoint(set);
  return out;
}
