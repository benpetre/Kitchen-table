import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';

import { matchAnswer, MISSES_ALLOWED, rarePoints, tierLabel } from '../logic/rare';
import { radius, usePalette } from '../theme';
import type { RarePuzzle } from '../types';
import { Btn, buzz, Card, Notice, tint, Txt } from '../ui/kit';
import type { GameProps } from './types';

interface Answer {
  /** What it matched, or null when the prompt was passed or the misses ran out. */
  a: string | null;
  pts: number;
}

interface State {
  answers: Answer[];
  /** Misses on the prompt currently being answered. */
  misses: number;
}

function Meter({ pts, accent }: { pts: number; accent: string }) {
  const p = usePalette();
  return (
    <View accessible accessibilityLabel={`${pts} out of 100`} style={{ gap: 4 }}>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: p.raised, overflow: 'hidden' }}>
        <View style={{ width: `${pts}%`, height: 10, borderRadius: 5, backgroundColor: accent }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Txt v="small" dim>
          everyone says it
        </Txt>
        <Txt v="small" dim>
          nobody says it
        </Txt>
      </View>
    </View>
  );
}

export default function LongShot({ puzzle, accent, saved, save, finish, locked }: GameProps<RarePuzzle, State>) {
  const p = usePalette();
  const [st, setSt] = useState<State>(saved ?? { answers: [], misses: 0 });
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  /** Index of the prompt whose result is on screen, waiting for "Next". */
  const [reveal, setReveal] = useState<number | null>(null);

  const total = puzzle.prompts.length;
  const over = st.answers.length >= total && reveal == null;
  const at = reveal ?? st.answers.length;
  const prompt = puzzle.prompts[Math.min(at, total - 1)];

  useEffect(() => {
    if (st.answers.length >= total) {
      const scores = st.answers.map((a) => a.pts);
      finish(rarePoints(scores, total), { summary: `Best answer: ${Math.max(...scores)} points`, scores });
    }
  }, [st.answers.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const record = (ans: Answer) => {
    const next = { answers: [...st.answers, ans], misses: 0 };
    setSt(next);
    save(next);
    setReveal(st.answers.length);
    setText('');
    setNotice('');
  };

  const submit = () => {
    if (!text.trim()) return;
    const hit = matchAnswer(prompt, text);
    if (hit) {
      buzz.good();
      return record(hit);
    }
    buzz.bad();
    const misses = st.misses + 1;
    if (misses >= MISSES_ALLOWED) return record({ a: null, pts: 0 });
    const next = { ...st, misses };
    setSt(next);
    save(next);
    setText('');
    setNotice(`Not on today's list. ${MISSES_ALLOWED - misses} ${MISSES_ALLOWED - misses === 1 ? 'try' : 'tries'} left on this one.`);
  };

  if (over) {
    return (
      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        {puzzle.prompts.map((pr, i) => {
          const ans = st.answers[i];
          const top = pr.answers.find((x) => x.a === pr.best);
          return (
            <Card key={i} style={{ gap: 8 }}>
              <Txt v="small" dim>
                {pr.prompt}
              </Txt>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Txt v="heading" style={{ flex: 1 }}>
                  {ans.a ?? 'No answer'}
                </Txt>
                <Txt v="heading" color={accent}>
                  {ans.pts}
                </Txt>
              </View>
              <Meter pts={ans.pts} accent={accent} />
              <Txt v="small" dim>
                Standout answer: {pr.best}
                {top ? ` (${top.pts})` : ''}
              </Txt>
            </Card>
          );
        })}
      </ScrollView>
    );
  }

  const shown = reveal != null ? st.answers[reveal] : null;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={110} style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', gap: 6 }} accessible accessibilityLabel={`Prompt ${at + 1} of ${total}`}>
          {puzzle.prompts.map((_, i) => (
            <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < st.answers.length ? accent : i === at ? tint(p, accent, 0.4) : p.line }} />
          ))}
        </View>
        <Card style={{ gap: 6, paddingVertical: 22 }}>
          <Txt v="label">
            Prompt {at + 1} of {total}
          </Txt>
          <Txt style={{ fontSize: 22, fontWeight: '700', lineHeight: 28 }}>{prompt.prompt}</Txt>
        </Card>

        {shown ? (
          <>
            <Card style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Txt v="heading" style={{ flex: 1 }}>
                  {shown.a ?? 'No answer this time'}
                </Txt>
                <Txt style={{ fontSize: 30, fontWeight: '800' }} color={accent}>
                  {shown.pts}
                </Txt>
              </View>
              <Meter pts={shown.pts} accent={accent} />
              <Txt color={accent} style={{ fontWeight: '700' }}>
                {shown.a ? tierLabel(shown.pts) : 'Three misses'}
              </Txt>
              <Txt v="small" dim>
                Standout answer: {prompt.best}
              </Txt>
            </Card>
            <Btn label={st.answers.length >= total ? 'See all five' : 'Next prompt'} color={accent} onPress={() => setReveal(null)} />
          </>
        ) : (
          <>
            <TextInput
              value={text}
              onChangeText={(t) => {
                setText(t);
                setNotice('');
              }}
              editable={!locked}
              onSubmitEditing={submit}
              placeholder="Your answer"
              placeholderTextColor={p.faint}
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="go"
              accessibilityLabel="Your answer"
              style={{ backgroundColor: p.card, borderWidth: 1.5, borderColor: p.line, borderRadius: radius.md, paddingHorizontal: 16, height: 54, fontSize: 18, color: p.ink }}
            />
            <Notice text={notice} tone="bad" />
            <Btn label="Lock it in" color={accent} disabled={!text.trim() || locked} onPress={submit} />
            <Txt v="small" dim center>
              One answer per prompt. Obvious answers score low, rare ones score high.
            </Txt>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
