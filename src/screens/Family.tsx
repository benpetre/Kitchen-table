import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Share, TextInput, View } from 'react-native';

import { useStore } from '../store';
import { usePalette } from '../theme';
import type { FamilyNotes } from '../types';
import { Avatar, Btn, Card, Notice, Txt } from '../ui/kit';
import { AvatarPicker, fieldStyle } from './Join';

const FIELDS: { key: keyof FamilyNotes; label: string; hint: string }[] = [
  { key: 'people', label: 'Who is playing', hint: 'Names, ages, what each of you is into. "Sam, 12, soccer and Minecraft."' },
  { key: 'watching', label: 'Watching, reading, following', hint: 'Shows, books, games, teams, music we are into right now.' },
  { key: 'events', label: 'Coming up', hint: 'Trips, birthdays, school things, holidays, family jokes.' },
];

export default function Family() {
  const p = usePalette();
  const { session, updateProfile, leave, notes: notesApi } = useStore();
  const me = session!.player;
  const [name, setName] = useState(me.name);
  const [emoji, setEmoji] = useState(me.emoji);
  const [color, setColor] = useState(me.color);
  const [notes, setNotes] = useState<FamilyNotes | null>(null);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<{ text: string; tone: 'good' | 'bad' | 'plain' }>({ text: '', tone: 'plain' });
  const [profileStatus, setProfileStatus] = useState('');

  useEffect(() => {
    notesApi()
      .then((r) => {
        setNotes(r.notes);
        setCode(r.code);
      })
      .catch(() => setStatus({ text: 'Could not load the family notes. Check your connection.', tone: 'bad' }));
  }, [notesApi]);

  const profileChanged = name.trim() !== me.name || emoji !== me.emoji || color !== me.color;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        <Txt v="title" accessibilityRole="header" style={{ marginTop: 4 }}>
          {session!.family.name}
        </Txt>

        <Card style={{ gap: 14 }}>
          <Txt v="label">You</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar emoji={emoji} color={color} size={52} />
            <TextInput value={name} onChangeText={setName} maxLength={16} autoCapitalize="words" accessibilityLabel="Your name" style={[fieldStyle(p), { flex: 1, minWidth: 0 }]} />
          </View>
          <AvatarPicker emoji={emoji} color={color} onEmoji={setEmoji} onColor={setColor} />
          {profileChanged ? (
            <Btn
              small
              label="Save"
              disabled={!name.trim()}
              onPress={() =>
                updateProfile({ name: name.trim(), emoji, color })
                  .then(() => setProfileStatus(''))
                  .catch((e) => setProfileStatus(e?.message ?? 'Could not save'))
              }
            />
          ) : null}
          {profileStatus ? <Notice text={profileStatus} tone="bad" /> : null}
        </Card>

        <Card style={{ gap: 8 }}>
          <Txt v="label">Invite the family</Txt>
          <Txt selectable style={{ fontSize: 30, fontWeight: '800', letterSpacing: 6 }}>
            {code || '······'}
          </Txt>
          <Txt v="small" dim>
            Anyone with this code can join your board. Share it only with family.
          </Txt>
          {code ? <Btn small kind="outline" label="Share the code" onPress={() => Share.share({ message: `Join our Kitchen Table family games with code ${code}` }).catch(() => {})} /> : null}
        </Card>

        <Card style={{ gap: 12 }}>
          <View style={{ gap: 4 }}>
            <Txt v="label">What the puzzle writer knows</Txt>
            <Txt v="small" dim>
              Each night the puzzles are written fresh, and these notes steer what they are about. Anyone in the family can edit them.
            </Txt>
          </View>
          {FIELDS.map((f) => (
            <View key={f.key} style={{ gap: 4 }}>
              <Txt style={{ fontWeight: '700' }}>{f.label}</Txt>
              <TextInput
                value={notes?.[f.key] ?? ''}
                editable={!!notes}
                onChangeText={(t) => {
                  setNotes((n) => (n ? { ...n, [f.key]: t } : n));
                  setStatus({ text: '', tone: 'plain' });
                }}
                placeholder={f.hint}
                placeholderTextColor={p.faint}
                multiline
                maxLength={600}
                accessibilityLabel={f.label}
                style={[fieldStyle(p), { minHeight: 84, paddingTop: 12, paddingBottom: 12, fontSize: 15, textAlignVertical: 'top' }]}
              />
            </View>
          ))}
          <Notice text={status.text} tone={status.tone} />
          <Btn
            label="Save notes"
            disabled={!notes}
            onPress={() =>
              notesApi(notes!)
                .then((r) => {
                  setNotes(r.notes);
                  setStatus({ text: "Saved. Tomorrow's puzzles will use them.", tone: 'good' });
                })
                .catch((e) => setStatus({ text: e?.message ?? 'Could not save', tone: 'bad' }))
            }
          />
        </Card>

        <Btn
          kind="quiet"
          label="Leave this family on this phone"
          onPress={() => {
            const go = () => void leave();
            if (Platform.OS === 'web') go();
            else Alert.alert('Leave the family?', 'Your scores stay on the family board, and your history stays on this phone. You can rejoin with the code.', [{ text: 'Stay', style: 'cancel' }, { text: 'Leave', style: 'destructive', onPress: go }]);
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
