import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { adjacent, letterAt, matchTrail, trailsPoints } from '../logic/trails';
import { usePalette } from '../theme';
import type { TrailsPuzzle } from '../types';
import { Btn, buzz, Notice, tint, Txt } from '../ui/kit';
import type { GameProps } from './types';

interface State {
  /** Indices into puzzle.words, in the order found. */
  found: number[];
  hints: number;
  /** A word whose letters are currently ringed by a hint. */
  hinted: number | null;
}

export default function WordTrails({ puzzle, accent, saved, save, finish, locked }: GameProps<TrailsPuzzle, State>) {
  const p = usePalette();
  const { width, height } = useWindowDimensions();
  const { rows, cols } = puzzle;
  const size = Math.floor(Math.min((width - 32) / cols, (height - 330) / rows, 62));
  const [st, setSt] = useState<State>(saved ?? { found: [], hints: 0, hinted: null });
  const [path, setPath] = useState<number[]>([]);
  const [notice, setNotice] = useState('');
  // Touch handlers outlive renders, so the trail they extend lives in a ref and is mirrored to state.
  const live = useRef({ st, path: [] as number[], changed: false, tapOnLast: false, outside: false });
  live.current.st = st;
  const trace = (next: number[]) => {
    live.current.path = next;
    setPath(next);
  };
  const origin = useRef({ x: 0, y: 0 });
  const gridRef = useRef<View>(null);

  const over = st.found.length === puzzle.words.length;
  const used = useMemo(() => new Set(st.found.flatMap((w) => puzzle.words[w].path)), [st.found, puzzle]);

  useEffect(() => {
    if (over) finish(trailsPoints(st.hints), { summary: st.hints ? `All found with ${st.hints} hint${st.hints > 1 ? 's' : ''}` : 'All found, no hints', hints: st.hints });
  }, [over]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (next: State) => {
    setSt(next);
    save(next);
  };

  const submit = (traced: number[]) => {
    trace([]);
    if (traced.length < 2) return;
    const cur = live.current.st;
    const w = matchTrail(puzzle, traced, cur.found);
    if (w >= 0) {
      buzz.good();
      update({ ...cur, found: [...cur.found, w], hinted: cur.hinted === w ? null : cur.hinted });
      setNotice(puzzle.words[w].span ? `${puzzle.words[w].word}: that's the theme!` : puzzle.words[w].word);
    } else if (traced.length >= 3) {
      buzz.bad();
      setNotice('Not one of today\'s words');
    }
  };

  /** The cell under a touch, or -1 between cells (the dead zone makes diagonals easy to hit). */
  const cellAt = (pageX: number, pageY: number) => {
    const x = pageX - origin.current.x;
    const y = pageY - origin.current.y;
    const c = Math.floor(x / size);
    const r = Math.floor(y / size);
    if (c < 0 || c >= cols || r < 0 || r >= rows) return -1;
    return Math.hypot(x - (c + 0.5) * size, y - (r + 0.5) * size) <= size * 0.42 ? r * cols + c : -1;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        gridRef.current?.measureInWindow((x, y) => (origin.current = { x, y }));
        const i = cellAt(e.nativeEvent.pageX, e.nativeEvent.pageY);
        const t = live.current;
        t.changed = false;
        t.tapOnLast = false;
        t.outside = i < 0 || usedRef.current.has(i);
        if (t.outside) return;
        const cur = t.path;
        if (cur.length && cur[cur.length - 1] === i) t.tapOnLast = true; // tapping the last letter again submits
        else if (cur.length && !cur.includes(i) && adjacent(cur[cur.length - 1], i, cols)) trace([...cur, i]); // tap-by-tap
        else trace([i]);
        buzz.tap();
      },
      onPanResponderMove: (e) => {
        const i = cellAt(e.nativeEvent.pageX, e.nativeEvent.pageY);
        const t = live.current;
        const cur = t.path;
        if (i < 0 || t.outside || !cur.length || cur[cur.length - 1] === i) return;
        if (cur.length > 1 && cur[cur.length - 2] === i) {
          t.changed = true;
          return trace(cur.slice(0, -1)); // slid back a letter
        }
        if (!cur.includes(i) && !usedRef.current.has(i) && adjacent(cur[cur.length - 1], i, cols)) {
          t.changed = true;
          buzz.tap();
          trace([...cur, i]);
        }
      },
      onPanResponderRelease: () => {
        const t = live.current;
        if (t.changed || (t.tapOnLast && t.path.length > 1)) submit(t.path); // lifted after a drag, or confirmed by tap
        else if (t.outside) trace([]);
      },
    }),
  ).current;
  const usedRef = useRef(used);
  usedRef.current = used;

  const center = (i: number) => `${((i % cols) + 0.5) * size},${(Math.floor(i / cols) + 0.5) * size}`;
  const spanColor = p.ink;
  const cellOwner = (i: number) => st.found.find((w) => puzzle.words[w].path.includes(i));
  const hintCells = st.hinted != null ? puzzle.words[st.hinted].path : [];

  const hint = () => {
    const pool = puzzle.words.map((_, i) => i).filter((i) => !st.found.includes(i));
    const pickFrom = pool.filter((i) => !puzzle.words[i].span);
    const w = (pickFrom.length ? pickFrom : pool)[0];
    update({ ...st, hints: st.hints + 1, hinted: w });
    setNotice(`${puzzle.words[w].path.length} letters, ringed on the board`);
    trace([]);
  };

  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 8 }}>
      <View style={{ alignSelf: 'stretch', backgroundColor: tint(p, accent, 0.18), borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 }}>
        <Txt v="label">Today's theme</Txt>
        <Txt v="heading">{puzzle.theme}</Txt>
      </View>
      <Text style={{ minHeight: 30, fontSize: 22, fontWeight: '800', letterSpacing: 2, color: accent }} accessibilityLiveRegion="polite">
        {path.map((i) => letterAt(puzzle, i)).join('')}
      </Text>

      <View ref={gridRef} onLayout={() => gridRef.current?.measureInWindow((x, y) => (origin.current = { x, y }))} {...(over || locked ? {} : pan.panHandlers)} style={{ width: cols * size, height: rows * size }} accessibilityLabel="Letter grid. Drag across neighbouring letters to trace a word.">
        <Svg width={cols * size} height={rows * size} style={{ position: 'absolute' }}>
          {st.found.map((w) => (
            <Polyline key={w} points={puzzle.words[w].path.map(center).join(' ')} stroke={puzzle.words[w].span ? spanColor : accent} strokeOpacity={puzzle.words[w].span ? 1 : 0.85} strokeWidth={size * 0.3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          ))}
          {path.length > 1 ? <Polyline points={path.map(center).join(' ')} stroke={p.faint} strokeWidth={size * 0.3} strokeLinecap="round" strokeLinejoin="round" fill="none" /> : null}
        </Svg>
        {Array.from({ length: rows * cols }, (_, i) => {
          const owner = cellOwner(i);
          const span = owner != null && puzzle.words[owner].span;
          const on = path.includes(i);
          const d = size * 0.76;
          return (
            <View key={i} pointerEvents="none" style={{ position: 'absolute', left: (i % cols) * size, top: Math.floor(i / cols) * size, width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
              <View
                style={{
                  width: d,
                  height: d,
                  borderRadius: d * 0.32,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: owner != null ? (span ? spanColor : accent) : on ? p.faint : p.card,
                  borderWidth: hintCells.includes(i) && owner == null ? 2.5 : 1,
                  borderStyle: hintCells.includes(i) && owner == null ? 'dashed' : 'solid',
                  borderColor: hintCells.includes(i) && owner == null ? accent : owner != null || on ? 'transparent' : p.line,
                }}>
                <Text style={{ alignSelf: 'stretch', textAlign: 'center', fontSize: size * 0.4, fontWeight: '800', color: owner != null ? (span ? p.bg : p.onAccent) : on ? p.bg : p.ink }}>{letterAt(puzzle, i)}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <Notice text={over ? 'Every letter used. Nicely traced.' : notice} tone={over ? 'good' : 'plain'} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Txt dim>
          {st.found.length} of {puzzle.words.length} words
        </Txt>
        {!over ? <Btn small kind="quiet" label="Hint (-12)" disabled={locked} onPress={hint} /> : null}
        {!over && path.length ? <Btn small kind="quiet" label="Clear" onPress={() => trace([])} /> : null}
      </View>
      {!over && !st.found.length ? (
        <Txt v="small" dim center>
          Drag through touching letters, any direction. One long word ties the theme together and crosses the whole board.
        </Txt>
      ) : null}
    </View>
  );
}
