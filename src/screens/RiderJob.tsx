import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { api, naira, type Fallback, type Job } from '../api';
import { getToken, getUserId } from '../lib/session';
import { createRiderPublisher } from '../lib/socket';
import { isRiderActive } from '../lib/jobStatus';
import { showTripPresence, clearTripPresence } from '../lib/tripPresence';
import { useRoute } from '../lib/routing';
import { metersBetween } from '../lib/geo';
import { chime } from '../lib/settings';
import { notifyStageNudge, clearStageNudge } from '../lib/stageNudge';
import { Map } from '../components/Map';
import { VendorAccountCapture } from '../components/VendorAccountCapture';
import { ErrandTopUpRequest } from '../components/ErrandTopUpRequest';
import { ErrandReceiptModal } from '../components/ErrandReceipt';
import { Button, Card, Mono, PressableScale, Screen, Spacer, useToast } from '../ui';
import { t } from '../theme';

const FLOW = ['EN_ROUTE_PICKUP', 'AT_PICKUP', 'IN_PROGRESS', 'EN_ROUTE_DROP'] as const;
const RELEASABLE = ['ACCEPTED', 'EN_ROUTE_PICKUP', 'AT_PICKUP']; // rider may hand back only before pickup
const LABEL: Record<string, string> = {
  EN_ROUTE_PICKUP: 'Heading to pickup', AT_PICKUP: 'At pickup', IN_PROGRESS: 'Picked up', EN_ROUTE_DROP: 'Heading to drop',
};
// Short status shown in the ongoing trip notification (covers every rider-active status, not just FLOW).
const PRESENCE_LABEL: Record<string, string> = {
  ACCEPTED: 'Heading to pickup', EN_ROUTE_PICKUP: 'Heading to pickup', AT_PICKUP: 'At pickup',
  IN_PROGRESS: 'Package picked up', EN_ROUTE_DROP: 'Heading to drop-off',
  ARRIVED: 'At drop-off', AWAITING_CODE: 'At drop-off',
  WAITING: 'Waiting for receiver', AWAITING_RESOLUTION: 'Waiting for receiver',
  // #4 MULTI-STOP: primary drop-off done, working the remaining extra stops.
  EN_ROUTE_STOP: 'Delivering extra stops',
};

