import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';

import { Palette, radius, usePalette } from '../theme';

const native = Platform.OS !== 'web';
export const buzz = {
  tap: () => native && Haptics.selectionAsync().catch(() => {}),
  good: () => native && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  bad: () => native && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
  thud: () => native && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
};

type Variant = 'title' | 'heading' | 'body' | 'small' | 'label';
const TEXT: Record<Variant, TextStyle> = {
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  heading: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
};

export function Txt({
  v = 'body',
  dim,
  color,
  center,
  style,
  ...rest
}: { v?: Variant; dim?: boolean; color?: string; center?: boolean } & React.ComponentProps<typeof Text>) {
  const p = usePalette();
  return <Text {...rest} style={[TEXT[v], { color: color ?? (dim || v === 'label' ? p.sub : p.ink) }, center && { textAlign: 'center' }, style]} />;
}

export function Btn({
  label,
  onPress,
  kind = 'solid',
  color,
  disabled,
  small,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'solid' | 'outline' | 'quiet';
  color?: string;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const p = usePalette();
  const tint = color ?? p.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        buzz.tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        kind === 'solid' && { backgroundColor: tint },
        kind === 'outline' && { borderWidth: 1.5, borderColor: tint },
        kind === 'quiet' && { backgroundColor: p.raised },
        disabled && { opacity: 0.35 },
        pressed && { opacity: 0.7 },
        style,
      ]}>
      <Text
        numberOfLines={1}
        style={{ fontSize: small ? 14 : 16, fontWeight: '700', color: kind === 'solid' ? (color ? p.onAccent : p.bg) : kind === 'outline' ? tint : p.ink }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return <View style={[{ backgroundColor: p.card, borderRadius: radius.lg, borderWidth: 1, borderColor: p.line, padding: 16 }, style]}>{children}</View>;
}

export function Avatar({ emoji, color, size = 36 }: { emoji: string; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.55 }}>{emoji}</Text>
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { key: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: p.raised, borderRadius: radius.md, padding: 3 }}>
      {options.map((o) => (
        <Pressable
          key={o.key}
          accessibilityRole="tab"
          accessibilityState={{ selected: o.key === value }}
          onPress={() => onChange(o.key)}
          style={{ flex: 1, paddingVertical: 8, borderRadius: radius.md - 3, alignItems: 'center', backgroundColor: o.key === value ? p.card : 'transparent' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: o.key === value ? p.ink : p.sub }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** A short status line under a board ("Not in the word list", "One away..."). Empty text keeps its height. */
export function Notice({ text, tone = 'plain' }: { text: string; tone?: 'plain' | 'good' | 'bad' }) {
  const p = usePalette();
  return (
    <Text accessibilityLiveRegion="polite" style={{ minHeight: 22, textAlign: 'center', fontSize: 15, fontWeight: '600', color: tone === 'good' ? p.good : tone === 'bad' ? p.bad : p.sub }}>
      {text}
    </Text>
  );
}

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

/** On-screen letter keys. `tones` colours individual keys; `enterLabel` adds a wide submit key. */
export function Keys({
  onKey,
  onBack,
  onEnter,
  enterLabel,
  tones,
  disabled,
}: {
  onKey: (letter: string) => void;
  onBack: () => void;
  onEnter?: () => void;
  enterLabel?: string;
  tones?: Record<string, { bg: string; fg: string }>;
  disabled?: boolean;
}) {
  const p = usePalette();
  const key = (label: string, onPress: () => void, wide = false, tone?: { bg: string; fg: string }, a11y?: string) => (
    <Pressable
      key={label}
      disabled={disabled}
      accessibilityRole="keyboardkey"
      accessibilityLabel={a11y ?? label}
      onPress={() => {
        buzz.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.key, { backgroundColor: tone?.bg ?? p.raised, flex: wide ? 1.6 : 1 }, pressed && { opacity: 0.6 }]}>
      <Text style={{ fontSize: wide ? 13 : 17, fontWeight: '700', color: tone?.fg ?? p.ink }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ gap: 6, opacity: disabled ? 0.4 : 1 }}>
      {ROWS.map((row, r) => (
        <View key={row} style={{ flexDirection: 'row', gap: 5, paddingHorizontal: r === 1 ? 16 : 0 }}>
          {r === 2 && onEnter ? key(enterLabel ?? 'Enter', onEnter, true) : null}
          {[...row].map((ch) => key(ch, () => onKey(ch), false, tones?.[ch]))}
          {r === 2 ? key('⌫', onBack, true, undefined, 'Delete') : null}
        </View>
      ))}
    </View>
  );
}

/** Colours for a finished-or-not state used across games. */
export const tint = (p: Palette, hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

const styles = StyleSheet.create({
  btn: { minHeight: 48, paddingHorizontal: 20, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { minHeight: 38, paddingHorizontal: 14, borderRadius: radius.sm + 2 },
  key: { height: 50, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
