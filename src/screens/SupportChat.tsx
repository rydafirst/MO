import { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { api, type SupportMessage, type SupportThread } from '../api';
import { botFollowUps } from '../lib/supportBot';
import { Button, Card, Mono, PressableScale, Screen, useToast } from '../ui';
import { t } from '../theme';
import { useKeyboardInset } from '../lib/keyboard';

function formatTime(ms: number): string {
  try { return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  catch { return ''; }
}

/**
 * The support conversation. Opens either an existing thread (`threadId` — resumable, loads full
 * history) or starts a new one for a `category` (optionally scoped to a trip via `jobId` — #6).
 * For a per-trip entry we reuse the newest un-resolved thread on that trip so support stays resumable
 * from the trip screen instead of spawning a duplicate.
 *
 * While the bot is running (status BOT) we render the current step's tap-options (mirrored client-side
 * from the backend script) and every answer — a tapped option or free text — is POSTed to /answer,
 * which advances the bot; the final free-text step escalates to a human agent.
 */
export function SupportChatScreen({ route, navigation }: NativeStackScreenProps<RootStack, 'SupportChat'>) {
  const { threadId, category, jobId } = route.params;
  const toast = useToast();
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(Date.now());
  const listRef = useRef<FlatList<SupportMessage>>(null);
  const kbInset = useKeyboardInset();
  // Keep the newest message visible above the composer when the keyboard opens.
  useEffect(() => { if (kbInset > 0) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true })); }, [kbInset]);

  // Bootstrap: resolve which thread this screen is showing, then load its history.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        let th: SupportThread | null = null;
        if (threadId) {
          th = (await api.mySupportThreads()).find((x) => x.id === threadId) ?? null;
          if (!th) throw new Error('Conversation not found');
        } else if (category) {
          if (jobId) {
            // Per-trip: reopen the newest still-open thread for this trip, else start a fresh one.
            const existing = (await api.mySupportThreads())
              .find((x) => x.jobId === jobId && x.status !== 'RESOLVED');
            th = existing ?? (await api.startSupportThread(category, jobId));
          } else {
            th = await api.startSupportThread(category);
          }
        } else {
          throw new Error('Nothing to open');
        }
        if (!live) return;
        setThread(th);
        setMessages(await api.supportMessages(th.id));
      } catch (e) {
        if (live) toast((e as Error).message);
      }
    })();
    return () => { live = false; };
  }, [threadId, category, jobId, toast]);

  // Poll messages + thread status while open (like the job chat), so an agent joining, a new agent
  // message, or a resolution appears without the user doing anything.
  useEffect(() => {
    if (!thread) return;
    const id = thread.id;
    const tick = async () => {
      try {
        const [msgs, all] = await Promise.all([api.supportMessages(id), api.mySupportThreads()]);
        setMessages(msgs);
        const fresh = all.find((x) => x.id === id);
        if (fresh) setThread(fresh);
      } catch { /* keep last */ }
    };
    const timer = setInterval(tick, 4000);
    return () => clearInterval(timer);
  }, [thread?.id]);

  // Soft countdown ticker for the "agent will join" SLA banner.
  useEffect(() => {
    if (thread?.status !== 'AWAITING_AGENT') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [thread?.status]);

  const isBot = thread?.status === 'BOT';
  const resolved = thread?.status === 'RESOLVED';
  // While the bot runs, the current step = the last BOT prompt seeded (one BOT message per step).
  const botStep = messages.filter((m) => m.sender === 'BOT').length - 1;
  const options = isBot && thread ? botFollowUps(thread.category, botStep) : [];

  // Send an answer (advances the bot) or a plain message (once with an agent). Used by both the
  // option buttons and the composer.
  const submit = async (text: string) => {
    const body = text.trim();
    if (!body || sending || !thread || resolved) return;
    setSending(true);
    try {
      if (thread.status === 'BOT') {
        const r = await api.answerSupport(thread.id, body);
        setThread(r.thread);
        setMessages(r.messages);
      } else {
        const msg = await api.postSupportMessage(thread.id, body);
        setMessages((prev) => [...prev, msg]);
      }
      setDraft('');
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (e) { toast((e as Error).message); }
    finally { setSending(false); }
  };

  const banner = (() => {
    if (!thread) return null;
    if (thread.status === 'AWAITING_AGENT') {
      const secs = thread.agentJoinDeadline ? Math.max(0, Math.round((thread.agentJoinDeadline - now) / 1000)) : 0;
      const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      return (
        <View style={[s.banner, { borderColor: t.warning }]}>
          <Mono style={{ color: t.warning }}>● AGENT ON THE WAY</Mono>
          <Text style={s.bannerBody}>An agent will join you shortly (within 30 minutes).</Text>
          {secs > 0 ? <Mono style={{ color: t.ink2, marginTop: 4 }}>~{mmss} LEFT ON OUR RESPONSE PROMISE</Mono> : null}
        </View>
      );
    }
    if (thread.status === 'AGENT_JOINED') {
      return (
        <View style={[s.banner, { borderColor: t.success }]}>
          <Mono style={{ color: t.success }}>● AGENT CONNECTED</Mono>
          <Text style={s.bannerBody}>You’re now chatting with a support agent.</Text>
        </View>
      );
    }
    if (thread.status === 'RESOLVED') {
      return (
        <View style={[s.banner, { borderColor: t.line }]}>
          <Mono style={{ color: t.ink2 }}>● RESOLVED</Mono>
          <Text style={s.bannerBody}>This conversation has been marked resolved. Start a new one if you need more help.</Text>
        </View>
      );
    }
    return null;
  })();

  return (
    <Screen title="Support" onBack={() => navigation.goBack()} avoidKeyboard={false}>
      {banner}
      <FlatList
        ref={listRef}
        style={{ flex: 1 }}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={<Mono style={{ color: t.mid, textAlign: 'center', marginTop: 40 }}>LOADING…</Mono>}
        renderItem={({ item, index }) => {
          const mine = item.sender === 'USER';
          const prev = messages[index - 1];
          const next = messages[index + 1];
          const grouped = prev?.sender === item.sender;
          const endsRun = next?.sender !== item.sender;
          const who = item.sender === 'BOT' ? 'Assistant' : item.sender === 'AGENT' ? 'Agent' : '';
          return (
            <View style={{ marginTop: grouped ? 2 : 12 }}>
              {!mine && !grouped ? <Mono style={{ marginBottom: 4, marginLeft: 4, color: t.mid }}>{who.toUpperCase()}</Mono> : null}
              <View style={[s.bubble, mine ? s.mine : s.theirs]}>
                <Text style={{ color: mine ? t.onDark : t.ink, fontSize: t.size.body, lineHeight: 22 }}>{item.body}</Text>
              </View>
              {endsRun ? (
                <Text style={[s.meta, mine ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>{formatTime(item.createdAt)}</Text>
              ) : null}
            </View>
          );
        }}
      />

      {options.length > 0 ? (
        <View style={s.options}>
          <Mono style={{ color: t.mid, marginBottom: 8, marginLeft: 2 }}>TAP AN OPTION OR TYPE BELOW</Mono>
          {options.map((opt) => (
            <PressableScale key={opt} onPress={() => submit(opt)} disabled={sending} style={{ marginBottom: 8 }}>
              <Card style={{ paddingVertical: 12, paddingHorizontal: 14, backgroundColor: t.bg2 }}>
                <Text style={{ fontSize: t.size.body, color: t.ink }}>{opt}</Text>
              </Card>
            </PressableScale>
          ))}
        </View>
      ) : null}

      {resolved ? (
        <View style={[s.composer, { marginBottom: kbInset }]}>
          <View style={{ flex: 1 }}><Button label="Start a new conversation" variant="ghost" onPress={() => navigation.navigate('Support')} /></View>
        </View>
      ) : (
        <View style={[s.composer, { marginBottom: kbInset }]}>
          <TextInput
            style={s.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={isBot ? 'Type your answer…' : 'Type a message…'}
            placeholderTextColor={t.mid}
            multiline
            editable={!!thread}
            onSubmitEditing={() => submit(draft)}
          />
          <View style={{ width: 92 }}><Button label="Send" onPress={() => submit(draft)} busy={sending} /></View>
        </View>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: t.radius.md, margin: 12, marginBottom: 0, padding: 12, backgroundColor: t.bg },
  bannerBody: { color: t.ink, fontSize: t.size.small, lineHeight: 19, marginTop: 4 },
  bubble: { maxWidth: '82%', borderRadius: t.radius.lg + 8, paddingVertical: 10, paddingHorizontal: 14 },
  mine: { alignSelf: 'flex-end', backgroundColor: t.ink, borderBottomRightRadius: t.radius.sm },
  theirs: { alignSelf: 'flex-start', backgroundColor: t.bg, borderWidth: 1, borderColor: t.line, borderBottomLeftRadius: t.radius.sm },
  meta: { color: t.mid, fontFamily: t.mono, fontSize: t.size.caption, marginTop: 4, marginHorizontal: 4 },
  options: { paddingHorizontal: 12, paddingTop: 6, borderTopWidth: 1, borderTopColor: t.line2, backgroundColor: t.bg },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: t.line, backgroundColor: t.bg },
  input: { flex: 1, borderWidth: 1, borderColor: t.line, borderRadius: t.radius.lg + 4, paddingHorizontal: 14, paddingVertical: 11, maxHeight: 120, fontSize: t.size.body, color: t.ink, backgroundColor: t.bg2 },
});
