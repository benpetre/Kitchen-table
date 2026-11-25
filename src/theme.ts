import { useColorScheme } from 'react-native';

import type { GameId } from './types';

export interface Palette {
  bg: string;
  card: string;
  raised: string;
  ink: string;
  sub: string;
  faint: string;
  line: string;
  good: string;
  warn: string;
  bad: string;
  onAccent: string;
  dark: boolean;
}

const light: Palette = {
  bg: '#F6F1E7',
  card: '#FFFDF8',
  raised: '#EDE5D4',
  ink: '#211C16',
  sub: '#6E6558',
  faint: '#A69C8B',
  line: '#E2D9C6',
  good: '#1F8A70',
  warn: '#D98A1E',
  bad: '#C4452F',
  onAccent: '#FFFFFF',
  dark: false,
};

const dark: Palette = {
  bg: '#161310',
  card: '#221D18',
  raised: '#2E2821',
  ink: '#F4EDE0',
  sub: '#B0A594',
  faint: '#7C7264',
  line: '#3A3229',
  good: '#3FB796',
  warn: '#E9A23B',
  bad: '#E36A52',
  onAccent: '#FFFFFF',
  dark: true,
};

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export interface GameMeta {
  id: GameId;
  name: string;
  tagline: string;
  icon: string;
  /** [light, dark] accent. */
  accent: [string, string];
}

export const GAMES: GameMeta[] = [
  { id: 'rare', name: 'Long Shot', tagline: 'Five prompts. Rare answers score big.', icon: '🎯', accent: ['#7A4FD6', '#A98BF0'] },
  { id: 'word', name: 'Hunch', tagline: 'Six hunches to find the five-letter word.', icon: '💡', accent: ['#1F8A70', '#3FB796'] },
  { id: 'cross', name: 'Pocket Cross', tagline: 'A five-by-five crossword against the clock.', icon: '✏️', accent: ['#2D6CDF', '#6C9BF2'] },
  { id: 'groups', name: 'Common Ground', tagline: 'Sort sixteen tiles into four groups of four.', icon: '🧩', accent: ['#D9603B', '#EE8763'] },
  { id: 'trails', name: 'Word Trails', tagline: 'Trace themed words until every letter is used.', icon: '🧵', accent: ['#B07A0C', '#DDA63A'] },
  { id: 'atlas', name: 'Outline', tagline: 'Name the country from its shape.', icon: '🌍', accent: ['#1C8CA8', '#4DB7D1'] },
  { id: 'blocks', name: 'Brickfall', tagline: 'Stack falling bricks. Everyone gets the same pieces.', icon: '🧱', accent: ['#C9344B', '#EA6177'] },
];

export const GAME_IDS = GAMES.map((g) => g.id);

export function gameMeta(id: GameId): GameMeta {
  return GAMES.find((g) => g.id === id)!;
}

export function accentOf(id: GameId, p: Palette): string {
  return gameMeta(id).accent[p.dark ? 1 : 0];
}

export const AVATAR_EMOJI = ['🦊', '🐻', '🐼', '🦉', '🐙', '🦖', '🐝', '🐢', '🦄', '🐧', '🦁', '🐸', '🚀', '⚽', '🎸', '🌮', '🍕', '🌵', '⭐', '🎲'];
export const AVATAR_COLORS = ['#D9603B', '#1F8A70', '#2D6CDF', '#7A4FD6', '#C9344B', '#B07A0C', '#1C8CA8', '#5B6B2F'];

export const radius = { sm: 8, md: 14, lg: 20 };
