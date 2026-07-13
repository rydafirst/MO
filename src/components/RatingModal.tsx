import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, type PendingRating } from '../api';
import { Button, Mono, Spacer, useToast } from '../ui';
import { t } from '../theme';

/**
 * Skippable "rate your rider" sheet shown to the customer after a delivery completes. 1–5 stars
 * plus an optional note. Dismissing it just closes — the prompt returns next time until they rate.
 */
export function RatingModal({ pending, onDone }: { pending: PendingRating | null; onDone: () => void }) {
  const toast = useToast();
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!pending || stars < 1) return;
    setSaving(true);
    try {
      await api.rateJob(pending.jobId, { stars, ...(note.trim() ? { comment: note.trim() } : {}) });
      toast('Thanks for your feedback');
      setStars(0); setNote('');
      onDone();
    } catch (e) { toast((e as Error).message); } finally { setSaving(false); }
  };

  const close = () => { setStars(0); setNote(''); onDone(); };

  return (
    <Modal visible={pending !== null} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={s.overlay} onPress={close}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: t.ink }}>How was your delivery?</Text>
            <Text style={{ fontSize: 13, color: t.ink2, marginTop: 4 }}>
              {pending?.riderName ? `Rate ${pending.riderName}` : 'Rate your rider'}
              {pending?.dropoffArea ? ` · to ${pending.dropoffArea}` : ''}
            </Text>

            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 18 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setStars(n)} hitSlop={6}>
                  <Text style={{ fontSize: 38, color: n <= stars ? t.primary : t.line }}>★</Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a note (optional)"
              placeholderTextColor={t.mid}
              multiline
              style={s.input}
            />
            <Spacer h={12} />
            <Button label="Submit rating" onPress={submit} busy={saving} disabled={stars < 1} />
            <Mono onPress={close} style={{ textAlign: 'center', color: t.ink2, marginTop: 12 }}>NOT NOW</Mono>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(17,17,17,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: t.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
  input: {
    borderWidth: 1, borderColor: t.line, borderRadius: t.radius.md, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: t.ink, minHeight: 60, textAlignVertical: 'top',
  },
});
