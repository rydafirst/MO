import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploadAsync, FileSystemUploadType } from 'expo-file-system/legacy';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { api, type ChecklistItem, type DocChecklist, type DocState, type DocType, type VehicleTrack } from '../api';
import { Button, Card, Mono, Pill, PressableScale, Screen, Spacer, useToast } from '../ui';
import { t } from '../theme';

const TRACKS: { value: VehicleTrack; label: string; hint: string }[] = [
  { value: 'BIKE', label: 'Motorcycle', hint: 'Dispatch bike' },
  { value: 'CAR', label: 'Car / Van', hint: 'Larger loads' },
  { value: 'KEKE', label: 'Keke (tricycle)', hint: 'Mid-size loads' },
];

const STATE_STYLE: Record<DocState, { text: string; color: string }> = {
  MISSING: { text: 'Upload', color: t.mid },
  SUBMITTED: { text: 'Submitted', color: t.info },
  UNDER_REVIEW: { text: 'Reviewing', color: t.info },
  APPROVED: { text: 'Approved', color: t.success },
  REJECTED: { text: 'Rejected', color: t.danger },
  EXPIRED: { text: 'Expired', color: t.danger },
};

const ONBOARDING_MSG: Record<DocChecklist['onboarding'], string> = {
  NO_TRACK: 'Choose your vehicle to begin.',
  INCOMPLETE: 'Upload the required documents below.',
  ACTION_REQUIRED: 'Some documents were rejected — re-upload them.',
  UNDER_REVIEW: 'Under review — we’ll notify you when it’s done.',
  EXPIRED: 'A document expired — re-upload to stay active.',
  APPROVED: 'Approved — you’re cleared to go online.',
};

