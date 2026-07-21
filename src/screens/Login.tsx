import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { api } from '../api';
import { setToken } from '../lib/session';
import { registerForPush } from '../lib/push';
import { Button, Input, KeyboardScreen, Mono, Segmented } from '../ui';
import { t } from '../theme';

type Role = 'CUSTOMER' | 'RIDER';
type Mode = 'signin' | 'signup';
const RESEND_COOLDOWN = 30; // seconds between code requests (UX guard on top of the server rate limit)

export function LoginScreen({ navigation }: NativeStackScreenProps<RootStack, 'Login'>) {
  const [mode, setMode] = useState<Mode>('signin');
  const [phase, setPhase] = useState<'phone' | 'code'>('phone');
  const [role, setRole] = useState<Role>('CUSTOMER');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const isSignup = mode === 'signup';

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next); setPhase('phone'); setCode(''); setErr(null); setNote(null);
  };

  const sendOtp = async () => {
    setErr(null); setNote(null);
    // On sign-up we must capture a name so the customer/rider has an identity in the app.
    if (isSignup && name.trim().length < 2) { setErr('Please enter your name'); return; }
    setBusy(true);
    try { await api.requestOtp(phone, email, isSignup ? name.trim() : undefined); setPhase('code'); setCooldown(RESEND_COOLDOWN); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const resend = async () => {
    if (cooldown > 0 || busy) return;
    setErr(null); setNote(null); setBusy(true);
    try { await api.requestOtp(phone, email, isSignup ? name.trim() : undefined); setNote(`New code sent to ${email}`); setCooldown(RESEND_COOLDOWN); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const verify = async () => {
    setErr(null); setNote(null); setBusy(true);
    try {
      const tok = await api.verifyOtp(phone, code, role);
      await setToken(tok.accessToken);
      void registerForPush(); // ask for push permission + register this device (best-effort)
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg2 }} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardScreen contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-start', padding: 24, paddingTop: 48, paddingBottom: 48 }}>
        <Text style={sx.h1}>Ryda<Text style={{ fontWeight: '400', color: t.ink2 }}>first</Text></Text>
        <Mono style={{ letterSpacing: 1, marginBottom: 24 }}>RIDERS FIRST</Mono>

        <View style={{ marginBottom: 12 }}>
          <Segmented
            options={[{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Create account' }]}
            value={mode}
            onChange={switchMode}
          />
        </View>

        <Segmented
          options={[{ value: 'CUSTOMER', label: 'I need a delivery' }, { value: 'RIDER', label: 'I am a rider' }]}
          value={role}
          onChange={setRole}
        />

        {phase === 'phone' ? (
          <>
            {isSignup ? (
              <>
                <Mono style={{ fontSize: t.size.caption, marginBottom: 8 }}>FULL NAME</Mono>
                <Input value={name} onChangeText={setName} placeholder="e.g. Chidi Okafor" autoCapitalize="words" style={{ marginBottom: 16 }} />
              </>
            ) : null}
            <Mono style={{ fontSize: t.size.caption, marginBottom: 8 }}>PHONE NUMBER</Mono>
            <Input value={phone} onChangeText={setPhone} placeholder="+234…" keyboardType="phone-pad" style={{ marginBottom: 16 }} />
            <Mono style={{ fontSize: t.size.caption, marginBottom: 8 }}>EMAIL</Mono>
            <Input value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" style={{ marginBottom: 6 }} />
            <Mono style={{ fontSize: t.size.caption, color: t.mid, marginBottom: 16 }}>WE&apos;LL EMAIL YOUR CODE FOR NOW</Mono>
            <Button label={busy ? 'Sending…' : isSignup ? 'Create account' : 'Send code'} onPress={sendOtp} busy={busy} />
            {isSignup ? (
              <Text style={{ fontSize: t.size.caption, color: t.ink2, lineHeight: 19, marginTop: 14, textAlign: 'center' }}>
                By creating an account you agree to our{' '}
                <Text style={{ color: t.ink, textDecorationLine: 'underline' }} onPress={() => navigation.navigate('Legal', { doc: 'terms' })}>Terms of Use</Text>
                {' '}and{' '}
                <Text style={{ color: t.ink, textDecorationLine: 'underline' }} onPress={() => navigation.navigate('Legal', { doc: 'privacy' })}>Privacy Policy</Text>.
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <Mono style={{ fontSize: t.size.caption, marginBottom: 8 }}>ENTER 6-DIGIT CODE</Mono>
            <Input value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} style={{ marginBottom: 10, textAlign: 'center', fontSize: t.size.heading, letterSpacing: 6, fontFamily: t.mono }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Mono style={{ fontSize: t.size.caption, color: t.mid }}>SENT TO {email.toUpperCase()}</Mono>
              <Mono onPress={resend} style={{ fontSize: t.size.caption, color: cooldown > 0 || busy ? t.mid : t.ink }}>{cooldown > 0 ? `RESEND IN ${cooldown}S` : 'RESEND CODE'}</Mono>
            </View>
            <Button label={busy ? 'Working…' : `Verify as ${role === 'RIDER' ? 'rider' : 'customer'}`} onPress={verify} busy={busy} />
            <Mono onPress={() => { setPhase('phone'); setCode(''); setErr(null); setNote(null); }} style={{ marginTop: 12, color: t.ink2 }}>← USE A DIFFERENT EMAIL</Mono>
          </>
        )}

        {note ? <Text style={{ color: t.success, fontSize: t.size.small, marginTop: 8 }}>{note}</Text> : null}
        {err ? <Text style={{ color: t.danger, fontSize: t.size.small, marginTop: 8 }}>{err}</Text> : null}
      </KeyboardScreen>
    </SafeAreaView>
  );
}

const sx = StyleSheet.create({
  h1: { fontSize: t.size.display, fontWeight: '700', color: t.ink, letterSpacing: -0.6 },
});
