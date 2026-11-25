import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { clock } from '../lib/dates';
import { cellNumbers, clueAt, clueCells, crossPoints, Dir, isBlock, isFull, isSolved, N, solutionAt } from '../logic/cross';
import { radius, usePalette } from '../theme';
import type { CrossPuzzle } from '../types';
import { Btn, buzz, Keys, Notice, tint, Txt } from '../ui/kit';
import type { GameProps } from './types';

interface State {
  fill: string[];
  seconds: number;
  checks: number;
  reveals: number;
  gaveUp: boolean;
  /** Squares filled in by Reveal: they stay marked. */
  revealed: number[];
}

export default function PocketCross({ puzzle, accent, saved, save, finish, locked }: GameProps<CrossPuzzle, State>) {
  const p = usePalette();
  const { width, height } = useWindowDimensions();
  const cell = Math.max(34, Math.min(64, Math.floor((width - 40) / N), Math.floor((height - 480) / N))); // shrink on short phones
  const [st, setSt] = useState<State>(saved ?? { fill: Array(N * N).fill(''), seconds: 0, checks: 0, reveals: 0, gaveUp: false, revealed: [] });
  const first = puzzle.across[0] ?? puzzle.down[0];
  const [cursor, setCursor] = useState(first.row * N + first.col);
  const [dir, setDir] = useState<Dir>(puzzle.across.length ? 'across' : 'down');
  const [wrong, setWrong] = useState<number[]>([]);
  const [notice, setNotice] = useState('');
  const stRef = useRef(st);
  stRef.current = st;

  const solved = isSolved(puzzle, st.fill);
  const over = solved || st.gaveUp;

  useEffect(() => {
    if (over || locked) return;
    const t = setInterval(() => {
      const next = { ...stRef.current, seconds: stRef.current.seconds + 1 };
      setSt(next);
      if (next.seconds % 5 === 0) save(next);
    }, 1000);
    return () => clearInterval(t);
  }, [over, locked]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!over) return;
    const points = crossPoints(st.seconds, st.checks, st.reveals, st.gaveUp);
    finish(points, { summary: st.gaveUp ? 'Revealed the grid' : `Solved in ${clock(st.seconds)}${st.checks + st.reveals ? ` with ${st.checks + st.reveals} assist${st.checks + st.reveals > 1 ? 's' : ''}` : ''}`, seconds: st.seconds, checks: st.checks, reveals: st.reveals });
  }, [over]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (next: State) => {
    setSt(next);
    save(next);
  };

  const clue = clueAt(puzzle, cursor, dir) ?? clueAt(puzzle, cursor, dir === 'across' ? 'down' : 'across');
  const activeDir: Dir = clueAt(puzzle, cursor, dir) ? dir : dir === 'across' ? 'down' : 'across';
  const entry = clue ? clueCells(clue, activeDir) : [cursor];
  const order = [...puzzle.across.map((c) => ({ c, d: 'across' as Dir })), ...puzzle.down.map((c) => ({ c, d: 'down' as Dir }))];

  const select = (i: number) => {
    if (isBlock(puzzle, i)) return;
    buzz.tap();
    if (i === cursor) {
      const other: Dir = activeDir === 'across' ? 'down' : 'across';
      if (clueAt(puzzle, i, other)) setDir(other);
    } else {
      setCursor(i);
      setDir(activeDir);
    }
  };

  const jump = (step: number) => {
    const at = order.findIndex((o) => o.c === clue && o.d === activeDir);
    const next = order[(at + step + order.length) % order.length];
    const cells = clueCells(next.c, next.d);
    setDir(next.d);
    setCursor(cells.find((i) => !st.fill[i]) ?? cells[0]);
  };

  const type = (ch: string) => {
    if (st.revealed.includes(cursor)) return advance();
    const fill = [...st.fill];
    fill[cursor] = ch;
    setWrong((w) => w.filter((i) => i !== cursor));
    update({ ...st, fill });
    setNotice(isFull(puzzle, fill) && !isSolved(puzzle, fill) ? 'Full, but something is off.' : '');
    if (isSolved(puzzle, fill)) buzz.good();
    advance();
  };
  const advance = () => {
    const at = entry.indexOf(cursor);
    if (at >= 0 && at < entry.length - 1) setCursor(entry[at + 1]);
  };
  const back = () => {
    const at = entry.indexOf(cursor);
    const target = st.fill[cursor] && !st.revealed.includes(cursor) ? cursor : at > 0 ? entry[at - 1] : cursor;
    if (target !== cursor) setCursor(target);
    if (st.revealed.includes(target)) return;
    const fill = [...st.fill];
    fill[target] = '';
    setNotice('');
    update({ ...st, fill });
  };

  const check = () => {
    const bad = st.fill.map((ch, i) => (ch && !isBlock(puzzle, i) && ch !== solutionAt(puzzle, i) ? i : -1)).filter((i) => i >= 0);
    setWrong(bad);
    setNotice(bad.length ? `${bad.length} square${bad.length > 1 ? 's' : ''} to fix` : 'All good so far');
    update({ ...st, checks: st.checks + 1 });
  };
  const reveal = () => {
    if (st.revealed.includes(cursor)) return;
    const fill = [...st.fill];
    fill[cursor] = solutionAt(puzzle, cursor);
    setWrong((w) => w.filter((i) => i !== cursor));
    update({ ...st, fill, reveals: st.reveals + 1, revealed: [...st.revealed, cursor] });
    advance();
  };
  const giveUp = () => {
    update({ ...st, fill: Array.from({ length: N * N }, (_, i) => (isBlock(puzzle, i) ? '' : solutionAt(puzzle, i))), gaveUp: true });
  };

  const nums = cellNumbers(puzzle);
  return (
    <View style={{ flex: 1, justifyContent: 'space-between' }}>
      <View style={{ alignItems: 'center', gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', alignItems: 'baseline' }}>
          <Txt v="small" dim style={{ flex: 1 }} numberOfLines={1}>
            {puzzle.title ?? ''}
          </Txt>
          <Txt style={{ fontVariant: ['tabular-nums'], fontWeight: '700' }} accessibilityLabel={`Time ${clock(st.seconds)}`}>
            {clock(st.seconds)}
          </Txt>
        </View>
        <View style={{ borderWidth: 2, borderColor: p.ink, borderRadius: 6, overflow: 'hidden' }}>
          {Array.from({ length: N }, (_, r) => (
            <View key={r} style={{ flexDirection: 'row' }}>
              {Array.from({ length: N }, (_, c) => {
                const i = r * N + c;
                if (isBlock(puzzle, i)) return <View key={c} style={{ width: cell, height: cell, backgroundColor: p.ink }} />;
                const here = i === cursor && !over;
                const inEntry = entry.includes(i) && !over;
                return (
                  <Pressable
                    key={c}
                    disabled={over || locked}
                    onPress={() => select(i)}
                    accessibilityLabel={`Row ${r + 1} column ${c + 1}, ${st.fill[i] || 'blank'}`}
                    style={{ width: cell, height: cell, borderWidth: 0.5, borderColor: p.faint, backgroundColor: here ? tint(p, accent, 0.55) : inEntry ? tint(p, accent, 0.18) : p.card, alignItems: 'center', justifyContent: 'center' }}>
                    {nums[i] ? <Text style={{ position: 'absolute', top: 2, left: 4, fontSize: 11, fontWeight: '600', color: p.sub }}>{nums[i]}</Text> : null}
                    <Text style={{ fontSize: cell * 0.5, fontWeight: '700', color: wrong.includes(i) ? p.bad : st.revealed.includes(i) ? accent : p.ink }}>{st.fill[i]}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {over ? (
        <ScrollView style={{ flex: 1, marginTop: 12 }} contentContainerStyle={{ gap: 6, paddingBottom: 12 }}>
          <Txt v="heading" center>
            {st.gaveUp ? 'Here is the full grid.' : `Solved in ${clock(st.seconds)}`}
          </Txt>
          {[...puzzle.across.map((c) => `${c.num}A  ${c.clue}: ${c.answer}`), ...puzzle.down.map((c) => `${c.num}D  ${c.clue}: ${c.answer}`)].map((line) => (
            <Txt key={line} v="small" dim>
              {line}
            </Txt>
          ))}
        </ScrollView>
      ) : (
        <View style={{ gap: 8 }}>
          <Notice text={notice} tone={notice.startsWith('All good') ? 'good' : 'bad'} />
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: tint(p, accent, 0.18), borderRadius: radius.md, minHeight: 56 }}>
            <Pressable accessibilityLabel="Previous clue" onPress={() => jump(-1)} style={{ padding: 14 }}>
              <Txt style={{ fontSize: 20, fontWeight: '800' }}>‹</Txt>
            </Pressable>
            <Pressable style={{ flex: 1, paddingVertical: 8 }} onPress={() => select(cursor)} accessibilityLabel={clue ? `${clue.num} ${activeDir}: ${clue.clue}` : ''}>
              <Txt style={{ fontWeight: '600' }}>
                <Txt style={{ fontWeight: '800' }}>{clue ? `${clue.num}${activeDir === 'across' ? 'A' : 'D'}  ` : ''}</Txt>
                {clue?.clue}
              </Txt>
            </Pressable>
            <Pressable accessibilityLabel="Next clue" onPress={() => jump(1)} style={{ padding: 14 }}>
              <Txt style={{ fontSize: 20, fontWeight: '800' }}>›</Txt>
            </Pressable>
          </View>
          <Keys disabled={locked} onKey={type} onBack={back} />
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
            <Btn small kind="quiet" label="Check (-8)" onPress={check} />
            <Btn small kind="quiet" label="Reveal square (-12)" onPress={reveal} />
            <Btn small kind="quiet" label="Give up" onPress={giveUp} />
          </View>
        </View>
      )}
    </View>
  );
}
