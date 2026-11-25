import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { useStore } from '../store';
import { accentOf, GAMES, usePalette } from '../theme';
import { Avatar, Card, Segmented, tint, Txt } from '../ui/kit';

type Range = 'today' | 'week' | 'month' | 'allTime';

export default function Board() {
  const p = usePalette();
  const { board, refreshBoard, session } = useStore();
  const [range, setRange] = useState<Range>('today');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    refreshBoard();
  }, [refreshBoard]);

  const players = board?.players ?? [];
  const todayBy = (id: string) => (board?.today ?? []).filter((r) => r.playerId === id);
  const rows = players
    .map((pl) => {
      if (range === 'today') {
        const mine = todayBy(pl.id);
        return { pl, points: mine.reduce((s, r) => s + r.points, 0), games: mine.length };
      }
      const r = board?.[range].find((x) => x.playerId === pl.id);
      return { pl, points: r?.points ?? 0, games: r?.games ?? 0 };
    })
    .sort((a, b) => b.points - a.points || a.pl.name.localeCompare(b.pl.name));
  const top = rows[0]?.points ?? 0;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          refreshing={busy}
          tintColor={p.sub}
          onRefresh={async () => {
            setBusy(true);
            await refreshBoard();
            setBusy(false);
          }}
        />
      }>
      <Txt v="title" accessibilityRole="header" style={{ marginTop: 4 }}>
        {session?.family.name ?? 'Family'} board
      </Txt>
      <Segmented
        value={range}
        onChange={setRange}
        options={[
          { key: 'today', label: 'Today' },
          { key: 'week', label: 'Week' },
          { key: 'month', label: 'Month' },
          { key: 'allTime', label: 'All time' },
        ]}
      />

      {!board ? (
        <Card>
          <Txt dim center>
            Standings show up here once the phone is online.
          </Txt>
        </Card>
      ) : (
        rows.map((r, i) => {
          const leader = r.points > 0 && r.points === top;
          const me = r.pl.id === session?.player.id;
          return (
            <Card key={r.pl.id} style={{ gap: 10, borderColor: me ? p.faint : p.line }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} accessible accessibilityLabel={`${i + 1}. ${r.pl.name}, ${r.points} points from ${r.games} games`}>
                <Txt style={{ width: 22, fontWeight: '800', fontSize: 18 }} dim={!leader}>
                  {r.points > 0 ? i + 1 : '–'}
                </Txt>
                <Avatar emoji={r.pl.emoji} color={r.pl.color} size={40} />
                <View style={{ flex: 1 }}>
                  <Txt v="heading">
                    {r.pl.name}
                    {me ? ' (you)' : ''}
                  </Txt>
                  <Txt v="small" dim>
                    {r.games} game{r.games === 1 ? '' : 's'}
                    {leader ? '  ·  in the lead' : ''}
                  </Txt>
                </View>
                <Txt style={{ fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{r.points}</Txt>
              </View>
              {range === 'today' && r.games > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {GAMES.map((g) => {
                    const res = todayBy(r.pl.id).find((x) => x.game === g.id);
                    return res ? (
                      <View key={g.id} accessible accessibilityLabel={`${g.name} ${res.points}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: tint(p, accentOf(g.id, p), 0.16), borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 13 }}>{g.icon}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: p.ink }}>{res.points}</Text>
                      </View>
                    ) : null;
                  })}
                </View>
              ) : null}
            </Card>
          );
        })
      )}
      <Txt v="small" dim center>
        Every game is worth up to 100 points. Weeks start on Monday.
      </Txt>
    </ScrollView>
  );
}
