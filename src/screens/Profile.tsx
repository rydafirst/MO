import { useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploadAsync, getInfoAsync, FileSystemUploadType } from 'expo-file-system/legacy';
import { api, type Account } from '../api';
import { clearToken, getRole, getToken } from '../lib/session';
import { unregisterForPush } from '../lib/push';
import { setRememberedTab } from '../lib/tabMemory';
import type { AppNav } from '../nav';
import { BankAccountForm } from '../components/BankAccountForm';
import { Button, Card, H1, KeyboardScreen, Mono, PressableScale, Spacer, useToast } from '../ui';
import { t } from '../theme';

type Role = 'CUSTOMER' | 'RIDER' | 'ADMIN';

export function ProfileTab({ navigation, onPrimary }: { navigation: AppNav; onPrimary?: () => void }) {
  const [role, setRole] = useState<Role>('CUSTOMER');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const toast = useToast();
  const isRider = role === 'RIDER';

  const [phone, setPhone] = useState<string | null>(null);
  useEffect(() => { getToken().then((tok) => setRole(getRole(tok))); }, []);
  useEffect(() => { api.myAvatar().then((a) => setPhotoUrl(a.photoUrl)).catch(() => {}); }, []);
  useEffect(() => { api.me().then((m) => setPhone(m.phone)).catch(() => {}); }, []);

  const changePhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { toast('Photo permission is needed'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    const contentType = asset.mimeType ?? 'image/jpeg';
    const sizeBytes = asset.fileSize ?? ((await getInfoAsync(asset.uri)) as { size?: number }).size ?? 0;
    if (sizeBytes > 5 * 1024 * 1024) { toast('Image must be 5 MB or smaller'); return; }
    setUploading(true);
    try {
      const { uploadUrl } = await api.avatarUploadUrl(contentType, sizeBytes);
      const put = await uploadAsync(uploadUrl, asset.uri, { httpMethod: 'PUT', uploadType: FileSystemUploadType.BINARY_CONTENT, headers: { 'Content-Type': contentType } });
      if (put.status >= 300) throw new Error(`Upload failed (${put.status})`);
      const a = await api.myAvatar(); setPhotoUrl(a.photoUrl);
      toast('Photo updated', 'success');
    } catch (e) { toast((e as Error).message); } finally { setUploading(false); }
  };

  const logout = async () => { setRememberedTab(null); await unregisterForPush(); await clearToken(); navigation.reset({ index: 0, routes: [{ name: 'Landing' }] }); };

  const deleteAccount = () => {
    Alert.alert(
      'Delete your account?',
      'This erases your name, email and photo and signs you out everywhere. It cannot be undone. Records the law requires us to keep are retained without identifying you.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteAccount();
              setRememberedTab(null); await unregisterForPush(); await clearToken();
              navigation.reset({ index: 0, routes: [{ name: 'Landing' }] });
            } catch (e) { toast((e as Error).message); }
          },
        },
      ],
    );
  };

  return (
    <KeyboardScreen contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <H1>Profile</H1>
      <Spacer h={16} />

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <PressableScale onPress={changePhoto}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={[s.avatar, { backgroundColor: t.bg2 }]} />
          ) : (
            <View style={s.avatar}><Text style={{ color: '#fff', fontWeight: '700', fontFamily: t.mono }}>{isRider ? 'R' : 'C'}</Text></View>
          )}
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700' }}>{isRider ? 'Rider account' : 'Customer account'}</Text>
          <Mono style={{ fontSize: 11, color: t.mid }}>{phone || '—'}</Mono>
          <PressableScale onPress={changePhoto} disabled={uploading}>
            <Mono style={{ color: t.ink, marginTop: 6 }}>{uploading ? 'UPLOADING…' : photoUrl ? 'CHANGE PHOTO →' : 'ADD A PHOTO →'}</Mono>
          </PressableScale>
        </View>
      </Card>

      <BankAccountCard isRider={isRider} />

      <Card style={{ padding: 0, marginBottom: 16 }}>
        <Row label={isRider ? 'Rider dashboard' : 'Book a delivery'} onPress={onPrimary} last={!isRider} />
        {isRider && <Row label="Documents & verification" onPress={() => navigation.navigate('Documents')} last />}
      </Card>

      <Card>
        <Mono style={{ fontSize: 11 }}>SESSION</Mono>
        <Text style={{ fontSize: 13, color: t.ink2, marginTop: 6, marginBottom: 12 }}>You stay signed in on this device until you log out here.</Text>
        <Button label="Log out" variant="ghost" onPress={logout} />
      </Card>

      <Spacer h={16} />
      <Card style={{ borderColor: t.danger }}>
        <Mono style={{ fontSize: 11, color: t.danger }}>DELETE ACCOUNT</Mono>
        <Text style={{ fontSize: 13, color: t.ink2, marginTop: 6, marginBottom: 12, lineHeight: 19 }}>
          Permanently erase your personal data (name, email, photo) and sign out everywhere. Records the
          law requires us to keep are retained without identifying you.
        </Text>
        <PressableScale onPress={deleteAccount} style={{ backgroundColor: t.danger, borderRadius: 10, paddingVertical: 13, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Delete my account</Text>
        </PressableScale>
      </Card>
    </KeyboardScreen>
  );
}

// Rider payout / customer fallback refund account — mirrors the web BankAccountCard.
function BankAccountCard({ isRider }: { isRider: boolean }) {
  const [acct, setAcct] = useState<Account | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => { api.getAccount().then((a) => { setAcct(a); setLoaded(true); }).catch(() => setLoaded(true)); }, []);

  return (
    <Card style={{ marginBottom: 16 }}>
      <Mono style={{ fontSize: 11 }}>{isRider ? 'PAYOUT ACCOUNT' : 'REFUND ACCOUNT (OPTIONAL)'}</Mono>
      <Text style={{ fontSize: 12.5, color: t.ink2, lineHeight: 18, marginTop: 6, marginBottom: 12 }}>
        {isRider ? 'Where your earnings are paid after each completed delivery.' : 'Refunds normally go back to your original payment method. Add an account only as a fallback.'}
      </Text>

      {!editing && loaded && acct && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ fontSize: 14, fontWeight: '600' }}>{acct.accountName}</Text>
            <Mono style={{ fontSize: 12, color: t.ink2 }}>{acct.accountNumberMasked} · bank {acct.bankCode}</Mono>
          </View>
          <PressableScale onPress={() => setEditing(true)} style={s.chip}><Mono style={{ color: t.ink, fontSize: 11 }}>EDIT</Mono></PressableScale>
        </View>
      )}

      {!editing && loaded && !acct && (
        <Button label={isRider ? 'Add payout account' : 'Add fallback account'} variant="ghost" onPress={() => setEditing(true)} />
      )}

      {editing && (
        <View>
          <BankAccountForm type={isRider ? 'payout' : 'refund'} onSaved={(a) => { setAcct(a); setEditing(false); }} />
          <Spacer h={8} />
          <Button label="Cancel" variant="ghost" onPress={() => setEditing(false)} />
        </View>
      )}
    </Card>
  );
}

function Row({ label, onPress, last }: { label: string; onPress?: () => void; last?: boolean }) {
  return (
    <PressableScale onPress={onPress} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.line2 }}>
      <Text style={{ fontSize: 14, color: t.ink }}>{label}</Text>
      <Mono style={{ color: t.mid }}>→</Mono>
    </PressableScale>
  );
}

const s = StyleSheet.create({
  avatar: { width: 48, height: 48, borderRadius: 10, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' },
  chip: { borderWidth: 1, borderColor: t.line, borderRadius: t.radius.md, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: t.bg },
});
