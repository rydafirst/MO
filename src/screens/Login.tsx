import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { api } from '../api';
import { setToken } from '../lib/session';
import { Button, Mono, useToast } from '../ui';
import { t } from '../theme';

type Role = 'CUSTOMER' | 'RIDER';
const COOLDOWN = 30;

export function LoginScreen({ navigation }: NativeStackScreenProps<RootStack, 'Login'>) {
  const toast = useToast();
  const [phase, setPhase] = useState<'phone' | 'code'>('phone');
  const [role, setRole] = useState<Role>('CUSTOMER');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const send = async () => {
    setBusy(true);
    try { await api.requestOtp(phone, email); setPhase('code'); setCooldown(COOLDOWN); }
    catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  const resend = async () => {
    if (cooldown > 0) return;
    try { await api.requestOtp(phone, email); setCooldown(COOLDOWN); toast('New code sent', 'success'); }
    catch (e) { toast((e as Error).message); }
  };
  const verify = async () => {
    setBusy(true);
    try {
      const tok = await api.verifyOtp(phone, code, role);
      await setToken(tok.accessToken);
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg2, padding: 24, justifyContent: 'center' }}>
      <Text style={s.wordmark}>Ryda<Text style={{ color: t.ink2, fontWeight: '400' }}>first</Text></Text>
      <Mono style={{ letterSpacing: 2, marginTop: 4, marginBottom: 24 }}>RIDERS FIRST</Mono>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
        {(['CUSTOMER', 'RIDER'] as Role[]).map((r) => (
          <Pressable key={r} onPress={() => setRole(r)} style={[s.roleBtn, { borderColor: role === r ? t.ink : t.line }]}>
            <Text style={[s.roleTxt, { color: role === r ? t.ink : t.mid }]}>{r === 'CUSTOMER' ? 'I NEED A DELIVERY' : 'I AM A RIDER'}</Text>
          </Pressable>
        ))}
      </View>

      {phase === 'phone' ? (
        <>
          <Mono>PHONE NUMBER</Mono>
          <TextInput style={s.input} value={phone} onChangeText={setPhone} placeholder="+234…" keyboardType="phone-pad" placeholderTextColor={t.mid} />
          <Mono>EMAIL</Mono>
          <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" placeholderTextColor={t.mid} />
          <Mono style={{ color: t.mid, marginBottom: 14 }}>WE&apos;LL EMAIL YOUR CODE FOR NOW</Mono>
          <Button label="Send code" onPress={send} busy={busy} />
        </>
      ) : (
        <>
          <Mono>ENTER 6-DIGIT CODE</Mono>
          <TextInput style={[s.input, s.codeInput]} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholderTextColor={t.mid} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Mono style={{ color: t.mid }}>SENT TO {email.toUpperCase()}</Mono>
            <Pressable onPress={resend} disabled={cooldown > 0}>
              <Mono style={{ color: cooldown > 0 ? t.mid : t.ink }}>{cooldown > 0 ? `RESEND IN ${cooldown}S` : 'RESEND'}</Mono>
            </Pressable>
          </View>
          <Button label={`Verify as ${role === 'RIDER' ? 'rider' : 'customer'}`} onPress={verify} busy={busy} />
          <Pressable onPress={() => setPhase('phone')} style={{ marginTop: 14, alignItems: 'center' }}>
            <Mono style={{ color: t.ink2 }}>← USE A DIFFERENT EMAIL</Mono>
          </Pressable>
        </>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wordmark: { fontSize: 32, fontWeight: '700', color: t.ink, letterSpacing: -0.5 },
  roleBtn: { flex: 1, borderWidth: 1, borderRadius: 6, paddingVertical: 11, alignItems: 'center', backgroundColor: t.bg },
  roleTxt: { fontFamily: t.mono, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: t.line, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: t.ink, backgroundColor: t.bg, marginTop: 8, marginBottom: 14 },
  codeInput: { textAlign: 'center', fontSize: 24, letterSpacing: 8, fontFamily: t.mono },
});
