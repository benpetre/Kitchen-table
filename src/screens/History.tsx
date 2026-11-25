import React from 'react';
import { ScrollView, Text, View } from 'react-native';

import { shortDate } from '../lib/dates';
import { dayPoints, lifetime, perGame, streak } from '../logic/stats';
import { useStore } from '../store';
import { accentOf, GAMES, usePalette } from '../theme';
import { Card, tint, Txt } from '../ui/kit';

export default function History() {
  const p = usePalette();
  const { history, date } = useStore();
  const life = lifetime(history);
  const days = Object.keys(history)
    .filter((d) => Object.keys(history[d]).length > 0)
    .sort()
    .reverse();

  const stat = (label: string, value: string | number) => (
    <View style={{ flex: 1, alignItems: 'center' }} accessible accessibilityLabel={`${label}: ${value}`}>
      <Txt style={{ fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{value}</Txt>
      <Txt v="label" center>
        {label}
      </Txt>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
      <Txt v="title" accessibilityRole="header" style={{ marginTop: 4 }}>
        Your history
      </Txt>
      <Card style={{ flexDirection: 'row' }}>
        {stat('Streak', streak(history, date))}
        {stat('Days', life.days)}
        {stat('Best day', life.bestDay)}
        {stat('Points', life.points.toLocaleString())}
      </Card>

      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row' }}>
          <Txt v="label" style={{ flex: 1 }}>
            Game
          </Txt>
          {['Played', 'Avg', 'Best'].map((h) => (
            <Txt key={h} v="label" style={{ width: 58, textAlign: 'right' }}>
              {h}
            </Txt>
          ))}
        </View>
        {GAMES.map((g) => {
          const s = perGame(history, g.id);
          return (
            <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Txt style={{ flex: 1, fontWeight: '600' }}>
                {g.icon} {g.name}
              </Txt>
              {[s.played, s.played ? s.average : '–', s.played ? s.best : '–'].map((v, i) => (
                <Txt key={i} style={{ width: 58, textAlign: 'right', fontVariant: ['tabular-nums'] }} dim={!s.played}>
                  {v}
                </Txt>
              ))}
            </View>
          );
        })}
      </Card>

      {days.length === 0 ? (
        <Txt dim center>
          Finished games are kept here, on this phone.
        </Txt>
      ) : (
        days.map((d) => (
          <Card key={d} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Txt v="heading" style={{ flex: 1 }}>
                {d === date ? 'Today' : shortDate(d)}
              </Txt>
              <Txt v="heading" style={{ fontVariant: ['tabular-nums'] }}>
                {dayPoints(history, d)}
              </Txt>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {GAMES.map((g) => {
                const r = history[d][g.id];
                return r ? (
                  <View key={g.id} accessible accessibilityLabel={`${g.name} ${r.points}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: tint(p, accentOf(g.id, p), 0.16), borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 13 }}>{g.icon}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: p.ink }}>{r.points}</Text>
                  </View>
                ) : null;
              })}
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}