export function DocumentsScreen({ navigation }: NativeStackScreenProps<RootStack, 'Documents'>) {
  const toast = useToast();
  const [data, setData] = useState<DocChecklist | null>(null);
  const [busyType, setBusyType] = useState<DocType | null>(null);
  const [expiryFor, setExpiryFor] = useState<ChecklistItem | null>(null); // item awaiting an expiry date

  const load = useCallback(async () => {
    try { setData(await api.documentsChecklist()); } catch (e) { toast((e as Error).message); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const chooseTrack = async (track: VehicleTrack) => {
    try { await api.setVehicleTrack(track); await load(); }
    catch (e) { toast((e as Error).message); }
  };

  // Pick an image and upload it straight to storage via the one-time presigned URL.
  const pickAndUpload = async (item: ChecklistItem, expiresAt?: number) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { toast('Photo permission is needed to upload'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    const contentType = asset.mimeType ?? 'image/jpeg';

    setBusyType(item.type);
    try {
      const { uploadUrl } = await api.requestDocumentUpload({
        type: item.type, contentType, ...(expiresAt ? { expiresAt } : {}),
      });
      const put = await uploadAsync(uploadUrl, asset.uri, {
        httpMethod: 'PUT',
        uploadType: FileSystemUploadType.BINARY_CONTENT,
        headers: { 'Content-Type': contentType },
      });
      if (put.status >= 300) throw new Error(`Upload failed (${put.status})`);
      toast('Uploaded — pending review');
      await load();
    } catch (e) { toast((e as Error).message); } finally { setBusyType(null); }
  };

  const onRowPress = (item: ChecklistItem) => {
    if (item.status === 'UNDER_REVIEW' || item.status === 'SUBMITTED' || item.status === 'APPROVED') return;
    if (item.expires) { setExpiryFor(item); return; } // collect expiry first
    void pickAndUpload(item);
  };

  if (!data) {
    return (
      <Screen title="Verification" onBack={() => navigation.goBack()}>
        <View style={{ padding: 20 }}><Mono style={{ color: t.mid }}>LOADING…</Mono></View>
      </Screen>
    );
  }

  return (
    <Screen title="Verification" onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Card style={{ borderColor: data.onboarding === 'APPROVED' ? t.success : t.line, marginBottom: 16 }}>
          <Mono style={{ color: t.ink2, fontSize: 10 }}>DOCUMENT STATUS</Mono>
          <Text style={{ fontSize: 15, fontWeight: '700', marginTop: 6, color: t.ink }}>{ONBOARDING_MSG[data.onboarding]}</Text>
        </Card>

        {!data.track && (
          <>
            <Mono style={{ marginBottom: 8 }}>WHAT DO YOU DELIVER WITH?</Mono>
            {TRACKS.map((tr) => (
              <PressableScale key={tr.value} onPress={() => chooseTrack(tr.value)} style={{ marginBottom: 10 }}>
                <Card style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: t.ink }}>{tr.label}</Text>
                    <Text style={{ fontSize: 12.5, color: t.ink2, marginTop: 2 }}>{tr.hint}</Text>
                  </View>
                  <Text style={{ fontSize: 20, color: t.ink2 }}>›</Text>
                </Card>
              </PressableScale>
            ))}
          </>
        )}

        {data.track && (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Mono>REQUIRED DOCUMENTS</Mono>
              <Mono style={{ color: t.ink2 }}>
                {TRACKS.find((x) => x.value === data.track)?.label.toUpperCase()}
              </Mono>
            </View>
            {data.items.map((item) => {
              const st = STATE_STYLE[item.status];
              const busy = busyType === item.type;
              return (
                <PressableScale key={item.type} onPress={() => onRowPress(item)} style={{ marginBottom: 8 }}>
                  <Card style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexShrink: 1, paddingRight: 10 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: t.ink }}>{item.label}</Text>
                      {item.rejectionReason && item.status === 'REJECTED' && (
                        <Text style={{ fontSize: 12, color: t.danger, marginTop: 3 }}>{item.rejectionReason}</Text>
                      )}
                      {item.expires && item.expiresAt && (
                        <Mono style={{ fontSize: 10, color: t.mid, marginTop: 3 }}>
                          EXPIRES {new Date(item.expiresAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </Mono>
                      )}
                    </View>
                    <Pill text={busy ? 'Uploading' : st.text} color={busy ? t.info : st.color} />
                  </Card>
                </PressableScale>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Expiry-date prompt for documents that expire (license, insurance, permits, etc.). */}
      <ExpiryModal
        item={expiryFor}
        onCancel={() => setExpiryFor(null)}
        onConfirm={(ms) => { const it = expiryFor; setExpiryFor(null); if (it) void pickAndUpload(it, ms); }}
      />
    </Screen>
  );
}

function ExpiryModal({ item, onCancel, onConfirm }: {
  item: ChecklistItem | null; onCancel: () => void; onConfirm: (expiresAtMs: number) => void;
}) {
  const [value, setValue] = useState('');
  const submit = () => {
    // Expect YYYY-MM-DD; must be a valid future date.
    const ms = Date.parse(`${value}T00:00:00`);
    if (Number.isNaN(ms)) return;
    if (ms <= Date.now()) return;
    setValue('');
    onConfirm(ms);
  };
  return (
    <Modal visible={item !== null} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={ms.overlay} onPress={onCancel}>
        <Pressable style={ms.sheet} onPress={() => {}}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: t.ink }}>{item?.label} — expiry date</Text>
          <Text style={{ fontSize: 12.5, color: t.ink2, marginTop: 4, marginBottom: 12 }}>
            Enter the date this document expires. Format: YYYY-MM-DD.
          </Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder="2027-05-31"
            placeholderTextColor={t.mid}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            style={ms.textInput}
          />
          <Spacer h={12} />
          <Button label="Choose photo" onPress={submit} />
          <Mono onPress={onCancel} style={{ textAlign: 'center', color: t.ink2, marginTop: 12 }}>CANCEL</Mono>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(17,17,17,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: t.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
  textInput: {
    borderWidth: 1, borderColor: t.line, borderRadius: t.radius.md, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: t.ink, fontFamily: t.mono,
  },
});
