import { addDays } from '../lib/dates';
import type { History } from '../store';
import type { GameId } from '../types';

export const dayPoints = (h: History, day: string) => Object.values(h[day] ?? {}).reduce((s, r) => s + r.points, 0);

/** Days in a row with at least one game, ending today (or yesterday, if today is not played yet). */
export function streak(h: History, today: string): number {
  const played = (d: string) => Object.keys(h[d] ?? {}).length > 0;
  let d = played(today) ? today : addDays(today, -1);
  let n = 0;
  while (played(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function lifetime(h: History) {
  const days = Object.keys(h).filter((d) => Object.keys(h[d]).length > 0);
  const totals = days.map((d) => dayPoints(h, d));
  return {
    days: days.length,
    points: totals.reduce((s, n) => s + n, 0),
    bestDay: Math.max(0, ...totals),
    games: days.reduce((s, d) => s + Object.keys(h[d]).length, 0),
  };
}

export function perGame(h: History, game: GameId) {
  const scores = Object.values(h)
    .map((d) => d[game]?.points)
    .filter((n): n is number => n != null);
  return { played: scores.length, average: scores.length ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length) : 0, best: Math.max(0, ...scores) };
}
