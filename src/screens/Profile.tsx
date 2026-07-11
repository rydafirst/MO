import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { api, type Account } from '../api';
import { clearToken, getRole, getToken } from '../lib/session';
import type { AppNav } from '../nav';
import { Button, Card, KeyboardScreen, Mono, PressableScale, Spacer, useToast } from '../ui';
import { t } from '../theme';

export function ProfileTab({ navigation }: { navigation: AppNav }) {
  const toast = useToast();
  const [role, setRole] = useState<'CUSTOMER' | 'RIDER' | 'ADMIN'>('CUSTOMER');
  const [acct, setAcct] = useState<Account | null>(null);
  const [editing, setEditing] = useState(false);
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [busy, setBusy] = useState(false);
  const isRider = role === 'RIDER';

  useEffect(() => {
    getToken().then((tok) => setRole(getRole(tok)));
    api.getAccount().then(setAcct).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const a = await api.setAccount({ bankCode, accountNumber, accountName, type: isRider ? 'payout' : 'refund' });
      setAcct(a); setEditing(false); setAccountNumber(''); toast('Bank account saved.', 'success');
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  const logout = async () => { await clearToken(); navigation.reset({ index: 0, routes: [{ name: 'Landing' }] }); };

  return (
    <KeyboardScreen contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: t.ink, marginBottom: 16 }}>Profile</Text>

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <View style={s.avatar}><Text style={{ color: '#fff', fontWeight: '700', fontFamily: t.mono }}>{isRider ? 'R' : 'C'}</Text></View>
        <Text style={{ fontSize: 15, fontWeight: '700' }}>{isRider ? 'Rider account' : 'Customer account'}</Text>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Mono>{isRider ? 'PAYOUT ACCOUNT' : 'REFUND ACCOUNT (OPTIONAL)'}</Mono>
        <Text style={{ fontSize: 12.5, color: t.ink2, marginVertical: 8, lineHeight: 18 }}>
          {isRider ? 'Where your earnings are paid after each completed delivery.' : 'Refunds normally go back to your original payment method. Add one only as a fallback.'}
        </Text>
        {!editing && acct && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View><Text style={{ fontSize: 14, fontWeight: '600' }}>{acct.accountName}</Text><Mono>{acct.accountNumberMasked} · bank {acct.bankCode}</Mono></View>
            <PressableScale onPress={() => setEditing(true)} style={s.chip}><Mono style={{ color: t.ink }}>EDIT</Mono></PressableScale>
          </View>
        )}
        {!editing && !acct && <Button label={isRider ? 'Add payout account' : 'Add fallback account'} variant="ghost" onPress={() => setEditing(true)} />}
        {editing && (
          <View>
            <TextInput style={s.input} placeholder="Account name" value={accountName} onChangeText={setAccountName} placeholderTextColor={t.mid} />
            <TextInput style={s.input} placeholder="Account number (10 digits)" keyboardType="number-pad" maxLength={10} value={accountNumber} onChangeText={(v) => setAccountNumber(v.replace(/\D/g, ''))} placeholderTextColor={t.mid} />
            <TextInput style={s.input} placeholder="Bank code (e.g. 044)" keyboardType="number-pad" value={bankCode} onChangeText={(v) => setBankCode(v.replace(/\D/g, ''))} placeholderTextColor={t.mid} />
            <Button label="Save account" onPress={save} busy={busy} />
            <Mono style={{ color: t.mid, marginTop: 10 }}>STORED ENCRYPTED · ONLY THE LAST 4 DIGITS ARE SHOWN</Mono>
          </View>
        )}
      </Card>

      {isRider && <><PressableScale onPress={() => navigation.navigate('Kyc')} style={s.link}><Mono style={{ color: t.ink }}>VERIFICATION (KYC)</Mono></PressableScale><Spacer h={8} /></>}
      <PressableScale onPress={() => navigation.navigate('Wallet')} style={s.link}><Mono style={{ color: t.ink }}>WALLET & EARNINGS</Mono></PressableScale>

      <Spacer h={16} />
      <Card>
        <Mono>SESSION</Mono>
        <Text style={{ fontSize: 13, color: t.ink2, marginVertical: 8 }}>You stay signed in on this device until you log out.</Text>
        <Button label="Log out" variant="ghost" onPress={logout} />
      </Card>
    </KeyboardScreen>
  );
}

const s = StyleSheet.create({
  avatar: { width: 48, height: 48, borderRadius: 10, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' },
  chip: { borderWidth: 1, borderColor: t.line, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: t.bg },
  input: { borderWidth: 1, borderColor: t.line, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: t.ink, backgroundColor: t.bg, marginBottom: 8 },
  link: { borderWidth: 1, borderColor: t.line, borderRadius: 8, paddingVertical: 13, alignItems: 'center', backgroundColor: t.bg },
});
