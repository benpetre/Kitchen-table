import React, { useEffect, useMemo, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';

import words5 from '../data/words5.json';
import { keyMarks, Mark, markGuess, WORD_GUESSES, wordPoints } from '../logic/word';
import { usePalette } from '../theme';
import type { WordPuzzle } from '../types';
import { buzz, Keys, Notice, Txt } from '../ui/kit';
import type { GameProps } from './types';

interface State {
  guesses: string[];
}

const VALID = new Set((words5 as string).toUpperCase().split(' '));

export default function Hunch({ puzzle, accent, saved, save, finish, locked }: GameProps<WordPuzzle, State>) {
  const p = usePalette();
  const answer = puzzle.answer.toUpperCase();
  const { height } = useWindowDimensions();
  const tile = Math.max(38, Math.min(56, Math.floor((height - 400) / 6) - 7)); // shrink on short phones
  const [guesses, setGuesses] = useState<string[]>(saved?.guesses ?? []);
  const [current, setCurrent] = useState('');
  const [notice, setNotice] = useState('');

  const solved = guesses.includes(answer);
  const over = solved || guesses.length >= WORD_GUESSES;

  useEffect(() => {
    if (over) finish(wordPoints(solved ? guesses.length : null), { summary: solved ? `Got it in ${guesses.length} of ${WORD_GUESSES}` : `Missed it: ${answer}`, guesses: guesses.length, solved });
  }, [over]); // eslint-disable-line react-hooks/exhaustive-deps

  const enter = () => {
    if (current.length < 5) return setNotice('Five letters, please');
    if (!VALID.has(current) && current !== answer) {
      buzz.bad();
      return setNotice('Not in the word list');
    }
    if (guesses.includes(current)) return setNotice('Already tried that one');
    const next = [...guesses, current];
    setGuesses(next);
    save({ guesses: next });
    setCurrent('');
    setNotice('');
    if (current === answer) buzz.good();
  };

  // Right place = solid accent. Right letter, wrong place = accent ring. Not in the word = faded.
  const look = (m: Mark | null) =>
    m === 'hit'
      ? { bg: accent, border: accent, fg: p.onAccent }
      : m === 'near'
        ? { bg: p.card, border: accent, fg: p.ink }
        : m === 'miss'
          ? { bg: p.raised, border: p.raised, fg: p.faint }
          : { bg: 'transparent', border: p.line, fg: p.ink };

  const tones = useMemo(() => {
    const t: Record<string, { bg: string; fg: string }> = {};
    for (const [ch, m] of Object.entries(keyMarks(guesses, answer))) {
      t[ch] = m === 'hit' ? { bg: accent, fg: p.onAccent } : m === 'near' ? { bg: p.card, fg: accent } : { bg: p.bg, fg: p.faint };
    }
    return t;
  }, [guesses, answer, accent, p]);

  const rows = Array.from({ length: WORD_GUESSES }, (_, r) => {
    const word = guesses[r] ?? (r === guesses.length && !over ? current : '');
    const marks = guesses[r] ? markGuess(guesses[r], answer) : null;
    return { word, marks };
  });

  return (
    <View style={{ flex: 1, justifyContent: 'space-between' }}>
      <View style={{ alignItems: 'center', gap: 7, paddingTop: 8 }}>
        {rows.map((row, r) => (
          <View
            key={r}
            style={{ flexDirection: 'row', gap: 7 }}
            accessible
            accessibilityLabel={row.marks ? `Guess ${r + 1}: ${[...row.word].map((ch, i) => `${ch} ${row.marks![i] === 'hit' ? 'right place' : row.marks![i] === 'near' ? 'wrong place' : 'not in word'}`).join(', ')}` : `Row ${r + 1}${row.word ? ': ' + row.word : ' empty'}`}>
            {Array.from({ length: 5 }, (_, i) => {
              const l = look(row.marks ? row.marks[i] : null);
              return (
                <View key={i} style={{ width: tile, height: tile, borderRadius: tile * 0.28, borderWidth: 2.5, borderColor: row.word[i] && !row.marks ? p.faint : l.border, backgroundColor: l.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ alignSelf: 'stretch', textAlign: 'center', fontSize: tile * 0.46, fontWeight: '800', color: l.fg }}>{row.word[i] ?? ''}</Text>
                </View>
              );
            })}
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 14, marginTop: 6 }}>
          {(['hit', 'near', 'miss'] as Mark[]).map((m) => {
            const l = look(m);
            return (
              <View key={m} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 14, height: 14, borderRadius: 5, borderWidth: 2, borderColor: l.border, backgroundColor: l.bg }} />
                <Txt v="small" dim>
                  {m === 'hit' ? 'right spot' : m === 'near' ? 'wrong spot' : 'not in word'}
                </Txt>
              </View>
            );
          })}
        </View>
      </View>

      {over ? (
        <View style={{ gap: 6, paddingVertical: 16 }}>
          <Txt v="heading" center>
            {solved ? 'Nice hunch.' : `The word was ${answer}`}
          </Txt>
          {puzzle.note ? (
            <Txt dim center>
              {puzzle.note}
            </Txt>
          ) : null}
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Notice text={notice} tone="bad" />
          <Keys
            disabled={locked}
            tones={tones}
            onKey={(ch) => {
              setNotice('');
              setCurrent((c) => (c.length < 5 ? c + ch : c));
            }}
            onBack={() => setCurrent((c) => c.slice(0, -1))}
            onEnter={enter}
            enterLabel="Guess"
          />
        </View>
      )}
    </View>
  );
}
