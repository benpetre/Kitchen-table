import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { ApiError, call } from './lib/api';
import { addDays, localDate } from './lib/dates';
import { seedFrom } from './lib/rng';
import { load, pruneBefore, remove, save } from './lib/storage';
import type { Api, FamilyNotes, GameId, Player, PuzzleSet } from './types';

export interface Session {
  token: string;
  deviceId: string;
  player: Player;
  family: { id: string; name: string };
}

/** One finished game, as kept on the phone. */
export interface LocalResult {
  points: number;
  detail: Record<string, unknown>;
  at: number;
  /** False until the family leaderboard has it. */
  synced: boolean;
}

export type History = Record<string, Partial<Record<GameId, LocalResult>>>;
export type Board = Api['board']['res'];

export interface Daily {
  status: 'loading' | 'ready' | 'generating' | 'failed' | 'offline';
  theme?: string;
  puzzles: PuzzleSet;
}

interface Store {
  hydrated: boolean;
  session: Session | null;
  date: string;
  daily: Daily;
  history: History;
  board: Board | null;
  join: (req: Omit<Api['join']['req'], 'deviceId'>) => Promise<void>;
  updateProfile: (p: { name?: string; emoji?: string; color?: string }) => Promise<void>;
  leave: () => Promise<void>;
  refreshDaily: () => void;
  refreshBoard: () => Promise<void>;
  /** Record a finished game for the given puzzle day (the day it was started, even if midnight has passed). */
  finish: (day: string, game: GameId, points: number, detail: Record<string, unknown>) => void;
  notes: (next?: FamilyNotes) => Promise<Api['notes']['res']>;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider is missing');
  return s;
}

const newId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => ((Math.random() * 16) | (c === 'x' ? 0 : 8)).toString(16).slice(-1));

/** Brickfall needs no server: the date alone decides the piece order, so it works offline too. */
const withBlocks = (date: string, puzzles: PuzzleSet): PuzzleSet => ({ ...puzzles, blocks: { seed: seedFrom(`brickfall:${date}`) } });

export const progressKey = (date: string, game: GameId) => `progress.${date}.${game}`;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [date, setDate] = useState(localDate());
  const [daily, setDaily] = useState<Daily>({ status: 'loading', puzzles: withBlocks(localDate(), {}) });
  const [history, setHistory] = useState<History>({});
  const [board, setBoard] = useState<Board | null>(null);
  const historyRef = useRef(history);
  historyRef.current = history;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [dailyNonce, setDailyNonce] = useState(0);

  // ---- startup
  useEffect(() => {
    (async () => {
      const [s, h] = await Promise.all([load<Session>('session'), load<History>('history')]);
      setSession(s);
      setHistory(h ?? {});
      setHydrated(true);
      pruneBefore(addDays(localDate(), -2));
    })();
  }, []);

  // ---- a new day starts when the phone's date changes
  useEffect(() => {
    const check = () => setDate((d) => (d === localDate() ? d : localDate()));
    const timer = setInterval(check, 30_000);
    return () => clearInterval(timer);
  }, []);

  const refreshBoard = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    try {
      setBoard(await call('board', { token: s.token, date: localDate() }));
    } catch {
      // keep showing the last standings
    }
  }, []);

  /** Send any results the leaderboard has not seen (finished offline, or the request failed). */
  const syncResults = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    let changed = false;
    const next: History = { ...historyRef.current };
    for (const [day, games] of Object.entries(historyRef.current)) {
      for (const [game, r] of Object.entries(games) as [GameId, LocalResult][]) {
        if (r.synced) continue;
        try {
          const res = await call('submit', { token: s.token, date: day, game, points: r.points, detail: r.detail });
          // If this game was already played elsewhere, the first score stands.
          next[day] = { ...next[day], [game]: { ...r, points: res.points, synced: true } };
          changed = true;
        } catch (e) {
          if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
            next[day] = { ...next[day], [game]: { ...r, synced: true } }; // refused for good (e.g. too old): stop retrying
            changed = true;
          }
        }
      }
    }
    if (changed) {
      setHistory(next);
      save('history', next);
      refreshBoard();
    }
  }, [refreshBoard]);

  // ---- coming back to the app: notice a new day, send anything unsent, refresh the standings
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      setDate((d) => (d === localDate() ? d : localDate()));
      syncResults();
      refreshBoard();
    });
    return () => sub.remove();
  }, [syncResults, refreshBoard]);

  // ---- today's puzzles: cache first, then the server, polling while they are being written
  useEffect(() => {
    if (!hydrated || !session) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const token = session.token;
    setDaily({ status: 'loading', puzzles: withBlocks(date, {}) });

    const ask = async (tries: number) => {
      try {
        const res = await call('daily', { token, date });
        if (!live) return;
        if (res.status === 'ready' && res.puzzles) {
          const d: Daily = { status: 'ready', theme: res.theme, puzzles: withBlocks(date, res.puzzles) };
          setDaily(d);
          save(`daily.${date}`, d);
        } else if (res.status === 'generating' && tries < 75) {
          setDaily({ status: 'generating', puzzles: withBlocks(date, {}) });
          timer = setTimeout(() => ask(tries + 1), 4000);
        } else {
          setDaily({ status: 'failed', puzzles: withBlocks(date, {}) });
        }
      } catch (e) {
        if (!live) return;
        if (e instanceof ApiError && e.status === 401) {
          // This device's membership is gone (removed, or the family was reset): start over.
          await remove('session');
          setSession(null);
          return;
        }
        setDaily({ status: 'offline', puzzles: withBlocks(date, {}) });
      }
    };

    (async () => {
      const cached = await load<Daily>(`daily.${date}`);
      if (!live) return;
      if (cached?.status === 'ready') setDaily(cached);
      else ask(0);
    })();
    syncResults();
    refreshBoard();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [hydrated, session, date, dailyNonce, syncResults, refreshBoard]);

  const store = useMemo<Store>(
    () => ({
      hydrated,
      session,
      date,
      daily,
      history,
      board,
      refreshBoard,
      refreshDaily: () => setDailyNonce((n) => n + 1),
      join: async (req) => {
        const deviceId = (await load<string>('device')) ?? newId();
        await save('device', deviceId);
        const res = await call('join', { ...req, deviceId });
        const s: Session = { token: res.token, deviceId, player: res.player, family: res.family };
        await save('session', s);
        setSession(s);
      },
      updateProfile: async (p) => {
        if (!session) return;
        const res = await call('profile', { token: session.token, ...p });
        const s = { ...session, player: res.player };
        await save('session', s);
        setSession(s);
        refreshBoard();
      },
      leave: async () => {
        await remove('session');
        setBoard(null);
        setSession(null);
      },
      finish: (day, game, points, detail) => {
        const prev = historyRef.current;
        if (prev[day]?.[game]) return; // once a day
        const next: History = { ...prev, [day]: { ...prev[day], [game]: { points, detail, at: Date.now(), synced: false } } };
        historyRef.current = next;
        setHistory(next);
        save('history', next).then(syncResults);
      },
      notes: async (next) => {
        if (!session) throw new ApiError('Not signed in', 401);
        return call('notes', { token: session.token, notes: next });
      },
    }),
    [hydrated, session, date, daily, history, board, refreshBoard, syncResults],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
