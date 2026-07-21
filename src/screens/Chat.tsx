import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { api, type ChatMessage } from '../api';
import { getToken, getUserId } from '../lib/session';
import { Button, Screen, useToast } from '../ui';
import { t } from '../theme';

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

  return (
    <Screen title="Messages" onBack={() => navigation.goBack()}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={<Text style={{ color: t.ink2, textAlign: 'center', marginTop: 40 }}>No messages yet. Say hello 👋</Text>}
          renderItem={({ item }) => {
            const mine = item.senderId === me;
            return (
              <Pressable
                onLongPress={() => { if (!mine) report(item); }}
                delayLongPress={350}
                style={[s.bubble, mine ? s.mine : s.theirs]}
              >
                <Text style={{ color: mine ? t.bg : t.ink, fontSize: t.size.body, lineHeight: 20 }}>{item.body}</Text>
                {!mine ? <Text style={s.hint}>Hold to report</Text> : null}
              </Pressable>
            );
          }}
        />
        <View style={s.composer}>
          <TextInput
            style={s.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Type a message…"
            placeholderTextColor={t.ink2}
            multiline
            onSubmitEditing={send}
          />
          <View style={{ width: 92 }}><Button label="Send" onPress={send} /></View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  bubble: { maxWidth: '80%', borderRadius: 14, paddingVertical: 9, paddingHorizontal: 13 },
  mine: { alignSelf: 'flex-end', backgroundColor: t.ink },
  theirs: { alignSelf: 'flex-start', backgroundColor: t.bg2, borderWidth: 1, borderColor: t.line },
  hint: { color: t.ink2, fontSize: t.size.caption, marginTop: 3, opacity: 0.7 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: t.line, backgroundColor: t.bg },
  input: { flex: 1, borderWidth: 1, borderColor: t.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, maxHeight: 120, fontSize: t.size.body, color: t.ink, backgroundColor: t.bg2 },
});
