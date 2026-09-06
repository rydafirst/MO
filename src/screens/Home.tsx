import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { api, naira, type ExtraStopDto, type Fallback, type GeoPoint, type Job, type JobType, type Quote } from '../api';
import type { AppNav } from '../nav';
import { AddressField, type Place } from '../components/AddressField';
import { AppHeader } from '../components/AppHeader';
import { MapPreview } from '../components/MapPreview';
import { Button, Card, Divider, Field, Input, KeyboardScreen, Mono, PressableScale, Segmented, Spacer, useToast } from '../ui';
import { t } from '../theme';

// #0 DIRECT DELIVERY: the forced Wait/Delegate/Return machinery is disabled for launch — deliveries
// are now plain direct trips. Kept (commented) so the fallback flow can be switched back on later.
// Plain-language explanation of each "receiver unavailable" choice — identical to web.
// const FALLBACK_OPTIONS: { value: Fallback; title: string; desc: string }[] = [
//   { value: 'WAIT', title: 'Wait for them', desc: 'The rider waits 10 minutes free. After that a small waiting fee applies (₦50/min, max ₦1,000). Best if the receiver is just running late.' },
//   { value: 'DELEGATE', title: 'Let someone else receive it', desc: 'If your receiver isn’t there, anyone present (a colleague, neighbour, security) can accept it with the code. The delivery still completes.' },
//   { value: 'RETURN', title: 'Return it to me', desc: 'If no one can receive it, the rider brings the parcel back to you. Adds a refundable return deposit (75% of the fare) — refunded in full if the delivery completes, or used to pay the rider for the return trip.' },
// ];

// #4 MULTI-STOP: at most 8 EXTRA drop-offs after the primary one (mirrors the server cap).
const MAX_EXTRA_STOPS = 8;
// A single extra drop-off being drafted in the booking form.
interface StopDraft { place: Place | null; recipientName: string; recipientPhone: string; item: string }

