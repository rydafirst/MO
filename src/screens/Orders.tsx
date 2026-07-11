import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { api, naira, type Job } from '../api';
import type { AppNav } from '../nav';
import { Card, H1, Mono, Pill, PressableScale } from '../ui';
import { t } from '../theme';

// Human label + colour per status, matching the tracking page (identical to web).
function badge(status: string): { text: string; color: string } {
  switch (status) {
    case 'CREATED': return { text: 'Awaiting payment', color: t.warning };
    case 'FUNDED': case 'SEARCHING': return { text: 'Finding a rider', color: t.info };
    case 'ACCEPTED': case 'EN_ROUTE_PICKUP': case 'AT_PICKUP': case 'IN_PROGRESS': case 'EN_ROUTE_DROP': case 'ARRIVED': case 'AWAITING_CODE':
      return { text: 'In progress', color: t.info };
    case 'COMPLETED': case 'RELEASED': return { text: 'Delivered', color: t.success };
    case 'CANCELLED': return { text: 'Cancelled', color: t.ink2 };
    case 'FAILED_ATTEMPT': return { text: 'Failed', color: t.danger };
    case 'DISPUTED': case 'DISPUTE_RESOLVED': return { text: 'Dispute', color: t.danger };
    default: return { text: status, color: t.ink2 };
  }
}

const ACTIVE = ['FUNDED', 'SEARCHING', 'ACCEPTED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'IN_PROGRESS', 'EN_ROUTE_DROP', 'ARRIVED', 'AWAITING_CODE', 'CREATED'];

export function OrdersTab({ navigation, onBook }: { navigation: AppNav; onBook?: () => void }) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { try { setJobs(await api.myJobs()); } catch { setJobs([]); } }, []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.ink} />}>
      <H1>Your orders</H1>
      <View style={{ height: 16 }} />

      {jobs === null && <Mono style={{ color: t.mid }}>LOADING…</Mono>}
      {jobs?.length === 0 && (
        <Card style={{ alignItems: 'center' }}>
          <Text style={{ color: t.ink2, fontSize: 14, marginBottom: 12 }}>No orders yet.</Text>
          <Mono onPress={onBook} style={{ color: t.ink, letterSpacing: 0.7 }}>BOOK A DELIVERY →</Mono>
        </Card>
      )}

      {jobs?.map((j) => {
        const b = badge(j.status);
        const active = ACTIVE.includes(j.status);
        return (
          <PressableScale key={j.id} onPress={() => navigation.navigate('Track', { jobId: j.id })} style={{ marginBottom: 10 }}>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontFamily: t.mono, fontSize: 16, fontWeight: '700' }}>{naira(j.amountMinor)}</Text>
                    <Mono style={{ fontSize: 10, color: t.ink2 }}>{j.type}</Mono>
                  </View>
                  <Mono style={{ fontSize: 10.5, color: t.mid, marginTop: 4 }}>
                    {new Date(j.createdAt).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {j.id.slice(0, 8)}…
                  </Mono>
                </View>
                <Pill text={`${b.text}${active && j.status !== 'CREATED' ? ' ›' : ''}`} color={b.color} />
              </View>
            </Card>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}
