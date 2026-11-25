import type { GroupsPuzzle } from '../types';

export const MAX_MISTAKES = 4;

/** Index of the group these four tiles make, or -1. `oneAway` when three of them belong together. */
export function judge(p: GroupsPuzzle, picked: string[]): { group: number; oneAway: boolean } {
  let oneAway = false;
  for (let g = 0; g < p.groups.length; g++) {
    const n = picked.filter((w) => p.groups[g].words.includes(w)).length;
    if (n === 4) return { group: g, oneAway: false };
    if (n === 3) oneAway = true;
  }
  return { group: -1, oneAway };
}

export function groupsPoints(found: number, mistakes: number): number {
  return found === 4 ? Math.max(40, 100 - mistakes * 15) : found * 12;
}
