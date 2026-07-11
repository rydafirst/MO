import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { api, naira, type Job } from '../api';
import { getToken, getUserId } from '../lib/session';
import { useJobLocation } from '../lib/socket';
import { Map } from '../components/Map';
import { Button, Card, Mono, Pill, Screen, Spacer, useToast } from '../ui';
import { t } from '../theme';

// Ordered lifecycle for the progress bar (identical to web).
const FLOW = ['FUNDED', 'SEARCHING', 'ACCEPTED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'IN_PROGRESS', 'EN_ROUTE_DROP', 'ARRIVED', 'COMPLETED', 'RELEASED'];
const HAS_RIDER = ['ACCEPTED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'IN_PROGRESS', 'EN_ROUTE_DROP', 'ARRIVED', 'AWAITING_CODE'];

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

export function TrackScreen({ route, navigation }: NativeStackScreenProps<RootStack, 'Track'>) {
  const { jobId } = route.params;
  const toast = useToast();
  const [job, setJob] = useState<Job | null>(null);
  const [uid, setUid] = useState('');
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);

  useEffect(() => { getToken().then((tok) => setUid(getUserId(tok))); }, []);
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

  const { point } = useJobLocation(jobId, uid);
  const hasRider = !!job && HAS_RIDER.includes(job.status);
  const step = job ? FLOW.indexOf(job.status) : -1;
  const l = job ? label(job.status) : { text: 'Loading…', color: t.ink2 };

  const reveal = async () => { try { setDeliveryCode((await api.issueCode(jobId)).code); } catch (e) { toast((e as Error).message); } };

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

        {job && (
          <Card style={{ marginBottom: 12 }}>
            <Row label="Status" value={l.text} />
            <Row label="Type" value={job.type} />
            <Row label="Amount held in escrow" value={naira(job.amountMinor)} strong />
            <Row label="Job ID" value={`${job.id.slice(0, 8)}…`} mono />
          </Card>
        )}

        {job && (job.pickup || job.dropoff) ? (
          <View style={{ marginBottom: 12 }}>
            <Map pickup={job.pickup} dropoff={job.dropoff} rider={hasRider ? point : null} height={200} />
            {hasRider && !point && <Mono style={{ color: t.mid, textAlign: 'center', marginTop: 6 }}>WAITING FOR RIDER LOCATION…</Mono>}
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
