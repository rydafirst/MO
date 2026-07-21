import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { api, naira, type AvailableJob, type Job } from '../api';
import type { AppNav } from '../nav';
import { AppHeader } from '../components/AppHeader';
import { JobsMap, type JobPin } from '../components/JobsMap';
import { Button, Card, Mono, Spacer, useToast } from '../ui';
import { t } from '../theme';

const ACTIVE = ['ACCEPTED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'IN_PROGRESS', 'EN_ROUTE_DROP', 'ARRIVED', 'AWAITING_CODE'];
/** Metres -> "X.X km" for the rider's job cards. */
const km = (m: number) => `${(Math.round(m / 100) / 10).toFixed(1)} KM`;

export function RiderHomeTab({ navigation, onOpenPayout }: { navigation: AppNav; onOpenPayout?: () => void }) {
  const toast = useToast();
  const [online, setOnline] = useState(false);
  const [jobs, setJobs] = useState<AvailableJob[]>([]);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [earnings, setEarnings] = useState<number | null>(null);
  const [hasBank, setHasBank] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadOnce = useCallback(async () => {
    await Promise.all([
      api.getAvailability().then((a) => setOnline(a.online)).catch(() => {}),
      api.assignedJobs().then((js) => setActiveJob(js.find((j) => ACTIVE.includes(j.status)) ?? null)).catch(() => {}),
      api.wallet().then((w) => setEarnings(w.releasedMinor)).catch(() => setEarnings(null)),
      api.getAccount().then((a) => setHasBank(a != null)).catch(() => setHasBank(null)),
    ]);
  }, []);

  useEffect(() => { loadOnce(); }, [loadOnce]);

  // Last known rider position, refreshed while online so the feed can rank jobs by nearness.
  const posRef = useRef<{ lat: number; lng: number } | undefined>(undefined);
  const loadFeed = useCallback(async () => {
    try { setJobs(await api.availableJobs(posRef.current)); } catch { /* keep last */ }
  }, []);

  useEffect(() => {
    if (!online) { setJobs([]); posRef.current = undefined; return; }
    let active = true;
    (async () => {
      // Best-effort location: if granted, the board is ordered nearest-first with per-job ETA.
      const perm = await Location.getForegroundPermissionsAsync();
      const ok = perm.granted || (await Location.requestForegroundPermissionsAsync()).granted;
      if (ok && active) {
        try { const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }); posRef.current = { lat: p.coords.latitude, lng: p.coords.longitude }; } catch { /* no fix */ }
      }
      if (active) loadFeed();
    })();
    const id = setInterval(loadFeed, 4000);
    return () => { active = false; clearInterval(id); };
  }, [online, loadFeed]);

  const noBank = hasBank === false;

  const toggle = async () => {
    if (noBank) { onOpenPayout?.(); return; }
    const next = !online;
    setOnline(next);
    try { await api.setAvailability(next); } catch (e) { setOnline(!next); toast((e as Error).message); }
  };

  const onRefresh = async () => { setRefreshing(true); await Promise.all([loadOnce(), online ? loadFeed() : Promise.resolve()]); setRefreshing(false); };

  const accept = async (id: string) => {
    if (noBank) { onOpenPayout?.(); return; }
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
          <Text style={{ fontSize: t.size.body, fontWeight: '700', marginTop: 4 }}>{naira(activeJob.amountMinor)} · {activeJob.status.replace(/_/g, ' ').toLowerCase()}</Text>
          <Spacer h={10} />
          <Button label="Resume delivery" onPress={() => navigation.navigate('RiderJob', { jobId: activeJob.id })} />
        </Card>
      )}

      <Mono>EARNINGS TODAY</Mono>
      <Text style={{ fontFamily: t.mono, fontSize: t.size.dataLg, fontWeight: '700', color: t.ink }}>{earnings === null ? '—' : naira(earnings)}</Text>

      {noBank && (
        <Card style={{ borderColor: t.primary, marginTop: 12 }}>
          <Text style={{ fontSize: t.size.body, color: t.ink }}>Add a payout bank account to start earning — it&apos;s where your delivery money is paid.</Text>
          <Spacer h={8} />
          <Pressable onPress={onOpenPayout}><Mono style={{ color: t.primary }}>ADD YOUR BANK ACCOUNT →</Mono></Pressable>
        </Card>
      )}

      {online ? (
        <View style={{ marginVertical: 12 }}>
          <JobsMap pins={jobs.map((j): JobPin => ({ id: j.id, lat: j.pickupApprox.lat, lng: j.pickupApprox.lng, label: naira(j.amountMinor) }))} />
          <Mono style={{ textAlign: 'center', color: t.ink2, marginTop: 8 }}>
            {jobs.length ? `${jobs.length} JOB${jobs.length > 1 ? 'S' : ''} NEARBY` : 'ONLINE — WAITING FOR JOBS'}
          </Mono>
        </View>
      ) : (
        <View style={s.statusBox}><Text style={s.statusTxt}>OFFLINE</Text></View>
      )}
      <Button label={online ? 'Go offline' : 'Go online'} variant={online ? 'ghost' : 'primary'} onPress={toggle} disabled={noBank} />

      {online && (
        <View style={{ marginTop: 16 }}>
          <Mono style={{ marginBottom: 8 }}>AVAILABLE JOBS</Mono>
          {jobs.length === 0 ? (
            <Card style={{ alignItems: 'center' }}><Mono style={{ color: t.mid }}>NO JOBS YET — YOU&apos;LL SEE THEM HERE</Mono></Card>
          ) : jobs.map((j) => (
            <Card key={j.id} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Mono>{j.type}</Mono>
                <Text style={{ fontFamily: t.mono, fontSize: t.size.subtitle, fontWeight: '700' }}>{naira(j.amountMinor)}</Text>
              </View>
              <Text style={{ fontSize: t.size.small, marginVertical: 8 }}>{j.pickupArea || 'Nearby'} <Text style={{ color: t.mid }}>→</Text> {j.dropoffArea || 'Nearby'}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {j.toPickupMeters !== undefined && (
                  <Mono style={{ color: t.ink }}>{km(j.toPickupMeters)} · ~{j.toPickupEtaMin} MIN AWAY</Mono>
                )}
                <Mono style={{ color: t.mid }}>TRIP {km(j.tripDistanceMeters)} · ~{j.tripEtaMin} MIN</Mono>
              </View>
              <Button label="Accept job" onPress={() => accept(j.id)} disabled={noBank} />
            </Card>
          ))}
        </View>
      )}

      <Spacer h={16} />
      <Button label="Documents & verification" variant="ghost" onPress={() => navigation.navigate('Documents')} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  statusBox: { height: 150, borderRadius: t.radius.md, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center', marginVertical: 12 },
  statusTxt: { color: t.onDark, fontFamily: t.mono, fontSize: t.size.small, letterSpacing: 1 },
});
