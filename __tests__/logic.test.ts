import { addDays, clock, localDate } from '../src/lib/dates';
import { makeRandom, seedFrom, shuffled } from '../src/lib/rng';
import { atlasPoints, COUNTRIES, countryByCode, direction, distanceKm, proximity, searchCountries } from '../src/logic/atlas';
import { blocksPoints, COLS, dropInterval, hardDrop, levelOf, move, newGame, pieceCells, rotate, ROWS, step } from '../src/logic/blocks';
import { cellNumbers, clueAt, clueCells, crossPoints, isFull, isSolved } from '../src/logic/cross';
import { groupsPoints, judge } from '../src/logic/groups';
import { editDistance, matchAnswer, normalize, rarePoints } from '../src/logic/rare';
import { dayPoints, lifetime, perGame, streak } from '../src/logic/stats';
import { adjacent, matchTrail, trailsPoints } from '../src/logic/trails';
import { keyMarks, markGuess, wordPoints } from '../src/logic/word';
import type { CrossPuzzle, GroupsPuzzle, RarePuzzle, TrailsPuzzle } from '../src/types';

describe('Hunch', () => {
  test('marks hits, nears and misses', () => {
    expect(markGuess('CRANE', 'CRANE')).toEqual(['hit', 'hit', 'hit', 'hit', 'hit']);
    expect(markGuess('NACRE', 'CRANE')).toEqual(['near', 'near', 'near', 'near', 'hit']);
    expect(markGuess('BOOST', 'ROBOT')).toEqual(['near', 'hit', 'near', 'miss', 'hit']);
  });
  test('a repeated letter is only credited as often as it appears', () => {
    expect(markGuess('LLAMA', 'PLANT')).toEqual(['miss', 'hit', 'hit', 'miss', 'miss']);
    expect(markGuess('EERIE', 'THERE')).toEqual(['near', 'miss', 'near', 'miss', 'hit']);
  });
  test('keyboard keeps the best mark per letter', () => {
    expect(keyMarks(['NACRE', 'CRANE'], 'CRANE')).toMatchObject({ C: 'hit', N: 'hit', E: 'hit' });
    expect(keyMarks(['BOOST'], 'ROBOT').S).toBe('miss');
  });
  test('fewer guesses score more', () => {
    expect([1, 2, 3, 4, 5, 6].map(wordPoints)).toEqual([100, 90, 78, 64, 50, 36]);
    expect(wordPoints(null)).toBe(10);
  });
});

describe('Common Ground', () => {
  const p: GroupsPuzzle = {
    groups: [
      { title: 'A', level: 1, words: ['a1', 'a2', 'a3', 'a4'] },
      { title: 'B', level: 2, words: ['b1', 'b2', 'b3', 'b4'] },
      { title: 'C', level: 3, words: ['c1', 'c2', 'c3', 'c4'] },
      { title: 'D', level: 4, words: ['d1', 'd2', 'd3', 'd4'] },
    ],
  };
  test('judges a pick', () => {
    expect(judge(p, ['b4', 'b2', 'b1', 'b3'])).toEqual({ group: 1, oneAway: false });
    expect(judge(p, ['b4', 'b2', 'b1', 'c3'])).toEqual({ group: -1, oneAway: true });
    expect(judge(p, ['a1', 'a2', 'c1', 'c3'])).toEqual({ group: -1, oneAway: false });
  });
  test('points', () => {
    expect(groupsPoints(4, 0)).toBe(100);
    expect(groupsPoints(4, 3)).toBe(55);
    expect(groupsPoints(2, 4)).toBe(24);
  });
});

describe('Long Shot', () => {
  const prompt: RarePuzzle['prompts'][number] = {
    prompt: 'Name a planet',
    best: 'Neptune',
    answers: [
      { a: 'Earth', pts: 5 },
      { a: 'Mars', pts: 10 },
      { a: 'Mercury', pts: 40 },
      { a: 'Neptune', pts: 80, alt: ['the blue giant'] },
      { a: 'The Moon', pts: 1 },
    ],
  };
  test('normalizes', () => {
    expect(normalize("  The Pokémon:  Go! ")).toBe('pokemon go');
    expect(normalize('Rock & Roll')).toBe('rock and roll');
  });
  test('edit distance with a cap', () => {
    expect(editDistance('neptune', 'neptnue', 2)).toBe(1);
    expect(editDistance('mars', 'earth', 1)).toBe(2);
  });
  test('matches exact, alias, plural, article and small typos', () => {
    expect(matchAnswer(prompt, 'neptune')).toEqual({ a: 'Neptune', pts: 80 });
    expect(matchAnswer(prompt, 'The Blue Giant')).toEqual({ a: 'Neptune', pts: 80 });
    expect(matchAnswer(prompt, 'moon')).toEqual({ a: 'The Moon', pts: 1 });
    expect(matchAnswer(prompt, 'Mercurry')).toEqual({ a: 'Mercury', pts: 40 });
    expect(matchAnswer(prompt, 'Earths')).toEqual({ a: 'Earth', pts: 5 });
  });
  test('does not stretch short words or guess between ties', () => {
    expect(matchAnswer(prompt, 'Mart')).toBeNull();
    expect(matchAnswer(prompt, 'Pluto')).toBeNull();
    expect(matchAnswer(prompt, ' ')).toBeNull();
  });
  test('day score is the average over all prompts', () => {
    expect(rarePoints([80, 40, 0, 10, 20], 5)).toBe(30);
  });
});

