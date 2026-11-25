import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useStore } from '../store';
import { AVATAR_COLORS, AVATAR_EMOJI, radius, usePalette } from '../theme';
import { Avatar, Btn, Notice, Txt } from '../ui/kit';

/** Pick a face and a colour. Shared with the Family screen. */
export function AvatarPicker({ emoji, color, onEmoji, onColor }: { emoji: string; color: string; onEmoji: (e: string) => void; onColor: (c: string) => void }) {
  const p = usePalette();
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {AVATAR_EMOJI.map((e) => (
          <Pressable key={e} accessibilityRole="button" accessibilityLabel={`Avatar ${e}`} accessibilityState={{ selected: e === emoji }} onPress={() => onEmoji(e)} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: e === emoji ? color : p.raised }}>
            <Text style={{ fontSize: 22 }}>{e}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {AVATAR_COLORS.map((c) => (
          <Pressable key={c} accessibilityRole="button" accessibilityLabel="Avatar colour" accessibilityState={{ selected: c === color }} onPress={() => onColor(c)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: 3, borderColor: c === color ? p.ink : 'transparent' }} />
        ))}
      </View>
    </View>
  );
}

export function fieldStyle(p: ReturnType<typeof usePalette>) {
  return { backgroundColor: p.card, borderWidth: 1.5, borderColor: p.line, borderRadius: radius.md, paddingHorizontal: 16, minHeight: 52, fontSize: 17, color: p.ink } as const;
}

export default function Join() {
  const p = usePalette();
  const { join } = useStore();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [emoji, setEmoji] = useState(AVATAR_EMOJI[0]);
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const go = async () => {
    setBusy(true);
    setError('');
    try {
      await join({ code: code.trim().toUpperCase(), name: name.trim(), emoji, color });
    } catch (e: any) {
      setError(e?.message ?? 'Could not join');
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, gap: 18 }}>
          <View style={{ gap: 6, marginTop: 24 }}>
            <Txt v="title">Kitchen Table</Txt>
            <Txt dim>Seven quick games, fresh every morning, written for your family. One try each per day.</Txt>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar emoji={emoji} color={color} size={56} />
            <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={p.faint} maxLength={16} autoCapitalize="words" accessibilityLabel="Your name" style={[fieldStyle(p), { flex: 1, minWidth: 0 }]} />
          </View>
          <AvatarPicker emoji={emoji} color={color} onEmoji={setEmoji} onColor={setColor} />
          <View style={{ gap: 6 }}>
            <Txt v="label">Family code</Txt>
            <TextInput value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder="e.g. K7M2QX" placeholderTextColor={p.faint} autoCapitalize="characters" autoCorrect={false} maxLength={8} accessibilityLabel="Family code" style={[fieldStyle(p), { letterSpacing: 4, fontWeight: '700' }]} />
            <Txt v="small" dim>
              Ask whoever set up the family for the code.
            </Txt>
          </View>
          <Notice text={error} tone="bad" />
          <Btn label={busy ? 'Joining…' : 'Join the table'} disabled={busy || name.trim().length < 1 || code.trim().length < 4} onPress={go} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
