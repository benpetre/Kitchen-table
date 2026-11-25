import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { makeRandom, seedFrom, shuffled } from '../lib/rng';
import { groupsPoints, judge, MAX_MISTAKES } from '../logic/groups';
import { radius, usePalette } from '../theme';
import type { GroupsPuzzle } from '../types';
import { Btn, buzz, Notice, tint, Txt } from '../ui/kit';
import type { GameProps } from './types';

interface State {
  /** Group indices in the order they were found. */
  found: number[];
  mistakes: number;
  /** Every wrong foursome tried, so a repeat is not charged twice. */
  tried: string[];
  order: string[];
}

/** Shrink the type so the longest word in a tile stays on one line. */
const tileFont = (label: string) => {
  const longest = Math.max(...label.split(/[\s-]+/).map((w) => w.length));
  return longest <= 6 ? 15 : longest === 7 ? 13.5 : longest === 8 ? 12 : longest === 9 ? 11 : 10;
};

export default function CommonGround({ puzzle, date, accent, saved, save, finish, locked }: GameProps<GroupsPuzzle, State>) {
  const p = usePalette();
  const all = useMemo(() => puzzle.groups.flatMap((g) => g.words), [puzzle]);
  const [st, setSt] = useState<State>(() => saved ?? { found: [], mistakes: 0, tried: [], order: shuffled(all, makeRandom(seedFrom(date))) });
  const [picked, setPicked] = useState<string[]>([]);
  const [notice, setNotice] = useState('');

  const lost = st.mistakes >= MAX_MISTAKES;
  const won = st.found.length === 4;
  const over = won || lost;

  useEffect(() => {
    if (over) finish(groupsPoints(st.found.length, st.mistakes), { summary: won ? (st.mistakes ? `Sorted with ${st.mistakes} slip${st.mistakes > 1 ? 's' : ''}` : 'Sorted without a slip') : `Found ${st.found.length} of 4 groups`, found: st.found.length, mistakes: st.mistakes });
  }, [over]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (next: State) => {
    setSt(next);
    save(next);
  };

  const submit = () => {
    const key = [...picked].sort().join('|');
    const { group, oneAway } = judge(puzzle, picked);
    if (group >= 0) {
      buzz.good();
      update({ ...st, found: [...st.found, group], order: st.order.filter((w) => !picked.includes(w)) });
      setPicked([]);
      setNotice('');
    } else if (st.tried.includes(key)) {
      setNotice('Already tried those four');
    } else {
      buzz.bad();
      update({ ...st, mistakes: st.mistakes + 1, tried: [...st.tried, key] });
      setNotice(oneAway ? 'One away…' : 'Not a group');
      if (st.mistakes + 1 >= MAX_MISTAKES) setPicked([]);
    }
  };

  // Deeper shade = trickier group.
  const shade = (level: number) => tint(p, accent, 0.2 + level * 0.2);
  const shown = lost ? [...st.found, ...[0, 1, 2, 3].filter((g) => !st.found.includes(g))] : st.found;

  return (
    <View style={{ flex: 1, gap: 8 }}>
      <Txt dim center>
        Find four groups of four.
      </Txt>
      {shown.map((g) => (
        <View key={g} style={{ backgroundColor: shade(puzzle.groups[g].level), borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center', opacity: st.found.includes(g) ? 1 : 0.6 }}>
          <Text style={{ fontWeight: '800', fontSize: 15, color: p.ink, textTransform: 'uppercase', textAlign: 'center' }}>{puzzle.groups[g].title}</Text>
          <Text style={{ fontSize: 14, color: p.ink, textAlign: 'center', marginTop: 2 }}>{puzzle.groups[g].words.join(', ')}</Text>
        </View>
      ))}
      {!lost ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {st.order.map((w) => {
            const on = picked.includes(w);
            return (
              <Pressable
                key={w}
                disabled={over || locked}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={w}
                onPress={() => {
                  buzz.tap();
                  setNotice('');
                  setPicked((cur) => (on ? cur.filter((x) => x !== w) : cur.length < 4 ? [...cur, w] : cur));
                }}
                style={{ width: '23.2%', flexGrow: 1, height: 68, borderRadius: radius.md, backgroundColor: on ? p.ink : p.card, borderWidth: 1.5, borderColor: on ? p.ink : p.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
                <Text numberOfLines={2} style={{ fontSize: tileFont(w), fontWeight: '700', textAlign: 'center', color: on ? p.bg : p.ink, textTransform: 'uppercase' }}>
                  {w}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Notice text={won ? 'All sorted!' : lost ? 'Out of tries. Here is how they go together.' : notice} tone={won ? 'good' : 'bad'} />
      {!over ? (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }} accessible accessibilityLabel={`${MAX_MISTAKES - st.mistakes} tries left`}>
            <Txt v="small" dim>
              Tries left
            </Txt>
            {Array.from({ length: MAX_MISTAKES }, (_, i) => (
              <View key={i} style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: i < MAX_MISTAKES - st.mistakes ? accent : p.line }} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 4 }}>
            <Btn small kind="quiet" label="Shuffle" onPress={() => update({ ...st, order: shuffled(st.order, Math.random) })} />
            <Btn small kind="quiet" label="Clear" disabled={!picked.length} onPress={() => setPicked([])} />
            <Btn small label="Submit" color={accent} disabled={picked.length !== 4 || locked} onPress={submit} />
          </View>
        </>
      ) : null}
    </View>
  );
}
