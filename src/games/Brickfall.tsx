import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, PanResponder, Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { blocksPoints, BlocksState, COLS, dropInterval, ghost, hardDrop, levelOf, move, newGame, pieceCells, rotate, ROWS, shapeOf, step } from '../logic/blocks';
import { usePalette } from '../theme';
import type { BlocksPuzzle } from '../types';
import { Btn, buzz, Txt } from '../ui/kit';
import type { GameProps } from './types';

interface State {
  game: BlocksState;
  started: boolean;
}

// One colour per piece, from the app's own palette.
const BRICK = ['#7A4FD6', '#1C8CA8', '#D9A21B', '#2D6CDF', '#D9603B', '#1F8A70', '#C9344B'];

/** A row only re-renders when its cells change. Each character: '0' empty, 1-7 a brick, 'g' the landing shadow. */
const Row = memo(function Row({ cells, size, empty, line }: { cells: string; size: number; empty: string; line: string }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {[...cells].map((ch, x) => (
        <View key={x} style={{ width: size, height: size, padding: 1 }}>
          {ch === '0' ? (
            <View style={{ flex: 1, borderRadius: 3, backgroundColor: empty }} />
          ) : ch === 'g' ? (
            <View style={{ flex: 1, borderRadius: 3, borderWidth: 1.5, borderColor: line, backgroundColor: empty }} />
          ) : (
            <View style={{ flex: 1, borderRadius: 3, backgroundColor: BRICK[+ch - 1], borderTopWidth: 3, borderTopColor: 'rgba(255,255,255,0.35)', borderBottomWidth: 2, borderBottomColor: 'rgba(0,0,0,0.2)' }} />
          )}
        </View>
      ))}
    </View>
  );
});

function Pad({ label, a11y, onPress, repeat, size = 58 }: { label: string; a11y: string; onPress: () => void; repeat?: boolean; size?: number }) {
  const p = usePalette();
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = undefined;
  };
  useEffect(() => stop, []);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPressIn={() => {
        onPress();
        if (repeat) {
          stop();
          let waited = 0;
          timer.current = setInterval(() => (++waited > 3 ? onPress() : undefined), 55); // hold to repeat after a short pause
        }
      }}
      onPressOut={stop}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: pressed ? p.line : p.raised, alignItems: 'center', justifyContent: 'center' })}>
      <Text style={{ fontSize: 24, fontWeight: '800', color: p.ink }}>{label}</Text>
    </Pressable>
  );
}

