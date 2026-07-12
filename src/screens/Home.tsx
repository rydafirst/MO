import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { api, naira, type Fallback, type GeoPoint, type Job, type JobType, type Quote } from '../api';
import type { AppNav } from '../nav';
import { AddressField, type Place } from '../components/AddressField';
import { MapPreview } from '../components/MapPreview';
import { Button, Card, Divider, Field, Input, KeyboardScreen, Mono, Segmented, Spacer, useToast } from '../ui';
import { t } from '../theme';

// Plain-language explanation of each "receiver unavailable" choice — identical to web.
const FALLBACK_OPTIONS: { value: Fallback; title: string; desc: string }[] = [
  { value: 'WAIT', title: 'Wait for them', desc: 'The rider waits 10 minutes free. After that a small waiting fee applies (₦50/min, max ₦1,000). Best if the receiver is just running late.' },
  { value: 'DELEGATE', title: 'Let someone else receive it', desc: 'If your receiver isn’t there, anyone present (a colleague, neighbour, security) can accept it with the code. The delivery still completes.' },
  { value: 'RETURN', title: 'Return it to me', desc: 'If no one can receive it, the rider brings the parcel back to you. The delivery is marked failed and you’re refunded, minus the rider’s trip.' },
];

export function HomeTab({ navigation }: { navigation: AppNav }) {
  const toast = useToast();
  const scrollRef = useRef<ScrollView>(null);
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
  const [showFallback, setShowFallback] = useState(false);
  const [fallbackAck, setFallbackAck] = useState(false); // only prompt once per session
  const isDelivery = type === 'DELIVERY';

  useEffect(() => { api.myJobs().then((js) => setPending(js.find((j) => j.status === 'CREATED') ?? null)).catch(() => {}); }, []);

  const getQuote = () => {
    if (!pickup || !dropoff) return toast('Enter a pickup and drop-off');
    // For deliveries, explain the "receiver unavailable" choice once before quoting.
    if (isDelivery && !fallbackAck) { setShowFallback(true); return; }
    void fetchQuote();
  };

  const fetchQuote = async () => {
    if (!pickup || !dropoff) return;
    setBusy(true);
    try {
      const pt: GeoPoint = { lat: pickup.lat, lng: pickup.lng };
      const dt: GeoPoint = { lat: dropoff.lat, lng: dropoff.lng };
      setQuote(await api.quote({ type, pickup: pt, dropoff: dt }));
      // Auto-scroll to the price breakdown as soon as it's ready (matches web).
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  const confirmFallback = () => { setFallbackAck(true); setShowFallback(false); void fetchQuote(); };

  const pay = async () => {
    if (!quote || !pickup || !dropoff) return;
    setBusy(true);
    try {
      const returnUrl = Linking.createURL('track');
      const job = await api.createJob({
        quoteToken: quote.quoteToken, fallbackPolicy: fallback, returnUrl,
        // Only send optional fields when they actually have a value — the server rejects empty strings.
        ...(pickup.label ? { pickupAddress: pickup.label } : {}),
        ...(dropoff.label ? { dropoffAddress: dropoff.label } : {}),
        ...(pickup.area ? { pickupArea: pickup.area } : {}),
        ...(dropoff.area ? { dropoffArea: dropoff.area } : {}),
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
          <Text style={{ fontSize: 13, color: t.ink2, marginVertical: 8, lineHeight: 19 }}>You have an unpaid order of {naira(pending.amountMinor)}. Complete or cancel it before booking a new one.</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button label="View order" variant="ghost" onPress={() => navigation.navigate('Track', { jobId: pending.id })} /></View>
            <View style={{ flex: 1 }}><Button label="Cancel it" variant="ghost" onPress={async () => { try { await api.cancelJob(pending.id); setPending(null); } catch (e) { toast((e as Error).message); } }} /></View>
          </View>
        </Card>
      </KeyboardScreen>
    );
  }

  return (
    <>
      <KeyboardScreen scrollRef={scrollRef} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
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
                {FALLBACK_OPTIONS.map((f) => (
                  <Mono key={f.value} onPress={() => setFallback(f.value)} style={{ color: fallback === f.value ? t.ink : t.mid, fontSize: 13, paddingVertical: 4 }}>
                    {fallback === f.value ? '● ' : '○ '}{f.title}
                  </Mono>
                ))}
              </View>
              <Mono onPress={() => setShowFallback(true)} style={{ color: t.ink2, marginTop: 6 }}>WHAT DO THESE MEAN? →</Mono>
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

      {/* Explainer sheet for the "receiver unavailable" choice, shown on first Get quote. */}
      <Modal visible={showFallback} transparent animationType="slide" onRequestClose={confirmFallback}>
        <Pressable style={ms.overlay} onPress={confirmFallback}>
          <Pressable style={ms.sheet} onPress={() => {}}>
            <Text style={{ fontSize: 17, fontWeight: '700' }}>If your receiver isn’t available</Text>
            <Text style={{ fontSize: 13, color: t.ink2, marginTop: 4, marginBottom: 14 }}>Pick what the rider should do. You can change this any time before paying.</Text>
            {FALLBACK_OPTIONS.map((o) => {
              const active = fallback === o.value;
              return (
                <Pressable key={o.value} onPress={() => setFallback(o.value)} style={[ms.opt, { borderColor: active ? t.ink : t.line, backgroundColor: active ? t.bg2 : t.bg }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 4, borderColor: active ? t.primary : t.line }} />
                    <Text style={{ fontSize: 14, fontWeight: '700' }}>{o.title}</Text>
                  </View>
                  <Text style={{ fontSize: 12.5, color: t.ink2, marginLeft: 24, lineHeight: 18 }}>{o.desc}</Text>
                </Pressable>
              );
            })}
            <Spacer h={6} />
            <Button label="Continue" onPress={confirmFallback} />
            <Mono onPress={confirmFallback} style={{ textAlign: 'center', color: t.ink2, marginTop: 12 }}>
              SKIP — USE “{FALLBACK_OPTIONS.find((o) => o.value === fallback)?.title.toUpperCase()}”
            </Mono>
          </Pressable>
        </Pressable>
      </Modal>
    </>
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
const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(17,17,17,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: t.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: '86%' },
  opt: { borderWidth: 1, borderRadius: 8, padding: 14, marginBottom: 10 },
});
