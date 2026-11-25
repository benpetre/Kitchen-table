import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import Board from './src/screens/Board';
import Family from './src/screens/Family';
import GameScreen from './src/screens/GameScreen';
import History from './src/screens/History';
import Join from './src/screens/Join';
import Today from './src/screens/Today';
import { StoreProvider, useStore } from './src/store';
import { usePalette } from './src/theme';
import type { GameId } from './src/types';

type Tab = 'today' | 'board' | 'history' | 'family';
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'today', label: 'Today', icon: '☀️' },
  { key: 'board', label: 'Board', icon: '🏆' },
  { key: 'history', label: 'History', icon: '📅' },
  { key: 'family', label: 'Family', icon: '🏡' },
];

function Root() {
  const p = usePalette();
  const { hydrated, session, refreshBoard } = useStore();
  const [tab, setTab] = useState<Tab>('today');
  const [game, setGame] = useState<GameId | null>(null);

  if (!hydrated) return <View style={{ flex: 1, backgroundColor: p.bg }} />;
  if (!session) return <Join />;
  if (game)
    return (
      <GameScreen
        key={game}
        game={game}
        onExit={() => {
          setGame(null);
          refreshBoard(); // see who else has played while this game was open
        }}
      />
    );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }} edges={['top', 'left', 'right']}>
      <View style={{ flex: 1 }}>{tab === 'today' ? <Today onPlay={setGame} /> : tab === 'board' ? <Board /> : tab === 'history' ? <History /> : <Family />}</View>
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: p.card, borderTopWidth: 1, borderTopColor: p.line }}>
        <View style={{ flexDirection: 'row' }} accessibilityRole="tablist">
          {TABS.map((t) => (
            <Pressable key={t.key} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: tab === t.key }} onPress={() => setTab(t.key)} style={{ flex: 1, alignItems: 'center', paddingTop: 8, paddingBottom: 6, opacity: tab === t.key ? 1 : 0.5 }}>
              <Text style={{ fontSize: 20 }}>{t.icon}</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: p.ink, marginTop: 2 }}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="auto" />
        <Root />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
