import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { longDate } from '../lib/dates';
import { load } from '../lib/storage';
import { dayPoints, streak } from '../logic/stats';
import { progressKey, useStore } from '../store';
import { accentOf, GAMES, radius, usePalette } from '../theme';
import type { GameId } from '../types';
import { Avatar, Btn, Card, tint, Txt } from '../ui/kit';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
};

export default function Today({ onPlay }: { onPlay: (g: GameId) => void }) {
  const p = usePalette();
  const { date, daily, history, board, session, refreshDaily } = useStore();
  const [started, setStarted] = useState<GameId[]>([]);
  const mine = history[date] ?? {};
  const played = Object.keys(mine).length;

  // Which games have a board in progress on this phone.
  useEffect(() => {
    let live = true;
    Promise.all(GAMES.map((g) => load(progressKey(date, g.id)).then((s) => (s ? g.id : null)))).then((ids) => live && setStarted(ids.filter((x): x is GameId => x != null)));
    return () => {
      live = false;
    };
  }, [date, history]);

  const waiting = daily.status === 'loading' || daily.status === 'generating';
  const run = streak(history, date);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
      <View style={{ gap: 2, marginTop: 4 }}>
        <Txt v="label">{longDate(date)}</Txt>
        <Txt v="title" accessibilityRole="header">
          {session ? `${greeting()}, ${session.player.name}` : 'Kitchen Table'}
        </Txt>
      </View>

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ alignItems: 'center', minWidth: 64 }}>
          <Txt style={{ fontSize: 32, fontWeight: '800' }}>{dayPoints(history, date)}</Txt>
          <Txt v="label">points</Txt>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 4 }} accessible accessibilityLabel={`${played} of ${GAMES.length} games played`}>
            {GAMES.map((g) => (
              <View key={g.id} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: mine[g.id] ? accentOf(g.id, p) : p.line }} />
            ))}
          </View>
          <Txt v="small" dim>
            {played} of {GAMES.length} played{run > 1 ? `  ·  ${run}-day streak` : ''}
          </Txt>
        </View>
      </Card>

      {daily.theme ? (
        <View style={{ paddingHorizontal: 4 }}>
          <Txt v="label">On the table today</Txt>
          <Txt>{daily.theme}</Txt>
        </View>
      ) : null}

      {waiting ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <ActivityIndicator color={p.sub} />
          <Txt dim style={{ flex: 1 }}>
            {daily.status === 'generating' ? "Writing today's puzzles. This takes about a minute the first time someone opens the app each day." : "Fetching today's puzzles…"}
          </Txt>
        </Card>
      ) : null}
      {daily.status === 'offline' || daily.status === 'failed' ? (
        <Card style={{ gap: 10 }}>
          <Txt>{daily.status === 'offline' ? "Can't reach today's puzzles. Check your connection." : "Today's puzzles did not come through."}</Txt>
          <Txt v="small" dim>
            Brickfall works without them.
          </Txt>
          <Btn small kind="outline" label="Try again" onPress={refreshDaily} />
        </Card>
      ) : null}

      {GAMES.map((g) => {
        const accent = accentOf(g.id, p);
        const result = mine[g.id];
        const ready = daily.puzzles[g.id] != null;
        const others = (board?.today ?? []).filter((r) => r.game === g.id && r.playerId !== session?.player.id);
        const state = result ? 'done' : !ready ? (waiting ? 'wait' : 'none') : started.includes(g.id) ? 'resume' : 'play';
        return (
          <Pressable
            key={g.id}
            accessibilityRole="button"
            accessibilityLabel={`${g.name}. ${result ? `Played, ${result.points} points` : state === 'resume' ? 'In progress' : state === 'play' ? 'Not played yet' : 'Not available yet'}`}
            disabled={!ready && !result}
            onPress={() => onPlay(g.id)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: p.card, borderRadius: radius.lg, borderWidth: 1, borderColor: p.line, padding: 14, opacity: pressed ? 0.75 : !ready && !result ? 0.5 : 1 })}>
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: tint(p, accent, 0.18), alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 26 }}>{g.icon}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt v="heading">{g.name}</Txt>
              <Txt v="small" dim numberOfLines={2}>
                {result ? String(result.detail.summary ?? '') : g.tagline}
              </Txt>
              {others.length ? (
                <View style={{ flexDirection: 'row', gap: 4, marginTop: 4, alignItems: 'center' }}>
                  {others.map((r) => {
                    const who = board?.players.find((x) => x.id === r.playerId);
                    return who ? <Avatar key={r.playerId} emoji={who.emoji} color={who.color} size={20} /> : null;
                  })}
                  <Txt v="small" dim>
                    played
                  </Txt>
                </View>
              ) : null}
            </View>
            {state === 'done' ? (
              <View style={{ alignItems: 'center', minWidth: 52 }}>
                <Txt style={{ fontSize: 24, fontWeight: '800' }} color={accent}>
                  {result!.points}
                </Txt>
                <Txt v="label">pts</Txt>
              </View>
            ) : state === 'wait' ? (
              <ActivityIndicator color={p.faint} />
            ) : state === 'none' ? (
              <Txt v="small" dim>
                Not today
              </Txt>
            ) : (
              <View style={{ backgroundColor: accent, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 }}>
                <Text style={{ color: p.onAccent, fontWeight: '800', fontSize: 15 }}>{state === 'resume' ? 'Resume' : 'Play'}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
      <Txt v="small" dim center style={{ marginTop: 4 }}>
        New games every morning. One try each.
      </Txt>
    </ScrollView>
  );
}