export default function Brickfall({ puzzle, accent, saved, save, finish, locked }: GameProps<BlocksPuzzle, State>) {
  const p = usePalette();
  const { width, height } = useWindowDimensions();
  const size = Math.max(12, Math.floor(Math.min((width - 32 - 96) / COLS, (height - 330) / ROWS)));
  const [st, setSt] = useState<State>(() => saved ?? { game: newGame(puzzle.seed), started: false });
  const [paused, setPaused] = useState(!!saved?.started && !saved.game.over);
  const ref = useRef(st);
  ref.current = st;
  const running = st.started && !paused && !st.game.over && !locked;
  const runningRef = useRef(running);
  runningRef.current = running;

  /** Apply a move. The board is saved whenever a piece locks, so a closed app resumes at the last landed piece. */
  const act = useCallback(
    (fn: (g: BlocksState) => BlocksState) => {
      if (!runningRef.current) return;
      const cur = ref.current;
      const game = fn(cur.game);
      if (game === cur.game) return;
      const next = { ...cur, game };
      ref.current = next;
      setSt(next);
      if (game.queue !== cur.game.queue) {
        save(next);
        if (game.lines > cur.game.lines) buzz.good();
        else buzz.thud();
      }
    },
    [save],
  );

  // Gravity. The timer restarts only when the pace changes, not on every move.
  const pace = dropInterval(st.game);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => act((g) => step(g)), pace);
    return () => clearInterval(t);
  }, [running, pace, act]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' && ref.current.started && !ref.current.game.over) {
        setPaused(true);
        save(ref.current);
      }
    });
    return () => {
      sub.remove();
      if (ref.current.started) save(ref.current); // leaving the screen keeps the run
    };
  }, [save]);

  // Arrow keys, for playing in a browser.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const fn = { ArrowLeft: (g: BlocksState) => move(g, -1), ArrowRight: (g: BlocksState) => move(g, 1), ArrowUp: rotate, ArrowDown: (g: BlocksState) => step(g, true), ' ': hardDrop }[e.key];
      if (fn) {
        e.preventDefault();
        act(fn);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act]);

  const over = st.game.over;
  useEffect(() => {
    if (over) finish(blocksPoints(st.game.score), { summary: `${st.game.score.toLocaleString()} points, ${st.game.lines} line${st.game.lines === 1 ? '' : 's'}`, score: st.game.score, lines: st.game.lines });
  }, [over]); // eslint-disable-line react-hooks/exhaustive-deps

  // Board gestures: tap to turn, slide sideways to move, flick down to drop.
  const drag = useRef({ x: 0, moved: false });
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        drag.current = { x: 0, moved: false };
      },
      onPanResponderMove: (_, g) => {
        const stepPx = sizeRef.current * 0.9;
        while (g.dx - drag.current.x > stepPx) {
          drag.current.x += stepPx;
          drag.current.moved = true;
          act((s) => move(s, 1));
        }
        while (g.dx - drag.current.x < -stepPx) {
          drag.current.x -= stepPx;
          drag.current.moved = true;
          act((s) => move(s, -1));
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 60 && g.vy > 0.6 && Math.abs(g.dx) < 50) act(hardDrop);
        else if (!drag.current.moved && Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8) act(rotate);
      },
    }),
  ).current;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  // Compose what is on screen: landed bricks, the landing shadow, then the falling piece.
  const view = st.game.board.map(String);
  if (st.started && !over) {
    for (const [x, y] of pieceCells(ghost(st.game))) if (y >= 0 && view[y * COLS + x] === '0') view[y * COLS + x] = 'g';
    for (const [x, y] of pieceCells(st.game.piece)) if (y >= 0) view[y * COLS + x] = String(st.game.piece.kind + 1);
  }
  const empty = p.dark ? '#1D1915' : '#EFE8DA';
  const next = st.game.queue[0];
  const mini = Math.floor(size * 0.6);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View {...pan.panHandlers} style={{ borderRadius: 8, borderWidth: 2, borderColor: p.line, backgroundColor: p.card, padding: 2 }} accessibilityLabel="Playing field">
          {Array.from({ length: ROWS }, (_, y) => (
            <Row key={y} cells={view.slice(y * COLS, (y + 1) * COLS).join('')} size={size} empty={empty} line={p.faint} />
          ))}
          {!running ? (
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: p.dark ? 'rgba(22,19,16,0.86)' : 'rgba(246,241,231,0.88)', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 12, borderRadius: 6 }}>
              {over ? (
                <>
                  <Txt v="heading" center>
                    Stacked out
                  </Txt>
                  <Txt style={{ fontSize: 34, fontWeight: '800' }} color={accent}>
                    {st.game.score.toLocaleString()}
                  </Txt>
                </>
              ) : !st.started ? (
                <>
                  <Txt center dim>
                    One run a day. Same pieces for the whole family. The bricks fall faster as you go.
                  </Txt>
                  <Btn label="Start" color={accent} disabled={locked} onPress={() => setSt((s) => ({ ...s, started: true }))} />
                </>
              ) : (
                <>
                  <Txt v="heading">Paused</Txt>
                  <Btn label="Resume" color={accent} onPress={() => setPaused(false)} />
                </>
              )}
            </View>
          ) : null}
        </View>

        <View style={{ width: 84, gap: 14 }}>
          <View>
            <Txt v="label">Next</Txt>
            <View style={{ height: mini * 2 + 8, marginTop: 6 }}>
              {next != null
                ? shapeOf(next).map(([x, y], i) => <View key={i} style={{ position: 'absolute', left: x * mini, top: y * mini, width: mini - 2, height: mini - 2, borderRadius: 3, backgroundColor: BRICK[next] }} />)
                : null}
            </View>
          </View>
          {(
            [
              ['Score', st.game.score.toLocaleString()],
              ['Lines', String(st.game.lines)],
              ['Level', String(levelOf(st.game))],
            ] as const
          ).map(([k, v]) => (
            <View key={k}>
              <Txt v="label">{k}</Txt>
              <Txt v="heading" style={{ fontVariant: ['tabular-nums'] }}>
                {v}
              </Txt>
            </View>
          ))}
          {st.started && !over ? <Btn small kind="quiet" label={paused ? 'Resume' : 'Pause'} onPress={() => setPaused((x) => !x)} /> : null}
        </View>
      </View>

      {!over ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', paddingHorizontal: 6, paddingBottom: 6, opacity: running ? 1 : 0.4 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pad label="←" a11y="Move left" repeat onPress={() => act((s) => move(s, -1))} />
            <Pad label="→" a11y="Move right" repeat onPress={() => act((s) => move(s, 1))} />
          </View>
          <Pad label="↓" a11y="Soft drop" repeat onPress={() => act((s) => step(s, true))} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pad label="⤓" a11y="Drop to the floor" onPress={() => act(hardDrop)} />
            <Pad label="⟳" a11y="Rotate" onPress={() => act(rotate)} size={66} />
          </View>
        </View>
      ) : null}
    </View>
  );
}