export function RiderJobScreen({ route, navigation }: NativeStackScreenProps<RootStack, 'RiderJob'>) {
  const { jobId } = route.params;
  const toast = useToast();
  const [job, setJob] = useState<Job | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [status, setStatus] = useState('ACCEPTED');
  const [policy, setPolicy] = useState<Fallback>('WAIT');
  const [code, setCode] = useState('');
  const [outcome, setOutcome] = useState<'paid' | null>(null);
  const [confirming, setConfirming] = useState(false);
  // #4 MULTI-STOP: code entry for the current EXTRA stop (separate from the primary drop-off code).
  const [stopCode, setStopCode] = useState('');
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [stepping, setStepping] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [showRelease, setShowRelease] = useState(false);
  const [geoOn, setGeoOn] = useState(false);
  // The rider's own position, mirrored onto the in-app map. Sourced from the same watcher that
  // already streams to the customer, so enabling the map costs no extra GPS subscription.
  const [riderPos, setRiderPos] = useState<{ lat: number; lng: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const pub = useRef<{ publish: (lat: number, lng: number) => void; close: () => void } | null>(null);
  // "Done" also covers a job that is already finished when the screen (re)loads — a COMPLETED/RELEASED
  // delivery must never show the "Mark: heading to pickup" button again, which is what produced the
  // "RELEASED -> EN_ROUTE_PICKUP" 409s in the logs when a rider reopened a completed job.
  const done = outcome !== null || status === 'COMPLETED' || status === 'RELEASED';
  const step = FLOW.indexOf(status as (typeof FLOW)[number]);
  // #4 MULTI-STOP: derived, ordered view of the extra drop-offs. The primary drop-off is stop 1; the
  // extra stops are worked in strict order after it. `currentExtra` is the 0-based index of the next
  // PENDING extra stop (its own index within extraStops == the index passed to api.confirmStop).
  const extraStops = job?.extraStops ?? [];
  const isMulti = extraStops.length > 0;
  const totalStops = extraStops.length + 1; // primary + extras
  const primaryDelivered = isMulti && (!!job?.primaryStopDeliveredAt || status === 'EN_ROUTE_STOP' || extraStops.some((x) => x.status === 'DELIVERED'));
  const deliveredExtras = extraStops.filter((x) => x.status === 'DELIVERED').length;
  const currentExtra = deliveredExtras < extraStops.length ? extraStops[deliveredExtras] : null;
  // 1-based position of the stop currently being worked (for the "Stop X of N" label).
  const currentStopNo = !primaryDelivered ? 1 : Math.min(deliveredExtras + 2, totalStops);
  // #4 MULTI-STOP: numbered map markers for the extra stops — current = the next undelivered one.
  const mapStops = extraStops.map((s, i) => ({
    lat: s.point.lat, lng: s.point.lng,
    label: s.address || s.area || `Stop ${i + 2}`,
    done: s.status === 'DELIVERED',
    current: primaryDelivered && i === deliveredExtras,
  }));
  const tripRoute = useRoute(job?.pickup, job?.dropoff); // road-following line for the trip map

  // Stage-nudge: from the rider's live position, detect when they've reached (or left) a stage but
  // haven't tapped to confirm it — so the trip never stalls with the customer left uninformed. This
  // is derived, not stored, so it can't get out of sync with the real status/position.
  const NUDGE_RADIUS_M = 130;
  const stageNudge: string | null = (() => {
    if (done || !riderPos || !job) return null;
    const near = (pt?: { lat: number; lng: number }) => !!pt && metersBetween(riderPos, pt) <= NUDGE_RADIUS_M;
    const away = (pt?: { lat: number; lng: number }) => !!pt && metersBetween(riderPos, pt) > NUDGE_RADIUS_M;
    if (status === 'EN_ROUTE_PICKUP' && near(job.pickup)) return 'You’ve reached the pickup — tap "I’ve arrived at pickup" to continue.';
    if (status === 'AT_PICKUP' && away(job.pickup)) return 'You’ve left the pickup — tap "Mark: Picked up" so the customer can track you.';
    if (status === 'EN_ROUTE_DROP' && near(job.dropoff)) return 'You’ve reached the drop-off — tap "I’ve arrived" to continue.';
    return null;
  })();

  // When a nudge is active, ping the rider (works even if the app is minimised) and keep reminding
  // every minute until they confirm; clear it the moment the nudge condition goes away or they leave.
  useEffect(() => {
    if (!stageNudge) { void clearStageNudge(); return; }
    void notifyStageNudge(jobId, stageNudge);
    const id = setInterval(() => { void notifyStageNudge(jobId, stageNudge); }, 60_000);
    return () => clearInterval(id);
  }, [stageNudge, jobId]);
  useEffect(() => () => { void clearStageNudge(); }, []);

  // Live waiting meter: 10-min free grace, then ₦50/min capped at ₦1,000 (mirrors the server).
  const waitStartedAt = job?.waitStartedAt;
  const elapsedS = waitStartedAt ? Math.max(0, Math.floor((now - waitStartedAt) / 1000)) : 0;
  const graceLeftS = Math.max(0, 600 - elapsedS);
  const accruedMinor = elapsedS > 600 ? Math.min(Math.ceil((elapsedS - 600) / 60) * 5_000, 100_000) : 0;
  const waitingPaid = !!job?.waitingTxId;
  // #0 DIRECT DELIVERY: waiting-fee chime disabled — no waiting fee is charged in direct mode.
  // Chime when the waiting fee is CONFIRMED paid (edge-detected: the first observation just records
  // the value, so reopening an already-paid job doesn't chime — only a real false→true transition does).
  // const prevPaid = useRef<boolean | undefined>(undefined);
  // useEffect(() => {
  //   if (!job) return;
  //   const paid = !!job.waitingTxId;
  //   if (prevPaid.current === undefined) { prevPaid.current = paid; return; }
  //   if (!prevPaid.current && paid) chime('Waiting fee paid', 'The customer paid — you can hand over once they enter the code.');
  //   prevPaid.current = paid;
  // }, [job]);
  useEffect(() => {
    if (status !== 'WAITING' && status !== 'AWAITING_RESOLUTION') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);

  const [customer, setCustomer] = useState<{ name?: string; photoUrl?: string; phone?: string; phoneMasked?: boolean; callMode?: 'proxy' | 'direct'; callNumber?: string } | null>(null);
  useEffect(() => {
    api.getJob(jobId).then((j) => { setJob(j); setStatus(j.status); if (j.fallbackPolicy) setPolicy(j.fallbackPolicy); }).catch(() => {});
    api.jobCustomer(jobId).then(setCustomer).catch(() => {});
  }, [jobId]);

  // inDrive-style presence: an ongoing Android notification while the delivery is live, so the rider
  // can jump straight back into the trip after minimising the app. Updates in place on each status
  // change; cleared once the delivery is done or the rider leaves this screen. (No-op on iOS.)
  useEffect(() => {
    if (done || !isRiderActive(status)) { void clearTripPresence(); return; }
    void showTripPresence(jobId, PRESENCE_LABEL[status] ?? 'On a delivery');
  }, [status, done, jobId]);
  useEffect(() => () => { void clearTripPresence(); }, []);

  // Location streaming to the customer, once permission is granted and the job is active.
  useEffect(() => {
    if (!geoOn || done) return;
    let sub: Location.LocationSubscription | null = null;
    let active = true;
    (async () => {
      const riderId = getUserId(await getToken());
      pub.current = createRiderPublisher(jobId, riderId);
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 3000 },
        (loc) => {
          if (!active) return;
          pub.current?.publish(loc.coords.latitude, loc.coords.longitude);
          setRiderPos({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        });
    })();
    return () => { active = false; sub?.remove(); pub.current?.close(); pub.current = null; };
  }, [geoOn, done, jobId]);

  // If the rider already granted location on a previous visit, turn sharing on automatically — the OS
  // permission persists, so re-asking on every open (as this screen used to) is pure friction. Only
  // when it isn't granted do we show the "Turn on location" card. Runs once per mount; never re-prompts.
  useEffect(() => {
    let live = true;
    Location.getForegroundPermissionsAsync()
      .then((p) => { if (live && p.granted) setGeoOn(true); })
      .catch(() => { /* permission read failed — fall back to the manual card */ });
    return () => { live = false; };
  }, []);

  const enableLocation = async () => {
    const { status: st } = await Location.requestForegroundPermissionsAsync();
    if (st === 'granted') setGeoOn(true); else toast('Location permission is needed to share your position');
  };

  const posOr = async (fail: string): Promise<{ lat: number; lng: number; accuracy?: number } | null> => {
    try {
      const cur = await Location.getForegroundPermissionsAsync();
      if (cur.status !== 'granted') { const r = await Location.requestForegroundPermissionsAsync(); if (r.status !== 'granted') { toast(fail); return null; } }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      // Pass the fix's own accuracy so the server can tolerate GPS drift at the geofence (bounded there).
      return { lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy ?? undefined };
    } catch {
      // GPS can throw on a weak/indoor fix — previously this bubbled up uncaught and the button just
      // did nothing, which looks broken. Always give the rider feedback so they can retry.
      toast('Could not get your location — check your GPS signal and try again');
      return null;
    }
  };

  // Run a status-changing rider action resiliently. On a slow/degraded backend the transition can
  // COMMIT server-side while the HTTP response is lost (timeout) — leaving the button on screen and
  // tempting the rider to tap again. So on error we re-read the job: if it has moved past where we
  // started, the action actually succeeded and we sync the UI silently; only if it truly didn't move
  // (e.g. a real geofence rejection) do we surface the error toast. This is why a "you're outside the
  // location" message still reaches the rider, while a dropped success no longer freezes the screen.
  const runStep = async (act: () => Promise<Job>) => {
    if (stepping) return; // guard against double/triple taps while a request is in flight
    setStepping(true);
    const before = status;
    try {
      const j = await act();
      setStatus(j.status); setJob(j);
    } catch (e) {
      const fresh = await api.getJob(jobId).catch(() => null);
      if (fresh && fresh.status !== before) { setStatus(fresh.status); setJob(fresh); }
      else toast((e as Error).message);
    } finally {
      setStepping(false);
    }
  };

  const advance = async () => {
    const next = FLOW[step + 1] ?? FLOW[0];
    if (next === 'AT_PICKUP') {
      const p = await posOr('Location needed to confirm you are at the pickup'); if (!p) return;
      await runStep(() => api.arrivePickup(jobId, p.lat, p.lng, p.accuracy));
      return;
    }
    await runStep(() => api.advance(jobId, next as 'EN_ROUTE_PICKUP' | 'IN_PROGRESS' | 'EN_ROUTE_DROP'));
  };
  const arrive = async () => {
    const p = await posOr('Location needed to verify arrival'); if (!p) return;
    await runStep(() => api.arrive(jobId, p.lat, p.lng, p.accuracy));
  };
  /**
   * Submit the receiver's code.
   *
   * The delivery is confirmed on the server before the response reaches us, so a network timeout
   * here does NOT mean the delivery failed. Riders were being shown "Invalid code" on a delivery
   * that had actually completed. On any failure we re-read the job: if the server says it landed,
   * the request succeeded and we were simply never told.
   */
  const confirm = async () => {
    if (confirming) return; // a second tap would race the first and burn a code attempt
    setConfirming(true);
    try {
      const r = await api.confirmCode(jobId, code);
      setStatus(r.status);
      setCode('');
      // #4 MULTI-STOP: on a multi-stop job the primary code returns EN_ROUTE_STOP (no payment yet) —
      // re-read the job so the extra-stop checklist appears. A single-stop job completes here as before.
      if (r.status === 'EN_ROUTE_STOP') {
        const fresh = await api.getJob(jobId).catch(() => null);
        if (fresh) setJob(fresh);
      } else {
        setOutcome('paid');
      }
    } catch (e) {
      const landed = await api.getJob(jobId).catch(() => null);
      if (landed && (landed.status === 'COMPLETED' || landed.status === 'RELEASED')) {
        setJob(landed);
        setStatus(landed.status);
        setOutcome('paid');
        return;
      }
      if (landed && landed.status === 'EN_ROUTE_STOP') {
        setJob(landed);
        setStatus(landed.status);
        setCode('');
        return;
      }
      toast((e as Error).message);
    } finally {
      setConfirming(false);
    }
  };

  // #4 MULTI-STOP: confirm the CURRENT extra stop's code with the rider's live GPS (same fix pattern the
  // primary arrive/confirm uses). Intermediate stops return EN_ROUTE_STOP; the final stop returns
  // RELEASED (escrow released, rider paid). Resilient to a lost success response like `confirm` above.
  const confirmCurrentStop = async () => {
    if (confirmingStop) return;
    const idx = deliveredExtras; // 0-based index of the first PENDING extra stop
    if (idx >= extraStops.length) return;
    const p = await posOr('Location needed to confirm this stop'); if (!p) return;
    setConfirmingStop(true);
    const before = deliveredExtras;
    try {
      const r = await api.confirmStop(jobId, idx, stopCode, p.lat, p.lng, p.accuracy);
      setStopCode('');
      const fresh = await api.getJob(jobId).catch(() => null);
      if (fresh) { setJob(fresh); setStatus(fresh.status); }
      else setStatus(r.status);
      if (r.status === 'RELEASED' || r.status === 'COMPLETED') setOutcome('paid');
    } catch (e) {
      const landed = await api.getJob(jobId).catch(() => null);
      if (landed && (landed.status === 'RELEASED' || landed.status === 'COMPLETED')) {
        setJob(landed); setStatus(landed.status); setOutcome('paid'); setStopCode('');
        return;
      }
      // The stop may have been recorded even though the response was lost — if the delivered count moved
      // past where we started, treat it as success and advance to the next stop.
      const nowDelivered = landed?.extraStops?.filter((x) => x.status === 'DELIVERED').length ?? before;
      if (landed && nowDelivered > before) { setJob(landed); setStatus(landed.status); setStopCode(''); return; }
      toast((e as Error).message);
    } finally {
      setConfirmingStop(false);
    }
  };
  // #0 DIRECT DELIVERY: the recipient-unavailable "start waiting" + waiting-fee actions are disabled.
  // These backend endpoints now return HTTP 409 in direct mode, so the UI must not call them.
  // const beginWaiting = async () => {
  //   try { const r = await api.startWaiting(jobId); setStatus(r.status); setJob((j) => (j ? { ...j, waitStartedAt: r.waitStartedAt } : j)); chime('Waiting started', 'You’re now waiting for the recipient — you’ll be paid for the wait.'); }
  //   catch (e) { toast((e as Error).message); }
  // };
  // const requestWaitingFee = async () => {
  //   try { const r = await api.chargeWaiting(jobId); Linking.openURL(r.paymentLink); toast('Waiting fee sent to the customer to pay', 'success'); }
  //   catch (e) { toast((e as Error).message); }
  // };
  // System-confirmed payment: while waiting, poll the job so the "paid" flag (waitingTxId — set ONLY
  // by the payment webhook/verify on the server, never by the rider) and any customer resolution
  // choice appear automatically. This replaces the rider's manual "I've been paid" self-declaration.
  useEffect(() => {
    if (done || (status !== 'WAITING' && status !== 'AWAITING_RESOLUTION')) return;
    const id = setInterval(() => {
      api.getJob(jobId).then((j) => { setJob(j); setStatus(j.status); }).catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [status, done, jobId]);
  const release = async () => {
    try { await api.releaseJob(jobId); toast('Job released — back to the pool', 'success'); navigation.goBack(); }
    catch (e) { toast((e as Error).message); }
  };
  // Call the sender. Confirm first, then place a NORMAL outgoing call: proxy mode dials Rydafirst's
  // masked line (the server bridges to the customer, no number exposed); direct mode dials tel:. This
  // replaced the old "server rings you first" flow that made the rider's own phone ring.
  const callCustomer = () => {
    const masked = customer?.callMode === 'proxy' ? customer?.callNumber : undefined;
    const direct = customer?.phone;
    const buttons: { text: string; style?: 'cancel'; onPress?: () => void }[] = [];
    if (masked) buttons.push({ text: 'In-app call (private)', onPress: () => Linking.openURL(`tel:${masked}`) });
    if (direct) buttons.push({ text: 'Call out (your phone)', onPress: () => Linking.openURL(`tel:${direct}`) });
    if (buttons.length === 0) { toast('Calling isn’t available right now'); return; }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Call the customer', 'In-app call keeps your number private — you’re connected through Rydafirst. Call out dials the customer directly.', buttons);
  };

  const navTo = (pt?: { lat: number; lng: number }) => { if (pt) Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${pt.lat},${pt.lng}`); };

  const nextStep = FLOW[Math.min(step + 1, FLOW.length - 1)];

  // #4 KEYBOARD: the delivery-code inputs sit low in a long scroll, so the number pad used to cover
  // them. iOS auto-insets via automaticallyAdjustKeyboardInsets; for both platforms we also scroll the
  // active code card into view on focus. Each code card reports its y via onLayout (only one is mounted
  // at a time, so a single shared offset is enough).
  const scrollRef = useRef<ScrollView>(null);
  const codeCardY = useRef(0);
  const onCodeCardLayout = (e: { nativeEvent: { layout: { y: number } } }) => { codeCardY.current = e.nativeEvent.layout.y; };
  const revealCode = () => setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, codeCardY.current - 80), animated: true }), 120);

  return (
    <Screen title="Active job" onBack={() => navigation.goBack()}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 20, paddingBottom: 260 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
        <Mono style={{ marginBottom: 12 }}>{status.replace(/_/g, ' ')}</Mono>
        <View style={{ flexDirection: 'row', gap: 4, marginBottom: 20 }}>
          {FLOW.map((_, i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? t.ink : t.line2 }} />)}
        </View>

        {!done && !geoOn && (
          <Card style={{ borderColor: t.warning, marginBottom: 16 }}>
            <Text style={{ fontSize: t.size.body, fontWeight: '700' }}>Turn on location</Text>
            <Text style={{ fontSize: t.size.small, color: t.ink2, marginVertical: 8, lineHeight: 19 }}>Share your location so the customer can track you and you can confirm arrival.</Text>
            <Button label="Enable location" onPress={enableLocation} />
          </Card>
        )}
        {!done && geoOn && <Mono style={{ color: t.success, marginBottom: 16 }}>● SHARING YOUR LIVE LOCATION</Mono>}

        {/* ERRAND ("buy-for-me"): what to buy + how much, and the vendor-account capture at the store. */}
        {!done && job?.type === 'ERRAND' && job.errand ? (
          <Card style={{ marginBottom: 16, borderColor: t.primary }}>
            <Mono style={{ color: t.primary, marginBottom: 8 }}>ERRAND · BUY FOR THE CUSTOMER</Mono>
            {job.errand.store?.name ? <Detail label="Shop" value={job.errand.store.name} /> : null}
            <Detail label="Buy" value={job.errand.shoppingList} />
            <Detail label="Amount to spend" value={naira(job.errand.goodsMinor)} />
            {job.errand.vendorPaidAt ? (
              <View style={{ marginTop: 8 }}>
                <Mono style={{ color: t.success, marginBottom: 8 }}>✓ VENDOR PAID — COLLECT THE ITEMS AND DELIVER</Mono>
                <Button label="Show payment receipt to shop" variant="ghost" onPress={() => setShowReceipt(true)} />
              </View>
            ) : job.errand.vendorAccount ? (
              <Mono style={{ color: t.ink2, marginTop: 8 }}>ACCOUNT SENT — WAITING FOR THE CUSTOMER TO APPROVE PAYMENT</Mono>
            ) : (
              <View style={{ marginTop: 10 }}>
                <VendorAccountCapture jobId={jobId} onCaptured={() => { api.getJob(jobId).then(setJob).catch(() => {}); }} />
              </View>
            )}
            {/* Shop price higher than declared: ask the customer to add the difference (in-app). */}
            <ErrandTopUpRequest job={job} onRequested={() => { api.getJob(jobId).then(setJob).catch(() => {}); }} />
          </Card>
        ) : null}
        {job?.type === 'ERRAND' ? <ErrandReceiptModal jobId={jobId} visible={showReceipt} onClose={() => setShowReceipt(false)} /> : null}

        {!done && job && (
          <Card style={{ marginBottom: 16 }}>
            <Mono style={{ marginBottom: 10 }}>{job.type === 'ERRAND' ? 'DELIVER TO' : 'DELIVERY DETAILS'}</Mono>
            {(customer?.photoUrl || customer?.name || job.customerName) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                {customer?.photoUrl ? (
                  <Image source={{ uri: customer.photoUrl }} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.bg2 }} />
                ) : (
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: t.onDark, fontWeight: '700', fontFamily: t.mono }}>{(customer?.name || job.customerName || 'C').trim().charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}><Mono>CUSTOMER</Mono><Text style={{ fontSize: t.size.body, fontWeight: '600' }}>{customer?.name || job.customerName || 'Customer'}</Text></View>
                {/* Reach the SENDER. The recipient's number below is a different person — riders
                    previously had no way to call the person who booked the delivery. Proxy mode rings
                    us and bridges (no number shown); direct mode falls back to a tel: link. */}
                {customer?.callMode === 'proxy' || customer?.phone ? (
                  <PressableScale onPress={callCustomer} style={s.chip}><Mono style={{ color: t.ink }}>CALL</Mono></PressableScale>
                ) : null}
                <PressableScale onPress={() => navigation.navigate('Chat', { jobId })} style={s.chip}><Mono style={{ color: t.ink }}>MESSAGE</Mono></PressableScale>
              </View>
            ) : null}
            {job.pickupAddress ? <Detail label="Pickup" value={job.pickupAddress} /> : null}
            {job.dropoffAddress ? <Detail label="Drop-off" value={job.dropoffAddress} /> : null}
            {job.recipient ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <View>
                  <Mono>RECIPIENT</Mono>
                  <Text style={{ fontSize: t.size.body, fontWeight: '600' }}>{job.recipient.name}</Text>
                  {/* The recipient's number is withheld by the server until pickup (privacy), so it
                      only appears here once the item is in hand. */}
                  {job.recipient.phone
                    ? <Mono>{job.recipient.phone}</Mono>
                    : <Mono style={{ color: t.ink2 }}>Number shows after pickup</Mono>}
                </View>
                {job.recipient.phone ? (
                  <PressableScale onPress={() => Linking.openURL(`tel:${job.recipient?.phone}`)} style={s.chip}><Mono style={{ color: t.ink }}>CALL</Mono></PressableScale>
                ) : null}
              </View>
            ) : null}
            {job.item ? <Detail label="Sending" value={job.item} /> : null}
            {job.weightGrams ? <Detail label="Weight" value={`${(job.weightGrams / 1000).toLocaleString()} kg`} /> : null}
            {job.instructions ? <Detail label="Notes" value={job.instructions} /> : null}
            {/* The rider previously had no map at all — only links that threw them out of the app
                into Google Maps. Same keyless Leaflet component the customer's tracking screen
                uses, so there is one map implementation and no API key on the device. */}
            {(job.pickup || job.dropoff) ? (
              <View style={{ marginTop: t.space.md }}>
                <Map
                  pickup={job.pickup ?? null}
                  dropoff={job.dropoff ?? null}
                  rider={riderPos}
                  route={tripRoute?.points ?? null}
                  distanceMeters={tripRoute?.distanceMeters}
                  durationSeconds={tripRoute?.durationSeconds}
                  stops={mapStops}
                  height={220}
                />
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <PressableScale onPress={() => navTo(job.pickup)} style={[s.chip, { flex: 1 }]}><Mono numberOfLines={1} adjustsFontSizeToFit style={{ color: t.ink, fontSize: t.size.caption }}>NAV · PICKUP</Mono></PressableScale>
              <PressableScale onPress={() => navTo(job.dropoff)} style={[s.chip, { flex: 1 }]}><Mono numberOfLines={1} adjustsFontSizeToFit style={{ color: t.ink, fontSize: t.size.caption }}>NAV · DROP-OFF</Mono></PressableScale>
            </View>
          </Card>
        )}

        {/* #4 MULTI-STOP: ordered checklist of every drop-off with live progress. Stop 1 is the primary
            drop-off (done once its code is confirmed); the rest are the extra stops in order. */}
        {isMulti && !done && (
          <Card style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Mono>STOP CHECKLIST</Mono>
              <Mono style={{ color: t.ink }}>STOP {currentStopNo} OF {totalStops}</Mono>
            </View>
            <StopRow no={1} label={job?.dropoffAddress || job?.dropoffArea || 'Primary drop-off'}
              delivered={primaryDelivered} current={!primaryDelivered} />
            {extraStops.map((s, i) => (
              <StopRow key={i} no={i + 2} label={s.address || s.area || `Stop ${i + 2}`}
                recipient={s.recipient?.name} delivered={s.status === 'DELIVERED'}
                current={primaryDelivered && i === deliveredExtras} />
            ))}
          </Card>
        )}

        {stageNudge && (
          <Card style={{ marginBottom: 12, borderColor: t.warning, borderWidth: 1.5 }}>
            <Mono style={{ color: t.warning, marginBottom: 4 }}>● ACTION NEEDED</Mono>
            <Text style={{ fontSize: t.size.body, color: t.ink, lineHeight: 20 }}>{stageNudge}</Text>
          </Card>
        )}

        {done ? (
          <Mono style={{ color: t.success, fontWeight: '700' }}>PAID ✓ — released to your wallet</Mono>
        ) : status === 'EN_ROUTE_DROP' ? (
          <Button label={stepping ? 'Verifying…' : "I've arrived (verify GPS)"} onPress={arrive} busy={stepping} />
        ) : status === 'WAITING' || status === 'AWAITING_RESOLUTION' ? (
          <>
            {/* #0 DIRECT DELIVERY: waiting-fee meter + "Request waiting fee" UI disabled. In direct mode a
                job never enters WAITING, and no waiting fee is charged; the code card below still lets a
                legacy WAITING job be handed over.
            <Card style={{ marginBottom: 12, borderColor: t.warning }}>
              <Mono style={{ marginBottom: 6 }}>{graceLeftS > 0 ? 'FREE WAITING' : 'METERED WAITING'}</Mono>
              <Text style={{ fontSize: t.size.title, fontWeight: '800', fontFamily: t.mono }}>
                {String(Math.floor(elapsedS / 60)).padStart(2, '0')}:{String(elapsedS % 60).padStart(2, '0')}
              </Text>
              <Text style={{ fontSize: t.size.small, color: t.ink2, marginTop: 6, lineHeight: 18 }}>
                {graceLeftS > 0
                  ? `First 10 minutes are free — ${Math.ceil(graceLeftS / 60)} min left. If no one comes after that, ask the customer to cover the wait.`
                  : waitingPaid
                    ? 'Waiting fee paid ✓ — you can hand over once the recipient enters the code.'
                    : `Waiting fee so far: ${naira(accruedMinor)} (₦50/min after the free 10). The customer must pay it before you hand over.`}
              </Text>
              {graceLeftS === 0 && !waitingPaid && (
                <View style={{ marginTop: 10, gap: 8 }}>
                  <Button label="Request waiting fee from customer" onPress={requestWaitingFee} />
                  {/* No self-declaration: the app watches for the confirmed payment and flips to "paid" itself. * / }
                  <Mono style={{ color: t.ink2, textAlign: 'center' }}>● WATCHING FOR THE CUSTOMER&apos;S PAYMENT…</Mono>
                </View>
              )}
            </Card>
            */}
            <Card style={{ marginBottom: 12 }} onLayout={onCodeCardLayout}>
              <Mono style={{ fontSize: t.size.caption }}>{policy === 'DELEGATE' ? 'ENTER THE CODE (RECEIVER OR THEIR PROXY)' : "ENTER THE RECEIVER'S DELIVERY CODE"}</Mono>
              <TextInput style={s.codeInput} value={code} onChangeText={setCode} onFocus={revealCode} keyboardType="number-pad" maxLength={4} />
              <Button label={confirming ? 'Confirming…' : 'Confirm & get paid'} onPress={confirm} busy={confirming} />
            </Card>
            <PressableScale onPress={() => navigation.navigate('Chat', { jobId })} style={[s.chip, { marginTop: 4 }]}>
              <Mono style={{ color: t.ink }}>MESSAGE THE CUSTOMER →</Mono>
            </PressableScale>
          </>
        ) : status === 'ARRIVED' ? (
          <>
            <Card style={{ marginBottom: 12 }} onLayout={onCodeCardLayout}>
              <Mono style={{ fontSize: t.size.caption }}>{policy === 'DELEGATE' ? 'ENTER THE CODE (RECEIVER OR THEIR PROXY)' : "ENTER THE RECEIVER'S DELIVERY CODE"}</Mono>
              <TextInput style={s.codeInput} value={code} onChangeText={setCode} onFocus={revealCode} keyboardType="number-pad" maxLength={4} />
              <Button label={confirming ? 'Confirming…' : 'Confirm & get paid'} onPress={confirm} busy={confirming} />
            </Card>
            {/* #0 DIRECT DELIVERY: the "Start waiting / waiting fee / return" recipient-unavailable flow is
                disabled. In a direct delivery the rider and customer simply call or message to sort out an
                absent receiver — no waiting timer, no fee, no return deposit. */}
            {!showUnavailable ? (
              <PressableScale onPress={() => setShowUnavailable(true)}><Mono style={{ color: t.ink2, textAlign: 'center' }}>RECEIVER NOT AVAILABLE? →</Mono></PressableScale>
            ) : (
              <Card>
                <Text style={{ fontSize: t.size.body, fontWeight: '700' }}>Receiver unavailable</Text>
                <Text style={{ fontSize: t.size.small, color: t.ink2, marginVertical: 8, lineHeight: 18 }}>
                  Call or message the customer to sort out the hand-over. You can reach them directly below.
                </Text>
                {/* #0 DIRECT DELIVERY: waiting action removed.
                <Button label="Start waiting (first 10 min free)" onPress={beginWaiting} />
                <View style={{ height: 8 }} />
                */}
                <PressableScale onPress={() => navigation.navigate('Chat', { jobId })} style={s.chip}>
                  <Mono style={{ color: t.ink }}>MESSAGE THE CUSTOMER →</Mono>
                </PressableScale>
              </Card>
            )}
          </>
        ) : status === 'EN_ROUTE_STOP' ? (
          // #4 MULTI-STOP: primary drop-off is done — work each extra stop in order. Show the current
          // stop's details + navigation, then its code entry (verified against the rider's live GPS).
          currentExtra ? (
            <>
              <Card style={{ marginBottom: 12 }}>
                <Mono style={{ marginBottom: 8 }}>CURRENT STOP · {currentStopNo} OF {totalStops}</Mono>
                {currentExtra.address ? <Detail label="Drop-off" value={currentExtra.address} /> : currentExtra.area ? <Detail label="Area" value={currentExtra.area} /> : null}
                {currentExtra.recipient ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <View>
                      <Mono>RECIPIENT</Mono>
                      <Text style={{ fontSize: t.size.body, fontWeight: '600' }}>{currentExtra.recipient.name}</Text>
                      {currentExtra.recipient.phone
                        ? <Mono>{currentExtra.recipient.phone}</Mono>
                        : <Mono style={{ color: t.ink2 }}>Number shows at this stop</Mono>}
                    </View>
                    {currentExtra.recipient.phone ? (
                      <PressableScale onPress={() => Linking.openURL(`tel:${currentExtra.recipient?.phone}`)} style={s.chip}><Mono style={{ color: t.ink }}>CALL</Mono></PressableScale>
                    ) : null}
                  </View>
                ) : null}
                {currentExtra.item ? <Detail label="Sending" value={currentExtra.item} /> : null}
                {currentExtra.instructions ? <Detail label="Notes" value={currentExtra.instructions} /> : null}
                <PressableScale onPress={() => navTo(currentExtra.point)} style={[s.chip, { marginTop: 8 }]}><Mono style={{ color: t.ink }}>NAVIGATE TO THIS STOP</Mono></PressableScale>
              </Card>
              <Card style={{ marginBottom: 12 }} onLayout={onCodeCardLayout}>
                <Mono style={{ fontSize: t.size.caption }}>ENTER THIS STOP&apos;S DELIVERY CODE</Mono>
                <TextInput style={s.codeInput} value={stopCode} onChangeText={setStopCode} onFocus={revealCode} keyboardType="number-pad" maxLength={4} />
                <Button label={confirmingStop ? 'Confirming…' : deliveredExtras >= extraStops.length - 1 ? 'Confirm final stop & get paid' : 'Confirm stop & continue'} onPress={confirmCurrentStop} busy={confirmingStop} />
              </Card>
              <PressableScale onPress={() => navigation.navigate('Chat', { jobId })} style={[s.chip, { marginTop: 4 }]}>
                <Mono style={{ color: t.ink }}>MESSAGE THE CUSTOMER →</Mono>
              </PressableScale>
            </>
          ) : (
            <Mono style={{ color: t.ink2 }}>Finishing up…</Mono>
          )
        ) : (
          <Button label={stepping ? 'Working…' : nextStep === 'AT_PICKUP' ? "I've arrived at pickup (verify GPS)" : `Mark: ${LABEL[nextStep]}`} onPress={advance} busy={stepping} />
        )}

        {!done && RELEASABLE.includes(status) && (
          showRelease ? (
            <Card style={{ marginTop: 16 }}>
              <Text style={{ fontSize: t.size.body, fontWeight: '700' }}>Release this job?</Text>
              <Text style={{ fontSize: t.size.small, color: t.ink2, marginVertical: 8, lineHeight: 18 }}>
                It goes back to the pool for another rider — only possible before pickup, and no money moves. Releasing too many jobs can limit the offers you get.
              </Text>
              <Button label="Release to another rider" variant="ghost" onPress={release} />
            </Card>
          ) : (
            <PressableScale onPress={() => setShowRelease(true)} style={{ marginTop: 20 }}>
              <Mono style={{ color: t.ink2, textAlign: 'center' }}>CAN&apos;T CONTINUE? RELEASE THIS JOB →</Mono>
            </PressableScale>
          )
        )}

        {/* #6 per-trip support: a resumable support thread scoped to THIS delivery. */}
        <PressableScale onPress={() => navigation.navigate('SupportChat', { category: 'DELIVERY_ISSUE', jobId })} style={{ marginTop: 20 }}>
          <Mono style={{ color: t.ink2, textAlign: 'center' }}>CONTACT SUPPORT ABOUT THIS DELIVERY →</Mono>
        </PressableScale>
        <Spacer h={40} />
      </ScrollView>
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={{ marginBottom: 8 }}><Mono>{label.toUpperCase()}</Mono><Text style={{ fontSize: t.size.body, marginTop: 2 }}>{value}</Text></View>;
}

// #4 MULTI-STOP: one row of the rider's ordered stop checklist. Delivered stops are ticked; the stop
// currently being worked is highlighted.
function StopRow({ no, label, recipient, delivered, current }: { no: number; label: string; recipient?: string; delivered?: boolean; current?: boolean }) {
  const color = delivered ? t.success : current ? t.ink : t.mid;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: color, backgroundColor: delivered ? t.success : t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: t.size.caption, fontFamily: t.mono, fontWeight: '700', color: delivered ? t.onDark : color }}>{delivered ? '✓' : no}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: t.size.body, fontWeight: current ? '700' : '400', color: current || delivered ? t.ink : t.ink2 }} numberOfLines={1}>{label}</Text>
        {recipient ? <Mono style={{ marginTop: 1 }}>{recipient}</Mono> : null}
      </View>
      <Mono style={{ color }}>{delivered ? 'DELIVERED' : current ? 'CURRENT' : 'PENDING'}</Mono>
    </View>
  );
}

const s = StyleSheet.create({
  chip: { borderWidth: 1, borderColor: t.line, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center', backgroundColor: t.bg },
  codeInput: { borderWidth: 1, borderColor: t.line, borderRadius: 6, textAlign: 'center', fontSize: t.size.dataLg, letterSpacing: 8, fontFamily: t.mono, paddingVertical: 10, marginVertical: 12 },
});
