import { useEffect, useRef, useState } from 'react';
import { Image, Linking, ScrollView, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { api, naira, type Account, type Job, type RiderSummary } from '../api';
import { getToken, getUserId } from '../lib/session';
import { useJobLocation } from '../lib/socket';
import { Map } from '../components/Map';
import { BankAccountForm } from '../components/BankAccountForm';
import { Button, Card, Mono, Pill, PressableScale, Screen, Spacer, useToast } from '../ui';
import { t } from '../theme';

// Ordered lifecycle for the progress bar (identical to web).
const FLOW = ['FUNDED', 'SEARCHING', 'ACCEPTED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'IN_PROGRESS', 'EN_ROUTE_DROP', 'ARRIVED', 'COMPLETED', 'RELEASED'];
const HAS_RIDER = ['ACCEPTED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'IN_PROGRESS', 'EN_ROUTE_DROP', 'ARRIVED', 'AWAITING_CODE'];
// A customer can cancel (and be refunded) any time before the parcel is picked up.
const CANCELLABLE = ['CREATED', 'FUNDED', 'SEARCHING', 'ACCEPTED', 'EN_ROUTE_PICKUP', 'AT_PICKUP'];
// Milestones that trigger an audible follow-up chime for the customer.
const STATUS_CHIME: Record<string, string> = {
  ACCEPTED: 'A rider accepted your delivery.',
  EN_ROUTE_PICKUP: 'Your rider is heading to the pickup.',
  AT_PICKUP: 'Your rider has arrived at the pickup.',
  IN_PROGRESS: 'Your parcel has been picked up.',
  EN_ROUTE_DROP: 'Your rider is on the way to the drop-off.',
  ARRIVED: 'Your rider has arrived at the drop-off.',
  RELEASED: 'Delivered — thanks for riding with Rydafirst.',
};

function label(status: string): { text: string; color: string } {
  switch (status) {
    case 'CREATED': return { text: 'Awaiting payment', color: t.warning };
    case 'FUNDED': return { text: 'Payment received', color: t.success };
    case 'SEARCHING': return { text: 'Finding a rider', color: t.info };
    case 'ACCEPTED': return { text: 'Rider assigned', color: t.info };
    case 'EN_ROUTE_PICKUP': return { text: 'Heading to pickup', color: t.info };
    case 'AT_PICKUP': return { text: 'At pickup', color: t.info };
    case 'IN_PROGRESS': return { text: 'Picked up', color: t.info };
    case 'EN_ROUTE_DROP': return { text: 'On the way to drop-off', color: t.info };
    case 'ARRIVED': return { text: 'Rider has arrived', color: t.warning };
    case 'AWAITING_CODE': return { text: 'Share your delivery code', color: t.warning };
    case 'COMPLETED': case 'RELEASED': return { text: 'Delivered', color: t.success };
    case 'CANCELLED': return { text: 'Cancelled', color: t.danger };
    case 'FAILED_ATTEMPT': return { text: 'Delivery failed', color: t.danger };
    case 'DISPUTED': return { text: 'Under dispute', color: t.danger };
    case 'DISPUTE_RESOLVED': return { text: 'Dispute resolved', color: t.danger };
    default: return { text: status, color: t.ink2 };
  }
}

function vehicleLabel(track: string | null): string {
  return track === 'BIKE' ? 'Motorcycle' : track === 'CAR' ? 'Car / Van' : track === 'KEKE' ? 'Keke' : 'Vehicle';
}

export function TrackScreen({ route, navigation }: NativeStackScreenProps<RootStack, 'Track'>) {
  const { jobId } = route.params;
  const toast = useToast();
  const [job, setJob] = useState<Job | null>(null);
  const [uid, setUid] = useState('');
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [refAcct, setRefAcct] = useState<Account | null>(null);

  useEffect(() => { getToken().then((tok) => setUid(getUserId(tok))); }, []);
  useEffect(() => { api.getAccount().then(setRefAcct).catch(() => {}); }, []);
  useEffect(() => {
    let stop = false;
    const TERMINAL = ['CANCELLED', 'RELEASED', 'COMPLETED', 'DISPUTE_RESOLVED', 'FAILED_ATTEMPT'];
    const tick = async () => {
      try { const j = await api.getJob(jobId); if (!stop) { setJob(j); if (TERMINAL.includes(j.status)) stop = true; } } catch { /* keep */ }
    };
    tick();
    const id = setInterval(() => { if (!stop) tick(); }, 4000);
    return () => { stop = true; clearInterval(id); };
  }, [jobId]);

  // Designed audible follow-up: chime + banner when the delivery reaches a new milestone. Reuses
  // the notification sound already configured for the app (foreground handler plays it).
  const lastChimed = useRef<string | null>(null);
  useEffect(() => {
    if (!job) return;
    const msg = STATUS_CHIME[job.status];
    if (!msg) return;
    if (lastChimed.current === null) { lastChimed.current = job.status; return; } // don't chime on first load
    if (lastChimed.current === job.status) return;
    lastChimed.current = job.status;
    Notifications.scheduleNotificationAsync({ content: { title: 'Delivery update', body: msg, sound: true }, trigger: null }).catch(() => {});
  }, [job?.status]);

  const { point } = useJobLocation(jobId, uid);
  const hasRider = !!job && HAS_RIDER.includes(job.status);

  // Once a rider is assigned, load their public details (name + vehicle) to show the customer.
  const [rider, setRider] = useState<RiderSummary | null>(null);
  useEffect(() => {
    if (!hasRider) { setRider(null); return; }
    let stop = false;
    api.jobRider(jobId).then((r) => { if (!stop) setRider(r.rider); }).catch(() => {});
    return () => { stop = true; };
  }, [hasRider, jobId]);

  const step = job ? FLOW.indexOf(job.status) : -1;
  const l = job ? label(job.status) : { text: 'Loading…', color: t.ink2 };

  const reveal = async () => { try { setDeliveryCode((await api.issueCode(jobId)).code); } catch (e) { toast((e as Error).message); } };
  const cancel = async () => {
    setCancelling(true);
    try { await api.cancelJob(jobId); toast('Order cancelled', 'success'); navigation.navigate('Main'); }
    catch (e) { toast((e as Error).message); } finally { setCancelling(false); }
  };
  const cancellable = !!job && CANCELLABLE.includes(job.status);
  const needsResolution = !!job && (job.status === 'WAITING' || job.status === 'AWAITING_RESOLUTION');
  const waitingDue = !!job?.waitingFeeMinor && !job?.waitingTxId;
  const payWaiting = async () => {
    try { const r = await api.payWaiting(jobId); Linking.openURL(r.paymentLink); toast('Opening payment for the waiting fee', 'success'); }
    catch (e) { toast((e as Error).message); }
  };
  const returnToMe = async () => {
    try { const r = await api.initiateReturn(jobId); if (r.paymentLink) Linking.openURL(r.paymentLink); toast('Return started — pay to bring it back', 'success'); }
    catch (e) { toast((e as Error).message); }
  };
  const notifyComing = async () => {
    try { await api.notifyComing(jobId); toast('Your rider has been notified', 'success'); }
    catch (e) { toast((e as Error).message); }
  };

  // Payment cancelled / order expired: no trip, no charge.
  if (job?.status === 'CANCELLED') {
    return (
      <Screen title="Your delivery" onBack={() => navigation.navigate('Main')}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Card style={{ alignItems: 'center' }}>
            <Mono style={{ color: t.warning, fontSize: 11 }}>ORDER EXPIRED</Mono>
            <Text style={{ fontSize: 18, fontWeight: '700', marginTop: 8 }}>You weren&apos;t charged</Text>
            <Text style={{ fontSize: 13.5, color: t.ink2, lineHeight: 21, textAlign: 'center', marginVertical: 12 }}>
              This order timed out before payment was completed, so it was cancelled and nothing was held in escrow. You can start again whenever you&apos;re ready.
            </Text>
            <Button label="Back to booking" onPress={() => navigation.navigate('Main')} />
            <Spacer h={12} />
            <Mono onPress={() => navigation.navigate('Main')} style={{ color: t.ink2 }}>VIEW MY ORDERS →</Mono>
          </Card>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen title="Your delivery" onBack={() => navigation.navigate('Main')}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ alignItems: 'flex-end', marginBottom: 12 }}><Pill text={l.text} color={l.color} /></View>

        <View style={{ flexDirection: 'row', gap: 4, marginBottom: 16 }}>
          {FLOW.map((_, i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: step >= 0 && i <= step ? t.ink : t.line2 }} />)}
        </View>

        {rider && (
          <Card style={{ marginBottom: 12 }}>
            <Mono style={{ marginBottom: 8 }}>YOUR RIDER</Mono>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {rider.photoUrl ? (
                <Image source={{ uri: rider.photoUrl }} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: t.bg2 }} />
              ) : (
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontFamily: t.mono }}>{(rider.name ?? 'R').trim().charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700' }}>
                  {rider.name ?? 'Assigned rider'}{rider.nameVerified ? '  ✓' : ''}
                  {rider.ratingCount ? `   ★ ${rider.rating?.toFixed(1)}` : ''}
                </Text>
                <Text style={{ fontSize: 12.5, color: t.ink2, marginTop: 2 }}>
                  {vehicleLabel(rider.vehicleType)}
                  {rider.vehicleColor ? ` · ${rider.vehicleColor.charAt(0) + rider.vehicleColor.slice(1).toLowerCase()}` : ''}
                  {rider.vehiclePlate ? ` · ${rider.vehiclePlate}` : ''}
                </Text>
              </View>
            </View>
          </Card>
        )}

        {job && (
          <Card style={{ marginBottom: 12 }}>
            <Row label="Status" value={l.text} />
            <Row label="Type" value={job.type} />
            {job.returnReserveMinor ? (
              <>
                <Row label="Delivery fare" value={naira(job.amountMinor - job.returnReserveMinor)} />
                <Row label="Return deposit (refundable)" value={naira(job.returnReserveMinor)} />
              </>
            ) : null}
            <Row label="Amount held in escrow" value={naira(job.amountMinor)} strong />
            {job.returnReserveMinor ? (
              <Text style={{ fontSize: 11.5, color: t.ink2, marginTop: 4, lineHeight: 16 }}>
                Your {naira(job.returnReserveMinor)} return deposit is refunded in full once the delivery is completed.
              </Text>
            ) : null}
          </Card>
        )}

        {job && (job.pickup || job.dropoff) ? (
          <View style={{ marginBottom: 12 }}>
            <Map pickup={job.pickup} dropoff={job.dropoff} rider={hasRider ? point : null} height={320} />
            {hasRider && !point && <Mono style={{ color: t.mid, textAlign: 'center', marginTop: 6 }}>WAITING FOR RIDER LOCATION…</Mono>}
            {hasRider && (
              <View style={{ marginTop: 10 }}>
                <Button label="I'm on my way — notify rider" variant="ghost" onPress={notifyComing} />
              </View>
            )}
          </View>
        ) : null}

        {hasRider ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontFamily: t.mono }}>R</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700' }}>Your rider</Text>
              <Mono style={{ fontSize: 11, color: t.mid }}>ASSIGNED · BIKE</Mono>
            </View>
          </Card>
        ) : (
          <Card style={{ alignItems: 'center', marginBottom: 12 }}>
            <Mono style={{ color: t.ink2 }}>{job?.status === 'SEARCHING' ? 'FINDING A RIDER NEARBY…' : job?.status === 'CREATED' ? 'WAITING FOR PAYMENT…' : 'NO RIDER ASSIGNED YET'}</Mono>
          </Card>
        )}

        {hasRider && (
          <Card style={{ alignItems: 'center', marginBottom: 12 }}>
            {deliveryCode ? (
              <>
                <Mono style={{ fontSize: 10 }}>DELIVERY CODE</Mono>
                <Text style={{ fontFamily: t.mono, fontSize: 32, fontWeight: '700', letterSpacing: 6, marginVertical: 6 }}>{deliveryCode}</Text>
                <Mono style={{ color: t.ink2 }}>GIVE THIS TO YOUR RIDER ON ARRIVAL</Mono>
              </>
            ) : <Button label="Reveal delivery code" variant="ghost" onPress={reveal} />}
          </Card>
        )}

        {needsResolution && (
          <Card style={{ marginBottom: 12, borderColor: t.warning }}>
            <Mono style={{ color: t.warning, marginBottom: 6 }}>RECIPIENT UNAVAILABLE</Mono>
            <Text style={{ fontSize: 13.5, color: t.ink2, lineHeight: 20, marginBottom: 10 }}>
              {waitingDue
                ? `Your rider waited past the free 10 minutes. Pay the waiting fee (${naira(job?.waitingFeeMinor ?? 0)}) so they can hand over — or have it returned to you.`
                : 'Your rider is at the drop-off but no one has collected. Keep them waiting (a small fee applies after the free 10 minutes) or have the package returned to you at a reduced fee.'}
            </Text>
            <Button label={waitingDue ? `Pay waiting fee ${naira(job?.waitingFeeMinor ?? 0)}` : 'Keep waiting & pay the fee'} onPress={payWaiting} />
            <Spacer h={8} />
            <Button label="Return the package to me" variant="ghost" onPress={returnToMe} />
            <Spacer h={8} />
            <PressableScale onPress={() => navigation.navigate('Chat', { jobId })} style={{ alignItems: 'center', paddingVertical: 8 }}>
              <Mono style={{ color: t.ink }}>MESSAGE YOUR RIDER →</Mono>
            </PressableScale>
          </Card>
        )}

        {hasRider && !needsResolution && (
          <PressableScale onPress={() => navigation.navigate('Chat', { jobId })} style={{ marginBottom: 12, alignItems: 'center', paddingVertical: 6 }}>
            <Mono style={{ color: t.ink2 }}>MESSAGE YOUR RIDER →</Mono>
          </PressableScale>
        )}

        {cancellable && (
          showCancel ? (
            <Card style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '700' }}>Cancel this order?</Text>
              <Text style={{ fontSize: 12.5, color: t.ink2, marginVertical: 8, lineHeight: 18 }}>
                {job?.status === 'CREATED'
                  ? 'This order isn’t paid yet, so nothing will be charged.'
                  : `You’ll be refunded ${naira(job?.amountMinor ?? 0)} to your original payment method. You can add a bank account below as a backup — it’s optional.`}
              </Text>

              {job?.status !== 'CREATED' && !refAcct && (
                <View style={{ marginBottom: 4 }}>
                  <Mono style={{ fontSize: 10, marginBottom: 6 }}>BACKUP REFUND ACCOUNT (OPTIONAL)</Mono>
                  <BankAccountForm type="refund" onSaved={setRefAcct} />
                  <Spacer h={10} />
                </View>
              )}
              {job?.status !== 'CREATED' && refAcct ? (
                <Mono style={{ color: t.ink2, marginBottom: 10 }}>BACKUP ACCOUNT ON FILE · {refAcct.accountNumberMasked}</Mono>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Button label="Yes, cancel" variant="ghost" onPress={cancel} busy={cancelling} /></View>
                <View style={{ flex: 1 }}><Button label="Keep order" variant="ghost" onPress={() => setShowCancel(false)} /></View>
              </View>
            </Card>
          ) : (
            <PressableScale onPress={() => setShowCancel(true)} style={{ marginBottom: 12 }}>
              <Mono style={{ color: t.danger, textAlign: 'center' }}>CANCEL THIS ORDER →</Mono>
            </PressableScale>
          )
        )}

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button label="Refresh" variant="ghost" onPress={async () => { try { setJob(await api.getJob(jobId)); } catch (e) { toast((e as Error).message); } }} /></View>
          <View style={{ flex: 1 }}><Button label="New order" variant="ghost" onPress={() => navigation.navigate('Main')} /></View>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value, strong, mono }: { label: string; value: string; strong?: boolean; mono?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text style={{ color: t.ink2, fontSize: 13 }}>{label}</Text>
      <Text style={{ fontFamily: mono ? t.mono : undefined, fontSize: strong ? 15 : 13, fontWeight: strong ? '700' : '400' }}>{value}</Text>
    </View>
  );
}
