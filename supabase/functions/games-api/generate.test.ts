// Run:  node --experimental-strip-types supabase/functions/games-api/generate.test.ts
// Drives the whole generator with a scripted model, including bad first answers.
import assert from "node:assert/strict";
import { generateDaily, recentFrom } from "./generate.ts";
import type { Llm } from "./llm.ts";
import { validateDisjoint, validatePuzzleSet } from "./validate.ts";

const rareAnswers = (n: number) => Array.from({ length: n }, (_, i) => ({ a: `Item ${i}`, alt: i === 0 ? ["item zero", "Item 1"] : [], pts: Math.min(100, 4 + i * 3) }));
let calls = 0;
const seenUsers: string[] = [];
const llm: Llm = {
  usage: () => ({ input: 0, output: 0, calls }),
  search: () => Promise.reject(new Error("no network in tests")),
  json<T>(call: Parameters<Llm["json"]>[0]) {
    calls++;
    const first = call.messages[0].content;
    const turn = (call.messages.length + 1) / 2;
    seenUsers.push(first);
    let v: unknown;
    if (first.includes("Gather what is topical")) v = { theme: "Thanksgiving Eve", hooks: ["Pies: pumpkin, pecan, apple", "Macy's parade balloons"] };
    else if (first.includes("mystery word for Hunch")) v = { candidates: [{ answer: "zzzzz", note: "bad" }, { answer: "cards", note: "plural" }, { answer: "feast", note: "Tomorrow is the big one." }] };
    else if (first.includes("Common Ground")) {
      const g = (title: string, level: number, words: string[]) => ({ title, level, words });
      v = turn === 1
        ? { groups: [g("Pies", 1, ["Apple", "Pecan", "Pumpkin", "Cherry"]), g("Dup", 2, ["Apple", "B", "C", "D"]), g("X", 3, ["E", "F", "G", "H"]), g("Y", 4, ["I", "J", "K", "L"])] }
        : { groups: [g("Pies", 1, ["Apple", "Pecan", "Pumpkin", "Cherry"]), g("Tech", 2, ["Orange", "B", "C", "D"]), g("X", 3, ["E", "F", "G", "H"]), g("Y", 4, ["I", "J", "K", "L"])] };
    } else if (first.includes("you choose the prompts")) v = { prompts: Array.from({ length: 7 }, (_, p) => ({ prompt: `Name a thing ${p}`, counts: "Any thing." })) };
    else if (first.includes("accepted answers for one Long Shot prompt")) {
      // The third prompt never gets a usable list: the spare has to cover for it.
      v = first.includes("Name a thing 2") ? { answers: rareAnswers(5), best: "x" } : { answers: rareAnswers(36), best: "item 35" };
    }
    else if (first.includes("Word Trails")) {
      v = turn === 1
        ? { theme: "Save room", span: "Pie", words: ["APPLE"] }
        : { theme: "Save room", span: "Pie season", words: ["APPLE", "PUMPKIN", "PECAN", "CHERRY", "CRUST", "BAKERY", "WHIPPED", "CREAM", "SLICE", "LATTICE", "FILLING", "OVEN", "SUGAR", "BUTTER", "FEAST"] };
    } else if (first.includes("mystery country")) v = { code: "tr", fact: "Turkeys are not from Turkey." };
    else if (first.includes("supply the theme")) v = { title: "Turkey Day", words: ["PIE", "YAM", "FEAST", "GRAVY", "CORN", "ROLLS", "FALL", "MEAL", "BAKE", "OVEN", "NAP", "GOURD"] };
    else if (first.includes("candidate fills")) {
      const last = call.messages[call.messages.length - 1].content;
      const src = turn === 1 ? first : last;
      const grid1 = /Grid 1:\n\s+Across: (.*)\n\s+Down: (.*)/.exec(src)!;
      const entries = [...grid1[1].split(", "), ...grid1[2].split(", ")];
      // Round 1: reject one entry of grid 1 to force a refill. Round 2: accept grid 1.
      v = turn === 1 ? { grid: 0, reject: [entries[0]], clues: [] } : { grid: 1, reject: [], clues: entries.map((answer) => ({ answer, clue: `Clue number ${entries.indexOf(answer)}` })) };
    } else throw new Error(`unscripted prompt: ${first.slice(0, 80)}`);
    return Promise.resolve({ value: v as T, raw: JSON.stringify(v) });
  },
};

