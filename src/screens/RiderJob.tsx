import { useEffect, useRef, useState } from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { api, naira, type Fallback, type Job } from '../api';
import { getToken, getUserId } from '../lib/session';
import { createRiderPublisher } from '../lib/socket';
import { Button, Card, Mono, PressableScale, Screen, Spacer, useToast } from '../ui';
import { t } from '../theme';

const FLOW = ['EN_ROUTE_PICKUP', 'AT_PICKUP', 'IN_PROGRESS', 'EN_ROUTE_DROP'] as const;
const RELEASABLE = ['ACCEPTED', 'EN_ROUTE_PICKUP', 'AT_PICKUP']; // rider may hand back only before pickup
const LABEL: Record<string, string> = {
  EN_ROUTE_PICKUP: 'Heading to pickup', AT_PICKUP: 'At pickup', IN_PROGRESS: 'Picked up', EN_ROUTE_DROP: 'Heading to drop',
};

export function RiderJobScreen({ route, navigation }: NativeStackScreenProps<RootStack, 'RiderJob'>) {
  const { jobId } = route.params;
  const toast = useToast();
  const [job, setJob] = useState<Job | null>(null);
  const [status, setStatus] = useState('ACCEPTED');
  const [policy, setPolicy] = useState<Fallback>('WAIT');
  const [code, setCode] = useState('');
  const [outcome, setOutcome] = useState<'paid' | null>(null);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [showRelease, setShowRelease] = useState(false);
  const [geoOn, setGeoOn] = useState(false);
  const [now, setNow] = useState(Date.now());
  const pub = useRef<{ publish: (lat: number, lng: number) => void; close: () => void } | null>(null);
  const done = outcome !== null;
  const step = FLOW.indexOf(status as (typeof FLOW)[number]);

  // Live waiting meter: 10-min free grace, then ₦50/min capped at ₦1,000 (mirrors the server).
  const waitStartedAt = job?.waitStartedAt;
  const elapsedS = waitStartedAt ? Math.max(0, Math.floor((now - waitStartedAt) / 1000)) : 0;
  const graceLeftS = Math.max(0, 600 - elapsedS);
  const accruedMinor = elapsedS > 600 ? Math.min(Math.ceil((elapsedS - 600) / 60) * 5_000, 100_000) : 0;
  const waitingPaid = !!job?.waitingTxId;
  useEffect(() => {
    if (status !== 'WAITING' && status !== 'AWAITING_RESOLUTION') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);

  const [customer, setCustomer] = useState<{ name?: string; photoUrl?: string } | null>(null);
  useEffect(() => {
    api.getJob(jobId).then((j) => { setJob(j); setStatus(j.status); if (j.fallbackPolicy) setPolicy(j.fallbackPolicy); }).catch(() => {});
    api.jobCustomer(jobId).then(setCustomer).catch(() => {});
  }, [jobId]);

  // Location streaming to the customer, once permission is granted and the job is active.
  useEffect(() => {
    if (!geoOn || done) return;
    let sub: Location.LocationSubscription | null = null;
    let active = true;
    (async () => {
      const riderId = getUserId(await getToken());
      pub.current = createRiderPublisher(jobId, riderId);
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 3000 },
        (loc) => { if (active) pub.current?.publish(loc.coords.latitude, loc.coords.longitude); });
    })();
    return () => { active = false; sub?.remove(); pub.current?.close(); pub.current = null; };
  }, [geoOn, done, jobId]);

  const enableLocation = async () => {
    const { status: st } = await Location.requestForegroundPermissionsAsync();
    if (st === 'granted') setGeoOn(true); else toast('Location permission is needed to share your position');
  };

  const posOr = async (fail: string): Promise<{ lat: number; lng: number } | null> => {
    const cur = await Location.getForegroundPermissionsAsync();
    if (cur.status !== 'granted') { const r = await Location.requestForegroundPermissionsAsync(); if (r.status !== 'granted') { toast(fail); return null; } }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: loc.coords.latitude, lng: loc.coords.longitude };
  };

  const advance = async () => {
    const next = FLOW[step + 1] ?? FLOW[0];
    if (next === 'AT_PICKUP') {
      const p = await posOr('Location needed to confirm you are at the pickup'); if (!p) return;
      try { const j = await api.arrivePickup(jobId, p.lat, p.lng); setStatus(j.status); } catch (e) { toast((e as Error).message); }
      return;
    }
    try { const j = await api.advance(jobId, next as 'EN_ROUTE_PICKUP' | 'IN_PROGRESS' | 'EN_ROUTE_DROP'); setStatus(j.status); } catch (e) { toast((e as Error).message); }
  };
  const arrive = async () => {
    const p = await posOr('Location needed to verify arrival'); if (!p) return;
    try { const j = await api.arrive(jobId, p.lat, p.lng); setStatus(j.status); } catch (e) { toast((e as Error).message); }
  };
  const confirm = async () => {
    try { const r = await api.confirmCode(jobId, code); setStatus(r.status); setOutcome('paid'); } catch (e) { toast((e as Error).message); }
  };
  const beginWaiting = async () => {
    try { const r = await api.startWaiting(jobId); setStatus(r.status); setJob((j) => (j ? { ...j, waitStartedAt: r.waitStartedAt } : j)); }
    catch (e) { toast((e as Error).message); }
  };
  const requestWaitingFee = async () => {
    try { const r = await api.chargeWaiting(jobId); Linking.openURL(r.paymentLink); toast('Waiting fee sent to the customer to pay', 'success'); }
    catch (e) { toast((e as Error).message); }
  };
  const refreshJob = async () => { try { setJob(await api.getJob(jobId)); } catch { /* noop */ } };
  const release = async () => {
    try { await api.releaseJob(jobId); toast('Job released — back to the pool', 'success'); navigation.goBack(); }
    catch (e) { toast((e as Error).message); }
  };
  const navTo = (pt?: { lat: number; lng: number }) => { if (pt) Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${pt.lat},${pt.lng}`); };

  const nextStep = FLOW[Math.min(step + 1, FLOW.length - 1)];

  return (
    <Screen title="Active job" onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Mono style={{ marginBottom: 12 }}>{status.replace(/_/g, ' ')}</Mono>
        <View style={{ flexDirection: 'row', gap: 4, marginBottom: 20 }}>
          {FLOW.map((_, i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? t.ink : t.line2 }} />)}
        </View>

        {!done && !geoOn && (
          <Card style={{ borderColor: t.warning, marginBottom: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: '700' }}>Turn on location</Text>
            <Text style={{ fontSize: 13, color: t.ink2, marginVertical: 8, lineHeight: 19 }}>Share your location so the customer can track you and you can confirm arrival.</Text>
            <Button label="Enable location" onPress={enableLocation} />
          </Card>
        )}
        {!done && geoOn && <Mono style={{ color: t.success, marginBottom: 16 }}>● SHARING YOUR LIVE LOCATION</Mono>}

        {!done && job && (
          <Card style={{ marginBottom: 16 }}>
            <Mono style={{ marginBottom: 10 }}>DELIVERY DETAILS</Mono>
            {(customer?.photoUrl || customer?.name || job.customerName) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                {customer?.photoUrl ? (
                  <Image source={{ uri: customer.photoUrl }} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.bg2 }} />
                ) : (
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontFamily: t.mono }}>{(customer?.name || job.customerName || 'C').trim().charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View><Mono>CUSTOMER</Mono><Text style={{ fontSize: 14, fontWeight: '600' }}>{customer?.name || job.customerName || 'Customer'}</Text></View>
              </View>
            ) : null}
            {job.pickupAddress ? <Detail label="Pickup" value={job.pickupAddress} /> : null}
            {job.dropoffAddress ? <Detail label="Drop-off" value={job.dropoffAddress} /> : null}
            {job.recipient ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <View><Text style={{ fontSize: 14, fontWeight: '600' }}>{job.recipient.name}</Text><Mono>{job.recipient.phone}</Mono></View>
                <PressableScale onPress={() => Linking.openURL(`tel:${job.recipient?.phone}`)} style={s.chip}><Mono style={{ color: t.ink }}>CALL</Mono></PressableScale>
              </View>
            ) : null}
            {job.item ? <Detail label="Sending" value={job.item} /> : null}
            {job.weightGrams ? <Detail label="Weight" value={`${(job.weightGrams / 1000).toLocaleString()} kg`} /> : null}
            {job.instructions ? <Detail label="Notes" value={job.instructions} /> : null}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <PressableScale onPress={() => navTo(job.pickup)} style={[s.chip, { flex: 1 }]}><Mono style={{ color: t.ink, fontSize: 10.5 }}>NAVIGATE TO PICKUP</Mono></PressableScale>
              <PressableScale onPress={() => navTo(job.dropoff)} style={[s.chip, { flex: 1 }]}><Mono style={{ color: t.ink, fontSize: 10.5 }}>NAVIGATE TO DROP-OFF</Mono></PressableScale>
            </View>
          </Card>
        )}

        {done ? (
          <Mono style={{ color: t.success, fontWeight: '700' }}>PAID ✓ — released to your wallet</Mono>
        ) : status === 'EN_ROUTE_DROP' ? (
          <Button label="I've arrived (verify GPS)" onPress={arrive} />
        ) : status === 'WAITING' || status === 'AWAITING_RESOLUTION' ? (
          <>
            <Card style={{ marginBottom: 12, borderColor: t.warning }}>
              <Mono style={{ marginBottom: 6 }}>{graceLeftS > 0 ? 'FREE WAITING' : 'METERED WAITING'}</Mono>
              <Text style={{ fontSize: 26, fontWeight: '800', fontFamily: t.mono }}>
                {String(Math.floor(elapsedS / 60)).padStart(2, '0')}:{String(elapsedS % 60).padStart(2, '0')}
              </Text>
              <Text style={{ fontSize: 12.5, color: t.ink2, marginTop: 6, lineHeight: 18 }}>
                {graceLeftS > 0
                  ? `First 10 minutes are free — ${Math.ceil(graceLeftS / 60)} min left. If no one comes after that, ask the customer to cover the wait.`
                  : waitingPaid
                    ? 'Waiting fee paid ✓ — you can hand over once the recipient enters the code.'
                    : `Waiting fee so far: ${naira(accruedMinor)} (₦50/min after the free 10). The customer must pay it before you hand over.`}
              </Text>
              {graceLeftS === 0 && !waitingPaid && (
                <View style={{ marginTop: 10, gap: 8 }}>
                  <Button label="Request waiting fee from customer" onPress={requestWaitingFee} />
                  <Button label="I've been paid — refresh" variant="ghost" onPress={refreshJob} />
                </View>
              )}
            </Card>
            <Card style={{ marginBottom: 12 }}>
              <Mono style={{ fontSize: 10 }}>{policy === 'DELEGATE' ? 'ENTER THE CODE (RECEIVER OR THEIR PROXY)' : "ENTER THE RECEIVER'S DELIVERY CODE"}</Mono>
              <TextInput style={s.codeInput} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={4} />
              <Button label="Confirm & get paid" onPress={confirm} />
            </Card>
            <PressableScale onPress={() => navigation.navigate('Chat', { jobId })} style={[s.chip, { marginTop: 4 }]}>
              <Mono style={{ color: t.ink }}>MESSAGE THE CUSTOMER →</Mono>
            </PressableScale>
          </>
        ) : status === 'ARRIVED' ? (
          <>
            <Card style={{ marginBottom: 12 }}>
              <Mono style={{ fontSize: 10 }}>{policy === 'DELEGATE' ? 'ENTER THE CODE (RECEIVER OR THEIR PROXY)' : "ENTER THE RECEIVER'S DELIVERY CODE"}</Mono>
              <TextInput style={s.codeInput} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={4} />
              <Button label="Confirm & get paid" onPress={confirm} />
            </Card>
            {!showUnavailable ? (
              <PressableScale onPress={() => setShowUnavailable(true)}><Mono style={{ color: t.ink2, textAlign: 'center' }}>RECEIVER NOT AVAILABLE? →</Mono></PressableScale>
            ) : (
              <Card>
                <Text style={{ fontSize: 14, fontWeight: '700' }}>Receiver unavailable</Text>
                <Text style={{ fontSize: 12.5, color: t.ink2, marginVertical: 8, lineHeight: 18 }}>
                  Start the wait — the first 10 minutes are free. After that you can ask the customer to
                  cover the wait, or they can choose to have the package returned. You’re paid in full either way.
                </Text>
                <Button label="Start waiting (first 10 min free)" onPress={beginWaiting} />
                <View style={{ height: 8 }} />
                <PressableScale onPress={() => navigation.navigate('Chat', { jobId })} style={s.chip}>
                  <Mono style={{ color: t.ink }}>MESSAGE THE CUSTOMER →</Mono>
                </PressableScale>
              </Card>
            )}
          </>
        ) : (
          <Button label={nextStep === 'AT_PICKUP' ? "I've arrived at pickup (verify GPS)" : `Mark: ${LABEL[nextStep]}`} onPress={advance} />
        )}

        {!done && RELEASABLE.includes(status) && (
          showRelease ? (
            <Card style={{ marginTop: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: '700' }}>Release this job?</Text>
              <Text style={{ fontSize: 12.5, color: t.ink2, marginVertical: 8, lineHeight: 18 }}>
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
        <Spacer h={40} />
      </ScrollView>
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={{ marginBottom: 8 }}><Mono>{label.toUpperCase()}</Mono><Text style={{ fontSize: 13.5, marginTop: 2 }}>{value}</Text></View>;
}

const s = StyleSheet.create({
  chip: { borderWidth: 1, borderColor: t.line, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center', backgroundColor: t.bg },
  codeInput: { borderWidth: 1, borderColor: t.line, borderRadius: 6, textAlign: 'center', fontSize: 22, letterSpacing: 8, fontFamily: t.mono, paddingVertical: 10, marginVertical: 12 },
});