export function HomeTab({ navigation }: { navigation: AppNav }) {
  const toast = useToast();
  const scrollRef = useRef<ScrollView>(null);
  const pickupY = useRef(0);
  const dropoffY = useRef(0);
  // When an address field is focused, lift it toward the top so the autocomplete dropdown is
  // visible above the keyboard. Delay lets the keyboard begin opening first.
  const scrollToField = (yRef: React.MutableRefObject<number>) =>
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, yRef.current - 12), animated: true }), 300);
  const [type, setType] = useState<JobType>('DELIVERY');
  const [marketplaceOn, setMarketplaceOn] = useState(false); // hidden until public config confirms it
  useEffect(() => { api.publicConfig().then((c) => setMarketplaceOn(c.marketplaceEnabled)).catch(() => {}); }, []);
  const [pickup, setPickup] = useState<Place | null>(null);
  const [locateSignal, setLocateSignal] = useState(0);
  // Ask the OS for location on open (no in-app card): requestForegroundPermissionsAsync shows the system
  // prompt the first time and silently returns the stored decision afterwards, so this can run every mount
  // without nagging. If granted, autofill the pickup from the current position.
  useEffect(() => {
    Location.requestForegroundPermissionsAsync()
      .then((p) => { if (p.granted) setLocateSignal((n) => n + 1); })
      .catch(() => {});
  }, []);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [instructions, setInstructions] = useState('');
  const [item, setItem] = useState('');
  const [weight, setWeight] = useState('');
  const [customerName, setCustomerName] = useState('');
  // #4 MULTI-STOP: ordered EXTRA drop-offs added AFTER the primary drop-off. Each carries its own
  // address (a Place), optional recipient name/phone, and optional item. Up to 8 extra stops.
  const [extraStops, setExtraStops] = useState<StopDraft[]>([]);
  // After a successful booking with extra stops, the created-job response returns each stop's
  // single-use code ONCE — shown here so the customer can share them before we move to tracking.
  const [stopCodes, setStopCodes] = useState<{ jobId: string; codes: string[] } | null>(null);
  const addStop = () => {
    if (extraStops.length >= MAX_EXTRA_STOPS) return;
    setExtraStops((s) => [...s, { place: null, recipientName: '', recipientPhone: '', item: '' }]);
    setQuote(null);
  };
  const removeStop = (i: number) => { setExtraStops((s) => s.filter((_, idx) => idx !== i)); setQuote(null); };
  const patchStop = (i: number, patch: Partial<StopDraft>) => setExtraStops((s) => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)));
  // #0 DIRECT DELIVERY: fallback choice + first-run explainer modal are disabled for launch.
  // const [fallback, setFallback] = useState<Fallback>('WAIT');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Job | null>(null);
  // const [showFallback, setShowFallback] = useState(false);
  // const [fallbackAck, setFallbackAck] = useState(false); // only prompt once per session
  const isDelivery = type === 'DELIVERY';

  useEffect(() => { api.myJobs().then((js) => setPending(js.find((j) => j.status === 'CREATED') ?? null)).catch(() => {}); }, []);

  const getQuote = () => {
    // #2 COMING SOON: rides can't be quoted — the Ride tab shows a Coming Soon card instead of a form.
    if (!isDelivery) return;
    if (!pickup || !dropoff) return toast('Enter a pickup and drop-off');
    // #4 MULTI-STOP: every added stop must have an address before we can price the route.
    if (extraStops.some((s) => !s.place)) return toast('Enter an address for each added stop');
    // #0 DIRECT DELIVERY: no more "receiver unavailable" explainer before quoting — go straight to the quote.
    // if (isDelivery && !fallbackAck) { setShowFallback(true); return; }
    void fetchQuote();
  };

  const fetchQuote = async () => {
    if (!pickup || !dropoff) return;
    setBusy(true);
    try {
      const pt: GeoPoint = { lat: pickup.lat, lng: pickup.lng };
      const dt: GeoPoint = { lat: dropoff.lat, lng: dropoff.lng };
      // #4 MULTI-STOP: ordered EXTRA drop-off points AFTER the primary drop-off (same order as the UI).
      const stopPts: GeoPoint[] = extraStops.flatMap((s) => (s.place ? [{ lat: s.place.lat, lng: s.place.lng }] : []));
      setQuote(await api.quote({ type, pickup: pt, dropoff: dt, ...(stopPts.length ? { stops: stopPts } : {}) }));
      // Auto-scroll to the price breakdown as soon as it's ready (matches web).
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  // #0 DIRECT DELIVERY: the fallback explainer modal is gone, so this confirm handler is no longer used.
  // const confirmFallback = () => { setFallbackAck(true); setShowFallback(false); void fetchQuote(); };

  const pay = async () => {
    // #2 COMING SOON: guard — rides never reach a paid booking.
    if (!isDelivery) return;
    if (!quote || !pickup || !dropoff) return;
    setBusy(true);
    try {
      const returnUrl = Linking.createURL('track');
      // #4 MULTI-STOP: per-stop metadata in the SAME order & count as the quote `stops`. The geo points
      // come from the signed quote, so here we only carry labels/recipient/item.
      const extraStopDtos: ExtraStopDto[] = extraStops.map((s) => ({
        ...(s.place?.label ? { address: s.place.label } : {}),
        ...(s.place?.area ? { area: s.place.area } : {}),
        ...(s.recipientName.trim() && s.recipientPhone.trim() ? { recipient: { name: s.recipientName.trim(), phone: s.recipientPhone.trim() } } : {}),
        ...(s.item.trim() ? { item: s.item.trim() } : {}),
      }));
      const job = await api.createJob({
        // #0 DIRECT DELIVERY: no longer send `fallbackPolicy` — backend defaults to direct mode.
        quoteToken: quote.quoteToken, returnUrl,
        // Only send optional fields when they actually have a value — the server rejects empty strings.
        ...(pickup.label ? { pickupAddress: pickup.label } : {}),
        ...(dropoff.label ? { dropoffAddress: dropoff.label } : {}),
        ...(pickup.area ? { pickupArea: pickup.area } : {}),
        ...(dropoff.area ? { dropoffArea: dropoff.area } : {}),
        ...(isDelivery && recipientName && recipientPhone ? { recipient: { name: recipientName, phone: recipientPhone } } : {}),
        ...(isDelivery && item ? { item } : {}), ...(isDelivery && instructions ? { instructions } : {}),
        ...(isDelivery && Number(weight) > 0 ? { weightKg: Number(weight) } : {}),
        ...(isDelivery && customerName.trim() ? { customerName: customerName.trim() } : {}),
        ...(isDelivery && extraStopDtos.length ? { extraStops: extraStopDtos } : {}),
      });
      // Open the Flutterwave hosted checkout in a stable in-app Safari view. (The ASWebAuthenticationSession
      // API crashes on this device, so we avoid it.) When Flutterwave redirects back to our deep link on
      // success, auto-close the browser and confirm the payment — so the customer doesn't have to tap Close.
      const link = job.paymentLink;
      if (link && /^https?:\/\//i.test(link)) {
        const sub = Linking.addEventListener('url', async ({ url }) => {
          const q = Linking.parse(url).queryParams ?? {};
          const txn = q.transaction_id;
          const status = q.status;
          if (txn && (!status || status === 'successful' || status === 'completed')) {
            try { await api.confirmPayment(job.id, String(txn)); } catch { /* Track polling will catch it */ }
          }
          WebBrowser.dismissBrowser(); // close the checkout and return to the app
        });
        try { await WebBrowser.openBrowserAsync(link); } finally { sub.remove(); }
      }
      // #4 MULTI-STOP: surface each extra stop's single-use code once (returned only here) so the
      // customer can share them, then continue to tracking. Single-stop bookings go straight through.
      if (job.extraStopCodes && job.extraStopCodes.length) {
        setStopCodes({ jobId: job.id, codes: job.extraStopCodes });
      } else {
        navigation.navigate('Track', { jobId: job.id });
      }
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  if (pending) {
    return (
      <KeyboardScreen contentContainerStyle={{ padding: 20 }}>
        <AppHeader navigation={navigation} />
        <Card style={{ borderColor: t.warning, marginTop: 16 }}>
          <Mono style={{ color: t.warning, fontSize: t.size.caption }}>ORDER AWAITING PAYMENT</Mono>
          <Text style={{ fontSize: t.size.body, fontWeight: '700', marginTop: 6 }}>Finish your last order first</Text>
          <Text style={{ fontSize: t.size.small, color: t.ink2, marginVertical: 8, lineHeight: 19 }}>You have an unpaid order of {naira(pending.amountMinor)}. Complete or cancel it before booking a new one.</Text>
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
        <AppHeader navigation={navigation} />
        <Spacer h={16} />

        <Segmented
          options={[{ value: 'DELIVERY', label: 'Delivery' }, { value: 'RIDE', label: 'Ride' }]}
          value={type}
          onChange={(v) => { setType(v); setQuote(null); }}
        />

        {/* ERRAND ("buy-for-me"): a distinct flow — a rider buys something for you and delivers it. */}
        <PressableScale onPress={() => navigation.navigate('ErrandBook')}
          style={{ marginTop: 12, borderWidth: 1, borderColor: t.line, borderRadius: t.radius.lg, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.bg }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 18 }}>🛍️</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: t.size.body, fontWeight: '700', color: t.ink }}>Send an errand</Text>
            <Text style={{ fontSize: t.size.small, color: t.ink2, marginTop: 1 }}>Need something bought and delivered? Tap here.</Text>
          </View>
          <Mono style={{ color: t.mid }}>→</Mono>
        </PressableScale>

        {/* MARKETPLACE: browse/sell entry points — hidden while the marketplace master switch is off. */}
        {marketplaceOn ? (<>
        <PressableScale onPress={() => navigation.navigate('Shop')}
          style={{ marginTop: 12, borderWidth: 1, borderColor: t.line, borderRadius: t.radius.lg, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.bg }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 18 }}>🛒</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: t.size.body, fontWeight: '700', color: t.ink }}>Shop from vendors</Text>
            <Text style={{ fontSize: t.size.small, color: t.ink2, marginTop: 1 }}>Order products and we deliver them to you.</Text>
          </View>
          <Mono style={{ color: t.mid }}>→</Mono>
        </PressableScale>

        {/* MARKETPLACE: become a vendor / manage your shop. */}
        <PressableScale onPress={() => navigation.navigate('Vendor')}
          style={{ marginTop: 12, borderWidth: 1, borderColor: t.line, borderRadius: t.radius.lg, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.bg }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 18 }}>🏪</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: t.size.body, fontWeight: '700', color: t.ink }}>Sell on Rydafirst</Text>
            <Text style={{ fontSize: t.size.small, color: t.ink2, marginTop: 1 }}>Register your shop and list your products.</Text>
          </View>
          <Mono style={{ color: t.mid }}>→</Mono>
        </PressableScale>
        </>) : null}

        {/* #2 COMING SOON: Rydafirst is licensed as a courier, not a ride-hailing operator, so the Ride
            tab shows an on-brand Coming Soon state instead of a booking form. Delivery stays fully active. */}
        {!isDelivery ? (
          <RideComingSoon />
        ) : (
        <>
        <Spacer h={14} />
        <MapPreview pickup={pickup} dropoff={dropoff} />
        <Spacer h={14} />

        <View onLayout={(e) => { pickupY.current = e.nativeEvent.layout.y; }}>
          <AddressField label={isDelivery ? 'PICKUP' : 'FROM'} autoLocate={locateSignal} onFocus={() => scrollToField(pickupY)} onSelect={(p) => { setPickup(p); setQuote(null); }} />
        </View>
        <View onLayout={(e) => { dropoffY.current = e.nativeEvent.layout.y; }}>
          <AddressField label={isDelivery ? 'DROP-OFF' : 'TO'} onFocus={() => scrollToField(dropoffY)} onSelect={(p) => { setDropoff(p); setQuote(null); }} />
        </View>

        {/* #4 MULTI-STOP: ordered EXTRA drop-offs (the primary drop-off above is stop 1). Each is a full
            AddressField plus optional recipient + item, priced into the same quote and booking. */}
        {isDelivery && (
          <>
            {extraStops.map((s, i) => (
              <View key={i} style={{ marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: 6 }}>
                  <Mono style={{ color: t.ink, letterSpacing: 0.7 }}>STOP {i + 2}</Mono>
                  <PressableScale onPress={() => removeStop(i)} style={{ paddingVertical: 3, paddingHorizontal: 8 }}>
                    <Mono style={{ color: t.danger }}>REMOVE ✕</Mono>
                  </PressableScale>
                </View>
                <AddressField label={`STOP ${i + 2} DROP-OFF`} onSelect={(p) => { patchStop(i, { place: p }); setQuote(null); }} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}><Field label="Recipient name"><Input value={s.recipientName} onChangeText={(v) => patchStop(i, { recipientName: v })} /></Field></View>
                  <View style={{ flex: 1 }}><Field label="Recipient phone"><Input value={s.recipientPhone} onChangeText={(v) => patchStop(i, { recipientPhone: v })} placeholder="+234…" keyboardType="phone-pad" /></Field></View>
                </View>
                <Field label="What are you sending? (optional)"><Input value={s.item} onChangeText={(v) => patchStop(i, { item: v })} placeholder="e.g. documents" /></Field>
              </View>
            ))}
            {extraStops.length < MAX_EXTRA_STOPS && (
              <PressableScale onPress={addStop} style={{ borderWidth: 1, borderColor: t.line, borderRadius: t.radius.md, borderStyle: 'dashed', paddingVertical: 12, alignItems: 'center', marginBottom: 12, backgroundColor: t.bg }}>
                <Mono style={{ color: t.ink }}>+ ADD ANOTHER STOP</Mono>
              </PressableScale>
            )}
          </>
        )}

        {isDelivery && (
          <>
            <Field label="Your name"><Input value={customerName} onChangeText={setCustomerName} placeholder="Shown to your rider" /></Field>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 2 }}><Field label="What are you sending?"><Input value={item} onChangeText={setItem} placeholder="e.g. documents, phone" /></Field></View>
              <View style={{ flex: 1 }}><Field label="Weight (kg)"><Input value={weight} onChangeText={setWeight} placeholder="e.g. 2" keyboardType="decimal-pad" /></Field></View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Field label="Recipient name"><Input value={recipientName} onChangeText={setRecipientName} /></Field></View>
              <View style={{ flex: 1 }}><Field label="Recipient phone"><Input value={recipientPhone} onChangeText={setRecipientPhone} placeholder="+234…" keyboardType="phone-pad" /></Field></View>
            </View>
            <Field label="Notes for the rider (optional)"><Input value={instructions} onChangeText={setInstructions} placeholder="e.g. call on arrival, gate code 1234" /></Field>
            {/* #0 DIRECT DELIVERY: the "If receiver unavailable" Wait/Delegate/Return chooser is disabled
                for launch. If the receiver isn't around, rider and customer simply call/chat to sort it out.
            <Field label="If receiver unavailable">
              <View style={{ gap: 6 }}>
                {FALLBACK_OPTIONS.map((f) => (
                  <Mono key={f.value} onPress={() => setFallback(f.value)} style={{ color: fallback === f.value ? t.ink : t.mid, fontSize: t.size.small, paddingVertical: 4 }}>
                    {fallback === f.value ? '● ' : '○ '}{f.title}
                  </Mono>
                ))}
              </View>
              <Mono onPress={() => setShowFallback(true)} style={{ color: t.ink2, marginTop: 6 }}>WHAT DO THESE MEAN? →</Mono>
            </Field>
            */}
          </>
        )}

        <Spacer h={4} />
        <Button label="Get quote" onPress={getQuote} busy={busy} />

        {quote && (() => {
          // #0 DIRECT DELIVERY: no return deposit is ever charged — show the plain quote total.
          // "Return it to me" pre-charges a refundable 75% deposit so the rider can be paid to bring
          // it back if needed. It's refunded in full when the delivery succeeds.
          // const returnDeposit = fallback === 'RETURN' ? Math.round(quote.breakdown.totalMinor * 0.75) : 0;
          // const grandTotal = quote.breakdown.totalMinor + returnDeposit;
          return (
            <Card style={{ marginTop: 16 }}>
              <Row label="Base" value={naira(quote.breakdown.baseMinor)} />
              <Row label="Distance" value={naira(quote.breakdown.distanceMinor)} />
              <Row label="Time" value={naira(quote.breakdown.timeMinor)} />
              <Row label="Platform fee" value={naira(quote.breakdown.platformFeeMinor)} />
              {/* #0 DIRECT DELIVERY: return-deposit row removed. */}
              {/* {returnDeposit > 0 && <Row label="Return deposit (refundable)" value={naira(returnDeposit)} />} */}
              <Divider />
              <Row label="Total" value={naira(quote.breakdown.totalMinor)} strong />
              {/* #0 DIRECT DELIVERY: return-deposit explainer removed.
              {returnDeposit > 0 && (
                <Text style={{ fontSize: t.size.caption, color: t.ink2, marginTop: 6, lineHeight: 17 }}>
                  Includes a {naira(returnDeposit)} return deposit — fully refunded if your delivery is completed, or used to pay the rider if the parcel is returned to you.
                </Text>
              )} */}
              <Spacer h={12} />
              <Button label="Pay & hold in escrow" onPress={pay} busy={busy} />
              <Mono style={{ textAlign: 'center', marginTop: 8, color: t.ink2, fontSize: t.size.caption }}>HELD SAFELY UNTIL DELIVERY IS CONFIRMED</Mono>
            </Card>
          );
        })()}
        </>
        )}
      </KeyboardScreen>

      {/* #4 MULTI-STOP: the created-job response returns each extra stop's single-use code exactly once.
          Show them here so the customer can share each with the matching recipient, then continue to
          tracking (where the primary drop-off code is revealed as usual). */}
      <Modal visible={!!stopCodes} transparent animationType="slide" onRequestClose={() => { const id = stopCodes?.jobId; setStopCodes(null); if (id) navigation.navigate('Track', { jobId: id }); }}>
        <View style={ms.overlay}>
          <View style={ms.sheet}>
            <Text style={{ fontSize: t.size.subtitle, fontWeight: '700' }}>Your stop codes</Text>
            <Text style={{ fontSize: t.size.small, color: t.ink2, marginTop: 4, marginBottom: 14, lineHeight: 19 }}>
              Share each code with the matching recipient — the rider needs it to complete that drop-off. Your primary drop-off code is on the tracking screen.
            </Text>
            {(stopCodes?.codes ?? []).map((c, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.line2 }}>
                <Mono style={{ color: t.ink }}>STOP {i + 2}</Mono>
                <Text style={{ fontFamily: t.mono, fontSize: t.size.dataLg, fontWeight: '700', letterSpacing: 6, color: t.ink }}>{c}</Text>
              </View>
            ))}
            <Spacer h={16} />
            <Button label="Continue to tracking" onPress={() => { const id = stopCodes?.jobId; setStopCodes(null); if (id) navigation.navigate('Track', { jobId: id }); }} />
          </View>
        </View>
      </Modal>

      {/* #0 DIRECT DELIVERY: the "receiver unavailable" explainer sheet is disabled for launch.
      {/* Explainer sheet for the "receiver unavailable" choice, shown on first Get quote.
      <Modal visible={showFallback} transparent animationType="slide" onRequestClose={confirmFallback}>
        <Pressable style={ms.overlay} onPress={confirmFallback}>
          <Pressable style={ms.sheet} onPress={() => {}}>
            <Text style={{ fontSize: t.size.subtitle, fontWeight: '700' }}>If your receiver isn’t available</Text>
            <Text style={{ fontSize: t.size.small, color: t.ink2, marginTop: 4, marginBottom: 14 }}>Pick what the rider should do. You can change this any time before paying.</Text>
            {FALLBACK_OPTIONS.map((o) => {
              const active = fallback === o.value;
              return (
                <Pressable key={o.value} onPress={() => setFallback(o.value)} style={[ms.opt, { borderColor: active ? t.ink : t.line, backgroundColor: active ? t.bg2 : t.bg }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 4, borderColor: active ? t.primary : t.line }} />
                    <Text style={{ fontSize: t.size.body, fontWeight: '700' }}>{o.title}</Text>
                  </View>
                  <Text style={{ fontSize: t.size.small, color: t.ink2, marginLeft: 24, lineHeight: 18 }}>{o.desc}</Text>
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
      */}
    </>
  );
}

