import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { api, naira, type Job } from '../api';
import type { AppNav } from '../nav';
import { Card, H1, Mono, Pill, PressableScale } from '../ui';
import { t } from '../theme';

// A rider's trip is resumable while it's active; anything past that is history.
const ACTIVE = ['ACCEPTED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'IN_PROGRESS', 'EN_ROUTE_DROP', 'ARRIVED', 'AWAITING_CODE'];

function badge(status: string): { text: string; color: string } {
  if (ACTIVE.includes(status)) return { text: 'In progress', color: t.info };
  switch (status) {
    case 'COMPLETED': case 'RELEASED': return { text: 'Delivered', color: t.success };
    case 'CANCELLED': return { text: 'Cancelled', color: t.ink2 };
    case 'FAILED_ATTEMPT': return { text: 'Failed', color: t.danger };
    case 'DISPUTED': case 'DISPUTE_RESOLVED': return { text: 'Dispute', color: t.danger };
    default: return { text: status.replace(/_/g, ' '), color: t.ink2 };
  }
}

export function RiderTripsTab({ navigation }: { navigation: AppNav }) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { try { setJobs(await api.assignedJobs()); } catch { setJobs([]); } }, []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const sorted = jobs ? [...jobs].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)) : null;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.ink} />}>
      <H1>Your trips</H1>
      <View style={{ height: 16 }} />

      {sorted === null && <Mono style={{ color: t.mid }}>LOADING…</Mono>}
      {sorted?.length === 0 && (
        <Card style={{ alignItems: 'center' }}>
          <Text style={{ color: t.ink2, fontSize: 14 }}>No trips yet.</Text>
          <Mono style={{ color: t.mid, marginTop: 8 }}>ACCEPT A JOB FROM YOUR DASHBOARD</Mono>
        </Card>
      )}

      {sorted?.map((j) => {
        const b = badge(j.status);
        const active = ACTIVE.includes(j.status);
        const row = (
          <Card style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontFamily: t.mono, fontSize: 16, fontWeight: '700' }}>{naira(j.amountMinor)}</Text>
              <Pill text={`${b.text}${active ? ' ›' : ''}`} color={b.color} />
            </View>
            <Text style={{ fontSize: 13, marginTop: 8 }}>{j.pickupArea || 'Pickup'} <Text style={{ color: t.mid }}>→</Text> {j.dropoffArea || 'Drop-off'}</Text>
            <Mono style={{ fontSize: 10.5, color: t.mid, marginTop: 4 }}>
              {new Date(j.createdAt).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {j.id.slice(0, 8)}…
            </Mono>
          </Card>
        );
        return active
          ? <PressableScale key={j.id} onPress={() => navigation.navigate('RiderJob', { jobId: j.id })}>{row}</PressableScale>
          : <View key={j.id}>{row}</View>;
      })}
    </ScrollView>
  );
}