describe('Word Trails', () => {
  // CAT / DOG laid out on a 2x3 board:  C A T
  //                                     G O D
  const p: TrailsPuzzle = { theme: 'Pets', rows: 2, cols: 3, grid: ['CAT', 'GOD'], words: [{ word: 'CAT', path: [0, 1, 2], span: true }, { word: 'DOG', path: [5, 4, 3] }] };
  test('adjacency includes diagonals but not wrap-around', () => {
    expect(adjacent(0, 4, 3)).toBe(true);
    expect(adjacent(2, 3, 3)).toBe(false);
    expect(adjacent(1, 1, 3)).toBe(false);
  });
  test('finds a word traced either way, once', () => {
    expect(matchTrail(p, [0, 1, 2], [])).toBe(0);
    expect(matchTrail(p, [3, 4, 5], [])).toBe(1);
    expect(matchTrail(p, [0, 1, 2], [0])).toBe(-1);
    expect(matchTrail(p, [0, 1], [])).toBe(-1);
  });
  test('hints cost points down to a floor', () => {
    expect(trailsPoints(0)).toBe(100);
    expect(trailsPoints(2)).toBe(76);
    expect(trailsPoints(20)).toBe(20);
  });
});

describe('Outline', () => {
  const fr = countryByCode('FR')!;
  const de = countryByCode('DE')!;
  const au = countryByCode('AU')!;
  test('every country has an outline and a unique code', () => {
    expect(COUNTRIES.length).toBeGreaterThan(150);
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length);
    expect(COUNTRIES.every((c) => c.path.startsWith('M') && c.name.length > 1)).toBe(true);
  });
  test('distance and direction', () => {
    const km = distanceKm(fr, de);
    expect(km).toBeGreaterThan(500);
    expect(km).toBeLessThan(1100);
    expect(direction(fr, de).word).toMatch(/east/);
    expect(direction(fr, au).word).toMatch(/east/);
    expect(distanceKm(fr, fr)).toBe(0);
  });
  test('proximity and points', () => {
    expect(proximity(0)).toBe(100);
    expect(proximity(distanceKm(fr, de))).toBeGreaterThan(90);
    expect(atlasPoints(1, 100)).toBe(100);
    expect(atlasPoints(6, 100)).toBe(30);
    expect(atlasPoints(null, 90)).toBe(18);
  });
  test('search prefers names that start with the text and skips past guesses', () => {
    expect(searchCountries('fra', [])[0].code).toBe('FR');
    expect(searchCountries('fra', ['FR']).some((c) => c.code === 'FR')).toBe(false);
    expect(searchCountries('land', []).length).toBeGreaterThan(2);
    expect(searchCountries('', [])).toEqual([]);
  });
});

describe('Pocket Cross', () => {
  const p: CrossPuzzle = {
    grid: ['#CAB#', 'ALONE', 'NOTES', 'TWEET', '#NDS#'],
    across: [
      { num: 1, row: 0, col: 1, len: 3, answer: 'CAB', clue: '' },
      { num: 4, row: 1, col: 0, len: 5, answer: 'ALONE', clue: '' },
    ],
    down: [{ num: 1, row: 0, col: 1, len: 5, answer: 'CLOWN', clue: '' }],
  };
  test('cells, numbers and lookups', () => {
    expect(clueCells(p.across[0], 'across')).toEqual([1, 2, 3]);
    expect(clueCells(p.down[0], 'down')).toEqual([1, 6, 11, 16, 21]);
    expect(cellNumbers(p)).toEqual({ 1: 1, 5: 4 });
    expect(clueAt(p, 6, 'down')?.answer).toBe('CLOWN');
    expect(clueAt(p, 5, 'down')).toBeUndefined();
  });
  test('solved only when every open square matches', () => {
    const fill = p.grid.join('').split('').map((ch) => (ch === '#' ? '' : ch));
    expect(isSolved(p, fill)).toBe(true);
    expect(isFull(p, fill)).toBe(true);
    fill[6] = 'X';
    expect(isSolved(p, fill)).toBe(false);
    expect(isFull(p, fill)).toBe(true);
  });
  test('points fall with time and help', () => {
    expect(crossPoints(60, 0, 0, false)).toBe(100);
    expect(crossPoints(130, 0, 0, false)).toBe(90);
    expect(crossPoints(130, 1, 1, false)).toBe(70);
    expect(crossPoints(9999, 5, 5, false)).toBe(20);
    expect(crossPoints(10, 0, 0, true)).toBe(10);
  });
});

