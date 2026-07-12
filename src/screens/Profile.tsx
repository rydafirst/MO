import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api, type Account } from '../api';
import { clearToken, getRole, getToken, getUserId } from '../lib/session';
import type { AppNav } from '../nav';
import { BankAccountForm } from '../components/BankAccountForm';
import { Button, Card, H1, KeyboardScreen, Mono, PressableScale, Spacer } from '../ui';
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
