import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { api, naira, type Fallback, type GeoPoint, type Job, type JobType, type Quote } from '../api';
import type { AppNav } from '../nav';
import { AddressField, type Place } from '../components/AddressField';
import { MapPreview } from '../components/MapPreview';
import { Button, Card, Divider, Field, Input, KeyboardScreen, Mono, Segmented, Spacer, useToast } from '../ui';
import { t } from '../theme';

const FALL: { v: Fallback; title: string }[] = [
  { v: 'WAIT', title: 'Wait for them' },
  { v: 'DELEGATE', title: 'Let someone else receive it' },
  { v: 'RETURN', title: 'Return it to me' },
];

export function HomeTab({ navigation }: { navigation: AppNav }) {
  const toast = useToast();
  const [type, setType] = useState<JobType>('DELIVERY');
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
  const isDelivery = type === 'DELIVERY';

  useEffect(() => { api.myJobs().then((js) => setPending(js.find((j) => j.status === 'CREATED') ?? null)).catch(() => {}); }, []);

  const getQuote = async () => {
    if (!pickup || !dropoff) return toast('Enter a pickup and drop-off');
    setBusy(true);
    try {
      const pt: GeoPoint = { lat: pickup.lat, lng: pickup.lng };
      const dt: GeoPoint = { lat: dropoff.lat, lng: dropoff.lng };
      setQuote(await api.quote({ type, pickup: pt, dropoff: dt }));
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  const pay = async () => {
    if (!quote || !pickup || !dropoff) return;
    setBusy(true);
    try {
      const returnUrl = Linking.createURL('track');
      const job = await api.createJob({
        quoteToken: quote.quoteToken, fallbackPolicy: fallback, returnUrl,
        pickupAddress: pickup.label, dropoffAddress: dropoff.label, pickupArea: pickup.area, dropoffArea: dropoff.area,
        ...(isDelivery && recipientName && recipientPhone ? { recipient: { name: recipientName, phone: recipientPhone } } : {}),
        ...(isDelivery && item ? { item } : {}), ...(isDelivery && instructions ? { instructions } : {}),
      });
      if (job.paymentLink) {
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
      <KeyboardScreen contentContainerStyle={{ padding: 20 }}>
        <Wordmark />
        <Card style={{ borderColor: t.warning, marginTop: 16 }}>
          <Mono style={{ color: t.warning, fontSize: 10 }}>ORDER AWAITING PAYMENT</Mono>
          <Text style={{ fontSize: 15, fontWeight: '700', marginTop: 6 }}>Finish your last order first</Text>
          <Text style={{ fontSize: 13, color: t.ink2, marginVertical: 8, lineHeight: 19 }}>You have an unpaid order of {naira(pending.amountMinor)}.</Text>
          <Button label="View order" variant="ghost" onPress={() => navigation.navigate('Track', { jobId: pending.id })} />
          <Spacer h={8} />
          <Button label="Cancel it" variant="ghost" onPress={async () => { try { await api.cancelJob(pending.id); setPending(null); } catch (e) { toast((e as Error).message); } }} />
        </Card>
      </KeyboardScreen>
    );
  }

  return (
    <KeyboardScreen contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Wordmark />
      <Spacer h={16} />

      <Segmented
        options={[{ value: 'DELIVERY', label: 'Delivery' }, { value: 'RIDE', label: 'Ride' }]}
        value={type}
        onChange={(v) => { setType(v); setQuote(null); }}
      />

      <MapPreview pickup={pickup} dropoff={dropoff} />

      <AddressField label={isDelivery ? 'PICKUP' : 'FROM'} onSelect={(p) => { setPickup(p); setQuote(null); }} />
      <AddressField label={isDelivery ? 'DROP-OFF' : 'TO'} onSelect={(p) => { setDropoff(p); setQuote(null); }} />

      {isDelivery && (
        <>
          <Field label="What are you sending?"><Input value={item} onChangeText={setItem} placeholder="e.g. documents, phone" /></Field>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Field label="Recipient name"><Input value={recipientName} onChangeText={setRecipientName} /></Field></View>
            <View style={{ flex: 1 }}><Field label="Recipient phone"><Input value={recipientPhone} onChangeText={setRecipientPhone} placeholder="+234…" keyboardType="phone-pad" /></Field></View>
          </View>
          <Field label="Notes for the rider (optional)"><Input value={instructions} onChangeText={setInstructions} placeholder="e.g. call on arrival, gate code 1234" /></Field>
          <Field label="If receiver unavailable">
            <View style={{ gap: 6 }}>
              {FALL.map((f) => (
                <Mono key={f.v} onPress={() => setFallback(f.v)} style={{ color: fallback === f.v ? t.ink : t.mid, fontSize: 13, paddingVertical: 4 }}>
                  {fallback === f.v ? '● ' : '○ '}{f.title}
                </Mono>
              ))}
            </View>
          </Field>
        </>
      )}

      <Spacer h={4} />
      <Button label="Get quote" onPress={getQuote} busy={busy} />

      {quote && (
        <Card style={{ marginTop: 16 }}>
          <Row label="Base" value={naira(quote.breakdown.baseMinor)} />
          <Row label="Distance" value={naira(quote.breakdown.distanceMinor)} />
          <Row label="Platform fee" value={naira(quote.breakdown.platformFeeMinor)} />
          <Divider />
          <Row label="Total" value={naira(quote.breakdown.totalMinor)} strong />
          <Spacer h={12} />
          <Button label="Pay & hold in escrow" onPress={pay} busy={busy} />
          <Mono style={{ textAlign: 'center', marginTop: 8, color: t.ink2, fontSize: 10 }}>HELD SAFELY UNTIL DELIVERY IS CONFIRMED</Mono>
        </Card>
      )}
    </KeyboardScreen>
  );
}

function Wordmark() {
  return <Text style={s.brand}>Ryda<Text style={{ color: t.ink2, fontWeight: '400' }}>first</Text></Text>;
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
});
