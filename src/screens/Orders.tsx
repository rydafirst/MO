import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { api, naira, type Job } from '../api';
import type { AppNav } from '../nav';
import { Card, Mono, Pill, PressableScale } from '../ui';
import { t } from '../theme';

function badge(status: string): { text: string; color: string } {
  switch (status) {
    case 'CREATED': return { text: 'Awaiting payment', color: t.warning };
    case 'FUNDED': case 'SEARCHING': return { text: 'Finding a rider', color: t.info };
    case 'COMPLETED': case 'RELEASED': return { text: 'Delivered', color: t.success };
    case 'CANCELLED': return { text: 'Cancelled', color: t.ink2 };
    case 'FAILED_ATTEMPT': return { text: 'Failed', color: t.danger };
    case 'DISPUTED': case 'DISPUTE_RESOLVED': return { text: 'Dispute', color: t.danger };
    default: return { text: 'In progress', color: t.info };
  }
}

export function OrdersTab({ navigation }: { navigation: AppNav }) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { try { setJobs(await api.myJobs()); } catch { setJobs([]); } }, []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.ink} />}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: t.ink, marginBottom: 16 }}>Your orders</Text>
      {jobs === null && <Mono style={{ color: t.mid }}>LOADING…</Mono>}
      {jobs?.length === 0 && <Card style={{ alignItems: 'center' }}><Text style={{ color: t.ink2 }}>No orders yet.</Text></Card>}
      {jobs?.map((j) => {
        const b = badge(j.status);
        return (
          <PressableScale key={j.id} onPress={() => navigation.navigate('Track', { jobId: j.id })} style={{ marginBottom: 10 }}>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ fontFamily: t.mono, fontSize: 16, fontWeight: '700' }}>{naira(j.amountMinor)}</Text>
                  <Mono style={{ color: t.mid, marginTop: 3 }}>{new Date(j.createdAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })} · {j.type}</Mono>
                </View>
                <Pill text={b.text} color={b.color} />
              </View>
            </Card>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}