describe('Brickfall', () => {
  test('the same seed deals the same pieces', () => {
    const a = newGame(42);
    const b = newGame(42);
    expect([a.piece.kind, ...a.queue]).toEqual([b.piece.kind, ...b.queue]);
    expect([a.piece.kind, ...a.queue.slice(0, 6)].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(newGame(43).queue).not.toEqual(a.queue);
  });
  test('pieces stay inside the walls', () => {
    let s = newGame(7);
    for (let i = 0; i < 20; i++) s = move(s, -1);
    expect(Math.min(...pieceCells(s.piece).map(([x]) => x))).toBe(0);
    for (let i = 0; i < 20; i++) s = move(s, 1);
    expect(Math.max(...pieceCells(s.piece).map(([x]) => x))).toBe(COLS - 1);
    for (let i = 0; i < 4; i++) s = rotate(s);
    expect(pieceCells(s.piece).every(([x]) => x >= 0 && x < COLS)).toBe(true);
  });
  test('a hard drop lands on the floor, scores, and deals the next piece', () => {
    const s = newGame(7);
    const d = hardDrop(s);
    expect(d.board.filter(Boolean).length).toBe(4);
    expect(d.board.slice(0, (ROWS - 4) * COLS).every((c) => c === 0)).toBe(true);
    expect(d.score).toBeGreaterThan(0);
    expect(d.piece.kind).toBe(s.queue[0]);
  });
  test('a full row clears and scores by level', () => {
    const s = newGame(7);
    const board = [...s.board];
    for (let x = 0; x < COLS; x++) board[(ROWS - 1) * COLS + x] = 1;
    // leave the falling piece to land on top; the bottom row is already complete
    const d = hardDrop({ ...s, board });
    expect(d.lines).toBe(1);
    expect(d.score).toBeGreaterThanOrEqual(100);
    expect(d.board.filter(Boolean).length).toBe(4);
  });
  test('dropping without steering eventually ends the run, deterministically', () => {
    const play = () => {
      let s = newGame(99);
      let n = 0;
      while (!s.over && n++ < 500) s = hardDrop(s);
      return s;
    };
    const end = play();
    expect(end.over).toBe(true);
    expect(play().score).toBe(end.score);
    expect(step(end)).toBe(end);
  });
  test('leaderboard points are bounded and rise with score', () => {
    expect(blocksPoints(0)).toBe(5);
    expect(blocksPoints(20000)).toBe(63);
    expect(blocksPoints(1e9)).toBe(100);
  });
  test('the pace climbs with lines cleared and with bricks landed, down to a floor', () => {
    expect(levelOf({ lines: 0, pieces: 0 })).toBe(1);
    expect(levelOf({ lines: 5, pieces: 0 })).toBe(2);
    expect(levelOf({ lines: 0, pieces: 30 })).toBe(2);
    expect(levelOf({ lines: 12, pieces: 65 })).toBe(5);
    expect(levelOf({ lines: 7 })).toBe(2); // a run saved before bricks were counted
    expect(dropInterval({ lines: 0, pieces: 0 })).toBe(720);
    expect(dropInterval({ lines: 25, pieces: 60 })).toBeLessThan(dropInterval({ lines: 20, pieces: 60 }));
    expect(dropInterval({ lines: 20, pieces: 90 })).toBeLessThan(dropInterval({ lines: 20, pieces: 60 }));
    expect(dropInterval({ lines: 50, pieces: 150 })).toBeLessThan(120);
    expect(dropInterval({ lines: 500, pieces: 999 })).toBe(70);
  });
  test('every landed brick is counted', () => {
    let s = newGame(7);
    for (let i = 0; i < 5; i++) s = hardDrop(s);
    expect(s.pieces).toBe(5);
  });
});

describe('dates, random and stats', () => {
  test('dates', () => {
    expect(localDate(new Date(2026, 10, 25, 23, 59))).toBe('2026-11-25');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(clock(125)).toBe('2:05');
  });
  test('seeded shuffle is repeatable', () => {
    const a = shuffled([1, 2, 3, 4, 5, 6, 7, 8], makeRandom(seedFrom('2026-11-25')));
    expect(a).toEqual(shuffled([1, 2, 3, 4, 5, 6, 7, 8], makeRandom(seedFrom('2026-11-25'))));
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
  test('history stats', () => {
    const r = (points: number) => ({ points, detail: {}, at: 0, synced: true });
    const h = { '2026-11-23': { word: r(90) }, '2026-11-24': { word: r(50), blocks: r(70) }, '2026-11-21': { word: r(100) } };
    expect(dayPoints(h, '2026-11-24')).toBe(120);
    expect(streak(h, '2026-11-25')).toBe(2);
    expect(streak(h, '2026-11-24')).toBe(2);
    expect(streak(h, '2026-11-27')).toBe(0);
    expect(lifetime(h)).toEqual({ days: 3, points: 310, bestDay: 120, games: 4 });
    expect(perGame(h, 'word')).toEqual({ played: 3, average: 80, best: 100 });
    expect(perGame(h, 'atlas')).toEqual({ played: 0, average: 0, best: 0 });
  });
});