const stages: string[] = [];
const out = await generateDaily({
  date: "2026-11-25",
  familyName: "Test family",
  notes: { people: "Alex (48), Sam (12)", watching: "", events: "" },
  recent: recentFrom([{ theme: "Old theme", puzzles: { word: { answer: "GRAVY" }, atlas: { code: "FR" } } }]),
  llm,
  deadline: Date.now() + 60_000,
  onProgress: (s) => { stages.push(s); },
});
assert.equal(out.theme, "Thanksgiving Eve");
assert.equal(out.meta.briefSource, "plain");
assert.deepEqual(Object.keys(out.puzzles).sort(), ["atlas", "blocks", "cross", "groups", "rare", "trails", "word"]);
assert.equal(out.puzzles.word!.answer, "FEAST");
assert.equal(out.puzzles.atlas!.code, "TR");
assert.equal(out.meta.attempts.groups, 2);
assert.equal(out.meta.attempts.trails, 2);
assert.equal(out.meta.attempts.cross, 2);
assert.equal(out.puzzles.rare!.prompts[0].best, "Item 35");
assert.deepEqual(out.puzzles.rare!.prompts.map((q) => q.prompt), [0, 1, 3, 4, 5].map((n) => `Name a thing ${n}`));
assert.equal(out.meta.attempts.rare3, 3);
assert.deepEqual(out.puzzles.rare!.prompts[0].answers[0].alt, ["item zero"]); // overlapping alias dropped
for (const [game, errs] of Object.entries(validatePuzzleSet(out.puzzles, new Set(out.meta.crossExtra)))) assert.deepEqual(errs, [], game);
assert.ok(seenUsers.some((u) => u.includes("GRAVY")), "recent answers reach the prompt");

// No game gives another away. The script offers FEAST (the Hunch answer) as a
// crossword theme word and as a trail word, and OVEN to both word games.
const crossEntries = [...out.puzzles.cross!.across, ...out.puzzles.cross!.down].map((c) => c.answer);
const trailWords = out.puzzles.trails!.words.map((x) => x.word);
assert.ok(!crossEntries.includes("FEAST") && !trailWords.includes("FEAST"));
assert.deepEqual(crossEntries.filter((x) => trailWords.includes(x)), []);
assert.equal(out.meta.errors.overlap, undefined);
assert.ok(seenUsers.filter((u) => u.includes("mystery word in another game is FEAST")).length >= 4, "the ban reaches the other games");
assert.ok(!seenUsers.find((u) => u.includes("mystery word for Hunch"))!.includes("another game"));
const clash = { ...out.puzzles, cross: { ...out.puzzles.cross!, across: out.puzzles.cross!.across.map((c, k) => (k ? c : { ...c, answer: "FEAST" })) } };
assert.ok(validateDisjoint(clash).some((e) => e.startsWith("cross:")));
assert.ok(validateDisjoint({ word: { answer: "APPLE" }, groups: out.puzzles.groups }).some((e) => e.startsWith("groups:")));
assert.ok(validateDisjoint({ word: { answer: "CRUST" }, trails: { ...out.puzzles.trails!, words: [{ word: "CRUST", path: [] }] } }).some((e) => e.startsWith("trails:")));
assert.ok(validateDisjoint({ word: { answer: "ITEMS" }, rare: { prompts: [{ prompt: "p", best: "Items", answers: [{ a: "Items", pts: 5 }] }] } }).some((e) => e.startsWith("rare:")));
assert.ok(validateDisjoint({ cross: clash.cross, trails: { ...out.puzzles.trails!, words: [{ word: "FEAST", path: [] }] } }).some((e) => e.includes("Word Trails")));
assert.ok(stages.includes("brief") && stages.includes("cross"));
console.log("generate ok:", JSON.stringify(out.meta.attempts), out.puzzles.cross!.grid.join("/"), out.puzzles.trails!.grid.join("/"));
