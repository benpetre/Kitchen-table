/**
 * The contract between the app and the games-api edge function.
 * supabase/functions/games-api/types.ts mirrors this file - change both together.
 */
export type GameId = 'rare' | 'word' | 'cross' | 'groups' | 'blocks' | 'trails' | 'atlas';

/** Long Shot: name something for each prompt; the less obvious the answer, the more it scores. */
export interface RarePuzzle {
  prompts: {
    prompt: string;
    /** Accepted answers. pts 1-100: 1-20 the first thing everyone says, 80-100 a great deep cut. */
    answers: { a: string; alt?: string[]; pts: number }[];
    /** The standout answer revealed afterwards (must be one of answers[].a). */
    best: string;
  }[];
}

/** Hunch: six guesses at a five-letter word. */
export interface WordPuzzle {
  /** Five letters, upper case. */
  answer: string;
  /** One line shown after the game: why this word today. */
  note?: string;
}

export interface CrossClue {
  num: number;
  row: number;
  col: number;
  len: number;
  /** Upper case. */
  answer: string;
  clue: string;
}

/** Pocket Cross: a 5x5 crossword. */
export interface CrossPuzzle {
  title?: string;
  /** Five strings of five characters, upper case, '#' for a black square. */
  grid: string[];
  across: CrossClue[];
  down: CrossClue[];
}

/** Common Ground: sort sixteen tiles into four groups of four. */
export interface GroupsPuzzle {
  /** level 1 = most straightforward group, 4 = trickiest. */
  groups: { title: string; level: 1 | 2 | 3 | 4; words: string[] }[];
}

/** Word Trails: every letter belongs to exactly one themed word. */
export interface TrailsPuzzle {
  /** A hint at the theme, not the answer to it. */
  theme: string;
  rows: number;
  cols: number;
  /** rows strings of cols upper-case letters. */
  grid: string[];
  /** path = cell indices (row * cols + col) in spelling order. Exactly one word has span = true. */
  words: { word: string; path: number[]; span?: boolean }[];
}

/** Outline: name the country from its shape. */
export interface AtlasPuzzle {
  /** ISO 3166-1 alpha-2, one of src/data/countries.json. */
  code: string;
  fact?: string;
}

/** Brickfall: everyone gets the same pieces in the same order. */
export interface BlocksPuzzle {
  seed: number;
}

export interface PuzzleSet {
  rare?: RarePuzzle;
  word?: WordPuzzle;
  cross?: CrossPuzzle;
  groups?: GroupsPuzzle;
  blocks?: BlocksPuzzle;
  trails?: TrailsPuzzle;
  atlas?: AtlasPuzzle;
}

export interface Player {
  id: string;
  name: string;
  emoji: string;
  color: string;
  organizer?: boolean;
}

export interface FamilyNotes {
  /** Who is playing: names, ages, what each is into. */
  people: string;
  /** Shows, books, games, teams we are following right now. */
  watching: string;
  /** Trips, birthdays, school and family events coming up. */
  events: string;
}

// ---- games-api: POST { action, ...request } -> response, or { error: string } with a 4xx/5xx status.

export interface Api {
  /** Join a family with its code. Calling again with the same deviceId returns the same player. */
  join: {
    req: { code: string; name: string; emoji: string; color: string; deviceId: string };
    res: { token: string; player: Player; family: { id: string; name: string } };
  };
  /** Update my name / emoji / color. */
  profile: { req: { token: string; name?: string; emoji?: string; color?: string }; res: { player: Player } };
  /**
   * The day's puzzles (date = the player's local YYYY-MM-DD). If they have not been
   * made yet this starts generation and answers 'generating': ask again in a few seconds.
   */
  daily: {
    req: { token: string; date: string };
    res: { status: 'ready' | 'generating' | 'failed'; date: string; theme?: string; puzzles?: PuzzleSet };
  };
  /** Record a finished game. One result per player, date and game: the first one sticks. */
  submit: {
    req: { token: string; date: string; game: GameId; points: number; detail?: Record<string, unknown> };
    res: { points: number; duplicate: boolean };
  };
  /** Family standings as of the given local date. Weeks start on Monday. */
  board: {
    req: { token: string; date: string };
    res: {
      players: Player[];
      /** Everyone's results for the date. */
      today: { playerId: string; game: GameId; points: number }[];
      week: { playerId: string; points: number; games: number }[];
      month: { playerId: string; points: number; games: number }[];
      allTime: { playerId: string; points: number; games: number }[];
    };
  };
  /** What the puzzle writer knows about the family. Any member can read and edit. */
  notes: { req: { token: string; notes?: FamilyNotes }; res: { notes: FamilyNotes; familyName: string; code: string } };
}
