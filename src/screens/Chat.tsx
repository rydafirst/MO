import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { api, type ChatMessage } from '../api';
import { getToken, getUserId } from '../lib/session';
import { Button, Screen, useToast } from '../ui';
import { t } from '../theme';

/** Rider <-> customer conversation for a single job. Polls for new messages while open. */
export function ChatScreen({ route, navigation }: NativeStackScreenProps<RootStack, 'Chat'>) {
  const { jobId } = route.params;
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [me, setMe] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const load = async () => {
    try { setMessages(await api.messages(jobId)); } catch { /* keep last */ }
  };

  useEffect(() => {
    (async () => setMe(getUserId(await getToken())))();
    load();
    const timer = setInterval(load, 4000); // lightweight polling
    return () => clearInterval(timer);
  }, [jobId]);

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
              <View style={[s.bubble, mine ? s.mine : s.theirs]}>
                <Text style={{ color: mine ? t.bg : t.ink, fontSize: 14.5, lineHeight: 20 }}>{item.body}</Text>
              </View>
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
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: t.line, backgroundColor: t.bg },
  input: { flex: 1, borderWidth: 1, borderColor: t.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, maxHeight: 120, fontSize: 14.5, color: t.ink, backgroundColor: t.bg2 },
});
