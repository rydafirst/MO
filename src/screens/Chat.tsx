import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { api, type ChatMessage } from '../api';
import { getToken, getUserId } from '../lib/session';
import { Button, Screen, useToast } from '../ui';
import { t } from '../theme';
import { useAndroidKeyboardInset } from '../lib/keyboard';

// Short local time (e.g. "3:07 PM") for a message bubble. Falls back to empty on a bad timestamp
// so a malformed value can never throw inside render.
function formatTime(ms: number): string {
  try { return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  catch { return ''; }
}

// Persist one-time acceptance of the chat conduct terms. SecureStore has no web build,
// so the web (debug) fallback uses localStorage — mirrors lib/session.
const TERMS_KEY = 'chat_terms_v1';
const isWeb = Platform.OS === 'web';
async function readAccepted(): Promise<boolean> {
  try {
    if (isWeb) return globalThis.localStorage?.getItem(TERMS_KEY) === '1';
    return (await SecureStore.getItemAsync(TERMS_KEY)) === '1';
  } catch { return false; }
}
async function writeAccepted(): Promise<void> {
  try {
    if (isWeb) { globalThis.localStorage?.setItem(TERMS_KEY, '1'); return; }
    await SecureStore.setItemAsync(TERMS_KEY, '1');
  } catch { /* non-fatal: user re-accepts next launch */ }
}

/** Rider <-> customer conversation for a single job. Polls for new messages while open. */
export function ChatScreen({ route, navigation }: NativeStackScreenProps<RootStack, 'Chat'>) {
  const { jobId } = route.params;
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [me, setMe] = useState('');
  const [sending, setSending] = useState(false);
  const [accepted, setAccepted] = useState<boolean | null>(null); // null = still loading
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const kbInset = useAndroidKeyboardInset(); // lifts the composer above the keyboard on Android

  const load = async () => {
    try { setMessages(await api.messages(jobId)); } catch { /* keep last */ }
  };

  useEffect(() => {
    (async () => {
      setMe(getUserId(await getToken()));
      setAccepted(await readAccepted());
    })();
  }, [jobId]);

  // Only start polling once the user has accepted the conduct terms.
  useEffect(() => {
    if (!accepted) return;
    load();
    const timer = setInterval(load, 4000); // lightweight polling
    return () => clearInterval(timer);
  }, [jobId, accepted]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const msg = await api.sendMessage(jobId, body);
      setDraft('');
      setMessages((prev) => [...prev, msg]);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (e) { toast((e as Error).message); }
    finally { setSending(false); }
  };

  const report = (m: ChatMessage) => {
    Alert.alert(
      'Report message',
      'Flag this message as abusive or objectionable? Our team reviews every report within 24 hours.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: async () => {
            try { await api.reportMessage(jobId, m.id); toast('Reported. Thank you — we’ll review it.'); }
            catch (e) { toast((e as Error).message); }
          },
        },
      ],
    );
  };

  if (accepted === null) {
    return <Screen title="Messages" onBack={() => navigation.goBack()}><View style={{ flex: 1 }} /></Screen>;
  }

  if (!accepted) {
    return (
      <Screen title="Community guidelines" onBack={() => navigation.goBack()}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
          <Text style={{ color: t.ink, fontSize: t.size.subtitle, fontWeight: '700' }}>Before you chat</Text>
          <Text style={{ color: t.ink2, fontSize: t.size.body, lineHeight: 21 }}>
            Rydafirst has zero tolerance for abusive, harassing, hateful, or otherwise objectionable
            content and behaviour. Keep messages respectful and related to the delivery.
          </Text>
          <Text style={{ color: t.ink2, fontSize: t.size.body, lineHeight: 21 }}>
            You can report any message by pressing and holding it. Reports are reviewed within 24
            hours and offending users are removed. By continuing you agree to these terms.
          </Text>
          <View style={{ marginTop: 8 }}>
            <Button label="I agree — continue" onPress={async () => { await writeAccepted(); setAccepted(true); }} />
          </View>
        </ScrollView>
      </Screen>
    );
  }

  // No KeyboardAvoidingView here on purpose: the shared <Screen> already wraps its children in one
  // (padding on iOS), and Android resizes the window (softwareKeyboardLayoutMode: "resize" in app.json)
  // so the composer stays above the keyboard. A second nested KAV used to fight the outer one and left
  // the input hidden behind the keyboard on Android — this keeps a single, correct avoidance path.
  return (
    <Screen title="Messages" onBack={() => navigation.goBack()}>
      <FlatList
        ref={listRef}
        style={{ flex: 1 }}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={(
          <View style={s.empty}>
            <View style={s.emptyGlyph}><Text style={s.emptyGlyphTxt}>💬</Text></View>
            <Text style={s.emptyTitle}>No messages yet</Text>
            <Text style={s.emptyBody}>Say hello and coordinate the delivery here.</Text>
          </View>
        )}
        renderItem={({ item, index }) => {
          const mine = item.senderId === me;
          // Group consecutive messages from the same sender: tighter gap, and only stamp the time on
          // the last of a run so the thread reads cleanly rather than as a wall of timestamps.
          const prev = messages[index - 1];
          const next = messages[index + 1];
          const grouped = prev?.senderId === item.senderId;
          const endsRun = next?.senderId !== item.senderId;
          return (
            <View style={{ marginTop: grouped ? 2 : 12 }}>
              <Pressable
                onLongPress={() => { if (!mine) report(item); }}
                delayLongPress={350}
                style={[s.bubble, mine ? s.mine : s.theirs]}
              >
                <Text style={{ color: mine ? t.onDark : t.ink, fontSize: t.size.body, lineHeight: 22 }}>{item.body}</Text>
              </Pressable>
              {endsRun ? (
                <Text style={[s.meta, mine ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
                  {formatTime(item.createdAt)}{!mine ? '  ·  hold to report' : ''}
                </Text>
              ) : null}
            </View>
          );
        }}
      />
      <View style={[s.composer, { marginBottom: kbInset }]}>
        <TextInput
          style={s.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Type a message…"
          placeholderTextColor={t.mid}
          multiline
          onSubmitEditing={send}
        />
        <View style={{ width: 92 }}><Button label="Send" onPress={send} /></View>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  bubble: { maxWidth: '82%', borderRadius: t.radius.lg + 8, paddingVertical: 10, paddingHorizontal: 14 },
  mine: { alignSelf: 'flex-end', backgroundColor: t.ink, borderBottomRightRadius: t.radius.sm },
  theirs: { alignSelf: 'flex-start', backgroundColor: t.bg, borderWidth: 1, borderColor: t.line, borderBottomLeftRadius: t.radius.sm },
  meta: { color: t.mid, fontFamily: t.mono, fontSize: t.size.caption, marginTop: 4, marginHorizontal: 4 },
  empty: { alignItems: 'center', marginTop: 64, paddingHorizontal: 32, gap: 8 },
  emptyGlyph: { width: 64, height: 64, borderRadius: t.radius.pill, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyGlyphTxt: { fontSize: 28 },
  emptyTitle: { color: t.ink, fontSize: t.size.subtitle, fontWeight: '700', marginTop: 4 },
  emptyBody: { color: t.ink2, fontSize: t.size.small, textAlign: 'center', lineHeight: 20 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: t.line, backgroundColor: t.bg },
  input: { flex: 1, borderWidth: 1, borderColor: t.line, borderRadius: t.radius.lg + 4, paddingHorizontal: 14, paddingVertical: 11, maxHeight: 120, fontSize: t.size.body, color: t.ink, backgroundColor: t.bg2 },
});
