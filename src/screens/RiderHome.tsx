import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, naira, type AvailableJob, type Job } from '../api';
import type { AppNav } from '../nav';
import { AppHeader } from '../components/AppHeader';
import { Button, Card, Mono, Spacer, useToast } from '../ui';
import { t } from '../theme';

const ACTIVE = ['ACCEPTED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'IN_PROGRESS', 'EN_ROUTE_DROP', 'ARRIVED', 'AWAITING_CODE'];

export function RiderHomeTab({ navigation }: { navigation: AppNav }) {
  const toast = useToast();
  const [online, setOnline] = useState(false);
  const [jobs, setJobs] = useState<AvailableJob[]>([]);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [earnings, setEarnings] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadOnce = useCallback(async () => {
    await Promise.all([
      api.getAvailability().then((a) => setOnline(a.online)).catch(() => {}),
      api.assignedJobs().then((js) => setActiveJob(js.find((j) => ACTIVE.includes(j.status)) ?? null)).catch(() => {}),
      api.wallet().then((w) => setEarnings(w.releasedMinor)).catch(() => setEarnings(null)),
    ]);
  }, []);

  useEffect(() => { loadOnce(); }, [loadOnce]);

  const loadFeed = useCallback(async () => {
    try { setJobs(await api.availableJobs()); } catch { /* keep last */ }
  }, []);

  useEffect(() => {
    if (!online) { setJobs([]); return; }
    loadFeed();
    const id = setInterval(loadFeed, 4000);
    return () => clearInterval(id);
  }, [online, loadFeed]);

  const toggle = async () => {
    const next = !online;
    setOnline(next);
    try { await api.setAvailability(next); } catch (e) { setOnline(!next); toast((e as Error).message); }
  };

  const onRefresh = async () => { setRefreshing(true); await Promise.all([loadOnce(), online ? loadFeed() : Promise.resolve()]); setRefreshing(false); };

  const accept = async (id: string) => {
    try { const j = await api.accept(id); navigation.navigate('RiderJob', { jobId: j.id }); }
    catch (e) { toast((e as Error).message); loadFeed(); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.ink} />}>
      <AppHeader navigation={navigation} />
      <Spacer h={16} />
      {activeJob && (
        <Card style={{ borderColor: t.ink, marginBottom: 16 }}>
          <Mono>YOU HAVE AN ACTIVE DELIVERY</Mono>
          <Text style={{ fontSize: 15, fontWeight: '700', marginTop: 4 }}>{naira(activeJob.amountMinor)} · {activeJob.status.replace(/_/g, ' ').toLowerCase()}</Text>
          <Spacer h={10} />
          <Button label="Resume delivery" onPress={() => navigation.navigate('RiderJob', { jobId: activeJob.id })} />
        </Card>
      )}

      <Mono>EARNINGS TODAY</Mono>
      <Text style={{ fontFamily: t.mono, fontSize: 28, fontWeight: '700', color: t.ink }}>{earnings === null ? '—' : naira(earnings)}</Text>

      <View style={s.statusBox}>
        <Text style={s.statusTxt}>{online ? (jobs.length ? `${jobs.length} JOB${jobs.length > 1 ? 'S' : ''} NEARBY` : 'ONLINE — WAITING FOR JOBS') : 'OFFLINE'}</Text>
      </View>
      <Button label={online ? 'Go offline' : 'Go online'} variant={online ? 'ghost' : 'primary'} onPress={toggle} />

      {online && (
        <View style={{ marginTop: 16 }}>
          <Mono style={{ marginBottom: 8 }}>AVAILABLE JOBS</Mono>
          {jobs.length === 0 ? (
            <Card style={{ alignItems: 'center' }}><Mono style={{ color: t.mid }}>NO JOBS YET — YOU&apos;LL SEE THEM HERE</Mono></Card>
          ) : jobs.map((j) => (
            <Card key={j.id} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Mono>{j.type}</Mono>
                <Text style={{ fontFamily: t.mono, fontSize: 16, fontWeight: '700' }}>{naira(j.amountMinor)}</Text>
              </View>
              <Text style={{ fontSize: 13, marginVertical: 8 }}>{j.pickupArea || 'Nearby'} <Text style={{ color: t.mid }}>→</Text> {j.dropoffArea || 'Nearby'}</Text>
              <Button label="Accept job" onPress={() => accept(j.id)} />
            </Card>
          ))}
        </View>
      )}

      <Spacer h={16} />
      <Button label="Complete verification (KYC)" variant="ghost" onPress={() => navigation.navigate('Kyc')} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  statusBox: { height: 150, borderRadius: t.radius.md, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center', marginVertical: 12 },
  statusTxt: { color: '#fff', fontFamily: t.mono, fontSize: 13, letterSpacing: 1 },
});
