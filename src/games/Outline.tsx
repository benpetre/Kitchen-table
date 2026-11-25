import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ATLAS_GUESSES, atlasPoints, countryByCode, direction, distanceKm, miles, proximity, searchCountries } from '../logic/atlas';
import { radius, usePalette } from '../theme';
import type { AtlasPuzzle } from '../types';
import { buzz, Card, Notice, Txt } from '../ui/kit';
import type { GameProps } from './types';

interface State {
  /** Country codes guessed, in order. */
  guesses: string[];
}

export default function Outline({ puzzle, accent, saved, save, finish, locked }: GameProps<AtlasPuzzle, State>) {
  const p = usePalette();
  const target = countryByCode(puzzle.code)!;
  const [guesses, setGuesses] = useState<string[]>(saved?.guesses ?? []);
  const [text, setText] = useState('');

  const solved = guesses.includes(target.code);
  const over = solved || guesses.length >= ATLAS_GUESSES;
  const rows = guesses.map((code) => {
    const c = countryByCode(code)!;
    const km = distanceKm(c, target);
    return { c, km, near: proximity(km), dir: direction(c, target) };
  });

  useEffect(() => {
    if (over) {
      const best = Math.max(0, ...rows.map((r) => r.near));
      finish(atlasPoints(solved ? guesses.length : null, best), { summary: solved ? `Found ${target.name} in ${guesses.length} of ${ATLAS_GUESSES}` : `It was ${target.name}`, guesses: guesses.length, solved });
    }
  }, [over]); // eslint-disable-line react-hooks/exhaustive-deps

  const guess = (code: string) => {
    const next = [...guesses, code];
    setGuesses(next);
    save({ guesses: next });
    setText('');
    if (code === target.code) buzz.good();
    else buzz.tap();
  };

  const matches = searchCountries(text, guesses);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={110} style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        <View style={{ alignItems: 'center' }} accessible accessibilityLabel="Outline of the mystery country">
          <Svg width={210} height={210} viewBox="0 0 1000 1000">
            <Path d={target.path} fill={accent} />
          </Svg>
        </View>

        {over ? (
          <Card style={{ gap: 6 }}>
            <Txt v="heading" center>
              {solved ? `Yes, ${target.name}!` : `It was ${target.name}`}
            </Txt>
            {puzzle.fact ? (
              <Txt dim center>
                {puzzle.fact}
              </Txt>
            ) : null}
          </Card>
        ) : (
          <View style={{ gap: 6 }}>
            <TextInput
              value={text}
              onChangeText={setText}
              editable={!locked}
              placeholder={`Guess ${guesses.length + 1} of ${ATLAS_GUESSES}: type a country`}
              placeholderTextColor={p.faint}
              autoCorrect={false}
              autoCapitalize="words"
              accessibilityLabel="Country guess"
              onSubmitEditing={() => matches.length === 1 && guess(matches[0].code)}
              style={{ backgroundColor: p.card, borderWidth: 1.5, borderColor: p.line, borderRadius: radius.md, paddingHorizontal: 16, height: 52, fontSize: 17, color: p.ink }}
            />
            {matches.map((c) => (
              <Pressable key={c.code} accessibilityRole="button" accessibilityLabel={`Guess ${c.name}`} onPress={() => guess(c.code)} style={({ pressed }) => ({ backgroundColor: pressed ? p.raised : p.card, borderWidth: 1, borderColor: p.line, borderRadius: radius.sm + 2, paddingHorizontal: 14, paddingVertical: 12 })}>
                <Txt style={{ fontWeight: '600' }}>{c.name}</Txt>
              </Pressable>
            ))}
            {text.trim() && !matches.length ? <Notice text="No country by that name" /> : null}
          </View>
        )}

        {rows.map((r, i) => {
          const right = r.c.code === target.code;
          return (
            <View key={i} accessible accessibilityLabel={right ? `${r.c.name}, correct` : `${r.c.name}: ${miles(r.km)} miles away, go ${r.dir.word}, ${r.near} percent close`} style={{ backgroundColor: p.card, borderRadius: radius.md, borderWidth: 1.5, borderColor: right ? accent : p.line, padding: 12, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Txt style={{ flex: 1, fontWeight: '700' }}>{r.c.name}</Txt>
                {right ? (
                  <Txt color={accent} style={{ fontWeight: '800' }}>
                    That's it
                  </Txt>
                ) : (
                  <>
                    <Txt dim>{miles(r.km).toLocaleString()} mi</Txt>
                    <Txt style={{ fontSize: 20 }}>{r.dir.arrow}</Txt>
                  </>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: p.raised, overflow: 'hidden' }}>
                  <View style={{ width: `${r.near}%`, height: 8, backgroundColor: accent }} />
                </View>
                <Txt v="small" dim style={{ width: 40, textAlign: 'right' }}>
                  {r.near}%
                </Txt>
              </View>
            </View>
          );
        })}
        {!over && !guesses.length ? (
          <Txt v="small" dim center>
            Each guess shows how far off you are and which way to go.
          </Txt>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
