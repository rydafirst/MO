import { useEffect, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { api, naira, type Job, type JobTimings, type RiderSummary } from '../api';
import { getRole, getToken } from '../lib/session';
import { Button, Card, Mono, Pill, Screen, Spacer, useToast } from '../ui';
import { t } from '../theme';

const SUPPORT_EMAIL = 'support@rydafirst.com';

function vehicleLabel(track: string | null): string {
  return track === 'BIKE' ? 'Motorcycle' : track === 'CAR' ? 'Car / Van' : track === 'KEKE' ? 'Keke' : 'Vehicle';
}
function statusLabel(s: string): { text: string; color: string } {
  switch (s) {
    case 'COMPLETED': case 'RELEASED': return { text: 'Delivered', color: t.success };
    case 'CANCELLED': return { text: 'Cancelled', color: t.ink2 };
    case 'FAILED_ATTEMPT': return { text: 'Failed', color: t.danger };
    case 'DISPUTED': case 'DISPUTE_RESOLVED': return { text: 'Under dispute', color: t.danger };
    default: return { text: s.replace(/_/g, ' ').toLowerCase(), color: t.info };
  }
}

export function ActivityDetailScreen({ route, navigation }: NativeStackScreenProps<RootStack, 'ActivityDetail'>) {
  const { jobId } = route.params;
  const toast = useToast();
  const [job, setJob] = useState<Job | null>(null);
  const [rider, setRider] = useState<RiderSummary | null>(null);
  const [isRider, setIsRider] = useState(false);
  const [timings, setTimings] = useState<JobTimings | null>(null);

  useEffect(() => { getToken().then((tok) => setIsRider(getRole(tok) === 'RIDER')); }, []);
  useEffect(() => {
    api.getJob(jobId).then(setJob).catch((e) => toast((e as Error).message));
    api.jobRider(jobId).then((r) => setRider(r.rider)).catch(() => {});
    // Jobs from before the status log existed simply have no stages; the card hides itself.
    api.jobTimings(jobId).then(setTimings).catch(() => {});
  }, [jobId, toast]);

  const contactSupport = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Delivery help (ref ${jobId.slice(0, 8)})`)}`).catch(() => toast('Could not open mail app'));
  };

  if (!job) {
    return <Screen title="Delivery details" onBack={() => navigation.goBack()}><View style={{ padding: 20 }}><Mono style={{ color: t.mid }}>LOADING…</Mono></View></Screen>;
  }

  const l = statusLabel(job.status);
  const when = new Date(job.createdAt).toLocaleString('en-NG', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <Screen title="Delivery details" onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={{ alignItems: 'flex-end', marginBottom: 12 }}><Pill text={l.text} color={l.color} /></View>

        <Card style={{ marginBottom: 12 }}>
          <Row label="From" value={job.pickupArea || job.pickupAddress || '—'} />
          <Row label="To" value={job.dropoffArea || job.dropoffAddress || '—'} />
          <Row label="When" value={when} />
          {job.returnReserveMinor ? (
            <>
              <Row label="Delivery fare" value={naira(job.amountMinor - job.returnReserveMinor)} />
              <Row label="Return deposit (refundable)" value={naira(job.returnReserveMinor)} />
            </>
          ) : null}
          <Row label="Amount" value={naira(job.amountMinor)} strong />
        </Card>

        {!isRider && rider && (
          <Card style={{ marginBottom: 12 }}>
            <Mono style={{ marginBottom: 8 }}>YOUR RIDER</Mono>
            <Text style={{ fontSize: t.size.body, fontWeight: '700' }}>{rider.name ?? 'Assigned rider'}{rider.nameVerified ? '  ✓' : ''}</Text>
            <Text style={{ fontSize: t.size.small, color: t.ink2, marginTop: 2 }}>
              {vehicleLabel(rider.vehicleType)}
              {rider.vehicleColor ? ` · ${rider.vehicleColor.charAt(0) + rider.vehicleColor.slice(1).toLowerCase()}` : ''}
              {rider.vehiclePlate ? ` · ${rider.vehiclePlate}` : ''}
            </Text>
          </Card>
        )}

        {timings && timings.stages.length > 0 ? (
          <Card style={{ marginBottom: 12 }}>
            <Mono style={{ marginBottom: 10 }}>TIME PER STAGE</Mono>
            {timings.stages.map((st, i) => (
              <Row key={`${st.status}-${i}`} label={stageLabel(st.status)} value={duration(st.ms)} />
            ))}
            <View style={{ height: 1, backgroundColor: t.line2, marginVertical: 8 }} />
            <Row label="Total" value={duration(timings.totalMs)} strong />
          </Card>
        ) : null}

        <Card>
          <Mono style={{ marginBottom: 10 }}>NEED HELP WITH THIS DELIVERY?</Mono>
          <Button label="Report an issue" variant="ghost" onPress={() => navigation.navigate('Dispute', { jobId })} />
          <Spacer h={8} />
          <Button label="Contact support" variant="ghost" onPress={contactSupport} />
        </Card>
      </ScrollView>
    </Screen>
  );
}

/** Compact, glanceable duration — a rider reading this does not want "0h 03m 12s". */
function duration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 1) return 'under a minute';
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** Human wording for a machine status, so the card reads as a story of the delivery. */
function stageLabel(status: string): string {
  switch (status) {
    case 'ACCEPTED': return 'Accepted, before setting off';
    case 'EN_ROUTE_PICKUP': return 'Riding to pickup';
    case 'AT_PICKUP': return 'At the pickup';
    case 'IN_PROGRESS': return 'Parcel collected';
    case 'EN_ROUTE_DROP': return 'Riding to drop-off';
    case 'ARRIVED': return 'At the drop-off';
    case 'AWAITING_CODE': return 'Waiting for the code';
    case 'WAITING': return 'Waiting for the recipient';
    case 'AWAITING_RESOLUTION': return 'Awaiting sender’s decision';
    case 'COMPLETED': return 'Completing';
    default: return status.replace(/_/g, ' ').toLowerCase();
  }
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, gap: 12 }}>
      <Text style={{ color: t.ink2, fontSize: t.size.small }}>{label}</Text>
      <Text style={{ fontFamily: t.mono, fontSize: strong ? t.size.body : t.size.small, fontWeight: strong ? '700' : '400', flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}
