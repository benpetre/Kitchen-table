export type Mark = 'hit' | 'near' | 'miss';

/** Score a guess: 'hit' = right letter, right place; 'near' = in the word, elsewhere. Repeats are counted, not double-marked. */
export function markGuess(guess: string, answer: string): Mark[] {
  const marks: Mark[] = Array(answer.length).fill('miss');
  const left: Record<string, number> = {};
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) marks[i] = 'hit';
    else left[answer[i]] = (left[answer[i]] ?? 0) + 1;
  }
  for (let i = 0; i < answer.length; i++) {
    if (marks[i] !== 'hit' && left[guess[i]] > 0) {
      marks[i] = 'near';
      left[guess[i]]--;
    }
  }
  return marks;
}

const RANK: Record<Mark, number> = { miss: 0, near: 1, hit: 2 };

/** The best mark each letter has earned so far, for colouring the keyboard. */
export function keyMarks(guesses: string[], answer: string): Record<string, Mark> {
  const best: Record<string, Mark> = {};
  for (const g of guesses) {
    markGuess(g, answer).forEach((m, i) => {
      if (best[g[i]] == null || RANK[m] > RANK[best[g[i]]]) best[g[i]] = m;
    });
  }
  return best;
}

export const WORD_GUESSES = 6;
const BY_GUESS = [100, 90, 78, 64, 50, 36];

export function wordPoints(solvedIn: number | null): number {
  return solvedIn == null ? 10 : BY_GUESS[solvedIn - 1];
}
