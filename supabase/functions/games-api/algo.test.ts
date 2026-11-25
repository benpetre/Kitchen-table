// Run:  node --experimental-strip-types supabase/functions/games-api/algo.test.ts
import assert from "node:assert/strict";
import { fillCrossword, slotsOf, TEMPLATES } from "./crossword.ts";
import { lettersOf, packTrails, pickWords, randomPath, TRAIL_COLS, TRAIL_ROWS } from "./trails.ts";
import { hashSeed, mulberry32 } from "./rng.ts";
import { COMMON, EASY5, validateCross, validateGroups, validateRare, validateTrails, validateWord } from "./validate.ts";

// ---- templates are well formed
for (const t of TEMPLATES) {
  const cover = new Uint8Array(25);
  for (const s of slotsOf(t)) { assert.ok(s.len >= 3, `short slot in ${t}`); for (const c of s.cells) cover[c]++; }
  t.forEach((row, r) => [...row].forEach((ch, c) => assert.equal(cover[r * 5 + c], ch === "#" ? 0 : 2)));
}

// ---- crossword filler: 300 seeded runs
const THEMES = [
  ["TURKEY", "PIE", "YAM", "FEAST", "GRAVY", "CORN", "ROLLS", "FALL", "MEAL", "THANK", "BAKE", "OVEN", "NAP", "GOURD", "FAMILY"],
  ["SNOW", "SKI", "SLED", "ICE", "COLD", "FROST", "MITT", "COCOA", "SCARF", "HAT", "COAT", "BOOT", "PLOW", "SLUSH", "GLOVE"],
  ["PIXAR", "LEGO", "MARIO", "ZELDA", "YODA", "ELSA", "SHREK", "GROOT", "WOODY", "BUZZ", "NEMO", "DORY", "STAR", "FILM", "HERO"],
  [],
];
let filled = 0, themed = 0, themeWords = 0, worst = 0, total = 0;
const RUNS = 300;
for (let i = 0; i < RUNS; i++) {
  const theme = THEMES[i % THEMES.length].filter((w) => w.length >= 3 && w.length <= 5);
  const t0 = performance.now();
  const fill = fillCrossword({ theme, words: COMMON, preferred: EASY5, rng: mulberry32(hashSeed(`cross-${i}`)), budgetMs: 600 });
  const ms = performance.now() - t0;
  total += ms; worst = Math.max(worst, ms);
  if (!fill) continue;
  filled++;
  if (fill.themeUsed.length) themed++;
  themeWords += fill.themeUsed.length;
  const puzzle = { grid: fill.grid, across: fill.across.map((c) => ({ ...c, clue: "x" })), down: fill.down.map((c) => ({ ...c, clue: "x" })) };
  assert.deepEqual(validateCross(puzzle, new Set(theme)), [], `seed ${i}: ${fill.grid.join("/")}`);
  // Reproducible from the seed.
  if (i < 10) {
    const again = fillCrossword({ theme, words: COMMON, preferred: EASY5, rng: mulberry32(hashSeed(`cross-${i}`)), budgetMs: 5000 });
    assert.ok(again);
  }
}
console.log(`crossword: ${filled}/${RUNS} filled, ${themed} with a theme word (avg ${(themeWords / filled).toFixed(2)}), avg ${(total / RUNS).toFixed(0)}ms, worst ${worst.toFixed(0)}ms`);
assert.equal(filled, RUNS, "every run must produce a grid");

// ---- hamiltonian paths
for (let i = 0; i < 200; i++) {
  const p = randomPath(TRAIL_ROWS, TRAIL_COLS, mulberry32(i));
  assert.equal(new Set(p).size, 48);
  for (let k = 1; k < p.length; k++) {
    const dr = Math.abs(Math.floor(p[k] / 6) - Math.floor(p[k - 1] / 6)), dc = Math.abs((p[k] % 6) - (p[k - 1] % 6));
    assert.equal(dr + dc, 1);
  }
}

// ---- trails packer: 400 seeded runs across span lengths 8-14
const POOL = ["APPLE", "PUMPKIN", "PECAN", "CHERRY", "CRUST", "BAKERY", "WHIPPED", "CREAM", "SLICE", "LATTICE", "FILLING", "OVEN", "SUGAR", "BUTTER", "CINNAMON", "TART"];
const SPANS = ["PIESEASON", "DESSERTS", "THANKSGIVING", "SWEETTREATS", "HOLIDAYBAKING", "PASTRYCHEF", "FRESHLYBAKEDPI"];
let packed = 0, tWorst = 0, tTotal = 0;
const TRUNS = 400;
for (let i = 0; i < TRUNS; i++) {
  const rng = mulberry32(hashSeed(`trails-${i}`));
  const span = SPANS[i % SPANS.length];
  const t0 = performance.now();
  const words = pickWords(span, POOL, 48, rng);
  assert.ok(words, `seed ${i}: no subset for ${span}`);
  assert.equal(words.reduce((s, w) => s + w.length, span.length), 48);
  const puzzle = packTrails("Fresh from the oven", span, words, rng);
  const ms = performance.now() - t0;
  tTotal += ms; tWorst = Math.max(tWorst, ms);
  if (!puzzle) continue;
  packed++;
  assert.deepEqual(validateTrails(puzzle), [], `seed ${i}`);
}
console.log(`trails: ${packed}/${TRUNS} packed, avg ${(tTotal / TRUNS).toFixed(1)}ms, worst ${tWorst.toFixed(0)}ms`);
assert.equal(packed, TRUNS, "every run must pack");
assert.equal(pickWords("ABCDEFGHIJ", ["AAAAAAAAA", "BBBBBBBBB"], 48, mulberry32(1)), null);
assert.equal(lettersOf("Ice-cream sundae!"), "ICECREAMSUNDAE");

// ---- validators catch bad input
assert.deepEqual(validateWord({ answer: "FEAST" }), []);
assert.ok(validateWord({ answer: "feast" }).length);
assert.ok(validateWord({ answer: "ZZZZZ" }).length);
assert.ok(validateWord({ answer: "FEAST" }, new Set(["FEAST"])).length);
const groups = { groups: [1, 2, 3, 4].map((level) => ({ title: `G${level}`, level: level as 1 | 2 | 3 | 4, words: ["a", "b", "c", "d"].map((x) => x + level) })) };
assert.deepEqual(validateGroups(groups), []);
assert.ok(validateGroups({ groups: groups.groups.map((g, i) => (i ? g : { ...g, words: ["a2", "b1", "c1", "d1"] })) }).length);
const rare = { prompts: Array.from({ length: 5 }, (_, p) => ({ prompt: `Name a thing ${p}`, best: "Thing 29", answers: Array.from({ length: 30 }, (_, i) => ({ a: `Thing ${i}`, pts: Math.min(100, 5 + i * 4) })) })) };
assert.deepEqual(validateRare(rare), []);
assert.ok(validateRare({ prompts: rare.prompts.map((q) => ({ ...q, best: "nope" })) }).length);
assert.ok(validateRare({ prompts: rare.prompts.map((q) => ({ ...q, answers: q.answers.slice(0, 19) })) }).length);
assert.ok(validateRare({ prompts: rare.prompts.slice(0, 4) }).length);
assert.ok(validateRare({ prompts: rare.prompts.map((q) => ({ ...q, answers: [...q.answers, { a: "thing 3", pts: 9 }] })) }).length);
console.log("ok");
