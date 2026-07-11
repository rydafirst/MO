import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api, type Account } from '../api';
import { clearToken, getRole, getToken, getUserId } from '../lib/session';
import type { AppNav } from '../nav';
import { Button, Card, H1, Input, KeyboardScreen, Mono, PressableScale, Spacer, useToast } from '../ui';
import { t } from '../theme';

type Role = 'CUSTOMER' | 'RIDER' | 'ADMIN';

export function ProfileTab({ navigation, onPrimary }: { navigation: AppNav; onPrimary?: () => void }) {
  const [role, setRole] = useState<Role>('CUSTOMER');
  const [uid, setUid] = useState('');
  const isRider = role === 'RIDER';

  useEffect(() => { getToken().then((tok) => { setRole(getRole(tok)); setUid(getUserId(tok)); }); }, []);

  const logout = async () => { await clearToken(); navigation.reset({ index: 0, routes: [{ name: 'Landing' }] }); };

  return (
    <KeyboardScreen contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <H1>Profile</H1>
      <Spacer h={16} />

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <View style={s.avatar}><Text style={{ color: '#fff', fontWeight: '700', fontFamily: t.mono }}>{isRider ? 'R' : 'C'}</Text></View>
        <View>
          <Text style={{ fontSize: 15, fontWeight: '700' }}>{isRider ? 'Rider account' : 'Customer account'}</Text>
          <Mono style={{ fontSize: 11, color: t.mid }}>ID {uid.slice(0, 8) || '—'}…</Mono>
        </View>
      </Card>

      <BankAccountCard isRider={isRider} />

      <Card style={{ padding: 0, marginBottom: 16 }}>
        <Row label={isRider ? 'Rider dashboard' : 'Book a delivery'} onPress={onPrimary} />
        <Row label="Verification (KYC)" onPress={() => navigation.navigate('Kyc')} last />
      </Card>

      <Card>
        <Mono style={{ fontSize: 11 }}>SESSION</Mono>
        <Text style={{ fontSize: 13, color: t.ink2, marginTop: 6, marginBottom: 12 }}>You stay signed in on this device until you log out here.</Text>
        <Button label="Log out" variant="ghost" onPress={logout} />
      </Card>
    </KeyboardScreen>
  );
}

// Rider payout / customer fallback refund account — mirrors the web BankAccountCard.
function BankAccountCard({ isRider }: { isRider: boolean }) {
  const toast = useToast();
  const [acct, setAcct] = useState<Account | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.getAccount().then((a) => { setAcct(a); setLoaded(true); }).catch(() => setLoaded(true)); }, []);

  const save = async () => {
    setBusy(true);
    try {
      const a = await api.setAccount({ bankCode, accountNumber, accountName, type: isRider ? 'payout' : 'refund' });
      setAcct(a); setEditing(false); setAccountNumber(''); toast('Bank account saved.', 'success');
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

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
          <Input style={{ marginBottom: 8 }} placeholder="Account name" value={accountName} onChangeText={setAccountName} />
          <Input style={{ marginBottom: 8 }} placeholder="Account number (10 digits)" keyboardType="number-pad" maxLength={10} value={accountNumber} onChangeText={(v) => setAccountNumber(v.replace(/\D/g, ''))} />
          <Input style={{ marginBottom: 12 }} placeholder="Bank code (e.g. 044)" keyboardType="number-pad" value={bankCode} onChangeText={(v) => setBankCode(v.replace(/\D/g, ''))} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button label={busy ? 'Saving…' : 'Save account'} onPress={save} busy={busy} /></View>
            <View style={{ flex: 1 }}><Button label="Cancel" variant="ghost" onPress={() => setEditing(false)} /></View>
          </View>
          <Mono style={{ fontSize: 10, color: t.mid, marginTop: 10 }}>STORED ENCRYPTED · ONLY THE LAST 4 DIGITS ARE EVER SHOWN</Mono>
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
