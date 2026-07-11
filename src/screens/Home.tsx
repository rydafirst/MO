import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { api, naira, type Fallback, type GeoPoint, type Job, type Quote } from '../api';
import type { AppNav } from '../nav';
import { Button, Card, Field, Mono, Spacer, useToast } from '../ui';
import { t } from '../theme';

interface Place { lat: number; lng: number; label: string; area: string }
const FALL: { v: Fallback; title: string }[] = [
  { v: 'WAIT', title: 'Wait for them' }, { v: 'DELEGATE', title: 'Let someone else receive it' }, { v: 'RETURN', title: 'Return it to me' },
];

async function geocode(text: string): Promise<Place | null> {
  const res = await Location.geocodeAsync(text);
  if (!res.length) return null;
  const { latitude: lat, longitude: lng } = res[0];
  let area = '';
  try { const r = (await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }))[0]; area = [r?.city || r?.district || r?.subregion, r?.region].filter(Boolean).join(', '); } catch { /* keep */ }
  return { lat, lng, label: text, area };
}

export function HomeTab({ navigation }: { navigation: AppNav }) {
  const toast = useToast();
  const [pickupText, setPickupText] = useState('');
  const [dropoffText, setDropoffText] = useState('');
  const [pickup, setPickup] = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [instructions, setInstructions] = useState('');
  const [item, setItem] = useState('');
  const [fallback, setFallback] = useState<Fallback>('WAIT');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Job | null>(null);

  useEffect(() => { api.myJobs().then((js) => setPending(js.find((j) => j.status === 'CREATED') ?? null)).catch(() => {}); }, []);

  const useMyLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return toast('Location permission needed');
    const loc = await Location.getCurrentPositionAsync({});
    const r = (await Location.reverseGeocodeAsync(loc.coords))[0];
    const label = [r?.name || r?.street, r?.city || r?.district, r?.region].filter(Boolean).join(', ') || 'Current location';
    setPickupText(label);
    setPickup({ lat: loc.coords.latitude, lng: loc.coords.longitude, label, area: [r?.city || r?.district, r?.region].filter(Boolean).join(', ') });
  };

  const getQuote = async () => {
    if (!pickupText || !dropoffText) return toast('Enter a pickup and drop-off');
    setBusy(true);
    try {
      const p = pickup ?? (await geocode(pickupText));
      const d = await geocode(dropoffText);
      if (!p || !d) { toast('Could not find that address'); return; }
      setPickup(p); setDropoff(d);
      const pt: GeoPoint = { lat: p.lat, lng: p.lng }; const dt: GeoPoint = { lat: d.lat, lng: d.lng };
      setQuote(await api.quote({ type: 'DELIVERY', pickup: pt, dropoff: dt }));
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  const pay = async () => {
    if (!quote || !pickup || !dropoff) return;
    setBusy(true);
    try {
      const returnUrl = Linking.createURL('track'); // rydafirst://track in a standalone build
      const job = await api.createJob({
        quoteToken: quote.quoteToken, fallbackPolicy: fallback, returnUrl,
        pickupAddress: pickup.label, dropoffAddress: dropoff.label, pickupArea: pickup.area, dropoffArea: dropoff.area,
        ...(recipientName && recipientPhone ? { recipient: { name: recipientName, phone: recipientPhone } } : {}),
        ...(item ? { item } : {}), ...(instructions ? { instructions } : {}),
      });
      if (job.paymentLink) {
        // Open Flutterwave's hosted checkout in an in-app browser; it returns to our deep link
        // when payment finishes (standalone build). We then verify and fund the job.
        const res = await WebBrowser.openAuthSessionAsync(job.paymentLink, returnUrl);
        if (res.type === 'success' && res.url) {
          const q = Linking.parse(res.url).queryParams ?? {};
          const txn = q.transaction_id; const status = q.status;
          if (txn && (status === 'successful' || status === 'completed')) {
            try { await api.confirmPayment(job.id, String(txn)); } catch { /* Track polling will catch it */ }
          }
        }
      }
      navigation.navigate('Track', { jobId: job.id });
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  if (pending) {
    return (
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={s.brand}>Ryda<Text style={{ color: t.ink2, fontWeight: '400' }}>first</Text></Text>
        <Card style={{ borderColor: t.warning, marginTop: 16 }}>
          <Mono style={{ color: t.warning }}>ORDER AWAITING PAYMENT</Mono>
          <Text style={{ fontSize: 15, fontWeight: '700', marginTop: 6 }}>Finish your last order first</Text>
          <Text style={{ fontSize: 13, color: t.ink2, marginVertical: 8 }}>You have an unpaid order of {naira(pending.amountMinor)}.</Text>
          <Button label="View order" variant="ghost" onPress={() => navigation.navigate('Track', { jobId: pending.id })} />
          <Spacer h={8} />
          <Button label="Cancel it" variant="ghost" onPress={async () => { try { await api.cancelJob(pending.id); setPending(null); } catch (e) { toast((e as Error).message); } }} />
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={s.brand}>Ryda<Text style={{ color: t.ink2, fontWeight: '400' }}>first</Text></Text>
      <Spacer h={16} />
      <Field label="Pickup">
        <TextInput style={s.input} value={pickupText} onChangeText={(v) => { setPickupText(v); setPickup(null); setQuote(null); }} placeholder="Search pickup address" placeholderTextColor={t.mid} />
        <Mono style={{ color: t.ink, marginTop: 6 }} onPress={useMyLocation}>USE MY LOCATION</Mono>
      </Field>
      <Field label="Drop-off"><TextInput style={s.input} value={dropoffText} onChangeText={(v) => { setDropoffText(v); setDropoff(null); setQuote(null); }} placeholder="Search drop-off address" placeholderTextColor={t.mid} /></Field>
      <Field label="What are you sending?"><TextInput style={s.input} value={item} onChangeText={setItem} placeholder="e.g. documents, phone" placeholderTextColor={t.mid} /></Field>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Field label="Recipient name"><TextInput style={s.input} value={recipientName} onChangeText={setRecipientName} placeholderTextColor={t.mid} /></Field></View>
        <View style={{ flex: 1 }}><Field label="Recipient phone"><TextInput style={s.input} value={recipientPhone} onChangeText={setRecipientPhone} placeholder="+234…" keyboardType="phone-pad" placeholderTextColor={t.mid} /></Field></View>
      </View>
      <Field label="Notes for the rider (optional)"><TextInput style={s.input} value={instructions} onChangeText={setInstructions} placeholder="e.g. call on arrival, gate code 1234" placeholderTextColor={t.mid} /></Field>
      <Field label="If receiver unavailable">
        <View style={{ gap: 6 }}>
          {FALL.map((f) => (
            <Mono key={f.v} onPress={() => setFallback(f.v)} style={{ color: fallback === f.v ? t.ink : t.mid, fontSize: 13, paddingVertical: 4 }}>
              {fallback === f.v ? '● ' : '○ '}{f.title}
            </Mono>
          ))}
        </View>
      </Field>

      <Button label="Get quote" onPress={getQuote} busy={busy} />
      {quote && (
        <Card style={{ marginTop: 16 }}>
          <Row label="Base" value={naira(quote.breakdown.baseMinor)} />
          <Row label="Distance" value={naira(quote.breakdown.distanceMinor)} />
          <Row label="Platform fee" value={naira(quote.breakdown.platformFeeMinor)} />
          <View style={{ height: 1, backgroundColor: t.line, marginVertical: 8 }} />
          <Row label="Total" value={naira(quote.breakdown.totalMinor)} strong />
          <Spacer h={12} />
          <Button label="Pay & hold in escrow" onPress={pay} busy={busy} />
          <Mono style={{ textAlign: 'center', marginTop: 8, color: t.ink2 }}>HELD SAFELY UNTIL DELIVERY IS CONFIRMED</Mono>
        </Card>
      )}
    </ScrollView>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text style={{ color: t.ink2, fontSize: 13 }}>{label}</Text>
      <Text style={{ fontFamily: t.mono, fontSize: strong ? 15 : 13, fontWeight: strong ? '700' : '400' }}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  brand: { fontSize: 20, fontWeight: '700', color: t.ink, letterSpacing: -0.5 },
  input: { borderWidth: 1, borderColor: t.line, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: t.ink, backgroundColor: t.bg },
});
