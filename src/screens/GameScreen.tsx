import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Brickfall from '../games/Brickfall';
import CommonGround from '../games/CommonGround';
import Hunch from '../games/Hunch';
import LongShot from '../games/LongShot';
import Outline from '../games/Outline';
import PocketCross from '../games/PocketCross';
import type { GameProps } from '../games/types';
import WordTrails from '../games/WordTrails';
import { load, save as persist } from '../lib/storage';
import { progressKey, useStore } from '../store';
import { accentOf, gameMeta, usePalette } from '../theme';
import type { GameId } from '../types';
import { Btn, Card, tint, Txt } from '../ui/kit';

const SCREENS: Record<GameId, React.ComponentType<GameProps<any, any>>> = {
  rare: LongShot,
  word: Hunch,
  cross: PocketCross,
  groups: CommonGround,
  trails: WordTrails,
  atlas: Outline,
  blocks: Brickfall,
};

export default function GameScreen({ game, onExit }: { game: GameId; onExit: () => void }) {
  const p = usePalette();
  const store = useStore();
  // The puzzle day is fixed when the game opens, so playing past midnight still counts for that day.
  const [day] = useState(store.date);
  const [puzzle] = useState(() => store.daily.puzzles[game]);
  const [saved, setSaved] = useState<unknown | null | undefined>(undefined);
  const meta = gameMeta(game);
  const accent = accentOf(game, p);
  const result = store.history[day]?.[game] ?? null;
  // Finished before this visit (as opposed to finishing while the board is on screen).
  const [playedEarlier] = useState(result != null);

  useEffect(() => {
    load(progressKey(day, game)).then(setSaved);
  }, [day, game]);

  const save = useCallback((state: unknown) => void persist(progressKey(day, game), state), [day, game]);
  const finish = useCallback((points: number, detail: Record<string, unknown>) => store.finish(day, game, points, detail), [store, day, game]);

  const Game = SCREENS[game];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, height: 48 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to today" onPress={onExit} hitSlop={8} style={{ paddingHorizontal: 10, paddingVertical: 8, minWidth: 76 }}>
          <Txt style={{ fontWeight: '700' }}>‹ Today</Txt>
        </Pressable>
        <Txt v="heading" center style={{ flex: 1 }} accessibilityRole="header">
          {meta.icon} {meta.name}
        </Txt>
        <View style={{ minWidth: 76 }} />
      </View>

      {result ? (
        <View style={{ marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: tint(p, accent, 0.16), borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 }}>
          <Txt style={{ fontSize: 26, fontWeight: '800' }} color={accent}>
            {result.points}
          </Txt>
          <View style={{ flex: 1 }}>
            <Txt v="label">Today's points</Txt>
            <Txt v="small">{String(result.detail.summary ?? '')}</Txt>
          </View>
          <Btn small label="Done" color={accent} onPress={onExit} />
        </View>
      ) : null}

      <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 8 }}>
        {saved === undefined ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={accent} />
        ) : !puzzle ? (
          <Card>
            <Txt center>This game is not available today.</Txt>
          </Card>
        ) : playedEarlier && saved === null ? (
          <Card style={{ gap: 6 }}>
            <Txt v="heading" center>
              Already played today
            </Txt>
            <Txt dim center>
              The board from that game is not on this phone, but the score is safe. A new one arrives tomorrow.
            </Txt>
          </Card>
        ) : (
          <Game puzzle={puzzle} date={day} accent={accent} saved={saved} save={save} finish={finish} locked={!!result} />
        )}
      </View>
    </SafeAreaView>
  );
}