// #2 COMING SOON: on-brand placeholder shown when the Ride tab is selected. Rydafirst is a licensed
// courier (not a ride-hailing operator), so in-app rides are gated behind a Coming Soon card until we
// launch them. Uses the shared theme + Card/Mono so it matches the rest of the app; remove this and the
// `!isDelivery` guard above to re-enable ride booking.
function RideComingSoon() {
  return (
    <Card style={{ marginTop: 16, alignItems: 'center', paddingVertical: t.space.x3 }}>
      <Mono style={{ color: t.primary, fontSize: t.size.caption, letterSpacing: 1 }}>COMING SOON</Mono>
      <Text style={{ fontSize: t.size.subtitle, fontWeight: '700', color: t.ink, marginTop: 10, textAlign: 'center' }}>
        Rides are on the way
      </Text>
      <Text style={{ fontSize: t.size.small, color: t.ink2, lineHeight: 21, textAlign: 'center', marginTop: 8, maxWidth: 300 }}>
        We&apos;re focused on fast, reliable deliveries for now. In-app rides are coming soon.
      </Text>
      <View style={{ height: 3, width: 44, borderRadius: 2, backgroundColor: t.primary, marginTop: 18 }} />
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text style={{ color: t.ink2, fontSize: t.size.small }}>{label}</Text>
      <Text style={{ fontFamily: t.mono, fontSize: strong ? t.size.body : t.size.small, fontWeight: strong ? '700' : '400' }}>{value}</Text>
    </View>
  );
}

const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(17,17,17,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: t.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: '86%' },
  opt: { borderWidth: 1, borderRadius: 8, padding: 14, marginBottom: 10 },
});
