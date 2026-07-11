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

function label(status: string): { text: string; color: string } {
  switch (status) {
    case 'CREATED': return { text: 'Awaiting payment', color: t.warning };
    case 'FUNDED': return { text: 'Payment received', color: t.success };
    case 'SEARCHING': return { text: 'Finding a rider', color: t.info };
    case 'COMPLETED': case 'RELEASED': return { text: 'Delivered', color: t.success };
    case 'CANCELLED': return { text: 'Cancelled', color: t.ink2 };
    case 'FAILED_ATTEMPT': return { text: 'Delivery failed', color: t.danger };
    default: return { text: status.replace(/_/g, ' '), color: t.info };
  }
}
const HAS_RIDER = ['ACCEPTED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'IN_PROGRESS', 'EN_ROUTE_DROP', 'ARRIVED', 'AWAITING_CODE'];

export function TrackScreen({ route, navigation }: NativeStackScreenProps<RootStack, 'Track'>) {
  const { jobId } = route.params;
  const toast = useToast();
  const [job, setJob] = useState<Job | null>(null);
  const [uid, setUid] = useState('');
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);

  useEffect(() => { getToken().then((tok) => setUid(getUserId(tok))); }, []);
  useEffect(() => {
    let stop = false;
    const tick = async () => { try { const j = await api.getJob(jobId); if (!stop) setJob(j); } catch { /* keep */ } };
    tick();
    const id = setInterval(tick, 4000);
    return () => { stop = true; clearInterval(id); };
  }, [jobId]);

  const { point } = useJobLocation(jobId, uid);
  const hasRider = !!job && HAS_RIDER.includes(job.status);
  const l = job ? label(job.status) : { text: 'Loading…', color: t.ink2 };

  const reveal = async () => { try { setDeliveryCode((await api.issueCode(jobId)).code); } catch (e) { toast((e as Error).message); } };

  return (
    <Screen title="Your delivery" onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ alignItems: 'flex-end', marginBottom: 12 }}><Pill text={l.text} color={l.color} /></View>
        {job && (
          <Card style={{ marginBottom: 12 }}>
            <Row label="Status" value={l.text} />
            <Row label="Type" value={job.type} />
            <Row label="Amount held in escrow" value={naira(job.amountMinor)} strong />
            <Row label="Job ID" value={`${job.id.slice(0, 8)}…`} />
          </Card>
        )}

        {job?.pickup || job?.dropoff ? (
          <View style={{ marginBottom: 12 }}>
            <Map pickup={job?.pickup} dropoff={job?.dropoff} rider={hasRider ? point : null} height={200} />
            {hasRider && !point && <Mono style={{ color: t.mid, textAlign: 'center', marginTop: 6 }}>WAITING FOR RIDER LOCATION…</Mono>}
          </View>
        ) : null}

        {hasRider ? (
          <>
            <Card style={{ marginBottom: 12 }}>
              <Mono>YOUR RIDER · ASSIGNED · BIKE</Mono>
              <Text style={{ fontSize: 12, color: t.ink2, marginTop: 6 }}>
                {point ? 'On the move — follow the map above' : 'Waiting for rider location…'}
              </Text>
            </Card>
            <Card style={{ alignItems: 'center', marginBottom: 12 }}>
              {deliveryCode ? (
                <>
                  <Mono>DELIVERY CODE</Mono>
                  <Text style={{ fontFamily: t.mono, fontSize: 32, fontWeight: '700', letterSpacing: 6, marginVertical: 6 }}>{deliveryCode}</Text>
                  <Mono style={{ color: t.ink2 }}>GIVE THIS TO YOUR RIDER ON ARRIVAL</Mono>
                </>
              ) : <Button label="Reveal delivery code" variant="ghost" onPress={reveal} />}
            </Card>
          </>
        ) : (
          <Card style={{ alignItems: 'center', marginBottom: 12 }}>
            <Mono style={{ color: t.mid }}>{job?.status === 'SEARCHING' ? 'FINDING A RIDER NEARBY…' : job?.status === 'CREATED' ? 'WAITING FOR PAYMENT…' : 'NO RIDER ASSIGNED YET'}</Mono>
          </Card>
        )}
        <Spacer h={8} />
        <Button label="New order" variant="ghost" onPress={() => navigation.navigate('Main')} />
      </ScrollView>
    </Screen>
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
