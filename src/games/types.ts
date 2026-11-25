/** What every game screen receives from GameScreen. */
export interface GameProps<P, S> {
  puzzle: P;
  date: string;
  accent: string;
  /** The board as it was last saved on this phone today (null on first open). */
  saved: S | null;
  /** Persist the board so leaving and coming back resumes the same attempt. */
  save: (state: S) => void;
  /** Report the final score. Safe to call more than once: only the first counts. */
  finish: (points: number, detail: { summary: string } & Record<string, unknown>) => void;
  /** True once today's result is recorded: show the final board, accept no input. */
  locked: boolean;
}
