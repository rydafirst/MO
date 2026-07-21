import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, naira, type Job } from '../api';
import type { AppNav } from '../nav';
import { TabIcon } from '../components/TabIcon';
import { Card, H1, Mono, Pill, PressableScale } from '../ui';
import { t } from '../theme';

type Role = 'CUSTOMER' | 'RIDER' | 'ADMIN';

const ACTIVE = ['CREATED', 'FUNDED', 'SEARCHING', 'ACCEPTED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'IN_PROGRESS', 'EN_ROUTE_DROP', 'ARRIVED', 'AWAITING_CODE'];

type Category = 'all' | 'active' | 'completed' | 'cancelled' | 'failed';
const FILTERS: { key: Category; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'active', label: 'Active' }, { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' }, { key: 'failed', label: 'Failed' },
];

function categoryOf(status: string): Category {
  if (ACTIVE.includes(status)) return 'active';
  if (status === 'COMPLETED' || status === 'RELEASED') return 'completed';
  if (status === 'CANCELLED') return 'cancelled';
  if (status === 'FAILED_ATTEMPT') return 'failed';
  return 'all';
}

function badge(status: string): { text: string; color: string } {
  if (ACTIVE.includes(status)) return { text: 'In progress', color: t.info };
  switch (status) {
    case 'COMPLETED': case 'RELEASED': return { text: 'Delivered', color: t.success };
    case 'CANCELLED': return { text: 'Cancelled', color: t.ink2 };
    case 'FAILED_ATTEMPT': return { text: 'Failed', color: t.danger };
    case 'DISPUTED': case 'DISPUTE_RESOLVED': return { text: 'Dispute', color: t.danger };
    default: return { text: status.replace(/_/g, ' ').toLowerCase(), color: t.ink2 };
  }
}

// One Activity screen for both sides (Uber-style). Customers see their orders; riders their trips.
export function ActivityTab({ navigation, role }: { navigation: AppNav; role: Role }) {
  const isRider = role === 'RIDER';
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [filter, setFilter] = useState<Category>('all');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setJobs(await (isRider ? api.assignedJobs() : api.myJobs())); } catch { setJobs([]); }
  }, [isRider]);
  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const sorted = jobs ? [...jobs].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)) : null;
  const shown = sorted?.filter((j) => filter === 'all' || categoryOf(j.status) === filter) ?? null;

  const open = (j: Job) => {
    const active = ACTIVE.includes(j.status);
    if (active && isRider) return navigation.navigate('RiderJob', { jobId: j.id });
    if (active) return navigation.navigate('Track', { jobId: j.id });
    navigation.navigate('ActivityDetail', { jobId: j.id });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.ink} />}>
      <H1>Activity</H1>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 14 }}>
        {FILTERS.map((f) => {
          const on = filter === f.key;
          return (
            <PressableScale key={f.key} onPress={() => setFilter(f.key)}>
              <View style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? t.ink : t.line, backgroundColor: on ? t.ink : t.bg }}>
                <Text style={{ fontFamily: t.mono, fontSize: t.size.caption, color: on ? '#fff' : t.ink2 }}>{f.label.toUpperCase()}</Text>
              </View>
            </PressableScale>
          );
        })}
      </ScrollView>

      {shown === null && <Mono style={{ color: t.mid }}>LOADING…</Mono>}
      {shown?.length === 0 && (
        <Card style={{ alignItems: 'center' }}>
          <Text style={{ color: t.ink2, fontSize: t.size.body }}>Nothing here yet.</Text>
          <Mono style={{ color: t.mid, marginTop: 8, fontSize: t.size.caption }}>{isRider ? 'ACCEPT A JOB FROM YOUR DASHBOARD' : 'BOOK A DELIVERY TO GET STARTED'}</Mono>
        </Card>
      )}

      {shown?.map((j) => {
        const b = badge(j.status);
        return (
          <PressableScale key={j.id} onPress={() => open(j)} style={{ marginBottom: 10 }}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={s.thumb}><TabIcon name="bike" color={t.ink} size={22} /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: t.size.body, fontWeight: '700' }} numberOfLines={1}>
                  {j.dropoffArea || j.dropoffAddress || 'Delivery'}
                </Text>
                <Mono style={{ fontSize: t.size.caption, color: t.mid, marginTop: 3 }}>
                  {new Date(j.createdAt).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </Mono>
                <Text style={{ fontFamily: t.mono, fontSize: t.size.small, fontWeight: '700', marginTop: 4 }}>{naira(j.amountMinor)}</Text>
              </View>
              <Pill text={b.text} color={b.color} />
            </Card>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  thumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: t.bg2, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' },
});
