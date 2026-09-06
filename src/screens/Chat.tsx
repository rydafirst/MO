import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { uploadAsync, getInfoAsync, FileSystemUploadType } from 'expo-file-system/legacy';
import { useAudioRecorder, useAudioPlayer, useAudioPlayerStatus, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { api, type ChatMessage } from '../api';
import { getToken, getUserId } from '../lib/session';
import { Button, Mono, Screen, useToast } from '../ui';
import { t } from '../theme';
import { useKeyboardInset } from '../lib/keyboard';

const AUDIO_MIME = 'audio/m4a'; // HIGH_QUALITY preset records an m4a/AAC container on iOS and Android

// Short local time (e.g. "3:07 PM") for a message bubble. Falls back to empty on a bad timestamp
// so a malformed value can never throw inside render.
function formatTime(ms: number): string {
  try { return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  catch { return ''; }
}

// Merge server messages with what we already have, keyed by id, so a message can NEVER render twice —
// this is what fixes the "message appears twice, then settles" flicker. The optimistic copy we add on
// send shares the server's id, and read-after-write lag can't drop it because we keep any local-only
// messages the latest poll hasn't returned yet. Always sorted oldest-first for a stable thread.
function mergeMessages(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const prevById = new Map(prev.map((m) => [m.id, m] as const));
  const byId = new Map<string, ChatMessage>();
  for (const m of incoming) {
    const existing = prevById.get(m.id);
    // Keep the FIRST signed playback URL we saw for a voice note: the server re-signs it on every poll,
    // and swapping the src would make the audio player reload (and cut off playback) every few seconds.
    // Keep the first signed URL for audio AND images — the server re-signs on every poll and swapping
    // the src would reload the media (audio playback would cut off; images would flicker).
    let merged = m;
    if (existing?.audioUrl && m.audioUrl) merged = { ...merged, audioUrl: existing.audioUrl };
    if (existing?.imageUrl && m.imageUrl) merged = { ...merged, imageUrl: existing.imageUrl };
    byId.set(m.id, merged);
  }
  for (const m of prev) if (!byId.has(m.id)) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
}

/** "0:07" style clock for a voice-note length (ms). */
function fmtDuration(ms?: number): string {
  const s = Math.max(0, Math.round((ms ?? 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null); // message being replied to, if any
  const [accepted, setAccepted] = useState<boolean | null>(null); // null = still loading
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const kbInset = useKeyboardInset(); // lifts the composer above the keyboard on iOS + Android
  // Keep the newest message visible above the composer when the keyboard opens.
  useEffect(() => { if (kbInset > 0) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true })); }, [kbInset]);

  // Voice notes: record with expo-audio, upload to the presigned URL, then send a message quoting the key.
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const recStartRef = useRef(0);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (recTimerRef.current) clearInterval(recTimerRef.current); }, []);

  const load = async () => {
    try { const server = await api.messages(jobId); setMessages((prev) => mergeMessages(prev, server)); } catch { /* keep last */ }
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
    const replyId = replyTo?.id;
    try {
      const msg = await api.sendMessage(jobId, body, replyId);
      setDraft('');
      setReplyTo(null);
      // Merge (not push) so the message is never duplicated by the next poll returning the same id.
      setMessages((prev) => mergeMessages(prev, [msg]));
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (e) { toast((e as Error).message); }
    finally { setSending(false); }
  };

  const startRecording = async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) { toast('Microphone permission is needed to record'); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recStartRef.current = Date.now();
      setRecSecs(0);
      setRecording(true);
      recTimerRef.current = setInterval(() => setRecSecs(Math.floor((Date.now() - recStartRef.current) / 1000)), 500);
    } catch { toast('Could not start recording'); }
  };

  const clearRecTimer = () => { if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; } };

  const cancelRecording = async () => {
    clearRecTimer();
    setRecording(false);
    try { await recorder.stop(); } catch { /* discard */ }
  };

  const stopAndSend = async () => {
    clearRecTimer();
    setRecording(false);
    const durationMs = Date.now() - recStartRef.current;
    let uri: string | null = null;
    try { await recorder.stop(); uri = recorder.uri; } catch { toast('Could not finish the recording'); return; }
    if (!uri || durationMs < 700) { toast('Hold to record a little longer'); return; } // ignore accidental taps
    setUploadingAudio(true);
    const replyId = replyTo?.id;
    try {
      const info = await getInfoAsync(uri);
      const size = (info as { size?: number }).size ?? 0;
      const { uploadUrl, key } = await api.chatAudioUploadUrl(jobId, AUDIO_MIME, size || 1);
      const put = await uploadAsync(uploadUrl, uri, { httpMethod: 'PUT', uploadType: FileSystemUploadType.BINARY_CONTENT, headers: { 'Content-Type': AUDIO_MIME } });
      if (put.status >= 300) throw new Error(`Upload failed (${put.status})`);
      const msg = await api.sendMessage(jobId, '', replyId, { audioKey: key, audioDurationMs: durationMs });
      setReplyTo(null);
      setMessages((prev) => mergeMessages(prev, [msg]));
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (e) { toast((e as Error).message); }
    finally { setUploadingAudio(false); }
  };

  // Photos: pick from the library, upload to the presigned URL, then send a message quoting the key.
  const sendImage = async () => {
    if (uploadingImage) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { toast('Photo permission is needed to attach an image'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      const asset = res.assets[0];
      const uri = asset.uri;
      const mime = asset.mimeType || 'image/jpeg';
      setUploadingImage(true);
      const replyId = replyTo?.id;
      const info = await getInfoAsync(uri);
      const size = (info as { size?: number }).size ?? 0;
      const { uploadUrl, key } = await api.chatImageUploadUrl(jobId, mime, size || 1);
      const put = await uploadAsync(uploadUrl, uri, { httpMethod: 'PUT', uploadType: FileSystemUploadType.BINARY_CONTENT, headers: { 'Content-Type': mime } });
      if (put.status >= 300) throw new Error(`Upload failed (${put.status})`);
      const msg = await api.sendMessage(jobId, draft.trim(), replyId, undefined, key);
      setDraft('');
      setReplyTo(null);
      setMessages((prev) => mergeMessages(prev, [msg]));
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (e) { toast((e as Error).message); }
    finally { setUploadingImage(false); }
  };

  // Long-press a message: reply to it (any message) or report it (the other party's only).
  const onLongPress = (m: ChatMessage) => {
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: 'Reply', onPress: () => setReplyTo(m) },
    ];
    if (m.senderId !== me) buttons.push({ text: 'Report', style: 'destructive', onPress: () => report(m) });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Message', undefined, buttons);
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

  // Keyboard handling: opt OUT of Screen's KeyboardAvoidingView (avoidKeyboard={false}) and lift the
  // composer ourselves by the real keyboard height (useKeyboardInset) on BOTH iOS and Android. This is
  // the single reliable path for a bottom-pinned composer — Screen's padding-KAV alone left the input
  // behind the keyboard on iOS, and Android edge-to-edge doesn't shrink the window.
  return (
    <Screen title="Messages" onBack={() => navigation.goBack()} avoidKeyboard={false}>
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
          const repliedTo = item.replyToId ? messages.find((m) => m.id === item.replyToId) : undefined;
          return (
            <View style={{ marginTop: grouped ? 3 : 14, alignItems: mine ? 'flex-end' : 'flex-start' }}>
              <Pressable
                onLongPress={() => onLongPress(item)}
                delayLongPress={300}
                style={[s.bubble, mine ? s.mine : s.theirs]}
              >
                {/* In-thread quote: shows what this message is replying to. */}
                {item.replyToId ? (
                  <View style={[s.quote, { borderLeftColor: mine ? t.onDark : t.primary }]}>
                    <Text numberOfLines={2} style={{ color: mine ? t.onDark : t.ink2, fontSize: t.size.small, opacity: 0.9 }}>
                      {repliedTo ? (repliedTo.audioUrl ? '🎤 Voice note' : repliedTo.imageUrl ? '📷 Photo' : repliedTo.body) : 'Message'}
                    </Text>
                  </View>
                ) : null}
                {item.audioUrl ? (
                  <VoiceBubble url={item.audioUrl} durationMs={item.audioDurationMs} mine={mine} />
                ) : null}
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={{ width: 200, height: 200, borderRadius: 10, backgroundColor: t.bg2 }} resizeMode="cover" />
                ) : null}
                {item.body ? (
                  <Text style={{ color: mine ? t.onDark : t.ink, fontSize: t.size.body, lineHeight: 22, marginTop: (item.audioUrl || item.imageUrl) ? 6 : 0 }}>{item.body}</Text>
                ) : null}
                {/* Time on every message, tucked into the bubble corner so it's always visible. */}
                <Text style={{ color: mine ? t.onDark : t.mid, opacity: mine ? 0.75 : 1, fontFamily: t.mono, fontSize: 10, alignSelf: 'flex-end', marginTop: 3 }}>
                  {formatTime(item.createdAt)}
                </Text>
              </Pressable>
              {endsRun && !mine ? (
                <Text style={[s.meta, { alignSelf: 'flex-start' }]}>HOLD TO REPLY OR REPORT</Text>
              ) : null}
            </View>
          );
        }}
      />

      {/* Reply preview: what you're replying to, with a way to cancel, sits just above the composer. */}
      {replyTo ? (
        <View style={s.replyBar}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Mono style={{ color: t.primary, fontSize: t.size.caption }}>REPLYING TO {replyTo.senderId === me ? 'YOURSELF' : 'THEM'}</Mono>
            <Text numberOfLines={1} style={{ color: t.ink2, fontSize: t.size.small, marginTop: 1 }}>{replyTo.body}</Text>
          </View>
          <Pressable onPress={() => setReplyTo(null)} hitSlop={10} style={{ paddingHorizontal: 8 }}>
            <Text style={{ color: t.ink2, fontSize: t.size.subtitle, lineHeight: 20 }}>×</Text>
          </Pressable>
        </View>
      ) : null}

      {recording ? (
        // Recording state: live timer with cancel + send. Mirrors the WhatsApp voice-note bar.
        <View style={[s.composer, { marginBottom: kbInset, alignItems: 'center' }]}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.danger }} />
          <Text style={{ flex: 1, marginLeft: 10, color: t.ink, fontFamily: t.mono }}>{fmtDuration(recSecs * 1000)} · Recording…</Text>
          <Pressable onPress={cancelRecording} hitSlop={8} style={{ paddingHorizontal: 12 }}><Mono style={{ color: t.ink2 }}>CANCEL</Mono></Pressable>
          <View style={{ width: 84 }}><Button label="Send" onPress={stopAndSend} /></View>
        </View>
      ) : uploadingAudio || uploadingImage ? (
        <View style={[s.composer, { marginBottom: kbInset, alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator color={t.ink} />
          <Text style={{ color: t.ink2, marginLeft: 8 }}>{uploadingImage ? 'Sending photo…' : 'Sending voice note…'}</Text>
        </View>
      ) : (
        <View style={[s.composer, { marginBottom: kbInset }]}>
          <Pressable onPress={sendImage} style={s.micBtn} accessibilityLabel="Attach a photo">
            <Text style={{ fontSize: 20 }}>📷</Text>
          </Pressable>
          <TextInput
            style={s.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={replyTo ? 'Type your reply…' : 'Type a message…'}
            placeholderTextColor={t.mid}
            multiline
            onSubmitEditing={send}
          />
          {draft.trim() ? (
            <View style={{ width: 84 }}><Button label="Send" onPress={send} /></View>
          ) : (
            <Pressable onPress={startRecording} style={s.micBtn} accessibilityLabel="Record a voice note">
              <Text style={{ fontSize: 20 }}>🎤</Text>
            </Pressable>
          )}
        </View>
      )}
    </Screen>
  );
}

/** A voice-note bubble: tap to play/pause, with a progress bar and duration. Each mounts one player. */
function VoiceBubble({ url, durationMs, mine }: { url: string; durationMs?: number; mine: boolean }) {
  const player = useAudioPlayer({ uri: url });
  const status = useAudioPlayerStatus(player);
  const ink = mine ? t.onDark : t.ink;
  const total = status.duration || (durationMs ? durationMs / 1000 : 1);
  const pct = Math.min(100, total > 0 ? (status.currentTime / total) * 100 : 0);
  const toggle = () => {
    if (status.playing) { player.pause(); return; }
    if (status.didJustFinish || status.currentTime >= total - 0.15) player.seekTo(0);
    player.play();
  };
  return (
    <Pressable onPress={toggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 168, paddingVertical: 2 }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: mine ? 'rgba(255,255,255,0.18)' : t.primarySoft }}>
        <Text style={{ color: ink, fontSize: 15 }}>{status.playing ? '❚❚' : '▶'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ height: 3, borderRadius: 2, backgroundColor: mine ? 'rgba(255,255,255,0.3)' : t.line, overflow: 'hidden' }}>
          <View style={{ height: 3, width: `${pct}%`, backgroundColor: mine ? t.onDark : t.primary }} />
        </View>
        <Text style={{ color: mine ? t.onDark : t.mid, opacity: mine ? 0.8 : 1, fontFamily: t.mono, fontSize: 11, marginTop: 5 }}>
          {fmtDuration(durationMs ?? total * 1000)}
        </Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  bubble: { maxWidth: '82%', borderRadius: t.radius.lg + 8, paddingVertical: 10, paddingHorizontal: 14 },
  mine: { alignSelf: 'flex-end', backgroundColor: t.ink, borderBottomRightRadius: t.radius.sm },
  theirs: { alignSelf: 'flex-start', backgroundColor: t.bg, borderWidth: 1, borderColor: t.line, borderBottomLeftRadius: t.radius.sm },
  meta: { color: t.mid, fontFamily: t.mono, fontSize: t.size.caption, marginTop: 4, marginHorizontal: 4 },
  quote: { borderLeftWidth: 2, paddingLeft: 8, marginBottom: 6, opacity: 0.95 },
  micBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg2, borderWidth: 1, borderColor: t.line },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.line, backgroundColor: t.bg2 },
  empty: { alignItems: 'center', marginTop: 64, paddingHorizontal: 32, gap: 8 },
  emptyGlyph: { width: 64, height: 64, borderRadius: t.radius.pill, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyGlyphTxt: { fontSize: 28 },
  emptyTitle: { color: t.ink, fontSize: t.size.subtitle, fontWeight: '700', marginTop: 4 },
  emptyBody: { color: t.ink2, fontSize: t.size.small, textAlign: 'center', lineHeight: 20 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: t.line, backgroundColor: t.bg },
  input: { flex: 1, borderWidth: 1, borderColor: t.line, borderRadius: t.radius.lg + 4, paddingHorizontal: 14, paddingVertical: 11, maxHeight: 120, fontSize: t.size.body, color: t.ink, backgroundColor: t.bg2 },
});
