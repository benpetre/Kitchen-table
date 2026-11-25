import { nextRandom } from '../lib/rng';

export const COLS = 10;
export const ROWS = 20;

/** Each piece as four [x, y] cells per rotation, inside its own 4x4 (or 3x3) box. */
const SHAPES: number[][][][] = [
  // I
  [[[0, 1], [1, 1], [2, 1], [3, 1]], [[2, 0], [2, 1], [2, 2], [2, 3]], [[0, 2], [1, 2], [2, 2], [3, 2]], [[1, 0], [1, 1], [1, 2], [1, 3]]],
  // O
  [[[1, 0], [2, 0], [1, 1], [2, 1]], [[1, 0], [2, 0], [1, 1], [2, 1]], [[1, 0], [2, 0], [1, 1], [2, 1]], [[1, 0], [2, 0], [1, 1], [2, 1]]],
  // T
  [[[1, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [1, 1], [2, 1], [1, 2]], [[0, 1], [1, 1], [2, 1], [1, 2]], [[1, 0], [0, 1], [1, 1], [1, 2]]],
  // S
  [[[1, 0], [2, 0], [0, 1], [1, 1]], [[1, 0], [1, 1], [2, 1], [2, 2]], [[1, 1], [2, 1], [0, 2], [1, 2]], [[0, 0], [0, 1], [1, 1], [1, 2]]],
  // Z
  [[[0, 0], [1, 0], [1, 1], [2, 1]], [[2, 0], [1, 1], [2, 1], [1, 2]], [[0, 1], [1, 1], [1, 2], [2, 2]], [[1, 0], [0, 1], [1, 1], [0, 2]]],
  // J
  [[[0, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [2, 0], [1, 1], [1, 2]], [[0, 1], [1, 1], [2, 1], [2, 2]], [[1, 0], [1, 1], [0, 2], [1, 2]]],
  // L
  [[[2, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [1, 1], [1, 2], [2, 2]], [[0, 1], [1, 1], [2, 1], [0, 2]], [[0, 0], [1, 0], [1, 1], [1, 2]]],
];

export interface Piece {
  kind: number;
  rot: number;
  x: number;
  y: number;
}

/** Everything needed to resume a run exactly where it stopped. */
export interface BlocksState {
  /** ROWS * COLS cells: 0 empty, otherwise piece kind + 1. */
  board: number[];
  piece: Piece;
  /** Upcoming piece kinds; refilled a bag of seven at a time. */
  queue: number[];
  rng: number;
  score: number;
  lines: number;
  over: boolean;
}

export const pieceCells = (p: Piece): [number, number][] => SHAPES[p.kind][p.rot].map(([x, y]) => [x + p.x, y + p.y]);
export const shapeOf = (kind: number) => SHAPES[kind][0];
export const levelOf = (lines: number) => Math.floor(lines / 10) + 1;
/** Milliseconds between gravity steps. */
export const dropInterval = (lines: number) => Math.max(90, 760 - (levelOf(lines) - 1) * 65);

function fits(board: number[], p: Piece): boolean {
  return pieceCells(p).every(([x, y]) => x >= 0 && x < COLS && y < ROWS && (y < 0 || board[y * COLS + x] === 0));
}

function refill(queue: number[], rng: number): [number[], number] {
  const q = [...queue];
  let state = rng;
  while (q.length < 8) {
    const bag = [0, 1, 2, 3, 4, 5, 6];
    for (let i = bag.length - 1; i > 0; i--) {
      const [v, s] = nextRandom(state);
      state = s;
      const j = Math.floor(v * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    q.push(...bag);
  }
  return [q, state];
}

const spawn = (kind: number): Piece => ({ kind, rot: 0, x: 3, y: kind === 0 ? -1 : 0 });

export function newGame(seed: number): BlocksState {
  const [queue, rng] = refill([], seed | 0);
  return { board: Array(ROWS * COLS).fill(0), piece: spawn(queue[0]), queue: queue.slice(1), rng, score: 0, lines: 0, over: false };
}

export function move(s: BlocksState, dx: number): BlocksState {
  if (s.over) return s;
  const piece = { ...s.piece, x: s.piece.x + dx };
  return fits(s.board, piece) ? { ...s, piece } : s;
}

/** Rotate clockwise, nudging sideways or up a little if the turn would hit a wall or the stack. */
export function rotate(s: BlocksState): BlocksState {
  if (s.over) return s;
  const rot = (s.piece.rot + 1) % 4;
  for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]]) {
    const piece = { ...s.piece, rot, x: s.piece.x + dx, y: s.piece.y + dy };
    if (fits(s.board, piece)) return { ...s, piece };
  }
  return s;
}

/** Where the current piece would land. */
export function ghost(s: BlocksState): Piece {
  let p = s.piece;
  while (fits(s.board, { ...p, y: p.y + 1 })) p = { ...p, y: p.y + 1 };
  return p;
}

const LINE_SCORE = [0, 100, 300, 500, 800];

function lock(s: BlocksState): BlocksState {
  const board = [...s.board];
  let above = false;
  for (const [x, y] of pieceCells(s.piece)) {
    if (y < 0) above = true;
    else board[y * COLS + x] = s.piece.kind + 1;
  }
  let kept: number[] = [];
  let cleared = 0;
  for (let y = 0; y < ROWS; y++) {
    const row = board.slice(y * COLS, (y + 1) * COLS);
    if (row.every((c) => c !== 0)) cleared++;
    else kept = kept.concat(row);
  }
  const next = Array(cleared * COLS).fill(0).concat(kept);
  const score = s.score + LINE_SCORE[cleared] * levelOf(s.lines);
  const [queue, rng] = refill(s.queue, s.rng);
  const piece = spawn(queue[0]);
  const over = above || !fits(next, piece);
  return { board: next, piece, queue: queue.slice(1), rng, score, lines: s.lines + cleared, over };
}

/** One gravity step: fall a row, or lock in place. `soft` = the player asked for it (worth a point a row). */
export function step(s: BlocksState, soft = false): BlocksState {
  if (s.over) return s;
  const piece = { ...s.piece, y: s.piece.y + 1 };
  if (fits(s.board, piece)) return { ...s, piece, score: s.score + (soft ? 1 : 0) };
  return lock(s);
}

/** Drop straight to the floor and lock (two points a row). */
export function hardDrop(s: BlocksState): BlocksState {
  if (s.over) return s;
  const g = ghost(s);
  return lock({ ...s, piece: g, score: s.score + (g.y - s.piece.y) * 2 });
}

/** Leaderboard points: climbs quickly at first and flattens toward 100. */
export function blocksPoints(score: number): number {
  return Math.max(5, Math.min(100, Math.round(100 * (1 - Math.exp(-score / 6000)))));
}
